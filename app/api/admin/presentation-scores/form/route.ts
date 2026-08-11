import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listCommitteeScoreRecords } from "../../../../../lib/committee-score-store";
import { listSubmissions, listWinners, type SubmissionListItem } from "../../../../../lib/admin-store";
import { formatPresentationJudge, presentationScoreCriteria, type PresentationJudgeProfile } from "../../../../../lib/presentation-score-config";
import { listPresentationJudgeProfiles, round1WeightedScore } from "../../../../../lib/presentation-score-store";
import { selectPresentationSubmissions } from "../../../../../lib/presentation-score-utils";
import { drawDocumentFooter, pdfFontBold, pdfFontRegular, type PdfFontSet } from "../../../../../lib/pdf-theme";
import { formatApplicantName } from "../../../../../lib/thai-rank-title";

export const runtime = "nodejs";

const fonts: PdfFontSet = { regular: pdfFontRegular, bold: pdfFontBold };
const PRINT = {
  black: "#111827",
  text: "#1f2937",
  muted: "#6b7280",
  watermark: "#cbd5e1",
  line: "#9ca3af",
  lineLight: "#d1d5db",
  sectionRed: "#b91c1c",
  white: "#ffffff",
} as const;

const columns = [
  ["ข้อ", 42],
  ["เกณฑ์การประเมินรอบที่ 2", 300],
  ["คะแนนเต็ม", 62],
  ["คะแนนที่ได้", 143],
] as const;
const tableWidth = columns.reduce((sum, [, width]) => sum + width, 0);

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });

  const [submissions, winners, profiles, round1Records] = await Promise.all([
    listSubmissions(),
    listWinners(),
    listPresentationJudgeProfiles(),
    listCommitteeScoreRecords(),
  ]);
  const finalists = selectPresentationSubmissions(submissions, winners);
  const selectedJudgeKey = new URL(request.url).searchParams.get("judgeKey")?.trim() || "";
  const selectedJudge = selectedJudgeKey ? profiles.find((profile) => profile.judgeKey === selectedJudgeKey) ?? null : null;
  if (selectedJudgeKey && !selectedJudge) {
    return NextResponse.json({ ok: false, message: "ไม่พบกรรมการรอบที่ 2 ที่เลือก" }, { status: 404 });
  }

  const judges = selectedJudgeKey ? [selectedJudge] : profiles.length ? profiles : [null];
  const pdf = await presentationScoreFormPdf(finalists, judges, round1Records);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "presentation_score.form_pdf",
    entityType: "presentation_score",
    summary: `Export PDF แบบฟอร์มให้คะแนนรอบที่ 2 ${finalists.length.toLocaleString("th-TH")} ผลงาน`,
    payload: { finalists: finalists.length, judges: judges.filter(Boolean).map((judge) => judge?.judgeKey ?? "") },
  }, request.headers);

  const suffix = selectedJudge ? `-${safeFilePart(selectedJudge.judgeKey)}` : "-all-judges";
  return new NextResponse(new Uint8Array(pdf), {
    headers: pdfHeaders(`presentation-score-form-round-2${suffix}-${new Date().toISOString().slice(0, 10)}.pdf`),
  });
}

export async function presentationScoreFormPdf(
  submissions: SubmissionListItem[],
  judges: Array<PresentationJudgeProfile | null>,
  round1Records: Awaited<ReturnType<typeof listCommitteeScoreRecords>>,
) {
  const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0, bufferPages: false });
  const pdf = collectPdf(doc);
  const submissionRows = submissions.length ? submissions : [null];
  const pageRows = judges.flatMap((judge) => submissionRows.map((submission) => ({ judge, submission })));
  const rows = pageRows.length ? pageRows : [{ judge: null, submission: null }];
  const totalPages = rows.length;
  doc.info.Title = "แบบฟอร์มกรอกคะแนนประกวดนวัตกรรม รอบที่ 2 (Presentation)";
  doc.info.Subject = "Police Innovation Contest 2026 Presentation score form";
  doc.info.Author = "Police Innovation Contest 2026";

  rows.forEach(({ submission, judge }, index) => {
    if (index) doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
    drawSheet(doc, submission, judge, index + 1, totalPages, round1Records);
  });
  doc.end();
  return pdf;
}

