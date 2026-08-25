import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../lib/admin-api-response";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { getEvaluationSummary, type EvaluationSummary } from "../../../../../lib/evaluation-store";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
} from "../../../../../lib/pdf-theme";

export const runtime = "nodejs";

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 30;
const contentWidth = pageWidth - margin * 2;
const reportTitle = "รายงานสรุปผลการประเมินความพึงพอใจของผู้เข้าร่วมงาน";
const profileSections = [
  ["gender", "เพศ"],
  ["ageRange", "อายุ"],
  ["organizationType", "ประเภทหน่วยงาน"],
  ["attendeeStatus", "สถานภาพผู้เข้าร่วม"],
] as const;
const commentsPerPage = 6;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) return adminUnauthorizedResponse(request);

  const summary = await getEvaluationSummary();
  const pdf = await evaluationSummaryPdf(summary);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "evaluation.report_exported",
    entityType: "evaluation",
    summary: `Export PDF ${reportTitle} ${summary.total} คน`,
    payload: { respondents: summary.total, questions: summary.questions.length, comments: summary.comments.length },
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
      "Content-Disposition": `inline; filename="evaluation-summary-${date}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function evaluationSummaryPdf(summary: EvaluationSummary) {
  const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0, bufferPages: true });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const commentPages = summary.comments.length ? Math.ceil(summary.comments.length / commentsPerPage) : 0;
  const totalPages = 2 + commentPages;

  doc.info.Title = reportTitle;
  doc.info.Subject = reportTitle;
  doc.info.Author = "Police Innovation Contest 2026";

  drawOverviewPage(doc, summary, generatedAt, totalPages);
  doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
  drawQuestionPage(doc, summary, generatedAt, totalPages, 2);

  for (let page = 0; page < commentPages; page += 1) {
    doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
    drawCommentsPage(
      doc,
      summary.comments.slice(page * commentsPerPage, (page + 1) * commentsPerPage),
      page * commentsPerPage,
      summary.total,
      generatedAt,
      totalPages,
      page + 3,
    );
  }

  doc.end();
  return pdf;
}

function drawReportHeader(doc: PDFKit.PDFDocument, subtitle: string, total: number) {
  drawDocumentHeader(doc, {
    title: reportTitle,
    titleFontSize: 17,
    subtitle: `${subtitle} • ออกรายงานเมื่อ ${formatPdfThaiDateTime(new Date())}`,
    showLogo: true,
  });
  doc.font(pdfFontRegular).fontSize(8).fillColor(PDF_THEME.muted).text(`ผู้ตอบแบบประเมินทั้งหมด ${total.toLocaleString("th-TH")} คน`, margin, 112, {
    width: contentWidth,
    align: "right",
    lineBreak: false,
  });
}

function drawOverviewPage(doc: PDFKit.PDFDocument, summary: EvaluationSummary, generatedAt: Date, totalPages: number) {
  drawBasePage(doc);
  drawDocumentHeader(doc, {
    title: reportTitle,
    titleFontSize: 17,
    subtitle: `ส่วนที่ 1 ภาพรวมผลการประเมิน • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    showLogo: true,
  });
  drawMetricCard(doc, "จำนวนผู้ส่งแบบประเมิน", `${summary.total.toLocaleString("th-TH")} คน`, 30, 126, contentWidth, PDF_THEME.white);
  drawMetricCard(doc, "คะแนนภาพรวมการจัดงาน", summary.average ? `${summary.average.toFixed(2)} / 5` : "-", 30, 178, contentWidth, PDF_THEME.goldSoft, "#e5cd70");
  drawSectionSummary(doc, summary.sections);
  drawProfileSummary(doc, summary);
  drawDocumentFooter(doc, 1, totalPages, "ส่วนที่ 1");
}

function drawQuestionPage(doc: PDFKit.PDFDocument, summary: EvaluationSummary, generatedAt: Date, totalPages: number, pageNumber: number) {
  drawBasePage(doc);
  drawReportHeader(doc, "ส่วนที่ 2 คะแนนเฉลี่ยรายหัวข้อ", summary.total);
  drawSectionLabel(doc, "ส่วนที่ 2 · คะแนนเฉลี่ยรายหัวข้อ", 132);
  drawQuestionTable(doc, summary.questions, 160);
  drawDocumentFooter(doc, pageNumber, totalPages, "ส่วนที่ 2");
}

