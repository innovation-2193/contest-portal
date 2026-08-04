import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import PDFKitDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { adminUnauthorizedResponse } from "../../../../../lib/admin-api-response";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { listSubmissions, listWinners, type SubmissionListItem, type WinnerRecord } from "../../../../../lib/admin-store";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
  type PdfFontSet,
} from "../../../../../lib/pdf-theme";
import { formatApplicantName } from "../../../../../lib/thai-rank-title";

export const runtime = "nodejs";

const fonts: PdfFontSet = {
  regular: pdfFontRegular,
  bold: pdfFontBold,
};

const pageWidth = 841.89;
const pageHeight = 595.28;
const marginX = 28;
const tableWidth = pageWidth - marginX * 2;

type WinnerSummaryRow = {
  no: number;
  projectTitle: string;
  ownerName: string;
  score: string;
  hashtags: string[];
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) return adminUnauthorizedResponse(request);
  if (session.role !== "super_admin") return adminUnauthorizedResponse(request);

  const [winners, submissions] = await Promise.all([listWinners(), listSubmissions()]);
  const rows = buildWinnerSummaryRows(winners, submissions);

  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "winner.export_pdf",
    entityType: "winner",
    summary: "Export PDF สรุปประกาศผลการแข่งขัน 10 ทีมรอบสุดท้าย",
    payload: { count: rows.length },
  }, request.headers);

  const pdf = await winnerSummaryPdf(rows);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="winner-finalists-summary-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function winnerSummaryPdf(rows: WinnerSummaryRow[]) {
  const doc = new PDFKitDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: true });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();

  drawPage(doc, rows, generatedAt);
  drawDocumentFooter(doc, 1, 1, "Finalists Summary", fonts);

  doc.info.Title = "Police Innovation Contest 2026 finalists summary";
  doc.info.Subject = "สรุปประกาศผลการแข่งขัน 10 ทีมรอบสุดท้าย";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

function drawPage(doc: PDFKit.PDFDocument, rows: WinnerSummaryRow[], generatedAt: Date) {
  doc.rect(0, 0, pageWidth, pageHeight).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "รายงานสรุปประกาศผลการแข่งขัน",
    subtitle: `10 ทีมรอบสุดท้าย • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "จำนวนรายการ",
    metaValue: `${rows.length}/10`,
    fonts,
  });

  drawSummaryNote(doc, rows.length);
  drawWinnerTable(doc, rows);
}

function drawSummaryNote(doc: PDFKit.PDFDocument, count: number) {
  const x = marginX;
  const y = 118;
  const width = tableWidth;
  doc.roundedRect(x, y, width, 42, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(10.5).fillColor(PDF_THEME.navy).text("สรุปสำหรับผู้บังคับบัญชา", x + 16, y + 8, {
    width: 180,
    lineBreak: false,
  });
  doc.font(fonts.regular).fontSize(8.8).fillColor(PDF_THEME.text).text(
    `รายงานนี้แสดงรายชื่อผลงานที่ประกาศผลเป็น 10 ทีมรอบสุดท้าย จำนวน ${count} รายการ พร้อมคะแนนรวมจากระบบและ Hashtag เพื่อใช้สรุปภาพรวมการคัดเลือกเข้าสู่การแข่งขันรอบที่ 2`,
    x + 16,
    y + 23,
    { width: width - 32, lineBreak: false },
  );
}

function drawWinnerTable(doc: PDFKit.PDFDocument, rows: WinnerSummaryRow[]) {
  const columns = [
    ["ลำดับ", 46],
    ["ชื่อโครงการ", 300],
    ["ผู้รับผิดชอบหลัก", 170],
    ["คะแนนรวม", 82],
    ["Hashtag", 187],
  ] as const;
  const x = marginX;
  let y = 174;
  const headerHeight = 28;
  const rowHeight = 28;
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);

  doc.roundedRect(x, y, totalWidth, headerHeight, 6).fill(PDF_THEME.navy);
  let cursor = x;
  doc.font(fonts.bold).fontSize(8.5).fillColor(PDF_THEME.goldSoft);
  for (const [label, width] of columns) {
    doc.text(label, cursor + 8, y + 9, {
      width: width - 16,
      align: label === "คะแนนรวม" ? "right" : "left",
      lineBreak: false,
    });
    cursor += width;
  }
  y += headerHeight + 4;

  if (!rows.length) {
    doc.roundedRect(x, y, totalWidth, 72, 8).fillAndStroke(PDF_THEME.goldSoft, "#e5cd70");
    doc.font(fonts.bold).fontSize(13).fillColor(PDF_THEME.navy).text("ยังไม่มีรายการประกาศผลที่เผยแพร่แล้ว", x + 18, y + 26, {
      width: totalWidth - 36,
      align: "center",
      lineBreak: false,
    });
    return;
  }

  rows.forEach((row, index) => {
    drawWinnerRow(doc, x, y, rowHeight, columns, row, index);
    y += rowHeight + 2;
  });
}

function drawWinnerRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  height: number,
  columns: readonly (readonly [string, number])[],
  row: WinnerSummaryRow,
  index: number,
) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.roundedRect(x, y, totalWidth, height, 6).fillAndStroke(index % 2 === 0 ? PDF_THEME.white : PDF_THEME.paleBlue, PDF_THEME.line);

  const values = [
    String(row.no).padStart(2, "0"),
    row.projectTitle,
    row.ownerName,
    row.score,
    row.hashtags.map((tag) => `#${tag}`).join("  "),
  ];
  let cursor = x;
  values.forEach((value, valueIndex) => {
    const [, width] = columns[valueIndex];
    const isNo = valueIndex === 0;
    const isScore = valueIndex === 3;
    const isTag = valueIndex === 4;
    const font = isNo || isScore || isTag ? fonts.bold : fonts.regular;
    const color = isNo || isScore ? PDF_THEME.navy : isTag ? PDF_THEME.green : PDF_THEME.text;
    doc.font(font).fontSize(isScore ? 10 : 7.8).fillColor(color).text(clean(value), cursor + 8, y + 7, {
      width: width - 16,
      align: isScore ? "right" : "left",
      lineBreak: false,
      ellipsis: true,
    });
    cursor += width;
  });
}

