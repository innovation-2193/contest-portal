import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { adminNoticePath } from "../../../../../lib/admin-flash";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { drawLuckyWinners, drawLuckyWinnersFromLocalStore, markLuckyWinnerNotified, markLuckyWinnerNotifiedInLocalStore } from "../../../../../lib/evaluation-store";
import { sendLuckyDrawWinnerEmail } from "../../../../../lib/lucky-draw-mail";

export function GET(request: NextRequest) {
  return runLuckyDraw(request);
}

export async function POST(request: NextRequest) {
  return runLuckyDraw(request);
}

async function runLuckyDraw(request: NextRequest) {
  const session = getAdminSession(request.cookies.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") {
    return NextResponse.redirect(new URL("/admin", request.url), 303);
  }

  let winners = await drawLuckyWinners(session.email).catch((error) => {
    console.error("lucky draw failed against database, using local fallback", error);
    return drawLuckyWinnersFromLocalStore(session.email);
  });
  const notifiedCodes: string[] = [];
  for (const winner of winners) {
    if (!winner.lucky_notified_at) {
      const result = await sendLuckyDrawWinnerEmail(winner);
      if (result.status === "sent" || result.status === "outbox") {
        await markLuckyWinnerNotified(winner.registration_code).catch((error) => {
          console.error("mark lucky winner notified failed against database, using local fallback", error);
          return markLuckyWinnerNotifiedInLocalStore(winner.registration_code);
        });
        notifiedCodes.push(winner.registration_code);
      }
    }
  }
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "evaluation.lucky_draw",
    entityType: "evaluation",
    summary: `สุ่ม Lucky Draw ${winners.length} รางวัล`,
    payload: {
      winners: winners.map((winner) => ({ registrationCode: winner.registration_code, prize: winner.lucky_draw_prize })),
      notifiedCodes,
    },
  }, await headers());
  revalidatePath("/admin");
  revalidatePath("/admin/evaluations");
  return NextResponse.redirect(new URL(adminNoticePath("/admin/evaluations", "lucky_draw_done"), request.url), 303);
}
