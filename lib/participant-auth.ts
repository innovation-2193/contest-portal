import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { db } from "./db";
import { ensureDatabaseSchema } from "./db-schema";
import { sendAdminMail } from "./admin-mail";
import { isDatabaseUnavailable } from "./local-registrations";
import { participantOtpMaxAge } from "./participant-session";
import { findRegistrationsByEmail } from "./registration-lookup";
import { findSubmissionsByEmail } from "./submission-lookup";

type ParticipantOtpRecord = {
  email: string;
  codeHash: string;
  expiresAt: number;
  sentAt: number;
  attempts: number;
};

const resendCooldownMs = 60 * 1000;
const maxAttempts = 5;
const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const localOtpPath = path.join(storageDir, "participant-login-otps.json");
let writeQueue: Promise<unknown> = Promise.resolve();

export async function requestParticipantLoginOtp(emailInput: string, now = Date.now()) {
  const email = normalizeEmail(emailInput);
  const [registrations, submissions] = await Promise.all([
    findRegistrationsByEmail(email),
    findSubmissionsByEmail(email),
  ]);
  if (!registrations.length && !submissions.length) {
    return { ok: true, delivery: "skipped" as const, expiresAt: now + participantOtpMaxAge * 1000 };
  }

  const current = await readParticipantOtp(email);
  if (current && now - current.sentAt < resendCooldownMs) {
    return {
      ok: false,
      delivery: "cooldown" as const,
      retryAfterSeconds: Math.ceil((resendCooldownMs - (now - current.sentAt)) / 1000),
      expiresAt: current.expiresAt,
    };
  }

  const code = String(randomInt(100000, 1000000));
  const record: ParticipantOtpRecord = {
    email,
    codeHash: hashOtp(email, code),
    expiresAt: now + participantOtpMaxAge * 1000,
    sentAt: now,
    attempts: 0,
  };
  await writeParticipantOtp(record);
  const owner = registrations[0] ?? submissions[0];
  const name = `${owner.title}${owner.first_name} ${owner.last_name}`.trim();
  const mail = await sendAdminMail({
    to: email,
    subject: `${code} คือรหัส OTP สำหรับเข้าสู่โปรไฟล์ของคุณ`,
    emailHeading: "เข้าสู่โปรไฟล์และดูผลงานของคุณ",
    emailSubtitle: "ยืนยันตัวตนด้วยรหัส OTP ที่ปลอดภัย",
    outboxKey: `participant-login-otp-${email}-${new Date(now).toISOString().replace(/[:.]/g, "-")}`,
    text: [
      `เรียน ${name}`,
      `รหัส OTP: ${code}`,
      "ใช้รหัสนี้เพื่อเข้าสู่โปรไฟล์และดูผลงานของคุณ",
      "รหัสนี้มีอายุ 1 ชั่วโมง และใช้ได้เพียงครั้งเดียว",
      "หากคุณไม่ได้เป็นผู้ขอรหัสนี้ กรุณาเพิกเฉยต่ออีเมล",
    ].join("\n"),
    html: `<p style="margin:0 0 16px">เรียน <strong>${escapeHtml(name)}</strong></p>
      <p style="margin:0 0 22px">เราได้รับคำขอเข้าสู่หน้าโปรไฟล์เพื่อดูข้อมูลลงทะเบียนและผลงานของคุณ โปรดใช้รหัสด้านล่างเพื่อยืนยันตัวตน</p>
      <div style="margin:22px 0;padding:22px 16px;border:1px solid #d8b62f;border-radius:12px;background:#fff9e8;text-align:center">
        <div style="margin-bottom:7px;font-size:13px;font-weight:700;color:#6d5b16">รหัส OTP ของคุณ</div>
        <div style="font-size:38px;font-weight:800;line-height:1.2;letter-spacing:8px;color:#0a2d63" aria-label="รหัส OTP ${escapeHtml(code)}">${escapeHtml(code)}</div>
        <div style="margin-top:9px;font-size:14px;color:#5a6478">ใช้ได้ภายใน 1 ชั่วโมง และใช้ได้เพียงครั้งเดียว</div>
      </div>
      <div style="padding:15px 17px;border-left:4px solid #123c73;background:#f2f6fb;color:#46536a;font-size:14px">
        เพื่อความปลอดภัย กรุณาอย่าส่งต่อรหัสนี้ให้ผู้อื่น หากคุณไม่ได้เป็นผู้ขอรหัส สามารถเพิกเฉยต่ออีเมลฉบับนี้ได้
      </div>`,
  });
  return {
    ok: true,
    delivery: mail.status,
    expiresAt: record.expiresAt,
    autoFillCode: mail.status === "outbox" ? code : undefined,
  };
}

