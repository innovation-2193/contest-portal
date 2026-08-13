import PDFDocument from "pdfkit";
import type { AdminAccount } from "./admin-users";
import { type SubmissionChecklistRow } from "./admin-store";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
  type PdfFontSet,
} from "./pdf-theme";
import { formatApplicantName } from "./thai-rank-title";

const fonts: PdfFontSet = { regular: pdfFontRegular, bold: pdfFontBold };
const tableX = 28;
const tableHeaderY = 139;
const tableStartY = tableHeaderY + 28;
const tableBottomY = 548;

export type SubmissionReviewContactRow = SubmissionChecklistRow & {
  reviewerName: string;
  primaryApplicantName: string;
  coordinatorPhone: string;
};

export function buildSubmissionReviewContactReport(rows: SubmissionChecklistRow[], admins: AdminAccount[]) {
  const adminNames = new Map(admins.map((admin) => [admin.email.trim().toLowerCase(), admin.name.trim()]));
  return rows
    .map((row) => {
      const reviewerEmail = (row.review_scored_by_email || row.review_assigned_admin_email || "").trim().toLowerCase();
      return {
        ...row,
        reviewerName: adminNames.get(reviewerEmail) || reviewerEmail || "ยังไม่ระบุ",
        primaryApplicantName: formatApplicantName(row),
        coordinatorPhone: clean(row.phone),
      } satisfies SubmissionReviewContactRow;
    })
    .sort((left, right) => (
      timestamp(left.submitted_at) - timestamp(right.submitted_at)
      || left.submission_code.localeCompare(right.submission_code)
    ));
}

export async function submissionReviewContactPdf(rows: SubmissionReviewContactRow[]) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const columns = reviewContactColumns();
  const layouts = rows.map((row, index) => layoutRow(doc, row, index + 1, columns));
  const pages = paginateRows(layouts, tableBottomY - tableStartY);
  const totalPages = Math.max(1, pages.length);

  doc.info.Title = "Police Innovation Contest 2026 preliminary review contacts";
  doc.info.Subject = "รายงานผลงาน ผู้ตรวจเอกสารเบื้องต้น ผู้สมัครหลัก และเบอร์ติดต่อ";
  doc.info.Author = "Police Innovation Contest 2026";

  for (let page = 0; page < totalPages; page += 1) {
    if (page > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawPage(doc, pages[page] ?? [], rows.length, generatedAt, page + 1, totalPages, columns);
  }

  doc.end();
  return pdf;
}

type CellLayout = { lines: string[]; size: number; font: string; color: string; align: "left" | "center" };
type RowLayout = { cells: CellLayout[]; height: number };

function reviewContactColumns() {
  return [
    ["ลำดับ", 38],
    ["เวลาสมัคร", 92],
    ["ผลงาน", 236],
    ["ผู้ตรวจเอกสารเบื้องต้น", 168],
    ["ผู้สมัครหลัก", 174],
    ["เบอร์โทรหลัก", 84],
  ] as const;
}

