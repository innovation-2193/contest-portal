import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../lib/admin-api-response";
import { getSubmissionDetail, listSubmissions } from "../../../../../lib/admin-store";
import { submissionPrintPacketPdf } from "../../../../../lib/submission-print-packet";
import { createZip, type ZipEntry } from "../../../../../lib/zip";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) return adminUnauthorizedResponse(request);
  if (session.role !== "super_admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const submissions = (await listSubmissions()).sort(compareSubmittedAt);
  const entries: ZipEntry[] = [];
  for (const item of submissions) {
    const detail = await getSubmissionDetail(item.submission_code);
    if (!detail) continue;
    const packet = await submissionPrintPacketPdf(detail, { includeReview: false });
    entries.push({
      name: `${safeFileName(`${detail.submission_code}-${detail.title_th}`)}.pdf`,
      data: packet,
      modifiedAt: new Date(detail.submitted_at),
    });
  }

  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "submission.review_packets_zip",
    entityType: "submission",
    summary: "Export ZIP รวม PDF ใบสมัครประกวดทุกโครงการสำหรับตรวจ",
    payload: { count: entries.length },
  }, request.headers);

  const zip = createZip(entries.length ? entries : [{ name: "empty.txt", data: Buffer.from("No submissions", "utf8") }]);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="submission-review-packets-${new Date().toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function safeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "submission";
}

function compareSubmittedAt<T extends { submitted_at: string }>(left: T, right: T) {
  return new Date(left.submitted_at).getTime() - new Date(right.submitted_at).getTime();
}
