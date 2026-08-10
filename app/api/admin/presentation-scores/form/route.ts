import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listCommitteeScoreRecords } from "../../../../../lib/committee-score-store";
import { listSubmissions, listWinners, type SubmissionListItem } from "../../../../../lib/admin-store";
import { createZip, type ZipEntry } from "../../../../../lib/zip";
import { selectPresentationSubmissions } from "../../../../../lib/presentation-score-utils";
import { formatPresentationJudge, presentationScoreCriteria, type PresentationJudgeProfile } from "../../../../../lib/presentation-score-config";
import { listPresentationJudgeProfiles, round1WeightedScore } from "../../../../../lib/presentation-score-store";
import { drawDocumentFooter, drawDocumentHeader, formatPdfThaiDateTime, PDF_THEME, pdfFontBold, pdfFontRegular, type PdfFontSet } from "../../../../../lib/pdf-theme";

export const runtime = "nodejs";

const fonts: PdfFontSet = { regular: pdfFontRegular, bold: pdfFontBold };

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
  const selectedProfiles = selectedJudgeKey ? profiles.filter((profile) => profile.judgeKey === selectedJudgeKey) : profiles;
  if (!selectedProfiles.length) return NextResponse.json({ ok: false, message: "ไม่พบกรรมการรอบที่ 2 ที่เลือก" }, { status: 404 });

  const entries: ZipEntry[] = [];
  for (const judge of selectedProfiles) {
    const pdf = await presentationScoreFormPdf(finalists, judge, round1Records);
    entries.push({ name: `${judge.judgeKey}/presentation-score-form-${judge.judgeKey}.pdf`, data: pdf });
  }
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "presentation_score.form_pdf",
    entityType: "presentation_score",
    summary: `Export แบบฟอร์มให้คะแนนรอบที่ 2 ${finalists.length.toLocaleString("th-TH")} ผลงาน`,
    payload: { finalists: finalists.length, judges: selectedProfiles.map((profile) => profile.judgeKey) },
  }, request.headers);
  if (selectedJudgeKey) {
    return new NextResponse(new Uint8Array(entries[0].data), { headers: pdfHeaders(`presentation-score-form-round-2-${selectedJudgeKey}.pdf`) });
  }
  return new NextResponse(new Uint8Array(await createZip(entries)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="presentation-score-forms-round-2-${new Date().toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function presentationScoreFormPdf(submissions: SubmissionListItem[], judge: PresentationJudgeProfile, round1Records: Awaited<ReturnType<typeof listCommitteeScoreRecords>>) {
  const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0 });
  const pdf = collectPdf(doc);
  const rows = submissions.length ? submissions : [null];
  doc.info.Title = "แบบฟอร์มกรอกคะแนนประกวดนวัตกรรม รอบที่ 2 (Presentation)";
  doc.info.Subject = "Police Innovation Contest 2026 Presentation score form";
  doc.info.Author = "Police Innovation Contest 2026";
  rows.forEach((submission, index) => {
    if (index) doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
    drawSheet(doc, submission, judge, index + 1, rows.length, round1Records);
  });
  doc.end();
  return pdf;
}