function drawPage(
  doc: PDFKit.PDFDocument,
  rows: RowLayout[],
  total: number,
  generatedAt: Date,
  pageNumber: number,
  totalPages: number,
  columns: readonly (readonly [string, number])[],
) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "รายงานผลงานและผู้ตรวจเอกสารเบื้องต้น",
    subtitle: `เรียงตามเวลาสมัครจากเก่าไปใหม่ • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "จำนวนผลงาน",
    metaValue: total.toLocaleString("th-TH"),
    fonts,
  });
  doc.font(fonts.regular).fontSize(8.8).fillColor(PDF_THEME.muted).text(
    "แสดงชื่อผลงาน ผู้ตรวจเอกสารเบื้องต้น ผู้สมัครหลัก และเบอร์ติดต่อผู้ประสานงานหลักของแต่ละใบสมัคร",
    tableX,
    118,
    { width: 760, lineBreak: false },
  );
  drawTableHeader(doc, tableX, tableHeaderY, columns);

  if (!rows.length) {
    doc.roundedRect(42, tableHeaderY + 48, doc.page.width - 84, 76, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(fonts.bold).fontSize(14).fillColor(PDF_THEME.navy).text("ยังไม่มีข้อมูลใบสมัครประกวดนวัตกรรม", 60, tableHeaderY + 78, {
      width: doc.page.width - 120,
      align: "center",
      lineBreak: false,
    });
  }

  let y = tableStartY;
  rows.forEach((row, index) => {
    drawRow(doc, tableX, y, row, index, columns);
    y += row.height;
  });
  drawDocumentFooter(doc, pageNumber, totalPages, "Preliminary Review Contacts", fonts);
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number, columns: readonly (readonly [string, number])[]) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.roundedRect(x, y, totalWidth, 25, 5).fill(PDF_THEME.navy);
  let cursor = x;
  columns.forEach(([label, width]) => {
    doc.font(fonts.bold).fontSize(7.8).fillColor(PDF_THEME.goldSoft).text(label, cursor + 5, y + 8, {
      width: width - 10,
      align: label === "ลำดับ" ? "center" : "left",
      lineBreak: false,
    });
    cursor += width;
  });
}

function layoutRow(
  doc: PDFKit.PDFDocument,
  row: SubmissionReviewContactRow,
  runningNumber: number,
  columns: readonly (readonly [string, number])[],
): RowLayout {
  const values = [
    String(runningNumber),
    formatPdfThaiDateTime(row.submitted_at, "short"),
    row.title_th,
    row.reviewerName,
    row.primaryApplicantName,
    row.coordinatorPhone,
  ];
  const cells = values.map((value, valueIndex) => {
    const centered = valueIndex === 0 || valueIndex === 5;
    const isStrong = valueIndex === 0 || valueIndex === 2 || valueIndex === 3;
    const size = valueIndex === 1 ? 7 : 7.5;
    const font = isStrong ? fonts.bold : fonts.regular;
    doc.font(font).fontSize(size);
    return {
      lines: fitCellLines(doc, clean(value), columns[valueIndex][1] - 10, centered ? 2 : 3),
      size,
      font,
      color: valueIndex === 3 && row.reviewerName === "ยังไม่ระบุ" ? PDF_THEME.red : isStrong ? PDF_THEME.navy : PDF_THEME.text,
      align: centered ? "center" : "left",
    } satisfies CellLayout;
  });
  const lineHeight = Math.max(...cells.map((cell) => cell.lines.length * (cell.size + 2)));
  return { cells, height: Math.max(34, lineHeight + 12) };
}

function drawRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  row: RowLayout,
  index: number,
  columns: readonly (readonly [string, number])[],
) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.rect(x, y, totalWidth, row.height).fill(index % 2 === 0 ? PDF_THEME.white : PDF_THEME.paleBlue);
  doc.moveTo(x, y + row.height).lineTo(x + totalWidth, y + row.height).lineWidth(0.45).stroke(PDF_THEME.line);
  let cursor = x;
  row.cells.forEach((cell, valueIndex) => {
    if (valueIndex > 0) doc.moveTo(cursor, y + 5).lineTo(cursor, y + row.height - 5).lineWidth(0.25).stroke("#e3e9f2");
    doc.font(cell.font).fontSize(cell.size).fillColor(cell.color);
    cell.lines.forEach((line, lineIndex) => {
      doc.text(line, cursor + 5, y + 6 + lineIndex * (cell.size + 2), {
        width: columns[valueIndex][1] - 10,
        align: cell.align,
        lineBreak: false,
      });
    });
    cursor += columns[valueIndex][1];
  });
}

function paginateRows(rows: RowLayout[], availableHeight: number) {
  if (!rows.length) return [[]];
  const pages: RowLayout[][] = [[]];
  let height = 0;
  for (const row of rows) {
    if (pages[pages.length - 1].length && height + row.height > availableHeight) {
      pages.push([]);
      height = 0;
    }
    pages[pages.length - 1].push(row);
    height += row.height;
  }
  return pages;
}

function fitCellLines(doc: PDFKit.PDFDocument, value: string, width: number, maxLines: number) {
  const graphemes = Array.from(new Intl.Segmenter("th", { granularity: "grapheme" }).segment(value), (item) => item.segment);
  const lines: string[] = [];
  let current = "";
  for (const grapheme of graphemes) {
    const next = `${current}${grapheme}`;
    if (!current || doc.widthOfString(next) <= width) {
      current = next;
      continue;
    }
    lines.push(current.trimEnd());
    if (lines.length >= maxLines) break;
    current = grapheme;
  }
  if (current && lines.length < maxLines) lines.push(current.trimEnd());
  const sourceLength = value.replace(/\s+/g, "").length;
  if (lines.join("").replace(/\s+/g, "").length < sourceLength && lines.length) {
    let last = lines[lines.length - 1];
    while (last && doc.widthOfString(`${last}…`) > width) last = Array.from(last).slice(0, -1).join("");
    lines[lines.length - 1] = `${last}…`;
  }
  return lines.length ? lines : ["-"];
}

function timestamp(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function clean(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim() || "-";
}

function collectPdf(doc: PDFKit.PDFDocument) {
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
