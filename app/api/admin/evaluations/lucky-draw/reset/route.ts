import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { cookieName, getAdminSession, verifySuperAdminOtp } from "../../../../../../lib/admin-auth";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../../lib/audit-log";
import { markLuckyDrawResetNotified, resetLuckyDraw } from "../../../../../../lib/evaluation-store";
import { sendLuckyDrawResetEmail } from "../../../../../../lib/lucky-draw-mail";

export async function POST(request: NextRequest) {
  const session = getAdminSession(request.cookies.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") {
    return NextResponse.redirect(new URL("/admin", request.url), 303);
  }
  const formData = await request.formData();
  const otpOk = await verifySuperAdminOtp(String(formData.get("otp") ?? ""), {
    purpose: "reset_lucky_draw",
  });
  if (!otpOk) {
    return NextResponse.redirect(new URL("/admin/evaluations?resetOtp=failed", request.url), 303);
  }

  let result;
  try {
    result = await resetLuckyDraw(session.email);
  } catch (error) {
    const code = String((error as { code?: string }).code ?? "");
    const status = code === "NOTHING_TO_RESET" ? "empty" : "error";
    return NextResponse.redirect(new URL(`/admin/evaluations?resetOtp=${status}`, request.url), 303);
  }

  const notifications = [];
  for (const winner of result.winners) {
    const mail = await sendLuckyDrawResetEmail(winner);
    notifications.push({
      registrationCode: winner.registration_code,
      prize: winner.lucky_draw_prize,
      status: mail.status,
    });
    if ((mail.status === "sent" || mail.status === "outbox") && result.cycleNo > 0) {
      await markLuckyDrawResetNotified(result.cycleNo, winner.registration_code);
    }
  }
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "evaluation.lucky_draw_reset",
    entityType: "evaluation",
    entityId: `cycle-${result.cycleNo}`,
    summary: `Reset ผล Lucky Draw ${result.winners.length} รางวัลด้วย OTP`,
    payload: {
      cycleNo: result.cycleNo,
      resetBy: session.email,
      winners: result.winners.map((winner) => ({
        registrationCode: winner.registration_code,
        name: winner.participant_name,
        email: winner.email,
        prize: winner.lucky_draw_prize,
        drawnAt: winner.lucky_drawn_at,
        drawnBy: winner.lucky_drawn_by_email,
      })),
      notifications,
    },
  }, await headers());
  revalidatePath("/admin");
  revalidatePath("/admin/evaluations");
  const hasFailedMail = notifications.some((item) => item.status === "failed");
  return NextResponse.redirect(
    new URL(`/admin/evaluations?resetOtp=${hasFailedMail ? "reset_mail_failed" : "reset_done"}`, request.url),
    303,
  );
}
