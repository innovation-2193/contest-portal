import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../lib/audit-log";
import { cookieName, getAdminSession } from "../../../../lib/admin-auth";
import { claimGiftQr } from "../../../../lib/evaluation-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = getAdminSession((await cookies()).get(cookieName)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { code?: string };
    const result = await claimGiftQr(String(body.code ?? ""), session.email);
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "evaluation.gift_claimed",
      entityType: "evaluation",
      entityId: result.registrationCode,
      summary: result.wasAlreadyClaimed ? `สแกน QR รับของชำร่วยซ้ำ ${result.registrationCode}` : `บันทึกรับของชำร่วย ${result.registrationCode}`,
      payload: { registrationCode: result.registrationCode, claimedAt: result.claimedAt, claimedByEmail: result.claimedByEmail, wasAlreadyClaimed: result.wasAlreadyClaimed },
    }, request.headers);
    return NextResponse.json(result);
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message = code === "NOT_FOUND" ? "ไม่พบ QR Code รับของชำร่วย หรือ QR Code ไม่ถูกต้อง" : code === "INVALID_GIFT_QR" ? "QR Code นี้ไม่ใช่ QR Code รับของชำร่วย" : "ไม่สามารถบันทึกการรับของชำร่วยได้";
    return NextResponse.json({ error: message }, { status: code === "NOT_FOUND" ? 404 : 422 });
  }
}
