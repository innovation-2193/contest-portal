import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import PDFKitDocument from "pdfkit";
import { PDFDocument as PdfLibDocument } from "pdf-lib";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../../lib/audit-log";
import { cookieName, getAdminSession } from "../../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../../lib/admin-api-response";
import {
  getSubmissionDetail,
  getSubmissionFile,
  type AdminSubmissionDetail,
} from "../../../../../../lib/admin-store";
import {
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
} from "../../../../../../lib/pdf-theme";
import {
  readSubmissionPdfFile,
  submissionDocumentTypes,
} from "../../../../../../lib/submission-file-reader";

export const runtime = "nodejs";

const documentLabels: Record<string, string> = {
  ownership: "3.1 หลักฐานความเป็นเจ้าของผลงาน",
  concept: "3.2 แบบสรุปผลงานโดยย่อ",
  prototype: "3.3 หลักฐานต้นแบบหรือการทดลอง",
  implementation: "3.4 แผนต่อยอดใช้งานจริง",
};

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

async function submissionPrintPacketPdf(submission: AdminSubmissionDetail) {
  const detailPdf = await submissionDetailPdf(submission);
  const merged = await PdfLibDocument.create();
  const missingAttachments: string[] = [];
  await appendPdf(merged, detailPdf);

  for (const type of submissionDocumentTypes) {
    const file = await getSubmissionFile(submission.submission_code, type);
    if (!file) {
      missingAttachments.push(documentLabels[type]);
      continue;
    }
    const bytes = await readSubmissionPdfFile(file);
    if (!bytes) {
      missingAttachments.push(`${documentLabels[type]} (${file.original_name})`);
      continue;
    }
    try {
      await appendPdf(merged, bytes);
    } catch {
      missingAttachments.push(`${documentLabels[type]} (${file.original_name})`);
    }
  }

  if (missingAttachments.length > 0) {
    await appendPdf(merged, await missingAttachmentSummaryPdf(submission, missingAttachments));
  }

  return Buffer.from(await merged.save());
}

async function appendPdf(target: PdfLibDocument, sourceBytes: Uint8Array | Buffer) {
  const source = await PdfLibDocument.load(sourceBytes, { ignoreEncryption: true });
  const pages = await target.copyPages(source, source.getPageIndices());
  pages.forEach((page) => target.addPage(page));
}

async function submissionDetailPdf(submission: AdminSubmissionDetail) {
  const doc = new PDFKitDocument({ size: "A4", margin: 0 });
  const pdf = collectPdf(doc);
  const width = 595.28;
  const height = 841.89;
  let page = 1;

  doc.info.Title = `ข้อมูลสมัครประกวด ${submission.submission_code}`;
  doc.info.Subject = "Police Innovation Contest 2026 submission print packet";
  doc.info.Author = "Police Innovation Contest 2026";

  const startPage = () => {
    doc.rect(0, 0, width, height).fill(PDF_THEME.paper);
    drawDocumentHeader(doc, {
      title: "ข้อมูลใบสมัครประกวดนวัตกรรม",
      subtitle: `ออกรายงานเมื่อ ${formatPdfThaiDateTime(new Date())}`,
      metaLabel: "เลขที่สมัคร",
      metaValue: submission.submission_code,
    });
  };

  const footer = () => drawPacketFooter(doc, page, submission.submission_code);

  startPage();
  let y = 132;
  y = drawSectionTitle(doc, "ข้อมูลผลงาน", y);
  y = drawInfoGrid(doc, [
    ["ชื่อผลงานภาษาไทย", submission.title_th],
    ["Innovation Title", submission.title_en || "-"],
    ["ประเภทการส่ง", submission.submission_type === "team" ? `ส่งแบบกลุ่ม${submission.team_name ? ` (${submission.team_name})` : ""}` : "ส่งเดี่ยว"],
    ["สถานะ", submission.status],
    ["บัญชีอีเมล", submission.email],
    ["Link Video", submission.video_url || "-"],
    ["คำอธิบายย่อ", submission.summary],
  ], y);

  y += 6;
  y = drawSectionTitle(doc, "ข้อมูลผู้สมัครและสมาชิกทีม", y);
  for (const member of submission.members) {
    if (y > 635) {
      footer();
      doc.addPage({ size: "A4", margin: 0 });
      page += 1;
      startPage();
      y = 132;
    }
    y = drawMemberCard(doc, member.member_order === 1 ? "ผู้สมัครหลัก" : `สมาชิกคนที่ ${member.member_order}`, member, y);
  }

  if (y > 520) {
    footer();
    doc.addPage({ size: "A4", margin: 0 });
    page += 1;
    startPage();
    y = 132;
  }
  y += 4;
  y = drawSectionTitle(doc, "ไฟล์แนบที่จะพิมพ์ต่อท้าย", y);
  for (const type of submissionDocumentTypes) {
    const file = submission.files.find((item) => item.document_type === type);
    y = drawAttachmentRow(doc, documentLabels[type], file?.original_name ?? "-", y);
  }

  if (y > 720) {
    footer();
    doc.addPage({ size: "A4", margin: 0 });
    page += 1;
    startPage();
    y = 132;
  }

  doc.roundedRect(34, y + 10, width - 68, 52, 8).fillAndStroke(PDF_THEME.goldSoft, "#e5cd70");
  doc.font(pdfFontBold).fontSize(11.5).fillColor(PDF_THEME.navy).text(
    "เอกสารนี้รวมหน้าข้อมูลใบสมัคร และแนบ PDF ทั้ง 4 รายการต่อท้ายในไฟล์เดียว",
    50,
    y + 28,
    { width: width - 100, align: "center", lineBreak: false },
  );

  footer();
  doc.end();
  return pdf;
}

