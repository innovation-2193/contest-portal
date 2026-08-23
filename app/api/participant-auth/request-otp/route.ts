import { NextRequest, NextResponse } from "next/server";
import { recordAuditEvent } from "../../../../lib/audit-log";
import { normalizeParticipantEmail, requestParticipantLoginOtp } from "../../../../lib/participant-auth";
import {
  createParticipantOtpAutoFillValue,
  createParticipantOtpPendingToken,
  normalizeParticipantReturnTo,
  participantCookieSecure,
  participantOtpAutoFillCookie,
  participantOtpMaxAge,
  participantOtpPendingCookie,
} from "../../../../lib/participant-session";
import { publicSiteUrl } from "../../../../lib/public-url";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = normalizeParticipantEmail(String(formData.get("email") ?? ""));
  const returnTo = normalizeParticipantReturnTo(String(formData.get("next") ?? ""));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return NextResponse.redirect(publicSiteUrl("/profile/login?status=invalid_email", request), 303);
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
  const response = NextResponse.redirect(publicSiteUrl(`/profile/login?status=${status}&next=${encodeURIComponent(returnTo)}`, request), 303);
  response.cookies.set(participantOtpPendingCookie, createParticipantOtpPendingToken(email, Date.now(), returnTo), {
    httpOnly: true,
    sameSite: "lax",
    secure: participantCookieSecure(),
    path: "/",
    maxAge: participantOtpMaxAge,
  });
  if (result.ok && result.autoFillCode) {
    response.cookies.set(participantOtpAutoFillCookie, createParticipantOtpAutoFillValue(result.autoFillCode), {
      httpOnly: true,
      sameSite: "lax",
      secure: participantCookieSecure(),
      path: "/",
      maxAge: 5 * 60,
    });
  } else {
    response.cookies.delete(participantOtpAutoFillCookie);
  }
  return response;
}
