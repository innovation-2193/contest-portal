import path from "path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../../../lib/audit-log";
import { cookieName, getAdminSession } from "../../../../../../../lib/admin-auth";
import { getSubmissionDetail, getSubmissionFile } from "../../../../../../../lib/admin-store";
import { readSubmissionPdfFile, submissionDocumentTypes } from "../../../../../../../lib/submission-file-reader";

export const runtime = "nodejs";

const documentTypes = new Set<string>(submissionDocumentTypes);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string; type: string }> },
) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { code, type } = await params;
  if (!documentTypes.has(type)) {
    return NextResponse.json({ error: "invalid document type" }, { status: 400 });
  }

  const submission = await getSubmissionDetail(decodeURIComponent(code));
  if (!submission) return NextResponse.json({ error: "submission not found" }, { status: 404 });
  if (session.role !== "super_admin" && submission.review_assigned_admin_email?.toLowerCase() !== session.email.toLowerCase()) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const file = await getSubmissionFile(code, type);
  if (!file) return NextResponse.json({ error: "file not found" }, { status: 404 });
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "submission.file_opened",
    entityType: "submission",
    entityId: code,
    summary: `เปิดไฟล์แนบใบสมัคร ${code}`,
    payload: { documentType: type, fileName: file.original_name },
  }, request.headers);

  const filename = file.original_name.replace(/[^\wก-๙ .()[\]-]+/gu, "_") || `${type}.pdf`;
  const pdf = await readSubmissionPdfFile(file);
  if (pdf) {
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": file.mime_type || "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (/^participants-\d{4}-\d{2}-\d{2}\.pdf$/i.test(path.basename(file.original_name))) {
    return NextResponse.redirect(new URL("/api/admin/participants/export", request.url));
  }

  return NextResponse.json({ error: "file not found" }, { status: 404 });
}
