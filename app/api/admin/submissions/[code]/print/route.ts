import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../../lib/audit-log";
import { cookieName, getAdminSession } from "../../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../../lib/admin-api-response";
import { getSubmissionDetail } from "../../../../../../lib/admin-store";
import { submissionPrintPacketPdf } from "../../../../../../lib/submission-print-packet";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) {
    return adminUnauthorizedResponse(request);
  }

  const { code } = await params;
  const submission = await getSubmissionDetail(decodeURIComponent(code));
  if (!submission) return NextResponse.json({ error: "submission not found" }, { status: 404 });
  if (session.role !== "super_admin" && submission.review_assigned_admin_email?.toLowerCase() !== session.email.toLowerCase()) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "submission.print_packet",
      entityType: "submission",
      entityId: submission.submission_code,
      summary: `เปิดชุดพิมพ์ใบสมัครประกวด ${submission.submission_code}`,
    }, request.headers);
    const packet = await submissionPrintPacketPdf(submission);
    return new NextResponse(new Uint8Array(packet), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${submission.submission_code}-print-packet.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "ไม่สามารถสร้างไฟล์ PDF รวมได้" },
      { status: 500 },
    );
  }
}
