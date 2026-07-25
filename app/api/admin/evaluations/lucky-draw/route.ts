import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { drawLuckyWinner, markLuckyWinnerNotified, markLuckyWinnerNotifiedInLocalStore, type EvaluationRecord } from "../../../../../lib/evaluation-store";
import { sendLuckyDrawWinnerEmail } from "../../../../../lib/lucky-draw-mail";

export async function POST(request: NextRequest) {
  const session = getAdminSession(request.cookies.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ดำเนินการ" }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { prize?: number } | null;
  const prize = Number(body?.prize);
  let winner: EvaluationRecord;
  try {
    winner = await drawLuckyWinner(prize, session.email);
  } catch (error) {
    const code = String((error as { code?: string }).code ?? "");
    const status = ["DRAW_COMPLETE", "WRONG_PRIZE", "DRAW_CONFLICT"].includes(code) ? 409 : 422;
    const message = code === "NO_CANDIDATE"
      ? "ไม่มีผู้มีสิทธิ์เหลือสำหรับจับฉลาก"
      : code === "DRAW_COMPLETE"
        ? "จับฉลากครบทั้ง 3 รางวัลแล้ว"
        : code === "WRONG_PRIZE"
          ? "กรุณาจับฉลากตามลำดับรางวัล"
          : "ไม่สามารถจับฉลากได้";
    return NextResponse.json({ error: message, code }, { status });
  }

  const mail = await sendLuckyDrawWinnerEmail(winner);
  if (mail.status === "sent" || mail.status === "outbox") {
    await markLuckyWinnerNotified(winner.registration_code).catch((error) => {
      console.error("mark lucky winner notified failed against database, using local fallback", error);
      return markLuckyWinnerNotifiedInLocalStore(winner.registration_code);
    });
    winner = { ...winner, lucky_notified_at: new Date().toISOString() };
  }
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "evaluation.lucky_draw",
    entityType: "evaluation",
    entityId: winner.registration_code,
    summary: `จับฉลาก Lucky Draw รางวัลที่ ${prize}: ${winner.participant_name ?? winner.registration_code}`,
    payload: {
      registrationCode: winner.registration_code,
      prize,
      drawnAt: winner.lucky_drawn_at,
      drawnBy: session.email,
      mailStatus: mail.status,
    },
  }, await headers());
  revalidatePath("/admin");
  revalidatePath("/admin/evaluations");
  return NextResponse.json({
    winner: {
      registrationCode: winner.registration_code,
      name: winner.participant_name ?? winner.registration_code,
      email: winner.email ?? "",
      prize: winner.lucky_draw_prize,
      drawnAt: winner.lucky_drawn_at,
      drawnBy: winner.lucky_drawn_by_email,
      notifiedAt: winner.lucky_notified_at,
    }
  });
}
