import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../lib/admin-api-response";
import { listParkingReservations } from "../../../../../lib/admin-store";
import { parkingReservationsPdf } from "../../../../../lib/parking-pdf";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") return adminUnauthorizedResponse(request);

  const reservations = await listParkingReservations();
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "parking.export_pdf",
    entityType: "parking",
    summary: "Export ป้ายสำรองที่จอดรถสำหรับผู้บริหารและแขกผู้มีเกียรติ ผู้จัดแสดงผลงาน และคณะทำงานและเจ้าหน้าที่เป็น PDF",
    payload: { count: reservations.length },
  }, request.headers);

  const pdf = await parkingReservationsPdf(reservations);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="parking-reservations-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
