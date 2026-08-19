import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../../lib/admin-guard";
import { listSubmissions } from "../../../../../../lib/admin-store";
import { committeeJudges, formatCommitteeJudgeProfile, type CommitteeJudgeProfile } from "../../../../../../lib/committee-score-config";
import { findCommitteeScoreReportVersion } from "../../../../../../lib/committee-score-report-versions";
import {
  buildCommitteeScoreboard,
  listCommitteeJudgeProfiles,
  listCommitteeScoreRecords,
  type CommitteeScoreSummaryRow,
} from "../../../../../../lib/committee-score-store";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
  type PdfFontSet,
} from "../../../../../../lib/pdf-theme";

export const runtime = "nodejs";

const fonts: PdfFontSet = {
  regular: pdfFontRegular,
  bold: pdfFontBold,
};

const pageMargin = 23;
const tableColumns = [
  ["ลำดับ", 46],
  ["ชื่อโครงการ", 290],
  ...committeeJudges.map((judge) => [`ก.${judge.order}`, 74] as const),
  ["สรุป\nคะแนนเฉลี่ย", 90],
] as const;
const headerHeight = 48;
const rowHeight = 44;
const rowsPerPage = 8;

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });

  const versionId = new URL(request.url).searchParams.get("versionId")?.trim() || "";
  const version = versionId ? await findCommitteeScoreReportVersion(versionId) : null;
  if (versionId && !version) return NextResponse.json({ ok: false, message: "ไม่พบ Version รายงานนี้" }, { status: 404 });

  const [rows, profiles] = await Promise.all([
    version ? enrichVersionRows(version.rows) : buildCurrentRows(),
    listCommitteeJudgeProfiles(),
  ]);
  const pdf = await buildPdf(rows, profiles, version?.version);

  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "committee_score.scoreboard_details_pdf",
    entityType: "committee_score",
    summary: version ? `Export PDF รายละเอียดคะแนนรายกรรมการ Version ${version.version}` : "Export PDF รายละเอียดคะแนนรายกรรมการ",
    payload: {
      submissions: rows.length,
      judges: profiles.map(formatCommitteeJudgeProfile),
      version: version?.version ?? null,
    },
  }, request.headers);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="committee-scoreboard-judge-details-${version ? `v${version.version}-` : ""}${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function buildCurrentRows() {
  const [submissions, records] = await Promise.all([
    listSubmissions(),
    listCommitteeScoreRecords(),
  ]);
  return buildCommitteeScoreboard(submissions.slice().sort(compareSubmittedAt), records);
}

async function enrichVersionRows(rows: CommitteeScoreSummaryRow[]) {
  const submissions = await listSubmissions().catch(() => []);
  const englishTitles = new Map(submissions.map((submission) => [submission.submission_code, submission.title_en || null]));
  return rows.map((row) => ({
    ...row,
    submissionTitleEnglish: row.submissionTitleEnglish || englishTitles.get(row.submissionCode) || null,
  }));
}

function compareSubmittedAt(left: { submitted_at: string }, right: { submitted_at: string }) {
  return new Date(left.submitted_at).getTime() - new Date(right.submitted_at).getTime();
}

async function buildPdf(rows: CommitteeScoreSummaryRow[], profiles: CommitteeJudgeProfile[], reportVersion?: number) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const pages = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  for (let page = 0; page < pages; page += 1) {
    if (page > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawPage(doc, rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage), rows.length, profiles, page + 1, pages, generatedAt, reportVersion);
  }

  doc.info.Title = "รายละเอียดคะแนนคณะกรรมการรายกรรมการ รอบที่ 1";
  doc.info.Subject = "Police Innovation Contest 2026 committee judge details";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

