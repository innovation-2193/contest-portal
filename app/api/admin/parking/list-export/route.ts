import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { canOperateEventStaff, cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../lib/admin-api-response";
import { listParkingReservations } from "../../../../../lib/admin-store";
import { parkingReservationsListPdf } from "../../../../../lib/parking-pdf";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session || !canOperateEventStaff(session)) return adminUnauthorizedResponse(request);

  const reservations = await listParkingReservations();
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "parking.export_list_pdf",
    entityType: "parking",
    summary: "Export รายการสำรองที่จอดรถเป็น PDF",
    payload: { count: reservations.length },
  }, request.headers);

  const pdf = await parkingReservationsListPdf(reservations);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="parking-reservation-list-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
