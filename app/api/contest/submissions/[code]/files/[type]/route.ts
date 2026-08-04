import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../../../lib/admin-guard";
import { getSubmissionDetail, replaceSubmissionFile } from "../../../../../../../lib/admin-store";
import { submissionDocumentTypes } from "../../../../../../../lib/submission-file-reader";

export const runtime = "nodejs";

const documentTypes = new Set<string>(submissionDocumentTypes);
const maxPdfBytes = 10 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string; type: string }> },
) {
  const session = requireSuperAdminRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const { code, type } = await params;
  const submissionCode = decodeURIComponent(code).trim();
  const documentType = decodeURIComponent(type).trim();
  if (!documentTypes.has(documentType)) {
    return NextResponse.json({ ok: false, message: "ประเภทเอกสารไม่ถูกต้อง" }, { status: 400 });
  }

  const form = await request.formData().catch(() => null);
  const value = form?.get("file");
  const file = value instanceof File ? value : null;
  if (!file) {
    return NextResponse.json({ ok: false, message: "กรุณาเลือกไฟล์ PDF" }, { status: 400 });
  }
  if (file.size < 1 || file.size > maxPdfBytes) {
    return NextResponse.json({ ok: false, message: "ไฟล์ PDF ต้องมีขนาดไม่เกิน 10 MB" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") {
    return NextResponse.json({ ok: false, message: "กรุณาอัปโหลดไฟล์ PDF เท่านั้น" }, { status: 400 });
  }

  try {
    const submission = await getSubmissionDetail(submissionCode);
    if (!submission) {
      return NextResponse.json({ ok: false, message: "ไม่พบรายการสมัคร" }, { status: 404 });
    }

    const replaced = await replaceSubmissionFile({
      submissionCode,
      documentType,
      originalName: file.name,
      mimeType: file.type || "application/pdf",
      bytes,
    });

    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "contest.submission_file_replaced",
      entityType: "submission",
      entityId: submissionCode,
      summary: `แทนที่ไฟล์แนบ ${documentType} ของ ${submissionCode}`,
      payload: {
        documentType,
        fileName: replaced.original_name,
        byteSize: replaced.byte_size,
      },
    }, request.headers).catch((error) => {
      console.error("contest file replacement audit failed", error);
    });

    return NextResponse.json({
      ok: true,
      message: `อัปโหลดแทนที่ไฟล์ ${documentLabel(documentType)} แล้ว`,
      file: {
        documentType: replaced.document_type,
        originalName: replaced.original_name,
        byteSize: replaced.byte_size,
      },
    });
  } catch (error) {
    console.error("contest file replacement failed", error);
    return NextResponse.json({
      ok: false,
      message: error instanceof Error ? error.message : "อัปโหลดแทนที่ไฟล์ไม่สำเร็จ",
    }, { status: 500 });
  }
}

function documentLabel(type: string) {
  if (type === "ownership") return "3.1";
  if (type === "concept") return "3.2";
  if (type === "prototype") return "3.3";
  if (type === "implementation") return "3.4";
  return type;
}
