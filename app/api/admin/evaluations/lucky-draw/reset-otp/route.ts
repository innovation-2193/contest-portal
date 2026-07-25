import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { cookieName, getAdminSession, requestSuperAdminOtp } from "../../../../../../lib/admin-auth";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../../lib/audit-log";
import { publicSiteUrl } from "../../../../../../lib/public-url";

export async function POST(request: NextRequest) {
  const session = getAdminSession(request.cookies.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") {
    return NextResponse.redirect(publicSiteUrl("/admin", request), 303);
  }
  const result = await requestSuperAdminOtp({ purpose: "reset_lucky_draw" });
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "evaluation.lucky_draw_reset_otp_requested",
    entityType: "evaluation",
    summary: "ขอ OTP เพื่อ Reset ผล Lucky Draw",
  }, await headers());
  const status = result.ok
    ? result.mailStatus === "failed" ? "mail_failed" : "sent"
    : "wait";
  return NextResponse.redirect(publicSiteUrl(`/admin/evaluations?resetOtp=${status}`, request), 303);
}
