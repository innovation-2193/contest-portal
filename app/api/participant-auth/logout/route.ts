import { NextRequest, NextResponse } from "next/server";
import { recordAuditEvent } from "../../../../lib/audit-log";
import {
  getParticipantSession,
  participantOtpPendingCookie,
  participantSessionCookie,
  participantSubmissionCookie,
} from "../../../../lib/participant-session";
import { publicSiteUrl } from "../../../../lib/public-url";

export async function POST(request: NextRequest) {
  const session = getParticipantSession(request.cookies.get(participantSessionCookie)?.value);
  const response = NextResponse.redirect(publicSiteUrl("/profile/login?status=logged_out", request), 303);
  response.cookies.delete(participantSessionCookie);
  response.cookies.delete(participantOtpPendingCookie);
  response.cookies.delete(participantSubmissionCookie);
  if (session) {
    await recordAuditEvent({
      actor: { type: "public", email: session.email },
      action: "auth.participant_logout",
      entityType: "participant_profile",
      entityId: session.registrationCode,
      summary: "ออกจากระบบโปรไฟล์ผู้เข้าร่วมงาน",
    }, request.headers);
  }
  return response;
}
