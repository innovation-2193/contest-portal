import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";
import { sendAdminMail } from "./admin-mail";

const cookieName = "contest_admin";

export { cookieName };

export type AdminRole = "super_admin" | "admin";

export type AdminSession = {
  email: string;
  role: AdminRole;
  issuedAt: number;
};

export const superAdminEmails = [
  "innovation@police.go.th",
  "innovation.it.police@gmail.com",
] as const;

const sessionMaxAgeSeconds = Number(process.env.ADMIN_SESSION_MAX_AGE_SECONDS ?? 60 * 60 * 8);
const maxFailures = Number(process.env.ADMIN_LOGIN_MAX_FAILURES ?? 5);
const windowMs = Number(process.env.ADMIN_LOGIN_WINDOW_SECONDS ?? 10 * 60) * 1000;
const lockMs = Number(process.env.ADMIN_LOGIN_LOCK_SECONDS ?? 15 * 60) * 1000;
const otpMaxAgeMs = 5 * 60 * 1000;
const otpResendCooldownMs = 60 * 1000;
const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const attemptsPath = path.join(storageDir, "admin-login-attempts.json");
const otpPath = path.join(storageDir, "admin-super-otp.json");

type LoginAttemptRecord = {
  failures: number;
  firstFailureAt: number;
  lastFailureAt: number;
  lockedUntil: number;
};

type LoginAttemptStore = Record<string, LoginAttemptRecord>;

type SuperAdminOtpRecord = {
  codeHash: string;
  expiresAt: number;
  sentAt: number;
  attempts: number;
};

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

export function createAdminSessionToken(session: Pick<AdminSession, "email" | "role">, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    email: session.email.trim().toLowerCase(),
    role: session.role,
    issuedAt: now,
    nonce: randomBytes(18).toString("base64url"),
  })).toString("base64url");
  return `${payload}.${signAdminSessionPayload(payload)}`;
}

export function adminToken() {
  return createAdminSessionToken({ email: superAdminEmails[0], role: "super_admin" });
}

export function verifyAdminToken(value?: string) {
  return Boolean(getAdminSession(value));
}

export function getAdminSession(value?: string): AdminSession | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || value.split(".").length !== 2) return null;
  const expected = signAdminSessionPayload(payload);
  if (!safeEqual(signature, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
      role?: string;
      issuedAt?: number;
    };
    if (!decoded.email || decoded.role !== "admin" && decoded.role !== "super_admin") return null;
    if (!Number.isFinite(decoded.issuedAt)) return null;
    if (Date.now() - Number(decoded.issuedAt) > sessionMaxAgeSeconds * 1000) return null;
    return {
      email: decoded.email.trim().toLowerCase(),
      role: decoded.role,
      issuedAt: Number(decoded.issuedAt),
    };
  } catch {
    return null;
  }
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
  if (status === "failed") return "ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบอีเมลหรือรหัสผ่านอีกครั้ง";
  if (status === "otp_sent") return "ส่งรหัส OTP ไปยังอีเมล Super Admin แล้ว รหัสมีอายุ 5 นาที";
  if (status === "otp_wait") return "สามารถส่งรหัส OTP ใหม่ได้ทุก 1 นาที กรุณารอสักครู่";
  if (status === "otp_failed") return "รหัส OTP ไม่ถูกต้องหรือหมดอายุ กรุณาตรวจสอบอีกครั้ง";
  if (status === "otp_mail_failed") return "สร้างรหัส OTP แล้ว แต่ส่งอีเมลไม่สำเร็จ กรุณาตรวจสอบ SMTP หรือดู outbox ใน storage";
  return "";
}

export async function slowFailedAdminLogin() {
  await new Promise((resolve) => setTimeout(resolve, 350 + Math.floor(Math.random() * 350)));
}

export async function requestSuperAdminOtp(now = Date.now()) {
  const current = await readSuperAdminOtp();
  if (current && now - current.sentAt < otpResendCooldownMs) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((otpResendCooldownMs - (now - current.sentAt)) / 1000),
      expiresAt: current.expiresAt,
    };
  }

  const code = String(randomInt(100000, 1000000));
  const record: SuperAdminOtpRecord = {
    codeHash: adminSecureHash(code, "super-admin-otp"),
    expiresAt: now + otpMaxAgeMs,
    sentAt: now,
    attempts: 0,
  };
  await writeSuperAdminOtp(record);
  const mail = await sendAdminMail({
    to: [...superAdminEmails],
    subject: `รหัส OTP สำหรับ Super Admin: ${code}`,
    text: `รหัส OTP สำหรับเข้าสู่ระบบ Super Admin คือ ${code}\nรหัสนี้หมดอายุภายใน 5 นาที`,
    html: `<p>รหัส OTP สำหรับเข้าสู่ระบบ Super Admin คือ</p><h1 style="letter-spacing:8px">${code}</h1><p>รหัสนี้หมดอายุภายใน 5 นาที</p>`,
    outboxKey: `super-admin-otp-${new Date(now).toISOString().replace(/[:.]/g, "-")}`,
  });
  return { ok: true, expiresAt: record.expiresAt, mailStatus: mail.status };
}

export async function verifySuperAdminOtp(input: string, now = Date.now()) {
  const code = input.trim();
  if (!/^\d{6}$/.test(code)) return false;
  return enqueueAttemptWrite(async () => {
    const record = await readSuperAdminOtp();
    if (!record || record.expiresAt < now || record.attempts >= 5) {
      await deleteSuperAdminOtp();
      return false;
    }
    if (safeEqual(record.codeHash, adminSecureHash(code, "super-admin-otp"))) {
      await deleteSuperAdminOtp();
      return true;
    }
    await writeSuperAdminOtp({ ...record, attempts: record.attempts + 1 });
    return false;
  });
}

export function createAdminPasswordHash(password: string, salt = randomBytes(18).toString("base64url")) {
  return `sha256:${salt}:${createHmac("sha256", adminSecret()).update(`${salt}:${password}`).digest("hex")}`;
}

export function verifyStoredAdminPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;
  const [algorithm, salt, expected] = storedHash.split(":");
  if (algorithm !== "sha256" || !salt || !expected) return false;
  const actual = createAdminPasswordHash(password, salt).split(":")[2];
  return safeEqual(actual, expected);
}

export function adminSecureHash(value: string, purpose: string) {
  return createHmac("sha256", adminSecret()).update(`${purpose}:${value}`).digest("hex");
}

function signAdminSessionPayload(payload: string) {
  return createHmac("sha256", adminSecret())
    .update(payload)
    .digest("base64url");
}

function adminSecret() {
  return process.env.ADMIN_SESSION_SECRET || adminPassword() || "contest-admin-development-secret";
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

async function readSuperAdminOtp() {
  try {
    return JSON.parse(await readFile(otpPath, "utf8")) as SuperAdminOtpRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeSuperAdminOtp(record: SuperAdminOtpRecord) {
  await mkdir(path.dirname(otpPath), { recursive: true });
  const tempPath = `${otpPath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await rename(tempPath, otpPath);
}

async function deleteSuperAdminOtp() {
  try {
    await unlink(otpPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
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
