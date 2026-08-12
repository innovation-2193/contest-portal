import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { listEventBooths } from "../../../../../lib/event-booths";
import { buildUciBoothLabelsPdf } from "../../../../../lib/event-booth-reports";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = getAdminSession((await cookies()).get(cookieName)?.value);
  if (!session || !["uci", "super_admin"].includes(session.role)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const booths = await listEventBooths(session.email);
  const pdf = await buildUciBoothLabelsPdf(booths);
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "event_booth.uci_labels_pdf", entityType: "event_booth", summary: `Export ป้ายประจำบูธสำหรับ UCI ${booths.length} บูธ` }, request.headers);
  return pdfResponse(pdf, `uci-booth-labels-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function pdfResponse(pdf: Buffer, filename: string) { return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } }); }