async function missingAttachmentSummaryPdf(submission: AdminSubmissionDetail, missingAttachments: string[]) {
  const doc = new PDFKitDocument({ size: "A4", margin: 0 });
  const pdf = collectPdf(doc);
  const width = 595.28;

  doc.info.Title = `รายการไฟล์แนบไม่พร้อม ${submission.submission_code}`;
  doc.rect(0, 0, width, 841.89).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "สรุปไฟล์แนบที่ไม่พร้อมพิมพ์",
    subtitle: `ออกรายงานเมื่อ ${formatPdfThaiDateTime(new Date())}`,
    metaLabel: "เลขที่สมัคร",
    metaValue: submission.submission_code,
  });

  let y = 140;
  doc.roundedRect(34, y, width - 68, 78, 9).fillAndStroke(PDF_THEME.goldSoft, "#e5cd70");
  doc.font(pdfFontBold).fontSize(13).fillColor(PDF_THEME.navy).text(
    "ระบบสร้างไฟล์ข้อมูลผู้สมัครให้แล้ว แต่ไฟล์แนบบางรายการไม่พร้อมรวมใน PDF",
    52,
    y + 18,
    { width: width - 104, lineGap: 3 },
  );
  doc.font(pdfFontRegular).fontSize(10).fillColor(PDF_THEME.text).text(
    "ทีมงานสามารถตรวจสอบหรืออัปโหลดไฟล์แนบใหม่จากหน้ารายละเอียดใบสมัคร",
    52,
    y + 52,
    { width: width - 104 },
  );

  y += 108;
  y = drawSectionTitle(doc, "รายการที่ไม่พร้อม", y);
  missingAttachments.forEach((label, index) => {
    doc.roundedRect(34, y, width - 68, 38, 7).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(pdfFontBold).fontSize(10).fillColor(PDF_THEME.gold).text(String(index + 1).padStart(2, "0"), 48, y + 13, {
      width: 34,
      lineBreak: false,
    });
    doc.font(pdfFontRegular).fontSize(10.5).fillColor(PDF_THEME.text).text(label, 88, y + 12, {
      width: width - 136,
      ellipsis: true,
      lineBreak: false,
    });
    y += 44;
  });

  drawPacketFooter(doc, 1, submission.submission_code);
  doc.end();
  return pdf;
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, y: number) {
  doc.font(pdfFontBold).fontSize(14).fillColor(PDF_THEME.navy).text(title, 34, y, {
    width: 527,
    lineBreak: false,
  });
  doc.moveTo(34, y + 22).lineTo(561, y + 22).lineWidth(0.8).stroke(PDF_THEME.line);
  return y + 34;
}

