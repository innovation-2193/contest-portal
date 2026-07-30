import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../lib/admin-api-response";
import { listSubmissionApplicantsForExport, type SubmissionApplicantExportRow } from "../../../../../lib/admin-store";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
  type PdfFontSet,
} from "../../../../../lib/pdf-theme";

export const runtime = "nodejs";

const reportFonts: PdfFontSet = {
  regular: pdfFontRegular,
  bold: pdfFontBold,
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) return adminUnauthorizedResponse(request);
  if (session.role !== "super_admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const applicants = await listSubmissionApplicantsForExport();
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "submission.applicants_export_pdf",
    entityType: "submission",
    summary: "Export รายชื่อผู้สมัครประกวดนวัตกรรมทั้งหมดเป็น PDF",
    payload: { count: applicants.length },
  }, request.headers);

  const pdf = await submissionApplicantsPdf(applicants);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="contest-applicants-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function submissionApplicantsPdf(applicants: SubmissionApplicantExportRow[]) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const rowsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(applicants.length / rowsPerPage));
  doc.info.Title = "Police Innovation Contest 2026 submission applicants";
  doc.info.Subject = "รายชื่อผู้สมัครประกวดนวัตกรรมทั้งหมด";
  doc.info.Author = "Police Innovation Contest 2026";

  for (let page = 0; page < totalPages; page += 1) {
    if (page > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    const rows = applicants.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
    drawPage(doc, rows, applicants.length, generatedAt, page + 1, totalPages, reportFonts);
  }

  doc.end();
  return pdf;
}

