import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { adminUnauthorizedResponse } from "../../../../../lib/admin-api-response";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listSubmissionChecklistRows } from "../../../../../lib/admin-store";
import { submissionChecklistPdf } from "../../../../../lib/submission-checklist-pdf";
import { buildSubmissionChecklistReport } from "../../../../../lib/submission-checklist-report";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return adminUnauthorizedResponse(request);

  const rows = await buildSubmissionChecklistReport(await listSubmissionChecklistRows());
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "submission.checklist_export_pdf",
    entityType: "submission",
    summary: "Export รายงานตรวจไฟล์แนบและลิงก์วิดีโอ",
    payload: { count: rows.length },
  }, request.headers);

  const pdf = await submissionChecklistPdf(rows);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="submission-checklist-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
