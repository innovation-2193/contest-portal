import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminUnauthorizedResponse } from "../../../../../lib/admin-api-response";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { listSubmissionChecklistRows } from "../../../../../lib/admin-store";
import { listAdminAccounts } from "../../../../../lib/admin-users";
import {
  buildSubmissionReviewContactReport,
  submissionReviewContactPdf,
} from "../../../../../lib/submission-review-contact-pdf";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) return adminUnauthorizedResponse(request);
  if (session.role !== "super_admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [submissionRows, admins] = await Promise.all([
    listSubmissionChecklistRows(),
    listAdminAccounts(),
  ]);
  const rows = buildSubmissionReviewContactReport(submissionRows, admins);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "submission.progress1_export_pdf",
    entityType: "submission",
    summary: "Export PDF รายงานผลงานและผู้ตรวจเอกสารเบื้องต้น",
    payload: { count: rows.length, sort: "submitted_at_asc" },
  }, request.headers);

  const pdf = await submissionReviewContactPdf(rows);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="progress1-review-contacts-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
