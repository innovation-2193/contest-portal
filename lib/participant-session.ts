import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const participantSessionCookie = "contest_participant_registration";
export const participantSubmissionCookie = "contest_participant_submission";
export const participantOtpPendingCookie = "contest_participant_otp_pending";
export const participantOtpAutoFillCookie = "contest_participant_otp_autofill";
export const participantSessionMaxAge = 60 * 60 * 24;
export const participantOtpMaxAge = 60 * 60;

export type ParticipantSession = {
  email: string;
  registrationCode?: string;
  issuedAt: number;
};

type ParticipantTokenPayload = ParticipantSession & {
  purpose: "session" | "otp_pending";
  nonce: string;
};

export function createParticipantSessionToken(input: { email: string; registrationCode?: string }, now = Date.now()) {
  return createParticipantToken({
    purpose: "session",
    email: normalizeEmail(input.email),
    registrationCode: input.registrationCode?.trim() || undefined,
    issuedAt: now,
    nonce: randomBytes(18).toString("base64url"),
  });
}

export function getParticipantSession(value?: string, now = Date.now()): ParticipantSession | null {
  const payload = readParticipantToken(value, "session");
  if (!payload || now - payload.issuedAt > participantSessionMaxAge * 1000) return null;
  return {
    email: payload.email,
    registrationCode: payload.registrationCode,
    issuedAt: payload.issuedAt,
  };
}

export function createParticipantOtpPendingToken(email: string, now = Date.now()) {
  return createParticipantToken({
    purpose: "otp_pending",
    email: normalizeEmail(email),
    issuedAt: now,
    nonce: randomBytes(18).toString("base64url"),
  });
}

export function getParticipantOtpPendingEmail(value?: string, now = Date.now()) {
  const payload = readParticipantToken(value, "otp_pending");
  if (!payload || now - payload.issuedAt > participantOtpMaxAge * 1000) return null;
  return payload.email;
}

export function createParticipantOtpAutoFillValue(code: string) {
  return normalizeOtpCode(code);
}

export function getParticipantOtpAutoFillCode(value?: string) {
  const code = normalizeOtpCode(value ?? "");
  return /^\d{6}$/.test(code) ? code : "";
}

export function participantCookieSecure() {
  if (process.env.PARTICIPANT_COOKIE_SECURE === "false") return false;
  if (process.env.NEXT_PUBLIC_BASE_URL?.startsWith("https://")) return true;
  return process.env.NODE_ENV === "production";
}

function createParticipantToken(payload: ParticipantTokenPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function readParticipantToken(value: string | undefined, expectedPurpose: ParticipantTokenPayload["purpose"]) {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1] || !safeEqual(parts[1], sign(parts[0]))) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Partial<ParticipantTokenPayload>;
    if (payload.purpose !== expectedPurpose || !payload.email || !Number.isFinite(payload.issuedAt)) return null;
    return {
      purpose: payload.purpose,
      email: normalizeEmail(payload.email),
      registrationCode: payload.registrationCode?.trim() || undefined,
      issuedAt: Number(payload.issuedAt),
      nonce: String(payload.nonce ?? ""),
    } satisfies ParticipantTokenPayload;
  } catch {
    return null;
  }
}

function sign(payload: string) {
  return createHmac("sha256", participantSecret()).update(payload).digest("base64url");
}

function participantSecret() {
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
    .replace(/\D/g, "")
    .slice(0, 6);
}

function safeEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}
