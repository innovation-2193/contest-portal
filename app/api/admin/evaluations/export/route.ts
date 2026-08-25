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
const commentGroupsPerPage = 10;
const pieColors = [PDF_THEME.blue, PDF_THEME.gold, PDF_THEME.green, "#8d5bd1", "#e77c42"];

type CommentGroup = {
  kind: "impressive" | "suggestion";
  text: string;
  count: number;
};

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
  const commentGroups = buildCommentGroups(summary.comments);
  const commentSections = [
    { kind: "impressive" as const, title: "สิ่งที่ประทับใจ", groups: commentGroups.filter((comment) => comment.kind === "impressive") },
    { kind: "suggestion" as const, title: "ข้อเสนอแนะ", groups: commentGroups.filter((comment) => comment.kind === "suggestion") },
  ].filter((section) => section.groups.length > 0);
  const commentPages = commentSections.reduce((total, section) => total + Math.ceil(section.groups.length / commentGroupsPerPage), 0);
  const totalPages = 2 + commentPages;

  doc.info.Title = reportTitle;
  doc.info.Subject = reportTitle;
  doc.info.Author = "Police Innovation Contest 2026";

  drawOverviewPage(doc, summary, generatedAt, totalPages);
  doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
  drawQuestionPage(doc, summary, generatedAt, totalPages, 2);

  let pageNumber = 3;
  for (const section of commentSections) {
    for (let offset = 0; offset < section.groups.length; offset += commentGroupsPerPage) {
      doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
      drawCommentsPage(doc, section.title, section.groups.slice(offset, offset + commentGroupsPerPage), offset, summary.total, totalPages, pageNumber);
      pageNumber += 1;
    }
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
  const cardWidth = (contentWidth - 15) / 2;
  drawMetricCard(doc, "จำนวนผู้ส่งแบบประเมิน", `${summary.total.toLocaleString("th-TH")} คน`, margin, 126, cardWidth, PDF_THEME.white);
  drawMetricCard(doc, "คะแนนภาพรวมการจัดงาน", summary.average ? `${summary.average.toFixed(2)} / 5` : "-", margin + cardWidth + 15, 126, cardWidth, PDF_THEME.goldSoft, "#e5cd70");
  drawSectionSummary(doc, summary.sections);
  drawProfileSummary(doc, summary);
  drawDocumentFooter(doc, 1, totalPages, "ส่วนที่ 1");
}

function drawQuestionPage(doc: PDFKit.PDFDocument, summary: EvaluationSummary, generatedAt: Date, totalPages: number, pageNumber: number) {
  drawBasePage(doc);
  drawReportHeader(doc, "ส่วนที่ 2 คะแนนเฉลี่ยรายหัวข้อ", summary.total);
  drawSectionLabel(doc, "ส่วนที่ 2 · คะแนนเฉลี่ยรายหัวข้อ", 132);
  drawQuestionBarChart(doc, summary.questions, 160);
  drawDocumentFooter(doc, pageNumber, totalPages, "ส่วนที่ 2");
}

function drawCommentsPage(doc: PDFKit.PDFDocument, title: string, comments: CommentGroup[], offset: number, total: number, totalPages: number, pageNumber: number) {
  drawBasePage(doc);
  drawReportHeader(doc, "ส่วนที่ 3 ข้อคิดเห็นและข้อเสนอแนะ (ไม่ระบุตัวตน)", total);
  drawSectionLabel(doc, `ส่วนที่ 3 · ${title}`, 132);
  if (!comments.length) {
    drawEmptyCard(doc, 160, "ยังไม่มีข้อคิดเห็นหรือข้อเสนอแนะ");
  } else {
    drawCommentSection(doc, title, comments, offset, 160);
  }
  drawDocumentFooter(doc, pageNumber, totalPages, "ส่วนที่ 3");
}

function drawBasePage(doc: PDFKit.PDFDocument) {
  doc.rect(0, 0, pageWidth, pageHeight).fill(PDF_THEME.paper);
}

function drawMetricCard(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number, background: string, border: string = PDF_THEME.line) {
  doc.roundedRect(x, y, width, 42, 7).fillAndStroke(background, border);
  doc.font(pdfFontRegular).fontSize(7.8).fillColor(PDF_THEME.muted).text(label, x + 11, y + 10, { width: width - 112, lineBreak: false });
  doc.font(pdfFontBold).fontSize(14).fillColor(PDF_THEME.navy).text(value, x + width - 105, y + 9, { width: 94, align: "right", lineBreak: false });
}

