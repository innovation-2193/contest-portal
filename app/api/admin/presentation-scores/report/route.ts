import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listCommitteeScoreRecords } from "../../../../../lib/committee-score-store";
import { listSubmissions, listWinners } from "../../../../../lib/admin-store";
import { selectPresentationSubmissions } from "../../../../../lib/presentation-score-utils";
import { buildPresentationScoreboard, listPresentationJudgeProfiles, listPresentationScoreRecords } from "../../../../../lib/presentation-score-store";
import { drawDocumentFooter, drawDocumentHeader, formatPdfThaiDateTime, PDF_THEME, pdfFontBold, pdfFontRegular, type PdfFontSet } from "../../../../../lib/pdf-theme";
import { drawPdfKitIpWatermark, exportWatermarkFromRequest, type PdfExportWatermark } from "../../../../../lib/pdf-watermark";
import { formatApplicantName } from "../../../../../lib/thai-rank-title";
import { findPresentationScoreReportVersion } from "../../../../../lib/presentation-score-report-versions";

export const runtime = "nodejs";

const fonts: PdfFontSet = { regular: pdfFontRegular, bold: pdfFontBold };
const PRINT = { black: "#111827", text: "#1f2937", muted: "#6b7280", line: "#9ca3af", lineLight: "#d1d5db", white: "#ffffff" } as const;
type PresentationReportRow = Awaited<ReturnType<typeof buildPresentationScoreboard>>[number] & { submissionTitleEnglish: string; ownerName: string; affiliation: string };

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  const watermark = exportWatermarkFromRequest(request);
  const versionId = new URL(request.url).searchParams.get("versionId")?.trim() || "";
  const version = versionId ? await findPresentationScoreReportVersion(versionId) : null;
  if (versionId && !version) return NextResponse.json({ ok: false, message: "ไม่พบ Version รายงานคะแนนรอบที่ 2" }, { status: 404 });
  const [submissions, winners, profiles, records, round1Records] = await Promise.all([
    listSubmissions(),
    listWinners(),
    listPresentationJudgeProfiles(),
    listPresentationScoreRecords(),
    listCommitteeScoreRecords(),
  ]);
  const finalists = selectPresentationSubmissions(submissions, winners);
  const finalistCodes = new Set(finalists.map((item) => item.submission_code));
  const scoreRows = version
    ? version.rows
    : await buildPresentationScoreboard(finalists, records.filter((record) => finalistCodes.has(record.submissionCode)), profiles, round1Records);
  const finalistsByCode = new Map(finalists.map((submission) => [submission.submission_code, submission]));
  const rows = scoreRows.map((row) => {
    const submission = finalistsByCode.get(row.submissionCode);
    return {
      ...row,
      submissionTitleEnglish: submission?.title_en?.trim() || "-",
      ownerName: submission ? formatApplicantName(submission) : "-",
      affiliation: submission ? [submission.division, submission.bureau].filter(Boolean).join(" / ") || "-" : "-",
    };
  });
  const pdf = await buildPdf(rows, profiles.length, version?.version, watermark);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "presentation_score.report_pdf",
    entityType: "presentation_score",
    summary: `Export PDF รายงานคะแนนรอบที่ 2 พร้อม Weight${version ? ` Version ${version.version}` : ""}`,
    payload: { finalists: rows.length, judges: profiles.length, reportVersion: version?.version ?? null },
  }, request.headers);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="presentation-score-report-round-2${version ? `-v${version.version}` : ""}-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function buildPdf(rows: PresentationReportRow[], judgeCount: number, reportVersion?: number, watermark?: PdfExportWatermark) {
  // Keep this report on a standard A4 landscape page so the weighted-score
  // table remains readable when printed or attached to an official report.
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: false });
  const pdf = collectPdf(doc);
  const perPage = 5;
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  for (let page = 0; page < pages; page += 1) {
    if (page) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    const pageRows = rows.slice(page * perPage, page * perPage + perPage);
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(PRINT.white);
    drawReportHeader(doc, judgeCount, reportVersion);
    drawTableHeader(doc, 28, 124);
    pageRows.forEach((row, index) => drawTableRow(doc, row, 156 + index * 68, index));
    drawDocumentFooter(doc, page + 1, pages, `รายงานคะแนนรอบที่ 2 • Weight 40/60${reportVersion ? ` • Version ${reportVersion}` : ""}`, fonts);
    if (watermark) drawPdfKitIpWatermark(doc, watermark);
  }
  doc.info.Title = "รายงานคะแนนประกวดนวัตกรรม รอบที่ 2 (Presentation)";
  doc.info.Subject = "Weighted presentation score report";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