function drawSheet(
  doc: PDFKit.PDFDocument,
  submission: SubmissionListItem | null,
  judge: PresentationJudgeProfile | null,
  pageNumber: number,
  totalPages: number,
  round1Records: Awaited<ReturnType<typeof listCommitteeScoreRecords>>,
) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PRINT.white);
  drawPrintHeader(doc, submission);
  if (!submission) {
    doc.rect(80, 190, doc.page.width - 160, 110).fillAndStroke(PRINT.white, PRINT.line);
    doc.font(fonts.bold).fontSize(18).fillColor(PRINT.black).text("ยังไม่มีผลงานในประกาศผลการแข่งขัน", 100, 224, {
      width: doc.page.width - 200,
      align: "center",
      lineBreak: false,
    });
    drawDocumentFooter(doc, pageNumber, totalPages, "รอบที่ 2 Presentation", fonts);
    return;
  }

  drawSectionHeading(doc, 24, 88, "ส่วนของคณะกรรมการพิจารณารางวัลนวัตกรรม รอบที่ 2");
  drawProjectInfo(doc, submission, 24, 108, pageNumber, totalPages);
  drawPresentationScoreTable(doc, 24, 170);

  const weighted = round1WeightedScore(round1Records, submission.submission_code);
  drawNotesAndSignature(doc, judge, 24, 474);
  drawDashedDivider(doc, 24, 592);
  drawSectionHeading(doc, 24, 604, "ส่วนของเจ้าหน้าที่ คณะกรรมการฯ รอบที่ 2");
  drawWeightedBoxes(doc, weighted, 24, 626);
  drawWatermark(doc);
  drawDocumentFooter(doc, pageNumber, totalPages, `${submission.submission_code} • รอบที่ 2 Presentation`, fonts);
}

function drawPrintHeader(doc: PDFKit.PDFDocument, submission: SubmissionListItem | null) {
  const margin = 24;
  const width = doc.page.width - margin * 2;
  doc.font(fonts.bold).fontSize(14.2).fillColor(PRINT.black).text(
    "แบบฟอร์มกรอกคะแนนประกวดนวัตกรรม รอบที่ 2 (Presentation)",
    margin,
    24,
    { width, align: "center", lineBreak: false },
  );
  doc.font(fonts.bold).fontSize(10.2).fillColor(PRINT.black).text(
    submission ? `รหัสโครงการ: ${submission.submission_code}` : "ผลงานที่ผ่านเข้ารอบการนำเสนอ",
    margin,
    47,
    { width, align: "center", lineBreak: false },
  );
  doc.moveTo(margin, 78).lineTo(doc.page.width - margin, 78).lineWidth(0.8).stroke(PRINT.line);
}

function drawSectionHeading(doc: PDFKit.PDFDocument, x: number, y: number, label: string) {
  doc.font(fonts.bold).fontSize(9.5).fillColor(PRINT.sectionRed).text(label, x, y, { width: tableWidth, lineBreak: false });
  doc.moveTo(x, y + 15).lineTo(x + tableWidth, y + 15).lineWidth(0.45).stroke(PRINT.line);
}

function drawDashedDivider(doc: PDFKit.PDFDocument, x: number, y: number) {
  doc.save();
  doc.dash(4, { space: 4 });
  doc.moveTo(x, y).lineTo(x + tableWidth, y).lineWidth(0.7).stroke(PRINT.line);
  doc.restore();
}

function drawProjectInfo(doc: PDFKit.PDFDocument, submission: SubmissionListItem, x: number, y: number, itemNumber: number, totalItems: number) {
  const width = doc.page.width - x * 2;
  doc.rect(x, y, width, 48).fillAndStroke(PRINT.white, PRINT.line);
  doc.font(fonts.bold).fontSize(8.6).fillColor(PRINT.black).text("ข้อมูลโครงการ", x + 14, y + 9, { width: 88, lineBreak: false });
  doc.font(fonts.bold).fontSize(8.4).fillColor(PRINT.black).text("ลำดับผลงาน", x + 14, y + 24, { width: 88, lineBreak: false });
  doc.font(fonts.bold).fontSize(8.7).fillColor(PRINT.black).text(`รายการที่ ${itemNumber} จาก ${totalItems}`, x + 14, y + 36, { width: 92, lineBreak: false });
  doc.font(fonts.bold).fontSize(11.3).fillColor(PRINT.black).text(clean(submission.title_th), x + 116, y + 9, { width: width - 130, height: 15, ellipsis: true, lineBreak: false });
  doc.font(fonts.regular).fontSize(8).fillColor(PRINT.text).text(
    `ผู้สมัคร/ทีม: ${formatApplicantName(submission)} • ประเภท: ${submission.submission_type === "team" ? `ทีม${submission.team_name ? ` ${submission.team_name}` : ""}` : "ส่งเดี่ยว"}`,
    x + 116,
    y + 30,
    { width: width - 130, height: 11, ellipsis: true, lineBreak: false },
  );
}

