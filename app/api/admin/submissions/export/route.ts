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
const tableX = 22;
const tableHeaderY = 136;
const tableStartY = tableHeaderY + 29;
const tableBottomY = 545;

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
  const columns = applicantColumns();
  const layouts = applicants.map((item, index) => layoutApplicantRow(doc, item, index + 1, columns, reportFonts));
  const pages = paginateRows(layouts, tableBottomY - tableStartY);
  const totalPages = Math.max(1, pages.length);
  doc.info.Title = "Police Innovation Contest 2026 submission applicants";
  doc.info.Subject = "รายชื่อผู้สมัครประกวดนวัตกรรมทั้งหมด";
  doc.info.Author = "Police Innovation Contest 2026";

  for (let page = 0; page < totalPages; page += 1) {
    if (page > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawPage(doc, pages[page] ?? [], applicants.length, generatedAt, page + 1, totalPages, columns, reportFonts);
  }

  doc.end();
  return pdf;
}

function drawPage(
  doc: PDFKit.PDFDocument,
  rows: ApplicantRowLayout[],
  totalApplicants: number,
  generatedAt: Date,
  pageNumber: number,
  totalPages: number,
  columns: readonly (readonly [string, number])[],
  fonts: PdfFontSet,
) {
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
  drawTableHeader(doc, tableX, tableHeaderY, columns, fonts);

  if (!rows.length) {
    doc.roundedRect(42, tableHeaderY + 48, doc.page.width - 84, 76, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(fonts.bold).fontSize(14).fillColor(PDF_THEME.navy).text("ยังไม่มีข้อมูลผู้สมัครประกวดนวัตกรรม", 60, tableHeaderY + 78, {
      width: doc.page.width - 120,
      align: "center",
      lineBreak: false,
    });
  }

  let y = tableStartY;
  rows.forEach((row, index) => {
    drawApplicantRow(doc, tableX, y, row, index);
    y += row.height;
  });

  drawDocumentFooter(doc, pageNumber, totalPages, `${totalApplicants.toLocaleString("th-TH")} คน`, fonts);
}

function applicantColumns() {
  return [
    ["ลำดับ", 34],
    ["รหัสผลงาน", 70],
    ["ผลงาน", 120],
    ["คำนำหน้า", 48],
    ["ชื่อ", 70],
    ["นามสกุล", 70],
    ["เลขบัตร", 76],
    ["สังกัด / หน่วยงาน", 138],
    ["อีเมล", 112],
    ["โทร", 54],
  ] as const;
}

type ApplicantCellLayout = {
  lines: string[];
  size: number;
  font: string;
  color: string;
};

type ApplicantRowLayout = {
  cells: ApplicantCellLayout[];
  height: number;
};

function layoutApplicantRow(
  doc: PDFKit.PDFDocument,
  item: SubmissionApplicantExportRow,
  runningNumber: number,
  columns: readonly (readonly [string, number])[],
  fonts: PdfFontSet,
): ApplicantRowLayout {
  const values = [
    String(runningNumber),
    item.submission_code,
    item.title_th,
    item.title,
    item.first_name,
    item.last_name,
    item.citizen_id,
    `${clean(item.division)} / ${clean(item.bureau)}`,
    item.email,
    item.phone,
  ];
  const cells = values.map((value, valueIndex) => {
    const isPrimary = valueIndex === 0 || valueIndex === 1 || valueIndex === 4 || valueIndex === 5;
    const size = valueIndex === 1 || valueIndex === 8 ? 6.9 : 7.4;
    const width = columns[valueIndex][1] - 10;
    doc.font(isPrimary ? fonts.bold : fonts.regular).fontSize(size);
    return {
      lines: fitCellLines(doc, clean(value), width),
      size,
      font: isPrimary ? fonts.bold : fonts.regular,
      color: isPrimary ? PDF_THEME.navy : PDF_THEME.text,
    };
  });
  const lineHeight = Math.max(...cells.map((cell) => cell.lines.length * (cell.size + 2)));
  return { cells, height: Math.max(34, lineHeight + 12) };
}

function paginateRows(rows: ApplicantRowLayout[], availableHeight: number) {
  if (!rows.length) return [[]];
  const pages: ApplicantRowLayout[][] = [];
  let page: ApplicantRowLayout[] = [];
  let usedHeight = 0;
  for (const row of rows) {
    if (page.length && usedHeight + row.height > availableHeight) {
      pages.push(page);
      page = [];
      usedHeight = 0;
    }
    page.push(row);
    usedHeight += row.height;
  }
  if (page.length) pages.push(page);
  return pages;
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
  row: ApplicantRowLayout,
  index: number,
) {
  const columns = applicantColumns();
  const rowHeight = row.height;
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.rect(x, y, totalWidth, rowHeight).fill(index % 2 === 0 ? PDF_THEME.white : PDF_THEME.paleBlue);
  doc.moveTo(x, y + rowHeight).lineTo(x + totalWidth, y + rowHeight).lineWidth(0.45).stroke(PDF_THEME.line);

  let cursor = x;
  row.cells.forEach((cell, valueIndex) => {
    if (valueIndex > 0) {
      doc.moveTo(cursor, y + 5).lineTo(cursor, y + rowHeight - 5).lineWidth(0.25).stroke("#e3e9f2");
    }
    drawCellText(doc, cell, cursor + 5, y + 6, columns[valueIndex][1] - 10);
    cursor += columns[valueIndex][1];
  });
}

function drawCellText(
  doc: PDFKit.PDFDocument,
  cell: ApplicantCellLayout,
  x: number,
  y: number,
  width: number,
) {
  doc.font(cell.font).fontSize(cell.size).fillColor(cell.color);
  cell.lines.forEach((line, index) => {
    doc.text(line, x, y + index * (cell.size + 2), { width, lineBreak: false });
  });
}

function fitCellLines(doc: PDFKit.PDFDocument, value: string, width: number) {
  const graphemes = Array.from(
    new Intl.Segmenter("th", { granularity: "grapheme" }).segment(value),
    (item) => item.segment,
  );
  const lines: string[] = [];
  let current = "";
  let index = 0;

  while (index < graphemes.length) {
    const next = `${current}${graphemes[index]}`;
    if (!current || doc.widthOfString(next) <= width) {
      current = next;
      index += 1;
      continue;
    }
    lines.push(current.trimEnd());
    current = "";
  }
  if (current) lines.push(current.trimEnd());
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