function drawSectionSummary(doc: PDFKit.PDFDocument, sections: EvaluationSummary["sections"]) {
  drawSectionLabel(doc, "คะแนนเฉลี่ยรายหมวด", 188);
  sections.forEach((section, index) => {
    const y = 210 + index * 26;
    const barX = margin + 205;
    const barWidth = 245;
    doc.font(pdfFontRegular).fontSize(7.2).fillColor(PDF_THEME.text).text(clean(section.title), margin + 2, y + 5, { width: 192, lineBreak: false, ellipsis: true });
    doc.roundedRect(barX, y + 6, barWidth, 9, 4).fill(PDF_THEME.paleBlue);
    if (section.average > 0) doc.roundedRect(barX, y + 6, barWidth * Math.min(section.average / 5, 1), 9, 4).fill(PDF_THEME.gold);
    doc.font(pdfFontBold).fontSize(8.2).fillColor(PDF_THEME.navy).text(section.average ? `${section.average.toFixed(2)} / 5` : "-", barX + barWidth + 10, y + 3, { width: 75, align: "right", lineBreak: false });
  });
}

function drawProfileSummary(doc: PDFKit.PDFDocument, summary: EvaluationSummary) {
  profileSections.forEach(([key, label], sectionIndex) => {
    const cardWidth = (contentWidth - 15) / 2;
    const x = sectionIndex % 2 === 0 ? margin : margin + cardWidth + 15;
    const y = 300 + Math.floor(sectionIndex / 2) * 142;
    const values = summary.profiles[key];
    const cardHeight = 128;
    doc.roundedRect(x, y, cardWidth, cardHeight, 6).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(pdfFontBold).fontSize(8.3).fillColor(PDF_THEME.navy).text(label, x + 10, y + 9, { width: cardWidth - 20, lineBreak: false });
    if (!values.length) {
      doc.font(pdfFontRegular).fontSize(7.2).fillColor(PDF_THEME.muted).text("ยังไม่มีข้อมูล", x + 10, y + 38, { width: cardWidth - 20, lineBreak: false });
      return;
    }
    drawPieChart(doc, values, summary.total, x + 60, y + 76, 38, x + 107, y + 29, cardWidth - 117);
  });
}

function drawPieChart(
  doc: PDFKit.PDFDocument,
  values: Array<{ label: string; count: number }>,
  total: number,
  centerX: number,
  centerY: number,
  radius: number,
  legendX: number,
  legendY: number,
  legendWidth: number,
) {
  const sum = values.reduce((result, item) => result + item.count, 0);
  if (!sum) return;
  let startAngle = -Math.PI / 2;
  values.slice(0, 5).forEach((item, index) => {
    const share = item.count / sum;
    const endAngle = startAngle + share * Math.PI * 2;
    const startX = centerX + Math.cos(startAngle) * radius;
    const startY = centerY + Math.sin(startAngle) * radius;
    doc.save();
    doc.moveTo(centerX, centerY).lineTo(startX, startY);
    (doc as PDFKit.PDFDocument & { arc: (x: number, y: number, radius: number, startAngle: number, endAngle: number) => PDFKit.PDFDocument })
      .arc(centerX, centerY, radius, startAngle, endAngle);
    doc.lineTo(centerX, centerY).closePath();
    doc.fillAndStroke(pieColors[index % pieColors.length], PDF_THEME.white);
    doc.restore();
    startAngle = endAngle;
  });
  values.slice(0, 5).forEach((item, index) => {
    const rowY = legendY + index * 18;
    const percentage = total ? `${((item.count / total) * 100).toFixed(1)}%` : "0.0%";
    doc.circle(legendX + 3, rowY + 4, 3).fill(pieColors[index % pieColors.length]);
    doc.font(pdfFontRegular).fontSize(5.9).fillColor(PDF_THEME.text).text(clean(item.label), legendX + 11, rowY, { width: Math.max(45, legendWidth - 66), lineBreak: false, ellipsis: true });
    doc.font(pdfFontRegular).fontSize(5.8).fillColor(PDF_THEME.muted).text(`${item.count.toLocaleString("th-TH")} (${percentage})`, legendX + legendWidth - 48, rowY, { width: 48, align: "right", lineBreak: false });
  });
}

