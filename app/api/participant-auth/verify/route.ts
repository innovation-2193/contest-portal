import { NextRequest, NextResponse } from "next/server";
import { recordAuditEvent } from "../../../../lib/audit-log";
import { verifyParticipantLoginOtp } from "../../../../lib/participant-auth";
import { findRegistrationsByEmail } from "../../../../lib/registration-lookup";
import { findSubmissionsByEmail } from "../../../../lib/submission-lookup";
import {
  createParticipantSessionToken,
  getParticipantOtpPendingEmail,
  participantCookieSecure,
  participantOtpPendingCookie,
  participantSessionCookie,
  participantSessionMaxAge,
} from "../../../../lib/participant-session";

export async function POST(request: NextRequest) {
  const email = getParticipantOtpPendingEmail(request.cookies.get(participantOtpPendingCookie)?.value);
  if (!email) {
    return NextResponse.redirect(new URL("/profile/login?status=otp_expired", request.url), 303);
  }
  const formData = await request.formData();
  const valid = await verifyParticipantLoginOtp(email, String(formData.get("otp") ?? ""));
  if (!valid) {
    return NextResponse.redirect(new URL("/profile/login?status=otp_failed", request.url), 303);
  }
  const [registrations, submissions] = await Promise.all([
    findRegistrationsByEmail(email),
    findSubmissionsByEmail(email),
  ]);
  const response = NextResponse.redirect(new URL("/profile", request.url), 303);
  response.cookies.set(participantSessionCookie, createParticipantSessionToken({
    email,
    registrationCode: registrations[0]?.registration_code,
  }), {
    httpOnly: true,
    sameSite: "lax",
    secure: participantCookieSecure(),
    path: "/",
    maxAge: participantSessionMaxAge,
  });
  response.cookies.delete(participantOtpPendingCookie);
  await recordAuditEvent({
    actor: { type: "public", email },
    action: "auth.participant_login",
    entityType: "participant_profile",
    entityId: registrations[0]?.registration_code ?? submissions[0]?.submission_code,
    summary: "เข้าสู่โปรไฟล์และดูผลงานด้วย OTP",
  }, request.headers);
  return response;
}