function drawInfoGrid(doc: PDFKit.PDFDocument, rows: Array<[string, string]>, y: number) {
  const x = 34;
  const gap = 8;
  const cellWidth = (527 - gap) / 2;
  let cursorY = y;
  const regularRows = rows.slice(0, -1);
  for (let index = 0; index < regularRows.length; index += 2) {
    drawInfoCell(doc, regularRows[index][0], regularRows[index][1], x, cursorY, cellWidth, 50);
    if (regularRows[index + 1]) {
      drawInfoCell(doc, regularRows[index + 1][0], regularRows[index + 1][1], x + cellWidth + gap, cursorY, cellWidth, 50);
    }
    cursorY += 58;
  }

  const [wideLabel, wideValue] = rows[rows.length - 1];
  drawInfoCell(doc, wideLabel, wideValue, x, cursorY, 527, 72);
  return cursorY + 82;
}

function drawInfoCell(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number, height: number) {
  doc.roundedRect(x, y, width, height, 7).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(pdfFontBold).fontSize(8.5).fillColor(PDF_THEME.gold).text(label, x + 11, y + 9, {
    width: width - 22,
    lineBreak: false,
  });
  doc.font(pdfFontRegular).fontSize(10.5).fillColor(PDF_THEME.text).text(clean(value), x + 11, y + 25, {
    width: width - 22,
    height: height - 30,
    ellipsis: true,
    lineGap: 1,
  });
}

function drawMemberCard(
  doc: PDFKit.PDFDocument,
  title: string,
  member: AdminSubmissionDetail["members"][number],
  y: number,
) {
  const x = 34;
  const width = 527;
  const height = 108;
  doc.roundedRect(x, y, width, height, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.roundedRect(x + 12, y + 12, 98, 24, 12).fill(PDF_THEME.paleBlue);
  doc.font(pdfFontBold).fontSize(9).fillColor(PDF_THEME.navy).text(title, x + 22, y + 20, {
    width: 78,
    align: "center",
    lineBreak: false,
  });
  doc.font(pdfFontBold).fontSize(14).fillColor(PDF_THEME.navy).text(
    `${member.title}${member.first_name} ${member.last_name}`,
    x + 124,
    y + 14,
    { width: width - 146, height: 24, ellipsis: true },
  );

  const details: Array<[string, string]> = [
    ["อีเมล", member.email],
    ["โทร", member.phone],
    ["เลขบัตรประชาชน", member.citizen_id],
    ["ตำแหน่ง", member.position],
    ["กองบังคับการ", member.division],
    ["กองบัญชาการ", member.bureau],
  ];
  let cursorX = x + 124;
  let cursorY = y + 46;
  details.forEach(([label, value], index) => {
    if (index === 3) {
      cursorX = x + 124;
      cursorY += 28;
    }
    drawTinyDetail(doc, label, value, cursorX, cursorY, 130);
    cursorX += 132;
  });
  return y + height + 10;
}

function drawTinyDetail(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number) {
  doc.font(pdfFontBold).fontSize(7.5).fillColor(PDF_THEME.muted).text(label, x, y, {
    width,
    lineBreak: false,
  });
  doc.font(pdfFontRegular).fontSize(8.8).fillColor(PDF_THEME.text).text(clean(value), x, y + 11, {
    width,
    height: 14,
    ellipsis: true,
  });
}

function drawAttachmentRow(doc: PDFKit.PDFDocument, label: string, filename: string, y: number) {
  doc.roundedRect(34, y, 527, 34, 6).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(pdfFontBold).fontSize(9.5).fillColor(PDF_THEME.navy).text(label, 46, y + 11, {
    width: 214,
    lineBreak: false,
  });
  doc.font(pdfFontRegular).fontSize(9).fillColor(PDF_THEME.muted).text(filename, 270, y + 11, {
    width: 276,
    lineBreak: false,
    ellipsis: true,
  });
  return y + 40;
}

function drawPacketFooter(doc: PDFKit.PDFDocument, pageNumber: number, reference: string) {
  const margin = 30;
  const y = doc.page.height - 30;
  doc.moveTo(margin, y - 9).lineTo(doc.page.width - margin, y - 9).lineWidth(0.7).stroke(PDF_THEME.line);
  doc.font(pdfFontRegular).fontSize(8).fillColor(PDF_THEME.muted).text(
    "เอกสารจากระบบ Police Innovation Contest 2026",
    margin,
    y,
    { width: 260, lineBreak: false },
  );
  doc.text(`หน้าข้อมูล ${pageNumber} • ${reference}`, doc.page.width - 260 - margin, y, {
    width: 260,
    align: "right",
    lineBreak: false,
  });
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim() || "-";
}

function collectPdf(doc: PDFKit.PDFDocument) {
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
