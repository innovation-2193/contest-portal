import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { listSubmissions, type SubmissionListItem } from "../../../../../lib/admin-store";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
  type PdfFontSet,
} from "../../../../../lib/pdf-theme";
import { sortScoreboardSubmissions } from "../../../../../lib/scoreboard-ranking";

export const runtime = "nodejs";

const fonts: PdfFontSet = {
  regular: pdfFontRegular,
  bold: pdfFontBold,
};

const columns = [
  ["อันดับ", 48],
  ["รหัส", 104],
  ["ผลงาน", 250],
  ["ผู้สมัคร", 145],
  ["ผู้ตรวจ", 170],
  ["คะแนน", 74],
] as const;

export async function GET() {
  const submissions = sortScoreboardSubmissions(await listSubmissions()).slice(0, 10);
  const pdf = await progressTopTenPdf(submissions);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="progress1-scoreboard-top-10-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

async function progressTopTenPdf(submissions: SubmissionListItem[]) {
  const pageHeight = Math.max(595.28, 216 + submissions.length * 86 + 72);
  const doc = new PDFDocument({ size: [841.89, pageHeight], margin: 0 });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  let y = drawPageHeader(doc, submissions, generatedAt);
  drawTableHeader(doc, 24, y);
  y += 30;

  submissions.forEach((submission, index) => {
    const rowHeight = Math.max(48, scoreRowHeight(doc, submission));
    drawScoreRow(doc, 24, y, rowHeight, submission, index);
    y += rowHeight + 5;
  });

  if (!submissions.length) {
    doc.roundedRect(28, y + 16, doc.page.width - 56, 72, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(fonts.bold).fontSize(14).fillColor(PDF_THEME.navy).text("ยังไม่มีคะแนนที่ส่งเข้ามา", 44, y + 42, {
      width: doc.page.width - 88,
      align: "center",
      lineBreak: false,
    });
  }

  drawDocumentFooter(doc, 1, 1, "Progress1 Top 10 Score Board", fonts);
  doc.info.Title = "Progress1 Top 10 Score Board";
  doc.info.Subject = "Score Board คะแนนรอบที่ 1";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

function drawPageHeader(doc: PDFKit.PDFDocument, submissions: SubmissionListItem[], generatedAt: Date) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "Score Board Top 10 รอบที่ 1",
    subtitle: `Paper Screening • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "คะแนนสูงสุด",
    metaValue: `${submissions[0]?.review_total_score ?? "-"}/100`,
    showLogo: false,
    fonts,
  });
  drawSummaryChip(doc, "Top 10", submissions.length, 26, 122, PDF_THEME.goldSoft, "#80620b");
  drawSummaryChip(doc, "คะแนนเต็ม", 100, 184, 122, PDF_THEME.greenSoft, PDF_THEME.green);
  return 184;
}

function drawSummaryChip(doc: PDFKit.PDFDocument, label: string, value: string | number, x: number, y: number, fill: string, color: string) {
  doc.roundedRect(x, y, 134, 44, 9).fillAndStroke(fill, "transparent");
  doc.font(fonts.bold).fontSize(9).fillColor(color).text(label, x + 12, y + 9, { width: 110, lineBreak: false });
  doc.font(fonts.bold).fontSize(15).fillColor(PDF_THEME.navy).text(String(value), x + 12, y + 24, { width: 110, lineBreak: false });
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.roundedRect(x, y, totalWidth, 28, 5).fill(PDF_THEME.navy);
  let cursor = x;
  doc.font(fonts.bold).fontSize(8.5).fillColor(PDF_THEME.goldSoft);
  for (const [label, width] of columns) {
    doc.text(label, cursor + 6, y + 9, { width: width - 12, align: label === "คะแนน" ? "right" : "left", lineBreak: false });
    cursor += width;
  }
}

function drawScoreRow(doc: PDFKit.PDFDocument, x: number, y: number, height: number, item: SubmissionListItem, index: number) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.roundedRect(x, y, totalWidth, height, 6).fillAndStroke(index % 2 === 0 ? PDF_THEME.white : PDF_THEME.paleBlue, PDF_THEME.line);
  const values = [
    `#${index + 1}`,
    item.submission_code,
    item.title_th,
    ownerName(item),
    item.review_assigned_admin_email || item.review_scored_by_email || "-",
    `${item.review_total_score ?? "-"}/100`,
  ];
  let cursor = x;
  values.forEach((value, valueIndex) => {
    const [, width] = columns[valueIndex];
    const isRank = valueIndex === 0;
    const isScore = valueIndex === 5;
    doc.font(isRank || isScore ? fonts.bold : fonts.regular).fontSize(isScore ? 12 : 8.7).fillColor(isRank || isScore ? PDF_THEME.navy : PDF_THEME.text).text(clean(value), cursor + 6, y + 13, {
      width: width - 12,
      align: isScore ? "right" : "left",
      lineGap: 1,
    });
    cursor += width;
  });
}

function scoreRowHeight(doc: PDFKit.PDFDocument, item: SubmissionListItem) {
  return Math.max(
    textHeight(doc, item.title_th, 238, fonts.regular, 8.7),
    textHeight(doc, item.review_assigned_admin_email || item.review_scored_by_email || "-", 158, fonts.regular, 8.7),
  ) + 24;
}

function ownerName(submission: SubmissionListItem) {
  return `${submission.first_name} ${submission.last_name}`.replace(/\s+/g, " ").trim() || "-";
}

function textHeight(doc: PDFKit.PDFDocument, value: string, width: number, font: string, size: number) {
  doc.font(font).fontSize(size);
  return doc.heightOfString(clean(value), { width, lineGap: 1 });
}

function clean(value: string) {
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