function drawReportHeader(doc: PDFKit.PDFDocument, judgeCount: number, reportVersion?: number) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "รายงานคะแนนประกวดนวัตกรรม รอบที่ 2 (Presentation)",
    subtitle: `${reportVersion ? `Version ${reportVersion} • ` : ""}คะแนนรวม = (คะแนนรอบที่ 1 × 40%) + (คะแนนรอบที่ 2 × 60%) • กรรมการ ${judgeCount.toLocaleString("th-TH")} คน • ออกรายงานเมื่อ ${formatPdfThaiDateTime(new Date())}`,
    fonts,
  });
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number) {
  const columns = [["ลำดับ", 42], ["ชื่อโครงการ / ผู้ส่งผลงานหลัก / สังกัด", 444], ["รอบ 1 × 40%", 100], ["รอบ 2 × 60%", 100], ["คะแนนรวม", 100]] as const;
  const total = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.rect(x, y, total, 32).fillAndStroke(PRINT.white, PRINT.black);
  let cursor = x;
  columns.forEach(([label, width], index) => {
    if (index) doc.moveTo(cursor, y).lineTo(cursor, y + 32).lineWidth(0.45).stroke(PRINT.line);
    doc.font(fonts.bold).fontSize(8.6).fillColor(PRINT.black).text(label, cursor + 4, y + 10, { width: width - 8, align: index === 1 ? "left" : "center", lineBreak: false });
    cursor += width;
  });
}

function drawTableRow(doc: PDFKit.PDFDocument, row: PresentationReportRow, y: number, index: number) {
  const columns = [42, 444, 100, 100, 100];
  const total = columns.reduce((sum, width) => sum + width, 0);
  doc.rect(28, y, total, 68).fillAndStroke(PRINT.white, PRINT.lineLight);
  let boundary = 28;
  columns.slice(0, -1).forEach((width) => {
    boundary += width;
    doc.moveTo(boundary, y).lineTo(boundary, y + 68).lineWidth(0.35).stroke(PRINT.lineLight);
  });
  doc.font(fonts.bold).fontSize(8.8).fillColor(PRINT.text).text(row.rank.toLocaleString("th-TH"), 33, y + 25, { width: columns[0] - 10, align: "center", lineBreak: false });
  const scores = [score(row.weightedRound1), score(row.weightedPresentation), score(row.finalScore)];
  scores.forEach((value, index) => {
    const columnIndex = index + 2;
    const columnX = 28 + columns.slice(0, columnIndex).reduce((sum, width) => sum + width, 0);
    doc.font(fonts.bold).fontSize(8.8).fillColor(PRINT.text).text(value, columnX + 5, y + 25, { width: columns[columnIndex] - 10, align: "center", lineBreak: false });
  });
  doc.font(fonts.bold).fontSize(10.5).fillColor(PRINT.text).text(clean(row.submissionTitle), 28 + columns[0] + 7, y + 7, { width: columns[1] - 14, height: 14, ellipsis: true, lineBreak: false });
  doc.font(fonts.regular).fontSize(8.5).fillColor(PRINT.text).text(`English: ${clean(row.submissionTitleEnglish)}`, 28 + columns[0] + 7, y + 23, { width: columns[1] - 14, height: 12, ellipsis: true, lineBreak: false });
  doc.font(fonts.regular).fontSize(8.2).fillColor(PRINT.text).text(`ผู้ส่งผลงานหลัก: ${clean(row.ownerName)}`, 28 + columns[0] + 7, y + 38, { width: columns[1] - 14, height: 11, ellipsis: true, lineBreak: false });
  doc.font(fonts.regular).fontSize(8.2).fillColor(PRINT.muted).text(`สังกัด: ${clean(row.affiliation)}`, 28 + columns[0] + 7, y + 51, { width: columns[1] - 14, height: 11, ellipsis: true, lineBreak: false });
  void index;
}

function score(value: number | null) { return value === null ? "-" : value.toFixed(2); }
function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function collectPdf(doc: PDFKit.PDFDocument) { const chunks: Buffer[] = []; return new Promise<Buffer>((resolve, reject) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); }); }
