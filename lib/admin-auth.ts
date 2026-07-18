import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";

const cookieName = "contest_admin";

export { cookieName };

const sessionMaxAgeSeconds = Number(process.env.ADMIN_SESSION_MAX_AGE_SECONDS ?? 60 * 60 * 8);
const maxFailures = Number(process.env.ADMIN_LOGIN_MAX_FAILURES ?? 5);
const windowMs = Number(process.env.ADMIN_LOGIN_WINDOW_SECONDS ?? 10 * 60) * 1000;
const lockMs = Number(process.env.ADMIN_LOGIN_LOCK_SECONDS ?? 15 * 60) * 1000;
const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const attemptsPath = path.join(storageDir, "admin-login-attempts.json");

type LoginAttemptRecord = {
  failures: number;
  firstFailureAt: number;
  lastFailureAt: number;
  lockedUntil: number;
};

type LoginAttemptStore = Record<string, LoginAttemptRecord>;

let writeQueue: Promise<unknown> = Promise.resolve();

export function adminPassword() {
  return process.env.ADMIN_PASSWORD ?? "";
}

export function adminSessionMaxAgeSeconds() {
  return sessionMaxAgeSeconds;
}

export function adminCookieSecure() {
  if (process.env.ADMIN_COOKIE_SECURE === "false") return false;
  if (process.env.NEXT_PUBLIC_BASE_URL?.startsWith("https://")) return true;
  return process.env.NODE_ENV === "production";
}

export function createAdminSessionToken(now = Date.now()) {
  const password = adminPassword();
  if (!password) return "";
  const payload = `${now}.${randomBytes(18).toString("base64url")}`;
  return `${payload}.${signAdminSessionPayload(payload)}`;
}

export function adminToken() {
  return createAdminSessionToken();
}

export function verifyAdminToken(value?: string) {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [issuedAtValue, nonce, signature] = parts;
  const issuedAt = Number(issuedAtValue);
  if (!Number.isFinite(issuedAt) || !nonce || !signature) return false;
  if (Date.now() - issuedAt > sessionMaxAgeSeconds * 1000) return false;

  const payload = `${issuedAtValue}.${nonce}`;
  const expected = signAdminSessionPayload(payload);
  return safeEqual(signature, expected);
}

export function verifyAdminPassword(input: string) {
  const password = adminPassword();
  if (!password) return false;
  return safeEqual(passwordHash(input), passwordHash(password));
}

export function adminClientKey(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || headers.get("x-real-ip") || headers.get("cf-connecting-ip") || "unknown";
  const userAgent = headers.get("user-agent") ?? "unknown";
  return createHmac("sha256", adminSecret())
    .update(`${ip}|${userAgent}`)
    .digest("hex");
}

export async function getAdminLoginStatus(clientKey: string, now = Date.now()) {
  const store = await readAttemptStore();
  const record = store[clientKey];
  if (!record) return { locked: false, remainingAttempts: maxFailures };
  if (record.lockedUntil > now) {
    return { locked: true, retryAfterSeconds: Math.ceil((record.lockedUntil - now) / 1000), remainingAttempts: 0 };
  }
  if (now - record.firstFailureAt > windowMs) {
    return { locked: false, remainingAttempts: maxFailures };
  }
  return { locked: false, remainingAttempts: Math.max(0, maxFailures - record.failures) };
}

export async function recordAdminLoginFailure(clientKey: string, now = Date.now()) {
  return enqueueAttemptWrite(async () => {
    const store = await readAttemptStore();
    const current = store[clientKey];
    const base = !current || now - current.firstFailureAt > windowMs
      ? { failures: 0, firstFailureAt: now, lastFailureAt: now, lockedUntil: 0 }
      : current;
    const nextFailures = base.failures + 1;
    const lockedUntil = nextFailures >= maxFailures ? now + lockMs : base.lockedUntil;
    store[clientKey] = { ...base, failures: nextFailures, lastFailureAt: now, lockedUntil };
    await writeAttemptStore(pruneAttemptStore(store, now));
    return {
      locked: lockedUntil > now,
      retryAfterSeconds: lockedUntil > now ? Math.ceil((lockedUntil - now) / 1000) : 0,
      remainingAttempts: Math.max(0, maxFailures - nextFailures),
    };
  });
}

export async function clearAdminLoginFailures(clientKey: string) {
  await enqueueAttemptWrite(async () => {
    const store = await readAttemptStore();
    delete store[clientKey];
    await writeAttemptStore(store);
  });
}

export function genericAdminLoginError(status?: "failed" | "locked" | string) {
  if (status === "locked") return "พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง";
  if (status === "failed") return "ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบรหัสผ่านอีกครั้ง";
  return "";
}

export async function slowFailedAdminLogin() {
  await new Promise((resolve) => setTimeout(resolve, 350 + Math.floor(Math.random() * 350)));
}

function signAdminSessionPayload(payload: string) {
  return createHmac("sha256", adminSecret())
    .update(`${payload}.${passwordHash(adminPassword())}`)
    .digest("base64url");
}

function adminSecret() {
  return process.env.ADMIN_SESSION_SECRET || adminPassword();
}

function passwordHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function readAttemptStore(): Promise<LoginAttemptStore> {
  try {
    return JSON.parse(await readFile(attemptsPath, "utf8")) as LoginAttemptStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeAttemptStore(store: LoginAttemptStore) {
  await mkdir(path.dirname(attemptsPath), { recursive: true });
  const tempPath = `${attemptsPath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tempPath, attemptsPath);
}

function pruneAttemptStore(store: LoginAttemptStore, now: number) {
  const cutoff = now - Math.max(windowMs, lockMs) * 2;
  return Object.fromEntries(Object.entries(store).filter(([, record]) => record.lockedUntil > now || record.lastFailureAt > cutoff));
}

function enqueueAttemptWrite<T>(work: () => Promise<T>) {
  const next = writeQueue.then(work, work);
  writeQueue = next.catch(() => undefined);
  return next;
}