function drawPage(
  doc: PDFKit.PDFDocument,
  rows: SubmissionApplicantExportRow[],
  totalApplicants: number,
  generatedAt: Date,
  pageNumber: number,
  totalPages: number,
  fonts: PdfFontSet,
) {
  const columns = [
    ["รหัสผลงาน", 70],
    ["ผลงาน", 110],
    ["ประเภท", 36],
    ["ลำดับ", 42],
    ["คำนำหน้า", 44],
    ["ชื่อ", 64],
    ["นามสกุล", 64],
    ["เลขบัตร", 72],
    ["สังกัด / หน่วยงาน", 120],
    ["อีเมล", 94],
    ["โทร", 54],
  ] as const;
  const tableX = 22;
  const rowHeight = 34;
  const headerY = 136;

  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "รายชื่อผู้สมัครประกวดนวัตกรรม",
    subtitle: `ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "จำนวนทั้งหมด",
    metaValue: `${totalApplicants.toLocaleString("th-TH")} คน`,
    showLogo: false,
    fonts,
  });

  drawSummaryLine(doc, totalApplicants, pageNumber, totalPages, fonts);
  drawTableHeader(doc, tableX, headerY, columns, fonts);

  if (!rows.length) {
    doc.roundedRect(42, headerY + 48, doc.page.width - 84, 76, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(fonts.bold).fontSize(14).fillColor(PDF_THEME.navy).text("ยังไม่มีข้อมูลผู้สมัครประกวดนวัตกรรม", 60, headerY + 78, {
      width: doc.page.width - 120,
      align: "center",
      lineBreak: false,
    });
  }

  rows.forEach((item, index) => {
    drawApplicantRow(doc, tableX, headerY + 29 + index * rowHeight, rowHeight, columns, item, index, fonts);
  });

  drawDocumentFooter(doc, pageNumber, totalPages, `${totalApplicants.toLocaleString("th-TH")} คน`, fonts);
}

function drawSummaryLine(
  doc: PDFKit.PDFDocument,
  totalApplicants: number,
  pageNumber: number,
  totalPages: number,
  fonts: PdfFontSet,
) {
  doc.font(fonts.regular).fontSize(8.8).fillColor(PDF_THEME.muted).text(
    "ข้อมูลสำหรับตรวจสอบรายชื่อผู้สมัครประกวดนวัตกรรม แสดงสมาชิกผู้ส่งผลงานทุกคนตามข้อมูลที่บันทึกในระบบ",
    30,
    117,
    { width: 580, lineBreak: false },
  );
  doc.font(fonts.bold).fontSize(8.8).fillColor(PDF_THEME.navy).text(
    `หน้า ${pageNumber}/${totalPages} • รวม ${totalApplicants.toLocaleString("th-TH")} คน`,
    doc.page.width - 230,
    117,
    { width: 200, align: "right", lineBreak: false },
  );
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  columns: readonly (readonly [string, number])[],
  fonts: PdfFontSet,
) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.roundedRect(x, y, totalWidth, 25, 5).fill(PDF_THEME.navy);
  let cursor = x;
  doc.font(fonts.bold).fontSize(7.8).fillColor(PDF_THEME.goldSoft);
  for (const [label, width] of columns) {
    doc.text(label, cursor + 5, y + 8, { width: width - 10, lineBreak: false });
    cursor += width;
  }
}

function drawApplicantRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  rowHeight: number,
  columns: readonly (readonly [string, number])[],
  item: SubmissionApplicantExportRow,
  index: number,
  fonts: PdfFontSet,
) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.rect(x, y, totalWidth, rowHeight).fill(index % 2 === 0 ? PDF_THEME.white : PDF_THEME.paleBlue);
  doc.moveTo(x, y + rowHeight).lineTo(x + totalWidth, y + rowHeight).lineWidth(0.45).stroke(PDF_THEME.line);

  const values = [
    item.submission_code,
    item.title_th,
    item.submission_type === "team" ? clean(item.team_name ?? "ทีม") : "เดี่ยว",
    item.member_order === 1 ? "หลัก" : `สมาชิก ${item.member_order}`,
    item.title,
    item.first_name,
    item.last_name,
    item.citizen_id,
    `${clean(item.division)} / ${clean(item.bureau)}`,
    item.email,
    item.phone,
  ];

  let cursor = x;
  values.forEach((value, valueIndex) => {
    if (valueIndex > 0) {
      doc.moveTo(cursor, y + 5).lineTo(cursor, y + rowHeight - 5).lineWidth(0.25).stroke("#e3e9f2");
    }
    const isPrimary = valueIndex === 0 || valueIndex === 5 || valueIndex === 6;
    drawCellText(
      doc,
      clean(value),
      cursor + 5,
      y + 6,
      columns[valueIndex][1] - 10,
      valueIndex === 0 || valueIndex === 9 ? 6.9 : 7.4,
      isPrimary ? fonts.bold : fonts.regular,
      isPrimary ? PDF_THEME.navy : PDF_THEME.text,
      valueIndex === 1 || valueIndex === 8 || valueIndex === 9 ? 2 : 1,
    );
    cursor += columns[valueIndex][1];
  });
}

function drawCellText(
  doc: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  width: number,
  size: number,
  font: string,
  color: string,
  maxLines: number,
) {
  doc.font(font).fontSize(size).fillColor(color);
  const lines = fitCellLines(doc, value, width, maxLines);
  lines.forEach((line, index) => {
    doc.text(line, x, y + index * (size + 2), { width, lineBreak: false });
  });
}

function fitCellLines(doc: PDFKit.PDFDocument, value: string, width: number, maxLines: number) {
  const graphemes = Array.from(
    new Intl.Segmenter("th", { granularity: "grapheme" }).segment(value),
    (item) => item.segment,
  );
  const lines: string[] = [];
  let current = "";
  let index = 0;

  while (index < graphemes.length && lines.length < maxLines) {
    const next = `${current}${graphemes[index]}`;
    if (!current || doc.widthOfString(next) <= width) {
      current = next;
      index += 1;
      continue;
    }
    lines.push(current.trimEnd());
    current = "";
  }
  if (current && lines.length < maxLines) lines.push(current.trimEnd());

  if (index < graphemes.length && lines.length) {
    const ellipsis = "…";
    let last = lines[lines.length - 1];
    while (last && doc.widthOfString(`${last}${ellipsis}`) > width) {
      last = Array.from(
        new Intl.Segmenter("th", { granularity: "grapheme" }).segment(last),
        (item) => item.segment,
      ).slice(0, -1).join("");
    }
    lines[lines.length - 1] = `${last}${ellipsis}`;
  }
  return lines.length ? lines : ["-"];
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
