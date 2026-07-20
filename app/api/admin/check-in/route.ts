import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../lib/audit-log";
import { cookieName, getAdminSession } from "../../../../lib/admin-auth";
import { checkInParticipant } from "../../../../lib/admin-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const registrationCode = extractRegistrationCode(String(body.code ?? ""));
    if (!registrationCode) {
      return NextResponse.json({ error: "ไม่พบเลขลงทะเบียนจาก QR Code" }, { status: 422 });
    }

    const record = await checkInParticipant(registrationCode, session.email);
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "registration.checked_in",
      entityType: "registration",
      entityId: registrationCode,
      summary: record.wasAlreadyCheckedIn
        ? `สแกนซ้ำผู้เข้าร่วมงานที่เช็คอินแล้ว ${registrationCode}`
        : `เช็คอินผู้เข้าร่วมงาน ${registrationCode}`,
      payload: {
        registrationCode,
        checkedInByEmail: record.checked_in_by_email ?? session.email,
        checkedInAt: record.checked_in_at,
        wasAlreadyCheckedIn: Boolean(record.wasAlreadyCheckedIn),
      },
    }, request.headers);
    return NextResponse.json({
      registrationCode: record.registration_code,
      name: `${record.title}${record.first_name} ${record.last_name}`,
      participantRole: record.participant_role,
      phone: record.phone,
      position: record.position,
      division: record.division,
      bureau: record.bureau,
      status: record.status,
      checkedInAt: record.checked_in_at,
      checkedInByEmail: record.checked_in_by_email,
      wasAlreadyCheckedIn: Boolean(record.wasAlreadyCheckedIn),
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message = code === "NOT_FOUND"
      ? "ไม่พบข้อมูลลงทะเบียน"
      : code === "CANCELLED"
        ? "รายการนี้ถูกยกเลิกแล้ว ไม่สามารถเช็คอินได้"
        : "ไม่สามารถเช็คอินได้";
    return NextResponse.json({ error: message }, { status: code === "NOT_FOUND" ? 404 : 422 });
  }
}

function extractRegistrationCode(value: string) {
  const decoded = value.trim();
  const matched = decoded.match(/REG-\d{4}-[A-Z0-9]+/i);
  return matched?.[0].toUpperCase() ?? "";
}
