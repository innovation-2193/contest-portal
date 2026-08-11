import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listSubmissions, type SubmissionListItem } from "../../../../../lib/admin-store";
import { committeeConsensusCriteria, formatCommitteeJudgeProfile, type CommitteeJudgeProfile } from "../../../../../lib/committee-score-config";
import { committeeConsensusJudgeKey, listCommitteeJudgeProfiles, listCommitteeScoreRecords, type CommitteeScoreRecord } from "../../../../../lib/committee-score-store";
import { drawDocumentFooter, formatPdfThaiDateTime, pdfFontBold, pdfFontRegular, type PdfFontSet } from "../../../../../lib/pdf-theme";

export const runtime = "nodejs";

const fonts: PdfFontSet = { regular: pdfFontRegular, bold: pdfFontBold };
const PRINT = { black: "#111827", text: "#1f2937", muted: "#6b7280", line: "#9ca3af", lineLight: "#d1d5db", white: "#ffffff" } as const;
const columns = [["ลำดับ", 40], ["ชื่อโครงการ", 270], ["1", 78], ["2", 78], ["3", 78], ["4", 78], ["5", 78], ["คะแนนรวม", 93]] as const;
const tableWidth = columns.reduce((sum, [, width]) => sum + width, 0);
const rowsPerPage = 10;

