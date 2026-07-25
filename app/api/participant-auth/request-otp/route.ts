import { NextRequest, NextResponse } from "next/server";
import { recordAuditEvent } from "../../../../lib/audit-log";
import { normalizeParticipantEmail, requestParticipantLoginOtp } from "../../../../lib/participant-auth";
import {
  createParticipantOtpPendingToken,
  participantCookieSecure,
  participantOtpMaxAge,
  participantOtpPendingCookie,
} from "../../../../lib/participant-session";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = normalizeParticipantEmail(String(formData.get("email") ?? ""));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return NextResponse.redirect(new URL("/profile/login?status=invalid_email", request.url), 303);
  }

  const result = await requestParticipantLoginOtp(email);
  await recordAuditEvent({
    actor: { type: "public", email },
    action: "auth.participant_otp_requested",
    entityType: "participant_profile",
    summary: "ขอ OTP เข้าสู่โปรไฟล์ผู้เข้าร่วมงาน",
    payload: { delivery: result.delivery },
  }, request.headers);
  const status = !result.ok
    ? "otp_wait"
    : result.delivery === "failed"
      ? "otp_mail_failed"
      : "otp_sent";
  const response = NextResponse.redirect(new URL(`/profile/login?status=${status}`, request.url), 303);
  response.cookies.set(participantOtpPendingCookie, createParticipantOtpPendingToken(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: participantCookieSecure(),
    path: "/",
    maxAge: participantOtpMaxAge,
  });
  return response;
}
