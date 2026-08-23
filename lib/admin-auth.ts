import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { sendAdminMail } from "./admin-mail";

const cookieName = "contest_admin";
export const adminOtpAutoFillCookie = "contest_admin_otp_autofill";
export const adminOtpRequestCookie = "contest_admin_otp_request";

export { cookieName };

export type AdminRole = "super_admin" | "admin" | "uci";

export type AdminSession = {
  email: string;
  role: AdminRole;
  issuedAt: number;
  remember?: boolean;
};

export const superAdminEmails = [
  "innovation@police.go.th",
  "innovation.it.police@gmail.com",
] as const;

const adminSessionMaxAge = Number(process.env.ADMIN_SESSION_MAX_AGE_SECONDS ?? 60 * 60 * 8);
const superAdminSessionMaxAge = Number(process.env.SUPER_ADMIN_SESSION_MAX_AGE_SECONDS ?? 60 * 60 * 24);
const rememberedAdminSessionMaxAge = Number(process.env.ADMIN_REMEMBERED_SESSION_MAX_AGE_SECONDS ?? 60 * 60 * 24 * 30);
const rememberedSuperAdminSessionMaxAge = Number(process.env.SUPER_ADMIN_REMEMBERED_SESSION_MAX_AGE_SECONDS ?? 60 * 60 * 24 * 30);
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
  purpose: SuperAdminOtpPurpose;
  contextKey: string;
};

type SuperAdminOtpPurpose = "login" | "delete_submission" | "reset_lucky_draw" | "reset_submission_reviews";

type SuperAdminOtpOptions = {
  purpose?: SuperAdminOtpPurpose;
  requestKey?: string;
  submissionCode?: string;
  titleTh?: string;
  teamName?: string | null;
  now?: number;
};

let writeQueue: Promise<unknown> = Promise.resolve();

export function adminPassword() {
  return process.env.ADMIN_PASSWORD ?? "";
}

export function verifyUciPortalCredentials(username: string, password: string) {
  const expectedUsername = process.env.UCI_PORTAL_USERNAME ?? "admin";
  const expectedPassword = process.env.UCI_PORTAL_PASSWORD ?? "admin";
  return safeEqual(passwordHash(username.trim().toLowerCase()), passwordHash(expectedUsername.trim().toLowerCase())) && safeEqual(passwordHash(password), passwordHash(expectedPassword));
}

export function adminSessionMaxAgeSeconds(role: AdminRole = "admin", remember = false) {
  if (remember) return role === "super_admin" ? rememberedSuperAdminSessionMaxAge : rememberedAdminSessionMaxAge;
  return role === "super_admin" ? superAdminSessionMaxAge : adminSessionMaxAge;
}

export function isUciSession(session: AdminSession | null | undefined): session is AdminSession & { role: "uci" } {
  return session?.role === "uci";
}

export function canOperateEventStaff(session: AdminSession | null | undefined) {
  return session?.role === "super_admin" || session?.role === "uci";
}

export function canOperateLuckyDraw(session: AdminSession | null | undefined) {
  return session?.role === "super_admin" || session?.role === "admin" || session?.role === "uci";
}

export function canManageEvaluationAvailability(session: AdminSession | null | undefined) {
  return session?.role === "super_admin" || session?.role === "admin" || session?.role === "uci";
}

export function adminCookieSecure() {
  if (process.env.ADMIN_COOKIE_SECURE === "false") return false;
  if (process.env.NEXT_PUBLIC_BASE_URL?.startsWith("https://")) return true;
  return process.env.NODE_ENV === "production";
}

export function createAdminOtpAutoFillValue(input: { purpose?: SuperAdminOtpPurpose; submissionCode?: string; code: string }) {
  return Buffer.from(JSON.stringify({
    purpose: input.purpose ?? "login",
    submissionCode: input.submissionCode?.trim() || undefined,
    code: normalizeOtpCode(input.code),
  })).toString("base64url");
}

export function getAdminOtpAutoFillCode(value: string | undefined, options: Pick<SuperAdminOtpOptions, "purpose" | "submissionCode"> = {}) {
  if (!value) return "";
  try {
    const payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      purpose?: SuperAdminOtpPurpose;
      submissionCode?: string;
      code?: string;
    };
    const expectedPurpose = options.purpose ?? "login";
    const expectedSubmissionCode = options.submissionCode?.trim() || undefined;
    if (payload.purpose !== expectedPurpose) return "";
    if ((payload.submissionCode?.trim() || undefined) !== expectedSubmissionCode) return "";
    const code = normalizeOtpCode(String(payload.code ?? ""));
    return /^\d{6}$/.test(code) ? code : "";
  } catch {
    return "";
  }
}

