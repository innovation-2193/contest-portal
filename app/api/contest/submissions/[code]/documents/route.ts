import { NextResponse } from "next/server";
import { getSubmissionDetail, getSubmissionFile } from "../../../../../../lib/admin-store";
import { readSubmissionPdfFile, submissionDocumentTypes } from "../../../../../../lib/submission-file-reader";
import { createZip, type ZipEntry } from "../../../../../../lib/zip";

export const runtime = "nodejs";

const documentLabels: Record<string, string> = {
  ownership: "3.1-หลักฐานความเป็นเจ้าของผลงาน",
  concept: "3.2-แบบสรุปผลงานโดยย่อ",
  prototype: "3.3-หลักฐานต้นแบบหรือการทดลอง",
  implementation: "3.4-แผนต่อยอดใช้งานจริง",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const submissionCode = decodeURIComponent(code);
  const submission = await getSubmissionDetail(submissionCode);
  if (!submission) return NextResponse.json({ error: "not found" }, { status: 404 });

  const entries: ZipEntry[] = [];
  for (const [index, type] of submissionDocumentTypes.entries()) {
    const file = await getSubmissionFile(submission.submission_code, type);
    if (!file) continue;
    const data = await readSubmissionPdfFile(file);
    if (!data) continue;
    entries.push({
      name: `${String(index + 1).padStart(2, "0")}-${documentLabels[type]}-${safeFileName(file.original_name)}`,
      data,
      modifiedAt: new Date(submission.submitted_at),
    });
  }

  if (!entries.length) return NextResponse.json({ error: "documents not found" }, { status: 404 });

  const zip = createZip(entries);
  const fileName = `${safeFileName(`${submission.submission_code}-${submission.title_th}`)}.zip`;
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDispositionAttachment(fileName, `${submission.submission_code}.zip`),
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
  const fallback = fallbackName.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-") || "documents.zip";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRFC5987(fileName)}`;
}

function encodeRFC5987(value: string) {
  return encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