function drawCommentsPage(doc: PDFKit.PDFDocument, comments: EvaluationSummary["comments"], offset: number, total: number, generatedAt: Date, totalPages: number, pageNumber: number) {
  drawBasePage(doc);
  drawReportHeader(doc, "ส่วนที่ 3 ข้อคิดเห็นและข้อเสนอแนะ (ไม่ระบุตัวตน)", total);
  drawSectionLabel(doc, "ส่วนที่ 3 · ข้อคิดเห็นและข้อเสนอแนะจากผู้ตอบแบบประเมิน", 132);
  if (!comments.length) {
    drawEmptyCard(doc, 160, "ยังไม่มีข้อคิดเห็นหรือข้อเสนอแนะ");
  } else {
    comments.forEach((comment, index) => drawCommentCard(doc, comment, offset + index, 160 + index * 99));
  }
  drawDocumentFooter(doc, pageNumber, totalPages, "ส่วนที่ 3");
}

function drawBasePage(doc: PDFKit.PDFDocument) {
  doc.rect(0, 0, pageWidth, pageHeight).fill(PDF_THEME.paper);
}

function drawMetricCard(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number, background: string, border: string = PDF_THEME.line) {
  doc.roundedRect(x, y, width, 42, 7).fillAndStroke(background, border);
  doc.font(pdfFontRegular).fontSize(8.5).fillColor(PDF_THEME.muted).text(label, x + 13, y + 10, { width: width - 180, lineBreak: false });
  doc.font(pdfFontBold).fontSize(16).fillColor(PDF_THEME.navy).text(value, x + width - 165, y + 9, { width: 150, align: "right", lineBreak: false });
}

function drawSectionSummary(doc: PDFKit.PDFDocument, sections: EvaluationSummary["sections"]) {
  sections.forEach((section, index) => {
    const y = 230 + index * 28;
    doc.roundedRect(margin, y, contentWidth, 24, 5).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(pdfFontBold).fontSize(7.8).fillColor(PDF_THEME.navy).text(section.title, margin + 10, y + 7, { width: contentWidth - 100, lineBreak: false });
    doc.font(pdfFontBold).fontSize(10).fillColor(PDF_THEME.gold).text(section.average ? section.average.toFixed(2) : "-", margin + contentWidth - 75, y + 5, { width: 50, align: "right", lineBreak: false });
    doc.font(pdfFontRegular).fontSize(6.8).fillColor(PDF_THEME.muted).text("/ 5", margin + contentWidth - 29, y + 8, { width: 18, align: "right", lineBreak: false });
  });
}

function drawProfileSummary(doc: PDFKit.PDFDocument, summary: EvaluationSummary) {
  profileSections.forEach(([key, label], sectionIndex) => {
    const y = 326 + sectionIndex * 88;
    const values = summary.profiles[key];
    doc.roundedRect(margin, y, contentWidth, 80, 6).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(pdfFontBold).fontSize(9.5).fillColor(PDF_THEME.navy).text(label, margin + 11, y + 9, { width: contentWidth - 22, lineBreak: false });
    if (!values.length) {
      doc.font(pdfFontRegular).fontSize(8).fillColor(PDF_THEME.muted).text("ยังไม่มีข้อมูล", margin + 11, y + 31, { width: contentWidth - 22, lineBreak: false });
      return;
    }
    values.slice(0, 5).forEach((item, index) => {
      const rowY = y + 27 + index * 10;
      const percentage = summary.total ? `${((item.count / summary.total) * 100).toFixed(1)}%` : "0.0%";
      doc.font(pdfFontRegular).fontSize(7.1).fillColor(PDF_THEME.text).text(clean(item.label), margin + 12, rowY, { width: 350, lineBreak: false, ellipsis: true });
      doc.font(pdfFontRegular).fontSize(7.1).fillColor(PDF_THEME.muted).text(`${item.count.toLocaleString("th-TH")} คน (${percentage})`, margin + contentWidth - 145, rowY, { width: 133, align: "right", lineBreak: false });
    });
  });
}

function drawSectionLabel(doc: PDFKit.PDFDocument, label: string, y: number) {
  doc.font(pdfFontBold).fontSize(11).fillColor(PDF_THEME.navy).text(label, margin, y, { width: contentWidth, lineBreak: false });
}

