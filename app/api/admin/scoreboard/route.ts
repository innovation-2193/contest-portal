import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../lib/audit-log";
import { cookieName, getAdminSession } from "../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../lib/admin-api-response";
import { listSubmissions, type SubmissionListItem } from "../../../../lib/admin-store";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
  type PdfFontSet,
} from "../../../../lib/pdf-theme";

export const runtime = "nodejs";

const reportFonts: PdfFontSet = {
  regular: pdfFontRegular,
  bold: pdfFontBold,
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) {
    return adminUnauthorizedResponse(request);
  }

  const submissions = await listSubmissions({ assignedAdminEmail: session.role === "super_admin" ? null : session.email });
  const scored = submissions
    .filter((item) => item.review_total_score !== null && item.review_total_score !== undefined)
    .sort((a, b) => Number(b.review_total_score ?? 0) - Number(a.review_total_score ?? 0) || a.submitted_at.localeCompare(b.submitted_at));

  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "submission.scoreboard_pdf",
    entityType: "submission",
    summary: "พิมพ์ Score Board รอบแรกเป็น PDF",
    payload: { count: scored.length },
  }, request.headers);

  const pdf = await scoreboardPdf(scored);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="scoreboard-paper-screening-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function scoreboardPdf(submissions: SubmissionListItem[]) {
  const pageHeight = Math.max(595.28, 178 + submissions.length * 82 + 74);
  const doc = new PDFDocument({ size: [841.89, pageHeight], margin: 0 });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const columns = [
    ["อันดับ", 48],
    ["รหัส", 104],
    ["ผลงาน", 228],
    ["ผู้สมัคร", 140],
    ["ผู้ตรวจ", 154],
    ["คะแนน", 70],
    ["สถานะ", 54],
  ] as const;
  const tableX = 22;
  const rowHeight = 44;
  let y = drawPageHeader(doc, submissions, generatedAt, reportFonts);
  drawTableHeader(doc, tableX, y, columns, reportFonts);
  y += 30;

  submissions.forEach((item, index) => {
    const height = Math.max(rowHeight, scoreRowHeight(doc, columns, item, index, reportFonts));
    drawScoreRow(doc, tableX, y, height, columns, item, index, reportFonts);
    y += height + 4;
  });

  if (!submissions.length) {
    doc.roundedRect(26, y + 16, doc.page.width - 52, 72, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(reportFonts.bold).fontSize(14).fillColor(PDF_THEME.navy).text("ยังไม่มีคะแนนที่ส่งเข้ามา", 44, y + 42, {
      width: doc.page.width - 88,
      align: "center",
      lineBreak: false,
    });
  }

  drawDocumentFooter(doc, 1, 1, `${submissions.length} รายการ`, reportFonts);
  doc.info.Title = "Police Innovation Contest 2026 scoreboard";
  doc.info.Subject = "Score Board รอบแรก";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

function drawPageHeader(doc: PDFKit.PDFDocument, submissions: SubmissionListItem[], generatedAt: Date, fonts: PdfFontSet) {
  const topScore = submissions[0]?.review_total_score ?? "-";
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "Score Board รอบแรก",
    subtitle: `Paper Screening • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "คะแนนสูงสุด",
    metaValue: `${topScore}/100`,
    showLogo: false,
    fonts,
  });
  drawSummaryChip(doc, "ส่งคะแนนแล้ว", submissions.length, 26, 120, PDF_THEME.greenSoft, PDF_THEME.green, fonts);
  drawSummaryChip(doc, "คะแนนเต็ม", 100, 184, 120, PDF_THEME.goldSoft, "#80620b", fonts);
  return 160;
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  columns: readonly (readonly [string, number])[],
  fonts: PdfFontSet,
) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.roundedRect(x, y, totalWidth, 28, 5).fill(PDF_THEME.navy);
  let cursor = x;
  doc.font(fonts.bold).fontSize(8.5).fillColor(PDF_THEME.goldSoft);
  for (const [label, width] of columns) {
    doc.text(label, cursor + 6, y + 9, { width: width - 12, align: label === "คะแนน" ? "right" : "left", lineBreak: false });
    cursor += width;
  }
}

function drawScoreRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  rowHeight: number,
  columns: readonly (readonly [string, number])[],
  item: SubmissionListItem,
  index: number,
  fonts: PdfFontSet,
) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.roundedRect(x, y, totalWidth, rowHeight, 6).fillAndStroke(index % 2 === 0 ? PDF_THEME.white : PDF_THEME.paleBlue, PDF_THEME.line);
  const values = scoreRowValues(item, index);
  let cursor = x;
  values.forEach((value, valueIndex) => {
    const [, width] = columns[valueIndex];
    const isScore = valueIndex === 5;
    const color = valueIndex === 0 || isScore ? PDF_THEME.navy : PDF_THEME.text;
    const font = valueIndex === 0 || isScore ? fonts.bold : fonts.regular;
    doc.font(font).fontSize(isScore ? 12 : 8.7).fillColor(color).text(cleanCellText(value), cursor + 6, y + 13, {
      width: width - 12,
      align: isScore ? "right" : "left",
      lineGap: 1,
    });
    cursor += width;
  });
}

function scoreRowValues(item: SubmissionListItem, index: number) {
  return [
    `#${index + 1}`,
    item.submission_code,
    item.title_th,
    `${item.first_name} ${item.last_name}`,
    item.review_scored_by_email || item.review_assigned_admin_email || "-",
    `${item.review_total_score ?? "-"}`,
    "ส่งแล้ว",
  ];
}

function scoreRowHeight(
  doc: PDFKit.PDFDocument,
  columns: readonly (readonly [string, number])[],
  item: SubmissionListItem,
  index: number,
  fonts: PdfFontSet,
) {
  const values = scoreRowValues(item, index);
  return Math.max(...values.map((value, valueIndex) => {
    const [, width] = columns[valueIndex];
    const isScore = valueIndex === 5;
    doc.font(valueIndex === 0 || isScore ? fonts.bold : fonts.regular).fontSize(isScore ? 12 : 8.7);
    return 24 + doc.heightOfString(cleanCellText(value), { width: width - 12, lineGap: 1 });
  }));
}

function drawSummaryChip(doc: PDFKit.PDFDocument, label: string, value: number, x: number, y: number, background: string, color: string, fonts: PdfFontSet) {
  doc.roundedRect(x, y, 132, 30, 15).fillAndStroke(background, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(9).fillColor(color).text(label, x + 13, y + 9, { width: 72, lineBreak: false });
  doc.font(fonts.bold).fontSize(12).fillColor(color).text(String(value), x + 86, y + 7, { width: 32, align: "right", lineBreak: false });
}

function cleanCellText(value: string) {
  return value.replace(/\s+/g, " ").trim() || "-";
}

function collectPdf(doc: PDFKit.PDFDocument) {
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  return done;
}
