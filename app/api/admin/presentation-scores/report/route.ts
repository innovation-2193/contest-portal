import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listCommitteeScoreRecords } from "../../../../../lib/committee-score-store";
import { listSubmissions, listWinners } from "../../../../../lib/admin-store";
import { selectPresentationSubmissions } from "../../../../../lib/presentation-score-utils";
import { buildPresentationScoreboard, listPresentationJudgeProfiles, listPresentationScoreRecords } from "../../../../../lib/presentation-score-store";
import { drawDocumentFooter, drawDocumentHeader, formatPdfThaiDateTime, PDF_THEME, pdfFontBold, pdfFontRegular, type PdfFontSet } from "../../../../../lib/pdf-theme";

export const runtime = "nodejs";
const fonts: PdfFontSet = { regular: pdfFontRegular, bold: pdfFontBold };

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  const [submissions, winners, profiles, records, round1Records] = await Promise.all([listSubmissions(), listWinners(), listPresentationJudgeProfiles(), listPresentationScoreRecords(), listCommitteeScoreRecords()]);
  const finalists = selectPresentationSubmissions(submissions, winners);
  const finalistCodes = new Set(finalists.map((item) => item.submission_code));
  const rows = await buildPresentationScoreboard(finalists, records.filter((record) => finalistCodes.has(record.submissionCode)), profiles, round1Records);
  const pdf = await buildPdf(rows, profiles.length);
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "presentation_score.report_pdf", entityType: "presentation_score", summary: "Export รายงานคะแนนรอบที่ 2 พร้อม Weight", payload: { finalists: rows.length, judges: profiles.length } }, request.headers);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="presentation-score-report-round-2-${new Date().toISOString().slice(0, 10)}.pdf"`, "Cache-Control": "private, no-store" } });
}

async function buildPdf(rows: Awaited<ReturnType<typeof buildPresentationScoreboard>>, judgeCount: number) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
  const pdf = collectPdf(doc);
  const perPage = 12;
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  for (let page = 0; page < pages; page += 1) {
    if (page) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    const pageRows = rows.slice(page * perPage, page * perPage + perPage);
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
    drawDocumentHeader(doc, { title: "รายงานคะแนนประกวดนวัตกรรม รอบที่ 2 (Presentation)", subtitle: `คะแนนถ่วงน้ำหนัก รอบที่ 1 40% + รอบที่ 2 60% • ออกรายงานเมื่อ ${formatPdfThaiDateTime(new Date())}`, metaLabel: "กรรมการ", metaValue: `${judgeCount.toLocaleString("th-TH")} คน`, showLogo: true, fonts });
    drawTableHeader(doc, 28, 145);
    pageRows.forEach((row, index) => drawTableRow(doc, row, 173 + index * 42, index));
    drawDocumentFooter(doc, page + 1, pages, "รายงานคะแนนรอบที่ 2 • Weight 40/60", fonts);
  }
  doc.info.Title = "รายงานคะแนนประกวดนวัตกรรม รอบที่ 2 (Presentation)";
  doc.end();
  return pdf;
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number) {
  const columns = [["ลำดับ", 42], ["ชื่อโครงการ", 290], ["รอบ 1 × 40%", 76], ["รอบ 2 × 60%", 76], ["รวม", 70], ["กรรมการ", 58]] as const;
  doc.roundedRect(x, y, 612, 28, 5).fill(PDF_THEME.navy);
  let cursor = x;
  doc.font(fonts.bold).fontSize(8).fillColor(PDF_THEME.goldSoft);
  for (const [label, width] of columns) { doc.text(label, cursor + 4, y + 9, { width: width - 8, align: label === "ชื่อโครงการ" ? "left" : "center", lineBreak: false }); cursor += width; }
}

function drawTableRow(doc: PDFKit.PDFDocument, row: Awaited<ReturnType<typeof buildPresentationScoreboard>>[number], y: number, index: number) {
  const columns = [42, 290, 76, 76, 70, 58];
  doc.rect(28, y, 612, 42).fillAndStroke(index % 2 ? PDF_THEME.paleBlue : PDF_THEME.white, PDF_THEME.line);
  let cursor = 28;
  const values = [row.rank.toLocaleString("th-TH"), row.submissionTitle, score(row.weightedRound1), score(row.weightedPresentation), score(row.finalScore), `${row.judgeCount}`];
  values.forEach((value, valueIndex) => { doc.font(valueIndex === 0 || valueIndex >= 2 ? fonts.bold : fonts.regular).fontSize(valueIndex === 1 ? 8.4 : 8.8).fillColor(valueIndex >= 2 ? PDF_THEME.navy : PDF_THEME.text).text(value, cursor + 5, y + 14, { width: columns[valueIndex] - 10, align: valueIndex === 1 ? "left" : "center", ellipsis: true, lineBreak: false }); cursor += columns[valueIndex]; });
}

function score(value: number | null) { return value === null ? "-" : value.toFixed(2); }
function collectPdf(doc: PDFKit.PDFDocument) { const chunks: Buffer[] = []; return new Promise<Buffer>((resolve, reject) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); }); }