function buildWinnerSummaryRows(winners: WinnerRecord[], submissions: SubmissionListItem[]) {
  const submissionsByCode = new Map(submissions.map((submission) => [submission.submission_code, submission]));
  const submissionsByFallback = new Map(submissions.map((submission) => [
    winnerFallbackKey(submission.title_th, submissionOwnerName(submission), submissionDivision(submission)),
    submission,
  ]));
  const submissionsByPrimaryFallback = new Map(submissions.map((submission) => [
    winnerFallbackKey(submission.title_th, primaryOwnerName(submission), submissionDivision(submission)),
    submission,
  ]));
  const submissionsByUniqueTitle = new Map<string, SubmissionListItem>();
  const duplicateTitles = new Set<string>();
  submissions.forEach((submission) => {
    const key = clean(submission.title_th).toLowerCase();
    if (submissionsByUniqueTitle.has(key)) duplicateTitles.add(key);
    submissionsByUniqueTitle.set(key, submission);
  });
  duplicateTitles.forEach((key) => submissionsByUniqueTitle.delete(key));

  return winners
    .filter((winner) => winner.published)
    .map((winner) => {
      const submission = (winner.submissionCode ? submissionsByCode.get(winner.submissionCode) : undefined) ??
        submissionsByFallback.get(winnerFallbackKey(winner.projectTitle, winner.ownerName, winner.division)) ??
        submissionsByPrimaryFallback.get(winnerFallbackKey(winner.projectTitle, winner.ownerName, winner.division)) ??
        submissionsByUniqueTitle.get(clean(winner.projectTitle).toLowerCase());
      return {
        winner,
        submission,
        score: Number(submission?.review_total_score ?? -1),
      };
    })
    .sort((a, b) => b.score - a.score || a.winner.createdAt.localeCompare(b.winner.createdAt))
    .slice(0, 10)
    .map(({ winner, submission }, index) => ({
      no: index + 1,
      projectTitle: submission?.title_th || winner.projectTitle,
      ownerName: submission ? primaryOwnerName(submission) : formatApplicantName({ first_name: winner.ownerName }),
      score: submission?.review_total_score !== null && submission?.review_total_score !== undefined
        ? `${submission.review_total_score}/100`
        : "-",
      hashtags: submission?.hashtags?.length ? submission.hashtags.slice(0, 3) : ["นวัตกรรมตำรวจ", "รอบสุดท้าย", "พร้อมนำเสนอ"],
    }));
}

function submissionOwnerName(submission: Pick<SubmissionListItem, "submission_type" | "team_name" | "title" | "first_name" | "last_name">) {
  return submission.submission_type === "team" && submission.team_name
    ? `ทีม ${submission.team_name}`
    : formatApplicantName(submission);
}

function primaryOwnerName(submission: Pick<SubmissionListItem, "title" | "first_name" | "last_name">) {
  return formatApplicantName(submission);
}

function submissionDivision(submission: Pick<SubmissionListItem, "division" | "bureau">) {
  return [submission.division, submission.bureau].map((item) => item?.trim()).filter(Boolean).join(" / ");
}

function winnerFallbackKey(projectTitle: string, ownerName: string, division: string) {
  return [projectTitle, ownerName, division].map((item) => clean(item).toLowerCase()).join("|");
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim() || "-";
}

function collectPdf(doc: PDFKit.PDFDocument) {
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  return done;
}