function drawSheet(doc: PDFKit.PDFDocument, submission: SubmissionListItem | null, judge: PresentationJudgeProfile, pageNumber: number, totalPages: number, round1Records: Awaited<ReturnType<typeof listCommitteeScoreRecords>>) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "แบบฟอร์มกรอกคะแนนประกวดนวัตกรรม รอบที่ 2 (Presentation)",
    subtitle: "การนำเสนอผลงานและตอบคำถาม • คะแนนเต็ม 100 คะแนน",
    metaLabel: "กรรมการ",
    metaValue: formatPresentationJudge(judge),
    showLogo: true,
    fonts,
  });
  if (!submission) {
    doc.font(fonts.bold).fontSize(16).fillColor(PDF_THEME.navy).text("ยังไม่มีรายการในประกาศผลการแข่งขัน", 48, 210, { width: 500, align: "center" });
    drawDocumentFooter(doc, pageNumber, totalPages, "รอบที่ 2 Presentation", fonts);
    return;
  }

  doc.font(fonts.bold).fontSize(10).fillColor(PDF_THEME.gold).text(`ลำดับ ${pageNumber.toLocaleString("th-TH")} • ${submission.submission_code}`, 38, 106, { lineBreak: false });
  doc.font(fonts.bold).fontSize(17).fillColor(PDF_THEME.navy).text(submission.title_th, 38, 126, { width: 520, height: 24, ellipsis: true, lineBreak: false });
  doc.font(fonts.regular).fontSize(9).fillColor(PDF_THEME.muted).text(`ผู้สมัครหลัก: ${submission.first_name} ${submission.last_name} • ${[submission.division, submission.bureau].filter(Boolean).join(" / ") || "ไม่ระบุหน่วยงาน"}`, 38, 151, { width: 520, ellipsis: true, lineBreak: false });

  const scoreTableX = 38;
  const scoreTableY = 178;
  const columns = [320, 75, 145];
  doc.roundedRect(scoreTableX, scoreTableY, columns.reduce((sum, value) => sum + value, 0), 28, 5).fill(PDF_THEME.navy);
  doc.font(fonts.bold).fontSize(9).fillColor(PDF_THEME.goldSoft).text("เกณฑ์การประเมินรอบที่ 2", scoreTableX + 8, scoreTableY + 9, { width: columns[0] - 16, lineBreak: false });
  doc.text("คะแนนเต็ม", scoreTableX + columns[0] + 5, scoreTableY + 9, { width: columns[1] - 10, align: "center", lineBreak: false });
  doc.text("คะแนนที่ได้", scoreTableX + columns[0] + columns[1] + 5, scoreTableY + 9, { width: columns[2] - 10, align: "center", lineBreak: false });
  let y = scoreTableY + 28;
  for (const [index, criterion] of presentationScoreCriteria.entries()) {
    const rowHeight = 52;
    doc.rect(scoreTableX, y, columns.reduce((sum, value) => sum + value, 0), rowHeight).fillAndStroke(index % 2 ? PDF_THEME.paleBlue : PDF_THEME.white, PDF_THEME.line);
    doc.font(fonts.regular).fontSize(9.4).fillColor(PDF_THEME.text).text(`${index + 1}. ${criterion.label}`, scoreTableX + 8, y + 17, { width: columns[0] - 16, height: rowHeight - 10, ellipsis: true, lineBreak: false });
    doc.font(fonts.bold).fontSize(11).fillColor(PDF_THEME.navy).text(String(criterion.max), scoreTableX + columns[0] + 5, y + 17, { width: columns[1] - 10, align: "center", lineBreak: false });
    doc.roundedRect(scoreTableX + columns[0] + columns[1] + 18, y + 10, columns[2] - 36, 31, 4).fillAndStroke(PDF_THEME.white, PDF_THEME.navy);
    y += rowHeight;
  }
  doc.rect(scoreTableX, y, columns.reduce((sum, value) => sum + value, 0), 32).fillAndStroke(PDF_THEME.goldSoft, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(11).fillColor(PDF_THEME.navy).text("รวมคะแนนรอบที่ 2", scoreTableX + 8, y + 10, { width: columns[0] + columns[1] - 16, lineBreak: false });
  doc.font(fonts.bold).fontSize(12).fillColor(PDF_THEME.navy).text("/ 100", scoreTableX + columns[0] + columns[1] + 5, y + 10, { width: columns[2] - 10, align: "center", lineBreak: false });

  const weighted = round1WeightedScore(round1Records, submission.submission_code);
  const summaryY = y + 48;
  drawSummaryBox(doc, 38, summaryY, 165, "รอบที่ 1 เฉลี่ย", weighted.average === null ? "- / 100" : `${weighted.average.toFixed(2)} / 100`);
  drawSummaryBox(doc, 213, summaryY, 165, "รอบที่ 1 × 40%", weighted.weighted === null ? "-" : `${weighted.weighted.toFixed(2)} คะแนน`);
  drawSummaryBox(doc, 388, summaryY, 165, "รอบที่ 2 × 60%", "รอกรอกคะแนน");
  drawSummaryBox(doc, 38, summaryY + 66, 515, "คะแนนรวมถ่วงน้ำหนัก = (รอบที่ 1 × 0.40) + (รอบที่ 2 × 0.60)", "รอกรอกคะแนนรอบที่ 2");
  doc.font(fonts.regular).fontSize(8).fillColor(PDF_THEME.muted).text(`ลงชื่อกรรมการ ${formatPresentationJudge(judge)}  ____________________________________    วันที่ ____________________`, 38, summaryY + 146, { width: 515, lineBreak: false });
  drawDocumentFooter(doc, pageNumber, totalPages, `${submission.submission_code} • รอบที่ 2 Presentation`, fonts);
}

function drawSummaryBox(doc: PDFKit.PDFDocument, x: number, y: number, width: number, label: string, value: string) {
  doc.roundedRect(x, y, width, 54, 6).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(8).fillColor(PDF_THEME.muted).text(label, x + 9, y + 10, { width: width - 18, lineBreak: false });
  doc.font(fonts.bold).fontSize(12).fillColor(PDF_THEME.navy).text(value, x + 9, y + 29, { width: width - 18, ellipsis: true, lineBreak: false });
}

function pdfHeaders(filename: string) {
  return { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" };
}

function collectPdf(doc: PDFKit.PDFDocument) {
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
}
