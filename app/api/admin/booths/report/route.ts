import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listEventBooths } from "../../../../../lib/event-booths";
import { buildExecutiveBoothReportPdf } from "../../../../../lib/event-booth-reports";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const booths = await listEventBooths(session.email);
  const pdf = await buildExecutiveBoothReportPdf(booths);
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "event_booth.executive_report_pdf", entityType: "event_booth", summary: `Export รายงานข้อมูลบูธสำหรับผู้บังคับบัญชา ${booths.length} บูธ`, payload: { booths: booths.length } }, request.headers);
  return pdfResponse(pdf, `executive-booth-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function pdfResponse(pdf: Buffer, filename: string) { return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } }); }
