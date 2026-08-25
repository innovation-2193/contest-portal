import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../lib/admin-api-response";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import {
  getEvaluationSummary,
  listEvaluationRespondents,
  type EvaluationRespondent,
  type EvaluationSummary,
} from "../../../../../lib/evaluation-store";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
} from "../../../../../lib/pdf-theme";

export const runtime = "nodejs";

const pageWidth = 841.89;
const pageHeight = 595.28;
const tableX = 30;
const tableWidth = 782;
const reportTitle = "รายงานสรุปผลการประเมินความพึงพอใจของผู้เข้าร่วมงาน";
const firstQuestionRowsPerPage = 8;
const questionRowsPerPage = 11;
const respondentRowsPerPage = 12;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) return adminUnauthorizedResponse(request);

  const [summary, respondents] = await Promise.all([
    getEvaluationSummary(),
    listEvaluationRespondents(),
  ]);
  const pdf = await evaluationReportPdf(summary, respondents);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "evaluation.report_exported",
    entityType: "evaluation",
    summary: `Export PDF ${reportTitle} ${respondents.length} คน`,
    payload: { respondents: respondents.length, questions: summary.questions.length },
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
      "Content-Disposition": `inline; filename="evaluation-report-${date}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function evaluationReportPdf(summary: EvaluationSummary, respondents: EvaluationRespondent[]) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: true });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const sortedRespondents = [...respondents].sort(compareSubmittedAt);
  const firstQuestionRows = summary.questions.slice(0, firstQuestionRowsPerPage);
  const remainingQuestions = summary.questions.slice(firstQuestionRowsPerPage);
  const partOnePages = summary.questions.length
    ? 1 + Math.ceil(remainingQuestions.length / questionRowsPerPage)
    : 1;
  const partTwoPages = Math.max(1, Math.ceil(sortedRespondents.length / respondentRowsPerPage));
  const totalPages = partOnePages + partTwoPages;

  doc.info.Title = reportTitle;
  doc.info.Subject = reportTitle;
  doc.info.Author = "Police Innovation Contest 2026";

  drawPartOnePage(doc, summary, firstQuestionRows, 0, generatedAt, totalPages, 1);
  for (let page = 1; page < partOnePages; page += 1) {
    doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    const start = firstQuestionRowsPerPage + (page - 1) * questionRowsPerPage;
    drawPartOnePage(
      doc,
      summary,
      remainingQuestions.slice((page - 1) * questionRowsPerPage, page * questionRowsPerPage),
      start,
      generatedAt,
      totalPages,
      page + 1,
    );
  }

  for (let page = 0; page < partTwoPages; page += 1) {
    doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawPartTwoPage(
      doc,
      sortedRespondents.slice(page * respondentRowsPerPage, (page + 1) * respondentRowsPerPage),
      page * respondentRowsPerPage,
      sortedRespondents.length,
      generatedAt,
      totalPages,
      partOnePages + page + 1,
    );
  }

  doc.end();
  return pdf;
}

function drawPartOnePage(
  doc: PDFKit.PDFDocument,
  summary: EvaluationSummary,
  questions: EvaluationSummary["questions"],
  offset: number,
  generatedAt: Date,
  totalPages: number,
  pageNumber: number,
) {
  drawBasePage(doc);
  drawDocumentHeader(doc, {
    title: reportTitle,
    titleFontSize: 19,
    subtitle: `ส่วนที่ 1 สรุปคะแนนรายหัวข้อ • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "ผู้ตอบทั้งหมด",
    metaValue: `${summary.total.toLocaleString("th-TH")} คน`,
  });

  const isFirstPartOnePage = offset === 0;
  const tableY = isFirstPartOnePage ? 244 : 160;
  if (isFirstPartOnePage) {
    drawSummary(doc, summary.total, summary.average);
    drawSectionSummary(doc, summary.sections);
  } else {
    drawSectionLabel(doc, "ส่วนที่ 1 · คะแนนรายข้อ", 126);
  }
  drawQuestionTable(doc, questions, offset, tableY);
  drawDocumentFooter(doc, pageNumber, totalPages, "ส่วนที่ 1");
}

