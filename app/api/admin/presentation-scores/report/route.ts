import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listCommitteeScoreRecords } from "../../../../../lib/committee-score-store";
import { listSubmissions, listWinners } from "../../../../../lib/admin-store";
import { selectPresentationSubmissions } from "../../../../../lib/presentation-score-utils";
import { buildPresentationScoreboard, listPresentationJudgeProfiles, listPresentationScoreRecords } from "../../../../../lib/presentation-score-store";
import { drawDocumentFooter, formatPdfThaiDateTime, pdfFontBold, pdfFontRegular, type PdfFontSet } from "../../../../../lib/pdf-theme";

export const runtime = "nodejs";

const fonts: PdfFontSet = { regular: pdfFontRegular, bold: pdfFontBold };
const PRINT = { black: "#111827", text: "#1f2937", muted: "#6b7280", line: "#9ca3af", lineLight: "#d1d5db", white: "#ffffff" } as const;

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  const [submissions, winners, profiles, records, round1Records] = await Promise.all([
    listSubmissions(),
    listWinners(),
    listPresentationJudgeProfiles(),
    listPresentationScoreRecords(),
    listCommitteeScoreRecords(),
  ]);
  const finalists = selectPresentationSubmissions(submissions, winners);
  const finalistCodes = new Set(finalists.map((item) => item.submission_code));
  const rows = await buildPresentationScoreboard(finalists, records.filter((record) => finalistCodes.has(record.submissionCode)), profiles, round1Records);
  const pdf = await buildPdf(rows, profiles.length);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "presentation_score.report_pdf",
    entityType: "presentation_score",
    summary: "Export PDF รายงานคะแนนรอบที่ 2 พร้อม Weight",
    payload: { finalists: rows.length, judges: profiles.length },
  }, request.headers);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="presentation-score-report-round-2-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function buildPdf(rows: Awaited<ReturnType<typeof buildPresentationScoreboard>>, judgeCount: number) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: false });
  const pdf = collectPdf(doc);
  const perPage = 14;
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  for (let page = 0; page < pages; page += 1) {
    if (page) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    const pageRows = rows.slice(page * perPage, page * perPage + perPage);
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(PRINT.white);
    drawReportHeader(doc, judgeCount);
    drawTableHeader(doc, 28, 104);
    pageRows.forEach((row, index) => drawTableRow(doc, row, 132 + index * 38, index));
    drawDocumentFooter(doc, page + 1, pages, "รายงานคะแนนรอบที่ 2 • Weight 40/60", fonts);
  }
  doc.info.Title = "รายงานคะแนนประกวดนวัตกรรม รอบที่ 2 (Presentation)";
  doc.info.Subject = "Weighted presentation score report";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

function drawReportHeader(doc: PDFKit.PDFDocument, judgeCount: number) {
  const width = doc.page.width - 56;
  doc.font(fonts.bold).fontSize(18).fillColor(PRINT.black).text("รายงานคะแนนประกวดนวัตกรรม รอบที่ 2 (Presentation)", 28, 24, { width, align: "center", lineBreak: false });
  doc.font(fonts.regular).fontSize(9.2).fillColor(PRINT.text).text(
    `คะแนนรวม = (คะแนนรอบที่ 1 × 40%) + (คะแนนรอบที่ 2 × 60%) • กรรมการ ${judgeCount.toLocaleString("th-TH")} คน • ออกรายงานเมื่อ ${formatPdfThaiDateTime(new Date())}`,
    28,
    52,
    { width, align: "center", lineBreak: false },
  );
  doc.moveTo(28, 78).lineTo(doc.page.width - 28, 78).lineWidth(0.8).stroke(PRINT.line);
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number) {
  const columns = [["ลำดับ", 42], ["ชื่อโครงการ", 360], ["รอบ 1 × 40%", 100], ["รอบ 2 × 60%", 100], ["รวม", 100], ["กรรมการ", 80]] as const;
  const total = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.rect(x, y, total, 28).fillAndStroke(PRINT.white, PRINT.black);
  let cursor = x;
  columns.forEach(([label, width], index) => {
    if (index) doc.moveTo(cursor, y).lineTo(cursor, y + 28).lineWidth(0.45).stroke(PRINT.line);
    doc.font(fonts.bold).fontSize(8.6).fillColor(PRINT.black).text(label, cursor + 4, y + 9, { width: width - 8, align: index === 1 ? "left" : "center", lineBreak: false });
    cursor += width;
  });
}

function drawTableRow(doc: PDFKit.PDFDocument, row: Awaited<ReturnType<typeof buildPresentationScoreboard>>[number], y: number, index: number) {
  const columns = [42, 360, 100, 100, 100, 80];
  const total = columns.reduce((sum, width) => sum + width, 0);
  doc.rect(28, y, total, 38).fillAndStroke(PRINT.white, PRINT.lineLight);
  let cursor = 28;
  const values = [row.rank.toLocaleString("th-TH"), row.submissionTitle, score(row.weightedRound1), score(row.weightedPresentation), score(row.finalScore), row.judgeCount.toLocaleString("th-TH")];
  values.forEach((value, valueIndex) => {
    if (valueIndex) doc.moveTo(cursor, y).lineTo(cursor, y + 38).lineWidth(0.35).stroke(PRINT.lineLight);
    doc.font(valueIndex === 0 || valueIndex >= 2 ? fonts.bold : fonts.regular).fontSize(valueIndex === 1 ? 8.5 : 8.8).fillColor(PRINT.text).text(value, cursor + 5, y + 13, { width: columns[valueIndex] - 10, align: valueIndex === 1 ? "left" : "center", ellipsis: true, lineBreak: false });
    cursor += columns[valueIndex];
  });
  void index;
}

function score(value: number | null) { return value === null ? "-" : value.toFixed(2); }
function collectPdf(doc: PDFKit.PDFDocument) { const chunks: Buffer[] = []; return new Promise<Buffer>((resolve, reject) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); }); }