function drawQuestionTable(doc: PDFKit.PDFDocument, questions: EvaluationSummary["questions"], y: number) {
  const columns = [
    { label: "ลำดับ", width: 42, align: "center" as const },
    { label: "หัวข้อการประเมิน", width: 314, align: "left" as const },
    { label: "จำนวนคำตอบ", width: 91, align: "center" as const },
    { label: "คะแนนเฉลี่ย", width: 88, align: "center" as const },
  ];
  doc.roundedRect(margin, y, contentWidth, 24, 5).fill(PDF_THEME.navy);
  let headerX = margin;
  columns.forEach((column) => {
    doc.font(pdfFontBold).fontSize(7.6).fillColor(PDF_THEME.goldSoft).text(column.label, headerX + 4, y + 7, { width: column.width - 8, align: column.align, lineBreak: false });
    headerX += column.width;
  });
  if (!questions.length) {
    drawEmptyCard(doc, y + 28, "ยังไม่มีคะแนนรายหัวข้อ");
    return;
  }
  questions.forEach((question, index) => {
    const rowY = y + 24 + index * 22;
    doc.rect(margin, rowY, contentWidth, 22).fillAndStroke(index % 2 ? PDF_THEME.paleBlue : PDF_THEME.white, PDF_THEME.line);
    const values = [String(index + 1), question.label, `${question.count.toLocaleString("th-TH")} คน`, question.average ? `${question.average.toFixed(2)} / 5` : "-"];
    let cellX = margin;
    columns.forEach((column, columnIndex) => {
      if (columnIndex > 0) doc.moveTo(cellX, rowY + 3).lineTo(cellX, rowY + 19).lineWidth(0.3).stroke(PDF_THEME.line);
      const font = columnIndex === 0 || columnIndex === 3 ? pdfFontBold : pdfFontRegular;
      doc.font(font).fontSize(7.5).fillColor(columnIndex === 0 || columnIndex === 3 ? PDF_THEME.navy : PDF_THEME.text).text(clean(values[columnIndex]), cellX + 5, rowY + 6, { width: column.width - 10, align: column.align, lineBreak: false, ellipsis: true });
      cellX += column.width;
    });
  });
}

function drawCommentCard(doc: PDFKit.PDFDocument, comment: EvaluationSummary["comments"][number], index: number, y: number) {
  doc.roundedRect(margin, y, contentWidth, 92, 6).fillAndStroke(index % 2 ? PDF_THEME.paleBlue : PDF_THEME.white, PDF_THEME.line);
  doc.font(pdfFontBold).fontSize(8.5).fillColor(PDF_THEME.navy).text(`ความคิดเห็นที่ ${index + 1}`, margin + 11, y + 8, { width: contentWidth - 22, lineBreak: false });
  let cursorY = y + 25;
  if (comment.impressiveText) {
    doc.font(pdfFontBold).fontSize(7.2).fillColor(PDF_THEME.gold).text("สิ่งที่ประทับใจ", margin + 11, cursorY, { width: 100, lineBreak: false });
    drawCommentText(doc, comment.impressiveText, margin + 105, cursorY, contentWidth - 116);
    cursorY += 27;
  }
  if (comment.suggestionText) {
    doc.font(pdfFontBold).fontSize(7.2).fillColor(PDF_THEME.gold).text("ข้อเสนอแนะ", margin + 11, cursorY, { width: 100, lineBreak: false });
    drawCommentText(doc, comment.suggestionText, margin + 105, cursorY, contentWidth - 116);
  }
}

function drawCommentText(doc: PDFKit.PDFDocument, value: string, x: number, y: number, width: number) {
  const lines = fitTextLines(doc, clean(value), width, 7.2, pdfFontRegular, 2);
  lines.forEach((line, index) => doc.font(pdfFontRegular).fontSize(7.2).fillColor(PDF_THEME.text).text(line, x, y + index * 9, { width, lineBreak: false }));
}

function drawEmptyCard(doc: PDFKit.PDFDocument, y: number, message: string) {
  doc.roundedRect(margin, y, contentWidth, 48, 6).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(pdfFontRegular).fontSize(9).fillColor(PDF_THEME.muted).text(message, margin, y + 17, { width: contentWidth, align: "center", lineBreak: false });
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