type ConsensusReportRow = { submission: SubmissionListItem; score: CommitteeScoreRecord | null };

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  const [submissions, records, profiles] = await Promise.all([listSubmissions(), listCommitteeScoreRecords(), listCommitteeJudgeProfiles()]);
  const rows = buildConsensusReportRows(submissions, records);
  const pdf = await buildConsensusReportPdf(rows, profiles);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "committee_score.consensus_report_pdf",
    entityType: "committee_score",
    summary: "Export รายงานจัดอันดับคะแนนรอบที่ 1 ทางเลือกที่ 3",
    payload: { submissions: rows.length, scored: rows.filter((row) => row.score).length, judges: profiles.slice(0, 5).map(formatCommitteeJudgeProfile) },
  }, request.headers);
  return new NextResponse(new Uint8Array(pdf), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="committee-round-1-option-3-ranking-${new Date().toISOString().slice(0, 10)}.pdf"`,
    "Cache-Control": "private, no-store",
  } });
}

export function buildConsensusReportRows(submissions: SubmissionListItem[], records: CommitteeScoreRecord[]) {
  const byCode = new Map(records.filter((record) => record.judgeKey === committeeConsensusJudgeKey).map((record) => [record.submissionCode, record]));
  return submissions.slice().sort((left, right) => {
    const leftScore = byCode.get(left.submission_code)?.calculatedTotal ?? -1;
    const rightScore = byCode.get(right.submission_code)?.calculatedTotal ?? -1;
    return rightScore - leftScore || new Date(left.submitted_at).getTime() - new Date(right.submitted_at).getTime();
  }).map((submission) => ({ submission, score: byCode.get(submission.submission_code) ?? null }));
}

export async function buildConsensusReportPdf(rows: ConsensusReportRow[], profiles: CommitteeJudgeProfile[] = []) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: false });
  const pdf = collectPdf(doc);
  const pages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const generatedAt = new Date();
  for (let page = 0; page < pages; page += 1) {
    if (page) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawPage(doc, rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage), profiles, page + 1, pages, generatedAt);
  }
  doc.info.Title = "รายงานจัดอันดับคะแนนคณะกรรมการรอบที่ 1";
  doc.info.Subject = "Committee coarse score ranking";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

function drawPage(doc: PDFKit.PDFDocument, rows: ConsensusReportRow[], profiles: CommitteeJudgeProfile[], pageNumber: number, totalPages: number, generatedAt: Date) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PRINT.white);
  doc.font(fonts.bold).fontSize(17).fillColor(PRINT.black).text("รายงานจัดอันดับคะแนนคณะกรรมการ รอบที่ 1 (Paper Screening)", 24, 24, { width: doc.page.width - 48, align: "center", lineBreak: false });
  doc.font(fonts.regular).fontSize(8.8).fillColor(PRINT.text).text(`คะแนนจากการพิจารณาร่วมกัน 5 ด้าน • เรียงจากคะแนนมากไปน้อย • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`, 24, 52, { width: doc.page.width - 48, align: "center", lineBreak: false });
  doc.moveTo(24, 78).lineTo(doc.page.width - 24, 78).lineWidth(0.8).stroke(PRINT.line);
  drawLegend(doc, 24, 88);
  const x = 24;
  const y = 116;
  drawTableHeader(doc, x, y);
  let cursorY = y + 36;
  rows.forEach((row, index) => {
    drawRow(doc, x, cursorY, row, (pageNumber - 1) * rowsPerPage + index);
    cursorY += 28;
  });
  if (!rows.length) {
    doc.rect(x, cursorY, tableWidth, 58).fillAndStroke(PRINT.white, PRINT.line);
    doc.font(fonts.bold).fontSize(11).fillColor(PRINT.black).text("ยังไม่มีรายการคะแนนที่อัปโหลด", x, cursorY + 22, { width: tableWidth, align: "center", lineBreak: false });
  }
  drawSignatures(doc, profiles, x, 450);
  drawDocumentFooter(doc, pageNumber, totalPages, "รายงานคะแนนรอบที่ 1", fonts);
}

function drawSignatures(doc: PDFKit.PDFDocument, profiles: CommitteeJudgeProfile[], x: number, y: number) {
  const cellTop = y + 20;
  const cellHeight = 62;
  const cellWidth = tableWidth / 5;
  doc.font(fonts.bold).fontSize(9.5).fillColor(PRINT.black).text("ลงนามผู้พิจารณา", x, y, { width: tableWidth, align: "center", lineBreak: false });
  doc.rect(x, cellTop, tableWidth, cellHeight).fillAndStroke(PRINT.white, PRINT.line);
  for (let index = 1; index < 5; index += 1) {
    const boundaryX = x + cellWidth * index;
    doc.moveTo(boundaryX, cellTop).lineTo(boundaryX, cellTop + cellHeight).lineWidth(0.45).stroke(PRINT.line);
  }
  profiles.slice(0, 5).forEach((profile, index) => {
    const cellX = x + cellWidth * index;
    doc.moveTo(cellX + 12, cellTop + 21).lineTo(cellX + cellWidth - 12, cellTop + 21).lineWidth(0.5).stroke(PRINT.line);
    doc.font(fonts.bold).fontSize(7).fillColor(PRINT.black).text(formatCommitteeJudgeProfile(profile), cellX + 5, cellTop + 28, { width: cellWidth - 10, height: 11, align: "center", ellipsis: true, lineBreak: false });
    doc.font(fonts.regular).fontSize(5.7).fillColor(PRINT.text).text(profile.position || "-", cellX + 5, cellTop + 42, { width: cellWidth - 10, height: 16, align: "center", ellipsis: true, lineGap: 0 });
  });
}

function drawLegend(doc: PDFKit.PDFDocument, x: number, y: number) {
  const labels = committeeConsensusCriteria.map((criterion, index) => `${index + 1}=${criterion.label.replace(/^\d+\.\s*/, "")} (${criterion.max})`);
  doc.font(fonts.regular).fontSize(6.6).fillColor(PRINT.muted).text(labels.join("  •  "), x, y, { width: tableWidth, align: "center", lineBreak: false });
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number) {
  doc.rect(x, y, tableWidth, 36).fillAndStroke(PRINT.white, PRINT.black);
  let cursorX = x;
  columns.forEach(([label, width], index) => {
    if (index) doc.moveTo(cursorX, y).lineTo(cursorX, y + 36).lineWidth(0.45).stroke(PRINT.line);
    doc.font(fonts.bold).fontSize(8.3).fillColor(PRINT.black).text(label, cursorX + 4, y + 12, { width: width - 8, align: index === 1 ? "left" : "center", lineBreak: false });
    cursorX += width;
  });
}

function drawRow(doc: PDFKit.PDFDocument, x: number, y: number, row: ConsensusReportRow, absoluteIndex: number) {
  doc.rect(x, y, tableWidth, 28).fillAndStroke(PRINT.white, PRINT.lineLight);
  let cursorX = x;
  columns.forEach(([, width], columnIndex) => {
    if (columnIndex) doc.moveTo(cursorX, y).lineTo(cursorX, y + 28).lineWidth(0.35).stroke(PRINT.lineLight);
    doc.font(columnIndex === 0 || columnIndex === 7 ? fonts.bold : fonts.regular).fontSize(columnIndex === 1 ? 8.1 : 8.4).fillColor(PRINT.text).text(rowValue(row, columnIndex, absoluteIndex), cursorX + 4, y + 9, { width: width - 8, height: 12, align: columnIndex === 1 ? "left" : "center", ellipsis: true, lineBreak: false });
    cursorX += width;
  });
}

function rowValue(row: ConsensusReportRow, columnIndex: number, absoluteIndex: number) {
  if (columnIndex === 0) return String(absoluteIndex + 1);
  if (columnIndex === 1) return clean(row.submission.title_th);
  if (columnIndex >= 2 && columnIndex <= 6) {
    const criterion = committeeConsensusCriteria[columnIndex - 2];
    const value = row.score?.itemScores[criterion.id];
    return value === null || value === undefined ? "-" : String(value);
  }
  return row.score ? row.score.calculatedTotal.toFixed(2) : "-";
}

function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim() || "-"; }
function collectPdf(doc: PDFKit.PDFDocument) { const chunks: Buffer[] = []; return new Promise<Buffer>((resolve, reject) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); }); }
