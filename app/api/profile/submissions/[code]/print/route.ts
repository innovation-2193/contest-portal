import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSubmissionDetail } from "../../../../../../lib/admin-store";
import { recordAuditEvent } from "../../../../../../lib/audit-log";
import {
  getParticipantSession,
  participantSessionCookie,
} from "../../../../../../lib/participant-session";
import { submissionPrintPacketPdf } from "../../../../../../lib/submission-print-packet";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const cookieStore = await cookies();
  const session = getParticipantSession(cookieStore.get(participantSessionCookie)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { code } = await params;
  const submission = await getSubmissionDetail(decodeURIComponent(code));
  if (!submission) return NextResponse.json({ error: "submission not found" }, { status: 404 });
  if (!canAccessSubmission(session.email, submission)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    await recordAuditEvent({
      actor: { type: "public", email: session.email },
      action: "submission.print_packet",
      entityType: "submission",
      entityId: submission.submission_code,
      summary: `ผู้สมัครดาวน์โหลดข้อมูลใบสมัครประกวด ${submission.submission_code}`,
    }, request.headers);
    const packet = await submissionPrintPacketPdf(submission, { includeReview: false });
    return new NextResponse(new Uint8Array(packet), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${submission.submission_code}-application.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "ไม่สามารถสร้างไฟล์ PDF ได้" },
      { status: 500 },
    );
  }
}

function canAccessSubmission(
  email: string,
  submission: Awaited<ReturnType<typeof getSubmissionDetail>>,
) {
  if (!submission) return false;
  const normalizedEmail = email.trim().toLowerCase();
  if (submission.email.trim().toLowerCase() === normalizedEmail) return true;
  return submission.members.some((member) => member.email.trim().toLowerCase() === normalizedEmail);
}
