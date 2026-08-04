import { NextResponse } from "next/server";
import { getSubmissionDetail } from "../../../../../../lib/admin-store";
import { submissionPrintPacketPdf } from "../../../../../../lib/submission-print-packet";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const submissionCode = decodeURIComponent(code);
  const submission = await getSubmissionDetail(submissionCode);
  if (!submission) return NextResponse.json({ error: "not found" }, { status: 404 });

  const pdf = await submissionPrintPacketPdf(submission, { includeReview: false });
  const fileName = `${safeFileName(`${submission.submission_code}-${submission.title_th}`)}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionAttachment(fileName, `${submission.submission_code}.pdf`),
      "Cache-Control": "public, max-age=60",
    },
  });
}

function safeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140) || "documents";
}

function contentDispositionAttachment(fileName: string, fallbackName: string) {
  const fallback = fallbackName.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-") || "documents.pdf";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRFC5987(fileName)}`;
}

function encodeRFC5987(value: string) {
  return encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