function drawPartTwoPage(
  doc: PDFKit.PDFDocument,
  respondents: EvaluationRespondent[],
  offset: number,
  totalRespondents: number,
  generatedAt: Date,
  totalPages: number,
  pageNumber: number,
) {
  drawBasePage(doc);
  drawDocumentHeader(doc, {
    title: reportTitle,
    titleFontSize: 19,
    subtitle: `ส่วนที่ 2 รายละเอียดผู้ส่งแบบประเมิน • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "ผู้ตอบทั้งหมด",
    metaValue: `${totalRespondents.toLocaleString("th-TH")} คน`,
  });
  drawSectionLabel(doc, "ส่วนที่ 2 · ผู้ส่งแบบประเมินเรียงตามวันเวลาที่ประเมิน", 126);
  drawRespondentTable(doc, respondents, offset, 160);
  drawDocumentFooter(doc, pageNumber, totalPages, "ส่วนที่ 2");
}

function drawBasePage(doc: PDFKit.PDFDocument) {
  doc.rect(0, 0, pageWidth, pageHeight).fill(PDF_THEME.paper);
}

function drawSummary(doc: PDFKit.PDFDocument, total: number, overallAverage: number) {
  const y = 126;
  drawMetricCard(doc, "จำนวนผู้ส่งแบบประเมิน", `${total.toLocaleString("th-TH")} คน`, 30, y, 376, PDF_THEME.white);
  drawMetricCard(doc, "คะแนนภาพรวมการจัดงาน", overallAverage ? `${overallAverage.toFixed(2)} / 5` : "-", 424, y, 388, PDF_THEME.goldSoft, "#e5cd70");
}

function drawMetricCard(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number, background: string, border: string = PDF_THEME.line) {
  doc.roundedRect(x, y, width, 54, 8).fillAndStroke(background, border);
  doc.font(pdfFontRegular).fontSize(9).fillColor(PDF_THEME.muted).text(label, x + 16, y + 12, { width: width - 190, lineBreak: false });
  doc.font(pdfFontBold).fontSize(19).fillColor(PDF_THEME.navy).text(value, x + width - 180, y + 12, { width: 164, align: "right", lineBreak: false });
}

function drawSectionSummary(doc: PDFKit.PDFDocument, sections: EvaluationSummary["sections"]) {
  const y = 194;
  const gap = 10;
  const width = (tableWidth - gap * 2) / 3;
  sections.forEach((section, index) => {
    const x = tableX + index * (width + gap);
    doc.roundedRect(x, y, width, 40, 6).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    const titleLines = fitTextLines(doc, section.title, width - 76, 7.4, pdfFontBold, 2);
    titleLines.forEach((line, lineIndex) => {
      doc.font(pdfFontBold).fontSize(7.4).fillColor(PDF_THEME.navy).text(line, x + 9, y + 7 + lineIndex * 9, { width: width - 76, lineBreak: false });
    });
    doc.font(pdfFontBold).fontSize(12).fillColor(PDF_THEME.gold).text(section.average ? section.average.toFixed(2) : "-", x + width - 61, y + 12, { width: 50, align: "right", lineBreak: false });
    doc.font(pdfFontRegular).fontSize(6.8).fillColor(PDF_THEME.muted).text("/ 5", x + width - 32, y + 25, { width: 22, align: "right", lineBreak: false });
  });
}

function drawSectionLabel(doc: PDFKit.PDFDocument, label: string, y: number) {
  doc.font(pdfFontBold).fontSize(12).fillColor(PDF_THEME.navy).text(label, tableX, y, { width: tableWidth, lineBreak: false });
}

function drawQuestionTable(doc: PDFKit.PDFDocument, questions: EvaluationSummary["questions"], offset: number, y: number) {
  const columns = [
    { label: "ลำดับ", width: 44, align: "center" as const },
    { label: "หัวข้อการประเมิน", width: 508, align: "left" as const },
    { label: "จำนวนคำตอบ", width: 110, align: "center" as const },
    { label: "คะแนนเฉลี่ย", width: 120, align: "center" as const },
  ];
  drawTableHeader(doc, columns, y);
  if (!questions.length) {
    drawEmptyTableMessage(doc, y + 30, "ยังไม่มีคะแนนรายหัวข้อ");
    return;
  }
  questions.forEach((question, index) => {
    const rowY = y + 28 + index * 31;
    drawTableRow(doc, rowY, 31, index, columns, [
      String(offset + index + 1),
      question.label,
      `${question.count.toLocaleString("th-TH")} คน`,
      question.average ? `${question.average.toFixed(2)} / 5` : "-",
    ], [2, 2, 1, 1]);
  });
}

function drawRespondentTable(doc: PDFKit.PDFDocument, respondents: EvaluationRespondent[], offset: number, y: number) {
  const columns = [
    { label: "ลำดับ", width: 52, align: "center" as const },
    { label: "ชื่อผู้ประเมิน", width: 350, align: "left" as const },
    { label: "วันเวลาที่ประเมิน", width: 230, align: "center" as const },
    { label: "คะแนน", width: 150, align: "center" as const },
  ];
  drawTableHeader(doc, columns, y);
  if (!respondents.length) {
    drawEmptyTableMessage(doc, y + 30, "ยังไม่มีผู้ส่งแบบประเมิน");
    return;
  }
  respondents.forEach((respondent, index) => {
    const rowY = y + 28 + index * 27;
    drawTableRow(doc, rowY, 27, index, columns, [
      String(offset + index + 1),
      respondent.name,
      formatPdfThaiDateTime(respondent.submittedAt, "short"),
      `${respondent.overallAverage.toFixed(2)} / 5`,
    ], [1, 1, 1, 1], [pdfFontRegular, pdfFontRegular, pdfFontRegular, pdfFontBold]);
  });
}

function drawTableHeader(doc: PDFKit.PDFDocument, columns: Array<{ label: string; width: number; align: "left" | "center" }>, y: number) {
  doc.roundedRect(tableX, y, tableWidth, 28, 5).fill(PDF_THEME.navy);
  let x = tableX;
  columns.forEach((column) => {
    doc.font(pdfFontBold).fontSize(8.8).fillColor(PDF_THEME.goldSoft).text(column.label, x + 6, y + 8, { width: column.width - 12, align: column.align, lineBreak: false });
    x += column.width;
  });
}

function drawTableRow(doc: PDFKit.PDFDocument, y: number, height: number, index: number, columns: Array<{ label: string; width: number; align: "left" | "center" }>, values: string[], maxLines: number[], fonts: string[] = []) {
  doc.rect(tableX, y, tableWidth, height).fillAndStroke(index % 2 ? PDF_THEME.paleBlue : PDF_THEME.white, PDF_THEME.line);
  let x = tableX;
  columns.forEach((column, columnIndex) => {
    if (columnIndex > 0) doc.moveTo(x, y + 4).lineTo(x, y + height - 4).lineWidth(0.35).stroke(PDF_THEME.line);
    const font = fonts[columnIndex] ?? (columnIndex === 0 ? pdfFontBold : pdfFontRegular);
    const size = height > 29 ? 8 : 8.5;
    const lines = fitTextLines(doc, clean(values[columnIndex]), column.width - 14, size, font, maxLines[columnIndex] ?? 1);
    lines.forEach((line, lineIndex) => {
      doc.font(font).fontSize(size).fillColor(columnIndex === 0 || columnIndex === columns.length - 1 ? PDF_THEME.navy : PDF_THEME.text).text(line, x + 7, y + 7 + lineIndex * (size + 2), { width: column.width - 14, align: column.align, lineBreak: false });
    });
    x += column.width;
  });
}

function drawEmptyTableMessage(doc: PDFKit.PDFDocument, y: number, message: string) {
  doc.roundedRect(tableX, y, tableWidth, 46, 5).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(pdfFontRegular).fontSize(10).fillColor(PDF_THEME.muted).text(message, tableX, y + 17, { width: tableWidth, align: "center", lineBreak: false });
}

function fitTextLines(doc: PDFKit.PDFDocument, value: string, width: number, size: number, font: string, maxLines: number) {
  doc.font(font).fontSize(size);
  const graphemes = Array.from(new Intl.Segmenter("th", { granularity: "grapheme" }).segment(value), (item) => item.segment);
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
    let last = lines[lines.length - 1];
    while (last && doc.widthOfString(`${last}…`) > width) {
      last = Array.from(new Intl.Segmenter("th", { granularity: "grapheme" }).segment(last), (item) => item.segment).slice(0, -1).join("");
    }
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

function compareSubmittedAt(a: EvaluationRespondent, b: EvaluationRespondent) {
  const aTime = new Date(a.submittedAt).getTime();
  const bTime = new Date(b.submittedAt).getTime();
  if (aTime !== bTime) return bTime - aTime;
  return a.registrationCode.localeCompare(b.registrationCode);
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