function drawPage(
  doc: PDFKit.PDFDocument,
  rows: CommitteeScoreSummaryRow[],
  totalRows: number,
  profiles: CommitteeJudgeProfile[],
  pageNumber: number,
  totalPages: number,
  generatedAt: Date,
  reportVersion?: number,
) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "รายละเอียดคะแนนคณะกรรมการรายกรรมการ รอบที่ 1",
    titleFontSize: 18,
    subtitle: `${reportVersion ? `Version ${reportVersion} • ` : ""}สรุปคะแนนรายผลงาน • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "จำนวนผลงาน",
    metaValue: `${totalRows.toLocaleString("th-TH")} ผลงาน`,
    showLogo: true,
    fonts,
  });

  const x = pageMargin;
  const y = 126;
  drawTableHeader(doc, x, y, profiles);
  let cursorY = y + headerHeight;
  rows.forEach((row, index) => {
    drawTableRow(doc, x, cursorY, row, index);
    cursorY += rowHeight;
  });

  if (!rows.length) {
    doc.roundedRect(x, cursorY + 18, totalTableWidth(), 68, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(fonts.bold).fontSize(13).fillColor(PDF_THEME.navy).text("ยังไม่มีข้อมูลคะแนนกรรมการ", x, cursorY + 43, {
      width: totalTableWidth(),
      align: "center",
      lineBreak: false,
    });
  }

  drawDocumentFooter(doc, pageNumber, totalPages, "รายละเอียดคะแนนรายกรรมการ", fonts);
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number, profiles: CommitteeJudgeProfile[]) {
  const width = totalTableWidth();
  doc.roundedRect(x, y, width, headerHeight, 5).fill(PDF_THEME.navy);
  let cursorX = x;
  const labels = [
    tableColumns[0][0],
    tableColumns[1][0],
    ...committeeJudges.map((judge) => {
      const profile = profiles.find((item) => item.judgeKey === judge.key);
      return `ก.${judge.order}\n${profile ? `${profile.prefix} ${profile.firstName}\n${profile.lastName}` : judge.name}`;
    }),
    tableColumns[tableColumns.length - 1][0],
  ];
  labels.forEach((label, index) => {
    const widthForColumn = tableColumns[index][1];
    doc.font(fonts.bold).fontSize(index === 1 ? 8.5 : 7.5).fillColor(PDF_THEME.goldSoft).text(label, cursorX + 4, y + 7, {
      width: widthForColumn - 8,
      height: headerHeight - 10,
      align: index === 1 ? "left" : "center",
      lineGap: 1,
    });
    cursorX += widthForColumn;
  });
}

function drawTableRow(doc: PDFKit.PDFDocument, x: number, y: number, row: CommitteeScoreSummaryRow, index: number) {
  const width = totalTableWidth();
  const fill = index % 2 === 0 ? PDF_THEME.white : PDF_THEME.paleBlue;
  doc.rect(x, y, width, rowHeight).fillAndStroke(fill, PDF_THEME.line);
  let boundaryX = x;
  for (let columnIndex = 0; columnIndex < tableColumns.length - 1; columnIndex += 1) {
    boundaryX += tableColumns[columnIndex][1];
    doc.moveTo(boundaryX, y).lineTo(boundaryX, y + rowHeight).lineWidth(0.45).stroke(PDF_THEME.line);
  }

  const values = [
    row.rank.toLocaleString("th-TH"),
    row.submissionTitle,
    ...committeeJudges.map((judge) => scoreText(row.judgeScores[judge.key])),
    scoreText(row.averageScore),
  ];
  let cursorX = x;
  values.forEach((value, valueIndex) => {
    const widthForColumn = tableColumns[valueIndex][1];
    const isTitle = valueIndex === 1;
    const isSummary = valueIndex === values.length - 1;
    doc.font(isSummary || valueIndex === 0 ? fonts.bold : fonts.regular)
      .fontSize(isTitle ? 8.8 : 9.3)
      .fillColor(isSummary ? PDF_THEME.navy : PDF_THEME.text)
      .text(clean(value), cursorX + 5, y + (isTitle ? 7 : 14), {
        width: widthForColumn - 10,
        height: rowHeight - 10,
        align: isTitle ? "left" : "center",
        ellipsis: true,
        lineGap: 1,
      });
    cursorX += widthForColumn;
  });
}

function totalTableWidth() {
  return tableColumns.reduce((sum, [, width]) => sum + width, 0);
}

function scoreText(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "-";
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim() || "-";
}

function collectPdf(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