function drawPresentationScoreTable(doc: PDFKit.PDFDocument, x: number, y: number) {
  const headerHeight = 30;
  const rowHeight = 46;
  let cursorY = y;
  doc.rect(x, cursorY, tableWidth, headerHeight).fillAndStroke(PRINT.white, PRINT.black);
  drawTableColumns(doc, x, cursorY, headerHeight, true);
  cursorY += headerHeight;

  presentationScoreCriteria.forEach((criterion, index) => {
    doc.rect(x, cursorY, tableWidth, rowHeight).fillAndStroke(PRINT.white, PRINT.lineLight);
    drawTableColumns(doc, x, cursorY, rowHeight, false);
    doc.font(fonts.bold).fontSize(9).fillColor(PRINT.black).text(String(index + 1), x + 6, cursorY + 18, { width: columns[0][1] - 12, align: "center", lineBreak: false });
    doc.font(fonts.regular).fontSize(14).fillColor(PRINT.text).text(criterion.label, x + columns[0][1] + 8, cursorY + 13, { width: columns[1][1] - 14, height: 20, ellipsis: true, lineBreak: false });
    doc.font(fonts.bold).fontSize(14).fillColor(PRINT.text).text(String(criterion.max), x + columns[0][1] + columns[1][1] + 5, cursorY + 13, { width: columns[2][1] - 10, align: "center", lineBreak: false });
    doc.rect(x + columns[0][1] + columns[1][1] + columns[2][1] + 13, cursorY + 9, columns[3][1] - 26, 30).fillAndStroke(PRINT.white, PRINT.line);
    cursorY += rowHeight;
  });

  doc.rect(x, cursorY, tableWidth, 30).fillAndStroke(PRINT.white, PRINT.black);
  drawTableColumns(doc, x, cursorY, 30, false);
  doc.font(fonts.bold).fontSize(11).fillColor(PRINT.black).text("คะแนนรวมรอบที่ 2", x + 8, cursorY + 9, { width: columns[0][1] + columns[1][1] - 16, lineBreak: false });
  doc.font(fonts.bold).fontSize(11).fillColor(PRINT.black).text("100", x + columns[0][1] + columns[1][1] + 5, cursorY + 9, { width: columns[2][1] - 10, align: "center", lineBreak: false });
}

function drawTableColumns(doc: PDFKit.PDFDocument, x: number, y: number, height: number, header: boolean) {
  let cursorX = x;
  columns.forEach(([label, width], index) => {
    if (index > 0) doc.moveTo(cursorX, y).lineTo(cursorX, y + height).lineWidth(0.45).stroke(PRINT.line);
    if (header) {
      doc.font(fonts.bold).fontSize(10.4).fillColor(PRINT.black).text(label, cursorX + 5, y + 8, { width: width - 10, align: index === 1 ? "left" : "center", lineBreak: false });
    }
    cursorX += width;
  });
}

function drawWeightedBoxes(doc: PDFKit.PDFDocument, weighted: { average: number | null; weighted: number | null }, x: number, y: number) {
  const gap = 10;
  const width = (tableWidth - gap * 2) / 3;
  drawBox(doc, x, y, width, 50, "คะแนนรอบที่ 1 (เฉลี่ย)", weighted.average === null ? "- / 100" : `${weighted.average.toFixed(2)} / 100`);
  drawBox(doc, x + width + gap, y, width, 50, "คะแนนรอบที่ 1 × 40%", weighted.weighted === null ? "-" : `${weighted.weighted.toFixed(2)} คะแนน`);
  drawBox(doc, x + (width + gap) * 2, y, width, 50, "คะแนนรอบที่ 2 × 60%", "________________");
  doc.rect(x, y + 60, tableWidth, 50).fillAndStroke(PRINT.white, PRINT.line);
  doc.font(fonts.bold).fontSize(9).fillColor(PRINT.black).text("คะแนนรวม", x + 10, y + 70, { width: 145, lineBreak: false });
  doc.font(fonts.regular).fontSize(8.2).fillColor(PRINT.text).text("(คะแนนรอบที่ 1 × 0.40) + (คะแนนรอบที่ 2 × 0.60)", x + 10, y + 85, { width: 260, lineBreak: false });
  doc.rect(x + tableWidth - 168, y + 71, 150, 28).fillAndStroke(PRINT.white, PRINT.line);
  doc.font(fonts.bold).fontSize(11).fillColor(PRINT.black).text("________________ / 100", x + tableWidth - 160, y + 80, { width: 134, align: "center", lineBreak: false });
}