function drawSectionLabel(doc: PDFKit.PDFDocument, label: string, y: number) {
  doc.font(pdfFontBold).fontSize(11).fillColor(PDF_THEME.navy).text(label, margin, y, { width: contentWidth, lineBreak: false });
}

function drawQuestionBarChart(doc: PDFKit.PDFDocument, questions: EvaluationSummary["questions"], y: number) {
  const barX = margin + 310;
  const barWidth = 135;
  if (!questions.length) {
    drawEmptyCard(doc, y, "ยังไม่มีคะแนนรายหัวข้อ");
    return;
  }
  questions.forEach((question, index) => {
    const rowY = y + index * 30;
    doc.roundedRect(margin, rowY, contentWidth, 27, 4).fillAndStroke(index % 2 ? PDF_THEME.paleBlue : PDF_THEME.white, PDF_THEME.line);
    doc.font(pdfFontBold).fontSize(6.7).fillColor(PDF_THEME.navy).text(`${index + 1}`, margin + 8, rowY + 8, { width: 20, align: "center", lineBreak: false });
    doc.font(pdfFontRegular).fontSize(7).fillColor(PDF_THEME.text).text(clean(question.label), margin + 38, rowY + 8, { width: 215, lineBreak: false, ellipsis: true });
    doc.roundedRect(barX, rowY + 10, barWidth, 7, 3).fill(PDF_THEME.paleBlue);
    if (question.average > 0) doc.roundedRect(barX, rowY + 10, barWidth * Math.min(question.average / 5, 1), 7, 3).fill(PDF_THEME.gold);
    doc.font(pdfFontRegular).fontSize(6.2).fillColor(PDF_THEME.muted).text(`${question.count.toLocaleString("th-TH")} คำตอบ`, barX - 53, rowY + 7, { width: 48, align: "right", lineBreak: false });
    doc.font(pdfFontBold).fontSize(7.2).fillColor(PDF_THEME.navy).text(question.average ? `${question.average.toFixed(2)} / 5` : "-", barX + barWidth + 8, rowY + 7, { width: 64, align: "right", lineBreak: false });
  });
}

function drawCommentSection(doc: PDFKit.PDFDocument, title: string, comments: CommentGroup[], offset: number, y: number) {
  const rowHeight = 35;
  const cardHeight = 39 + comments.length * rowHeight;
  doc.roundedRect(margin, y, contentWidth, cardHeight, 7).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(pdfFontBold).fontSize(9.2).fillColor(PDF_THEME.gold).text(title, margin + 13, y + 12, { width: contentWidth - 26, lineBreak: false });
  comments.forEach((comment, index) => {
    const rowY = y + 35 + index * rowHeight;
    if ((offset + index) % 2 === 1) doc.rect(margin + 8, rowY - 2, contentWidth - 16, rowHeight).fill(PDF_THEME.paleBlue);
    doc.circle(margin + 20, rowY + 12, 2.2).fill(PDF_THEME.blue);
    drawCommentText(doc, comment.text, margin + 31, rowY + 4, contentWidth - 135);
    if (comment.count > 1) {
      doc.font(pdfFontRegular).fontSize(6.5).fillColor(PDF_THEME.muted).text(`${comment.count.toLocaleString("th-TH")} ครั้ง`, pageWidth - margin - 87, rowY + 9, { width: 72, align: "right", lineBreak: false });
    }
  });
}

function drawCommentText(doc: PDFKit.PDFDocument, value: string, x: number, y: number, width: number) {
  const lines = fitTextLines(doc, clean(value), width, 7.2, pdfFontRegular, 2);
  lines.forEach((line, index) => doc.font(pdfFontRegular).fontSize(7.2).fillColor(PDF_THEME.text).text(line, x, y + index * 9, { width, lineBreak: false }));
}

function buildCommentGroups(comments: EvaluationSummary["comments"]): CommentGroup[] {
  const groups: CommentGroup[] = [];
  const indexByKey = new Map<string, number>();
  const add = (kind: CommentGroup["kind"], value: string) => {
    const text = value.replace(/\s+/g, " ").trim();
    if (!text) return;
    const key = `${kind}:${text}`;
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({ kind, text, count: 1 });
    } else {
      groups[existingIndex].count += 1;
    }
  };
  comments.forEach((comment) => {
    add("impressive", comment.impressiveText);
    add("suggestion", comment.suggestionText);
  });
  return groups;
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