export function createAdminSessionToken(session: Pick<AdminSession, "email" | "role"> & { remember?: boolean }, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    email: session.email.trim().toLowerCase(),
    role: session.role,
    issuedAt: now,
    remember: Boolean(session.remember),
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

export function getAdminSession(value?: string, now = Date.now()): AdminSession | null {
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
      remember?: boolean;
    };
    const role = decoded.role;
    if (!decoded.email || (role !== "admin" && role !== "super_admin" && role !== "uci")) return null;
    if (!Number.isFinite(decoded.issuedAt)) return null;
    const remember = Boolean(decoded.remember);
    if (now - Number(decoded.issuedAt) > adminSessionMaxAgeSeconds(role, remember) * 1000) return null;
    return {
      email: decoded.email.trim().toLowerCase(),
      role,
      issuedAt: Number(decoded.issuedAt),
      remember,
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

export async function requestSuperAdminOtp(options: SuperAdminOtpOptions = {}) {
  const now = options.now ?? Date.now();
  const purpose = options.purpose ?? "login";
  const requestKey = options.requestKey?.trim() || undefined;
  const contextKey = otpContextKey({ purpose, requestKey, submissionCode: options.submissionCode });
  const current = await readSuperAdminOtps();
  const existing = current.find((item) => item.purpose === purpose && item.contextKey === contextKey && now - item.sentAt < otpResendCooldownMs);
  if (existing) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((otpResendCooldownMs - (now - existing.sentAt)) / 1000),
      expiresAt: existing.expiresAt,
    };
  }

  const code = String(randomInt(100000, 1000000));
  const record: SuperAdminOtpRecord = {
    codeHash: adminSecureHash(code, "super-admin-otp"),
    expiresAt: now + otpMaxAgeMs,
    sentAt: now,
    attempts: 0,
    purpose,
    contextKey,
  };
  await writeSuperAdminOtps([
    ...current.filter((item) => item.expiresAt > now && item.attempts < 5),
    record,
  ]);
  const message = superAdminOtpMessage(code, options);
  const mail = await sendAdminMail({
    to: [...superAdminEmails],
    subject: message.subject,
    text: message.text,
    html: message.html,
    outboxKey: `super-admin-otp-${new Date(now).toISOString().replace(/[:.]/g, "-")}`,
  });
  return {
    ok: true,
    expiresAt: record.expiresAt,
    mailStatus: mail.status,
    autoFillCode: mail.status === "outbox" ? code : undefined,
  };
}

export async function verifySuperAdminOtp(input: string, options: SuperAdminOtpOptions = {}) {
  const now = options.now ?? Date.now();
  const expectedPurpose = options.purpose ?? "login";
  const expectedContextKey = otpContextKey({ purpose: expectedPurpose, requestKey: options.requestKey, submissionCode: options.submissionCode });
  const code = normalizeOtpCode(input);
  if (!/^\d{6}$/.test(code)) return false;
  return enqueueAttemptWrite(async () => {
    const records = await readSuperAdminOtps();
    const activeRecords = records.filter((item) => item.expiresAt >= now && item.attempts < 5);
    const matchingRecords = activeRecords.filter((item) => item.purpose === expectedPurpose && item.contextKey === expectedContextKey);
    const matched = matchingRecords.find((item) => safeEqual(item.codeHash, adminSecureHash(code, "super-admin-otp")));
    if (matched) {
      await writeSuperAdminOtps(activeRecords.filter((item) => item !== matched));
      return true;
    }
    if (matchingRecords.length) {
      const latest = matchingRecords.reduce((current, item) => item.sentAt > current.sentAt ? item : current);
      await writeSuperAdminOtps(activeRecords.map((item) => item === latest ? { ...item, attempts: item.attempts + 1 } : item));
    } else {
      await writeSuperAdminOtps(activeRecords);
    }
    return false;
  });
}

export function normalizeOtpCode(input: string) {
  return input
    .trim()
    .replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)))
    .replace(/\D/g, "");
}

function otpContextKey(options: Pick<SuperAdminOtpOptions, "purpose" | "requestKey" | "submissionCode">) {
  if (options.purpose === "delete_submission") return `delete_submission:${options.submissionCode?.trim() ?? ""}`;
  if (options.purpose === "reset_lucky_draw") return "reset_lucky_draw";
  if (options.purpose === "reset_submission_reviews") return "reset_submission_reviews";
  return `login:${options.requestKey?.trim() || "legacy"}`;
}

