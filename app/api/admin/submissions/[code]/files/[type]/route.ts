import path from "path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieName, verifyAdminToken } from "../../../../../../../lib/admin-auth";
import { getSubmissionFile } from "../../../../../../../lib/admin-store";
import { readSubmissionPdfFile, submissionDocumentTypes } from "../../../../../../../lib/submission-file-reader";

export const runtime = "nodejs";

const documentTypes = new Set<string>(submissionDocumentTypes);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string; type: string }> },
) {
  const cookieStore = await cookies();
  if (!verifyAdminToken(cookieStore.get(cookieName)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { code, type } = await params;
  if (!documentTypes.has(type)) {
    return NextResponse.json({ error: "invalid document type" }, { status: 400 });
  }

  const file = await getSubmissionFile(code, type);
  if (!file) return NextResponse.json({ error: "file not found" }, { status: 404 });

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
