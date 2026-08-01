import { NextResponse } from "next/server";
import { getSubmissionDetail } from "../../../../../../lib/admin-store";
import { clientIpFromRequest } from "../../../../../../lib/pdf-watermark";
import { reviewerLabel } from "../../../../../../lib/progress-review";
import { submissionPrintPacketPdf } from "../../../../../../lib/submission-print-packet";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const exporterIp = clientIpFromRequest(request);
  const { code } = await params;
  const submission = await getSubmissionDetail(decodeURIComponent(code));
  if (!submission) return NextResponse.json({ error: "submission not found" }, { status: 404 });

  try {
    const packet = await submissionPrintPacketPdf(submission, {
      reviewerLabel: await reviewerLabel({
        assignedEmail: submission.review_assigned_admin_email,
        scoredEmail: submission.review_scored_by_email,
      }),
      watermarkIp: exporterIp,
    });
    return new NextResponse(new Uint8Array(packet), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${submission.submission_code}-executive-review-packet.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "ไม่สามารถสร้างไฟล์ PDF ได้" },
      { status: 500 },
    );
  }
}
