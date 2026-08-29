import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { cookieName, getAdminSession } from "../../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../../lib/admin-api-response";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../../lib/audit-log";
import { listEvaluationRespondents, type EvaluationRespondent } from "../../../../../../lib/evaluation-store";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
} from "../../../../../../lib/pdf-theme";

export const runtime = "nodejs";

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 30;
const contentWidth = pageWidth - margin * 2;
const reportTitle = "รายชื่อผู้ตอบแบบสอบถามทั้งหมด";
const rowsPerPage = 20;
const columns = [
  ["ลำดับ", 42],
  ["ชื่อผู้ประเมิน", 265],
  ["วันที่ประเมิน", 135],
  ["คะแนนภาพรวม", 93],
] as const;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) return adminUnauthorizedResponse(request);

  const respondents = await listEvaluationRespondents();
  const pdf = await respondentsPdf(respondents);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "evaluation.report_exported",
    entityType: "evaluation",
    summary: `Export PDF ${reportTitle} ${respondents.length} คน`,
    payload: { respondents: respondents.length, report: "respondents" },
  }, request.headers);

  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="evaluation-respondents-${date}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function respondentsPdf(respondents: EvaluationRespondent[]) {
  const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0, bufferPages: true });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const pageCount = Math.max(1, Math.ceil(respondents.length / rowsPerPage));

  doc.info.Title = reportTitle;
  doc.info.Subject = reportTitle;
  doc.info.Author = "Police Innovation Contest 2026";

  for (let page = 0; page < pageCount; page += 1) {
    if (page > 0) doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
    drawBasePage(doc);
    drawDocumentHeader(doc, {
      title: reportTitle,
      titleFontSize: 18,
      subtitle: `จากแบบประเมินความพึงพอใจ • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
      metaLabel: "จำนวนผู้ตอบทั้งหมด",
      metaValue: `${respondents.length.toLocaleString("th-TH")} คน`,
      showLogo: true,
    });
    drawSummaryCard(doc, respondents.length);
    const tableY = 184;
    drawTableHeader(doc, tableY);
    const pageRows = respondents.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
    pageRows.forEach((respondent, index) => drawRespondentRow(doc, tableY + 30 + index * 29, respondent, page * rowsPerPage + index));
    if (!pageRows.length) drawEmptyState(doc, tableY + 48);
  }

  const range = doc.bufferedPageRange();
  for (let pageIndex = 0; pageIndex < range.count; pageIndex += 1) {
    doc.switchToPage(range.start + pageIndex);
    drawDocumentFooter(doc, pageIndex + 1, range.count, `${respondents.length.toLocaleString("th-TH")} รายการ`);
  }

  doc.end();
  return pdf;
}

function drawBasePage(doc: PDFKit.PDFDocument) {
  doc.rect(0, 0, pageWidth, pageHeight).fill(PDF_THEME.paper);
}

function drawSummaryCard(doc: PDFKit.PDFDocument, count: number) {
  doc.roundedRect(margin, 126, contentWidth, 42, 7).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(pdfFontRegular).fontSize(8).fillColor(PDF_THEME.muted).text("จำนวนผู้ตอบแบบสอบถาม", margin + 12, 138, {
    width: 250,
    lineBreak: false,
  });
  doc.font(pdfFontBold).fontSize(14).fillColor(PDF_THEME.navy).text(`${count.toLocaleString("th-TH")} คน`, margin + contentWidth - 125, 136, {
    width: 113,
    align: "right",
    lineBreak: false,
  });
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number) {
  doc.roundedRect(margin, y, contentWidth, 30, 6).fill(PDF_THEME.navy);
  let x = margin;
  columns.forEach(([label, width]) => {
    doc.font(pdfFontBold).fontSize(8.3).fillColor(PDF_THEME.goldSoft).text(label, x + 5, y + 9, {
      width: width - 10,
      align: "center",
      lineBreak: false,
    });
    x += width;
  });
}

function drawRespondentRow(doc: PDFKit.PDFDocument, y: number, respondent: EvaluationRespondent, index: number) {
  const rowHeight = 26;
  doc.roundedRect(margin, y, contentWidth, rowHeight, 4)
    .fillAndStroke(index % 2 === 0 ? PDF_THEME.white : PDF_THEME.paleBlue, PDF_THEME.line);

  const values = [
    `${index + 1}`,
    clean(respondent.name),
    formatPdfThaiDateTime(respondent.submittedAt, "short"),
  ];
  let x = margin;
  values.forEach((value, valueIndex) => {
    if (valueIndex > 0) drawCellDivider(doc, x, y, rowHeight);
    doc.font(valueIndex === 1 ? pdfFontBold : pdfFontRegular)
      .fontSize(valueIndex === 1 ? 7.8 : 7.4)
      .fillColor(valueIndex === 1 ? PDF_THEME.navy : PDF_THEME.text)
      .text(value, x + 7, y + 8, {
        width: columns[valueIndex][1] - 14,
        align: valueIndex === 0 ? "center" : "left",
        lineBreak: false,
        ellipsis: valueIndex === 1,
      });
    x += columns[valueIndex][1];
  });

  drawCellDivider(doc, x, y, rowHeight);
  const score = respondent.overallAverage ? `${respondent.overallAverage.toFixed(2)} / 5` : "-";
  const scoreWidth = 68;
  const scoreX = x + (columns[3][1] - scoreWidth) / 2;
  doc.roundedRect(scoreX, y + 4, scoreWidth, 18, 9).fillAndStroke(PDF_THEME.greenSoft, PDF_THEME.green);
  doc.font(pdfFontBold).fontSize(7.4).fillColor(PDF_THEME.green).text(score, scoreX, y + 9, {
    width: scoreWidth,
    align: "center",
    lineBreak: false,
  });
}

function drawCellDivider(doc: PDFKit.PDFDocument, x: number, y: number, height: number) {
  doc.moveTo(x, y + 5).lineTo(x, y + height - 5).lineWidth(0.4).stroke("#dfe5ef");
}

function drawEmptyState(doc: PDFKit.PDFDocument, y: number) {
  doc.roundedRect(margin, y, contentWidth, 60, 6).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(pdfFontRegular).fontSize(9).fillColor(PDF_THEME.muted).text("ยังไม่มีผู้ตอบแบบสอบถาม", margin, y + 24, {
    width: contentWidth,
    align: "center",
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
