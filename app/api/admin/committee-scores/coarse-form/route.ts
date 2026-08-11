import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listSubmissions, type SubmissionListItem } from "../../../../../lib/admin-store";
import { formatCommitteeJudgeProfile, type CommitteeJudgeProfile } from "../../../../../lib/committee-score-config";
import { listCommitteeJudgeProfiles } from "../../../../../lib/committee-score-store";
import { drawDocumentFooter, pdfFontBold, pdfFontRegular, type PdfFontSet } from "../../../../../lib/pdf-theme";

export const runtime = "nodejs";

const fonts: PdfFontSet = { regular: pdfFontRegular, bold: pdfFontBold };
const PRINT = {
  black: "#111827",
  text: "#1f2937",
  muted: "#6b7280",
  line: "#9ca3af",
  lineLight: "#d1d5db",
  white: "#ffffff",
} as const;
const rowsPerPage = 10;
const columns = [
  ["ลำดับ", 40],
  ["ชื่อโครงการ", 278],
  ["1. ผลงาน\nตำรวจ (20)", 76],
  ["2. ปัญหา /\nจำเป็น (15)", 76],
  ["3. แนวคิด /\nรูปแบบ (25)", 76],
  ["4. หลักฐาน\nผลลัพธ์ (20)", 76],
  ["5. คุ้มค่า /\nขยายผล (20)", 76],
  ["คะแนนรวม\n(100)", 75],
] as const;
const tableWidth = columns.reduce((sum, [, width]) => sum + width, 0);

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  const [submissions, profiles] = await Promise.all([listSubmissions(), listCommitteeJudgeProfiles()]);
  const sorted = submissions.slice().sort(compareSubmittedAt);
  const pdf = await buildCoarseScoreFormPdf(sorted, profiles);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "committee_score.coarse_form_pdf",
    entityType: "committee_score",
    summary: "Export แบบฟอร์มคะแนนรอบที่ 1 ทางเลือกที่ 3 แบบหลายโครงการต่อหน้า",
    payload: { submissions: sorted.length, judges: profiles.slice(0, 5).map(formatCommitteeJudgeProfile) },
  }, request.headers);
  return new NextResponse(new Uint8Array(pdf), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="committee-round-1-coarse-score-form-${new Date().toISOString().slice(0, 10)}.pdf"`,
    "Cache-Control": "private, no-store",
  } });
}

export async function buildCoarseScoreFormPdf(submissions: SubmissionListItem[], profiles: CommitteeJudgeProfile[]) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: false });
  const pdf = collectPdf(doc);
  const pageCount = Math.max(1, Math.ceil(submissions.length / rowsPerPage));
  for (let page = 0; page < pageCount; page += 1) {
    if (page) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawPage(doc, submissions.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage), profiles, page + 1, pageCount, page * rowsPerPage);
  }
  doc.info.Title = "แบบฟอร์มคะแนนคณะกรรมการรอบที่ 1";
  doc.info.Subject = "Committee coarse score form - multiple innovations per page";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

function drawPage(doc: PDFKit.PDFDocument, submissions: SubmissionListItem[], profiles: CommitteeJudgeProfile[], pageNumber: number, totalPages: number, startIndex: number) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PRINT.white);
  drawHeader(doc);
  const x = 34;
  const tableY = 88;
  drawTableHeader(doc, x, tableY);
  let cursorY = tableY + 48;
  submissions.forEach((submission, index) => {
    drawSubmissionRow(doc, x, cursorY, submission, startIndex + index + 1);
    cursorY += 30;
  });
  for (let index = submissions.length; index < rowsPerPage; index += 1) {
    drawBlankRow(doc, x, cursorY);
    cursorY += 30;
  }
  drawSignatures(doc, profiles, x, 462);
  drawDocumentFooter(doc, pageNumber, totalPages, "แบบฟอร์มคะแนนรอบที่ 1", fonts);
}

function drawHeader(doc: PDFKit.PDFDocument) {
  const x = 34;
  doc.font(fonts.bold).fontSize(16.5).fillColor(PRINT.black).text("แบบฟอร์มกรอกคะแนนประกวดนวัตกรรม รอบที่ 1 (Paper Screening)", x, 22, { width: tableWidth, align: "center", lineBreak: false });
  doc.font(fonts.regular).fontSize(8.4).fillColor(PRINT.text).text("คณะกรรมการพิจารณาร่วมกัน • กรอกคะแนนหยาบ 5 ด้าน แล้วรวมคะแนนเต็ม 100", x, 50, { width: tableWidth, align: "center", lineBreak: false });
  doc.moveTo(x, 76).lineTo(x + tableWidth, 76).lineWidth(0.8).stroke(PRINT.line);
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number) {
  doc.rect(x, y, tableWidth, 48).fillAndStroke(PRINT.white, PRINT.black);
  let cursorX = x;
  columns.forEach(([label, width], index) => {
    if (index) doc.moveTo(cursorX, y).lineTo(cursorX, y + 48).lineWidth(0.5).stroke(PRINT.line);
    doc.font(fonts.bold).fontSize(index <= 1 ? 9.2 : 7.1).fillColor(PRINT.black).text(label, cursorX + 4, y + (label.includes("\n") ? 10 : 17), {
      width: width - 8,
      height: 30,
      align: index === 1 ? "left" : "center",
      lineGap: 0,
    });
    cursorX += width;
  });
}

function drawSubmissionRow(doc: PDFKit.PDFDocument, x: number, y: number, submission: SubmissionListItem, order: number) {
  drawRowGrid(doc, x, y);
  doc.font(fonts.bold).fontSize(8.6).fillColor(PRINT.black).text(String(order), x + 4, y + 10, { width: columns[0][1] - 8, align: "center", lineBreak: false });
  doc.font(fonts.regular).fontSize(8.2).fillColor(PRINT.text).text(clean(submission.title_th), x + columns[0][1] + 6, y + 8, { width: columns[1][1] - 12, height: 15, ellipsis: true, lineBreak: false });
}

function drawBlankRow(doc: PDFKit.PDFDocument, x: number, y: number) {
  drawRowGrid(doc, x, y);
}

function drawRowGrid(doc: PDFKit.PDFDocument, x: number, y: number) {
  doc.rect(x, y, tableWidth, 30).fillAndStroke(PRINT.white, PRINT.lineLight);
  let cursorX = x;
  columns.forEach(([, width], index) => {
    if (index) doc.moveTo(cursorX, y).lineTo(cursorX, y + 30).lineWidth(0.4).stroke(PRINT.lineLight);
    cursorX += width;
  });
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

function compareSubmittedAt(left: { submitted_at: string }, right: { submitted_at: string }) { return new Date(left.submitted_at).getTime() - new Date(right.submitted_at).getTime(); }
function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim() || "-"; }
function collectPdf(doc: PDFKit.PDFDocument) { const chunks: Buffer[] = []; return new Promise<Buffer>((resolve, reject) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); }); }