function superAdminOtpMessage(code: string, options: SuperAdminOtpOptions) {
  if (options.purpose === "delete_submission") {
    const submissionCode = options.submissionCode?.trim() || "-";
    const titleTh = options.titleTh?.trim() || "-";
    const teamName = options.teamName?.trim() || "ส่งเดี่ยว / ไม่มีชื่อทีม";
    return {
      subject: `OTP ยืนยันลบใบสมัครประกวด ${submissionCode}`,
      text: [
        "ยืนยันที่จะลบข้อมูลการสมัครประกวดรายการนี้",
        `รหัสรายการ: ${submissionCode}`,
        `ชื่อผลงาน: ${titleTh}`,
        `ชื่อทีม: ${teamName}`,
        "",
        `รหัส OTP: ${code}`,
        "รหัสนี้หมดอายุภายใน 5 นาที",
      ].join("\n"),
      html: [
        "<p>ยืนยันที่จะลบข้อมูลการสมัครประกวดรายการนี้</p>",
        "<ul>",
        `<li><strong>รหัสรายการ:</strong> ${escapeHtml(submissionCode)}</li>`,
        `<li><strong>ชื่อผลงาน:</strong> ${escapeHtml(titleTh)}</li>`,
        `<li><strong>ชื่อทีม:</strong> ${escapeHtml(teamName)}</li>`,
        "</ul>",
        `<p>รหัส OTP คือ</p><h1 style="letter-spacing:8px">${escapeHtml(code)}</h1>`,
        "<p>รหัสนี้หมดอายุภายใน 5 นาที</p>",
      ].join(""),
    };
  }
  if (options.purpose === "reset_lucky_draw") {
    return {
      subject: "OTP ยืนยัน Reset ผล Lucky Draw",
      text: [
        "มีคำขอ Reset ผล Lucky Draw ของ Police Innovation Contest 2026",
        "การดำเนินการนี้จะยกเลิกผลรางวัลปัจจุบันและส่งอีเมลแจ้งผู้ได้รับรางวัลเดิม",
        "",
        `รหัส OTP: ${code}`,
        "รหัสนี้หมดอายุภายใน 5 นาที",
      ].join("\n"),
      html: [
        "<p>มีคำขอ <strong>Reset ผล Lucky Draw</strong> ของ Police Innovation Contest 2026</p>",
        "<p>การดำเนินการนี้จะยกเลิกผลรางวัลปัจจุบันและส่งอีเมลแจ้งผู้ได้รับรางวัลเดิม</p>",
        `<p>รหัส OTP คือ</p><h1 style="letter-spacing:8px">${escapeHtml(code)}</h1>`,
        "<p>รหัสนี้หมดอายุภายใน 5 นาที</p>",
      ].join(""),
    };
  }
  if (options.purpose === "reset_submission_reviews") {
    return {
      subject: "OTP ยืนยัน Reset คะแนนและการตรวจเอกสารเบื้องต้น",
      text: [
        "มีคำขอ Reset คะแนนและการตรวจเอกสารเบื้องต้นของ Police Innovation Contest 2026",
        "การดำเนินการนี้จะล้างคะแนน หมายเหตุ วันที่ตรวจ และสถานะการตรวจ โดยคงผู้ตรวจและการ Assign ไว้",
        "",
        `รหัส OTP: ${code}`,
        "รหัสนี้หมดอายุภายใน 5 นาที",
      ].join("\n"),
      html: [
        "<p>มีคำขอ <strong>Reset คะแนนและการตรวจเอกสารเบื้องต้น</strong> ของ Police Innovation Contest 2026</p>",
        "<p>การดำเนินการนี้จะล้างคะแนน หมายเหตุ วันที่ตรวจ และสถานะการตรวจ โดยคงผู้ตรวจและการ Assign ไว้</p>",
        `<p>รหัส OTP คือ</p><h1 style="letter-spacing:8px">${escapeHtml(code)}</h1>`,
        "<p>รหัสนี้หมดอายุภายใน 5 นาที</p>",
      ].join(""),
    };
  }

  return {
    subject: `รหัส OTP สำหรับ Super Admin: ${code}`,
    text: `รหัส OTP สำหรับเข้าสู่ระบบ Super Admin คือ ${code}\nรหัสนี้หมดอายุภายใน 5 นาที`,
    html: `<p>รหัส OTP สำหรับเข้าสู่ระบบ Super Admin คือ</p><h1 style="letter-spacing:8px">${escapeHtml(code)}</h1><p>รหัสนี้หมดอายุภายใน 5 นาที</p>`,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

async function readSuperAdminOtps(): Promise<SuperAdminOtpRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(otpPath, "utf8")) as SuperAdminOtpRecord | SuperAdminOtpRecord[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeSuperAdminOtps(records: SuperAdminOtpRecord[]) {
  await mkdir(path.dirname(otpPath), { recursive: true });
  const tempPath = `${otpPath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  await rename(tempPath, otpPath);
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