function drawBox(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, label: string, value: string) {
  doc.rect(x, y, width, height).fillAndStroke(PRINT.white, PRINT.line);
  doc.font(fonts.bold).fontSize(8).fillColor(PRINT.black).text(label, x + 8, y + 10, { width: width - 16, lineBreak: false });
  doc.font(fonts.bold).fontSize(10.5).fillColor(PRINT.black).text(value, x + 8, y + 32, { width: width - 16, align: "center", ellipsis: true, lineBreak: false });
}

function drawNotesAndSignature(doc: PDFKit.PDFDocument, judge: PresentationJudgeProfile | null, x: number, y: number) {
  const notesWidth = 280;
  const signatureX = x + notesWidth + 12;
  const signatureWidth = tableWidth - notesWidth - 12;
  const boxHeight = 104;
  doc.rect(x, y, notesWidth, boxHeight).fillAndStroke(PRINT.white, PRINT.line);
  doc.font(fonts.bold).fontSize(9).fillColor(PRINT.black).text("หมายเหตุกรรมการ", x + 10, y + 10, { width: notesWidth - 20, lineBreak: false });
  for (let index = 0; index < 3; index += 1) {
    const lineY = y + 36 + index * 18;
    doc.moveTo(x + 10, lineY).lineTo(x + notesWidth - 10, lineY).lineWidth(0.45).stroke(PRINT.line);
  }
  doc.rect(signatureX, y, signatureWidth, boxHeight).fillAndStroke(PRINT.white, PRINT.line);
  doc.font(fonts.bold).fontSize(9).fillColor(PRINT.black).text("ลงชื่อกรรมการ", signatureX + 10, y + 10, { width: signatureWidth - 20, align: "center", lineBreak: false });
  doc.moveTo(signatureX + 15, y + 44).lineTo(signatureX + signatureWidth - 15, y + 44).lineWidth(0.5).stroke(PRINT.line);
  if (judge) {
    doc.font(fonts.bold).fontSize(7.5).fillColor(PRINT.black).text(formatPresentationJudge(judge), signatureX + 8, y + 55, { width: signatureWidth - 16, align: "center", ellipsis: true, lineBreak: false });
    doc.font(fonts.regular).fontSize(6.2).fillColor(PRINT.text).text(`${judge.position} / ${judge.role}`, signatureX + 8, y + 68, { width: signatureWidth - 16, height: 18, align: "center", ellipsis: true, lineGap: 0 });
  } else {
    doc.font(fonts.regular).fontSize(7.5).fillColor(PRINT.text).text("คณะกรรมการรอบที่ 2", signatureX + 8, y + 59, { width: signatureWidth - 16, align: "center", ellipsis: true, lineBreak: false });
  }
  doc.font(fonts.regular).fontSize(7.5).fillColor(PRINT.text).text("วันที่ 24 ส.ค.69", signatureX + 8, y + 90, { width: signatureWidth - 16, align: "center", lineBreak: false });
}

function drawWatermark(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.rotate(-38, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.font(fonts.bold).fontSize(34).fillColor(PRINT.watermark).fillOpacity(0.18).text("Police Innovation Contest 2026", -80, doc.page.height / 2 - 18, { width: doc.page.width + 160, align: "center", lineBreak: false });
  doc.restore();
}

function clean(value: string) { return value.replace(/\s+/g, " ").trim(); }
function safeFilePart(value: string) { return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "judge"; }
function pdfHeaders(filename: string) { return { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" }; }
function collectPdf(doc: PDFKit.PDFDocument) { const chunks: Buffer[] = []; return new Promise<Buffer>((resolve, reject) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); }); }
