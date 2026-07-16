import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieName, verifyAdminToken } from "../../../../lib/admin-auth";
import { checkInParticipant } from "../../../../lib/admin-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  if (!verifyAdminToken(cookieStore.get(cookieName)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const registrationCode = extractRegistrationCode(String(body.code ?? ""));
    if (!registrationCode) {
      return NextResponse.json({ error: "ไม่พบเลขลงทะเบียนจาก QR Code" }, { status: 422 });
    }

    const record = await checkInParticipant(registrationCode);
    return NextResponse.json({
      registrationCode: record.registration_code,
      name: `${record.title}${record.first_name} ${record.last_name}`,
      phone: record.phone,
      position: record.position,
      division: record.division,
      bureau: record.bureau,
      status: record.status,
      checkedInAt: record.checked_in_at,
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