export async function verifyParticipantLoginOtp(emailInput: string, input: string, now = Date.now()) {
  const email = normalizeEmail(emailInput);
  const code = normalizeOtpCode(input);
  if (!/^\d{6}$/.test(code)) return false;
  const record = await readParticipantOtp(email);
  if (!record || record.expiresAt < now || record.attempts >= maxAttempts) {
    await deleteParticipantOtp(email);
    return false;
  }
  if (!safeEqual(record.codeHash, hashOtp(email, code))) {
    await writeParticipantOtp({ ...record, attempts: record.attempts + 1 });
    return false;
  }
  const [registrations, submissions] = await Promise.all([
    findRegistrationsByEmail(email),
    findSubmissionsByEmail(email),
  ]);
  if (!registrations.length && !submissions.length) {
    await deleteParticipantOtp(email);
    return false;
  }
  await deleteParticipantOtp(email);
  return true;
}

export function normalizeParticipantEmail(value: string) {
  return normalizeEmail(value);
}

async function readParticipantOtp(email: string): Promise<ParticipantOtpRecord | null> {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      "SELECT email,code_hash,expires_at,sent_at,attempts FROM participant_login_otps WHERE email=? LIMIT 1",
      [email],
    );
    const row = (rows as Array<{ email: string; code_hash: string; expires_at: number | string; sent_at: number | string; attempts: number }>)[0];
    return row ? {
      email: row.email,
      codeHash: row.code_hash,
      expiresAt: Number(row.expires_at),
      sentAt: Number(row.sent_at),
      attempts: Number(row.attempts),
    } : null;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    await writeQueue.catch(() => undefined);
    const store = await readLocalOtpStore();
    return store[email] ?? null;
  }
}

async function writeParticipantOtp(record: ParticipantOtpRecord) {
  try {
    await ensureDatabaseSchema();
    await db.execute(
      `INSERT INTO participant_login_otps(email,code_hash,expires_at,sent_at,attempts)
       VALUES(?,?,?,?,?)
       ON DUPLICATE KEY UPDATE code_hash=VALUES(code_hash),expires_at=VALUES(expires_at),sent_at=VALUES(sent_at),attempts=VALUES(attempts)`,
      [record.email, record.codeHash, record.expiresAt, record.sentAt, record.attempts],
    );
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    await enqueueLocalOtpWrite(async () => {
      const store = await readLocalOtpStore();
      store[record.email] = record;
      await writeLocalOtpStore(store);
    });
  }
}

async function deleteParticipantOtp(email: string) {
  try {
    await ensureDatabaseSchema();
    await db.execute("DELETE FROM participant_login_otps WHERE email=?", [email]);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    await enqueueLocalOtpWrite(async () => {
      const store = await readLocalOtpStore();
      delete store[email];
      await writeLocalOtpStore(store);
    });
  }
}

function hashOtp(email: string, code: string) {
  return createHmac("sha256", participantAuthSecret()).update(`${email}:${code}`).digest("hex");
}

function participantAuthSecret() {
  return process.env.PARTICIPANT_SESSION_SECRET
    || process.env.ADMIN_SESSION_SECRET
    || process.env.ADMIN_PASSWORD
    || "contest-participant-development-secret";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeOtpCode(value: string) {
  return value
    .trim()
    .replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)))
    .replace(/\D/g, "");
}

function safeEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function enqueueLocalOtpWrite<T>(work: () => Promise<T>) {
  const result = writeQueue.then(work, work);
  writeQueue = result.catch(() => undefined);
  return result;
}

async function readLocalOtpStore(): Promise<Record<string, ParticipantOtpRecord>> {
  try {
    return JSON.parse(await readFile(localOtpPath, "utf8")) as Record<string, ParticipantOtpRecord>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeLocalOtpStore(store: Record<string, ParticipantOtpRecord>) {
  await mkdir(path.dirname(localOtpPath), { recursive: true });
  const tempPath = `${localOtpPath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tempPath, localOtpPath);
}
