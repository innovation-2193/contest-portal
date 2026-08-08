import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { listSubmissions } from "../../../../../lib/admin-store";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { findCommitteeScoreReportVersion } from "../../../../../lib/committee-score-report-versions";
import {
  buildCommitteeScoreboard,
  committeeJudges,
  listCommitteeScoreRecords,
  type CommitteeScoreSummaryRow,
} from "../../../../../lib/committee-score-store";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
  type PdfFontSet,
} from "../../../../../lib/pdf-theme";

export const runtime = "nodejs";

const fonts: PdfFontSet = {
  regular: pdfFontRegular,
  bold: pdfFontBold,
};

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const versionId = new URL(request.url).searchParams.get("versionId")?.trim() || "";
  const version = versionId ? await findCommitteeScoreReportVersion(versionId) : null;
  if (versionId && !version) {
    return NextResponse.json({ ok: false, message: "ไม่พบ Version รายงานนี้" }, { status: 404 });
  }
  const rows = version
    ? await enrichVersionRows(version.rows)
    : await buildCurrentRows();
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "committee_score.scoreboard_pdf",
    entityType: "committee_score",
    summary: version ? `Export รายงานผลคะแนนคณะกรรมการ Version ${version.version}` : "Export ผลคะแนนคณะกรรมการรอบที่ 1 พร้อมจัดอันดับ",
    payload: { submissions: rows.length, scored: rows.filter((row) => row.averageScore !== null).length, version: version?.version ?? null },
  }, request.headers);

  const pdf = await buildPdf(rows, version?.version);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="committee-scoreboard-round-1-${version ? `v${version.version}-` : ""}${new Date().toISOString().slice(0, 10)}.pdf"`,
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

async function buildPdf(rows: CommitteeScoreSummaryRow[], reportVersion?: number) {
  const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0 });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const perPage = 11;
  const pages = Math.max(1, Math.ceil(rows.length / perPage));

  for (let page = 0; page < pages; page += 1) {
    if (page > 0) doc.addPage();
    const pageRows = rows.slice(page * perPage, page * perPage + perPage);
    drawPage(doc, pageRows, page + 1, pages, generatedAt, reportVersion);
  }

  doc.info.Title = "ผลคะแนนคณะกรรมการรอบที่ 1";
  doc.info.Subject = "Police Innovation Contest 2026 committee scoreboard";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

function drawPage(doc: PDFKit.PDFDocument, rows: CommitteeScoreSummaryRow[], pageNumber: number, totalPages: number, generatedAt: Date, reportVersion?: number) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "รายงานอันดับคะแนนคณะกรรมการ รอบที่ 1",
    titleFontSize: 21,
    subtitle: `เรียงจากคะแนนมากไปน้อย • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    showLogo: true,
    fonts,
  });

  const columns = [
    ["ลำดับ", 48],
    ["ชื่อโครงการ", 314],
    ["คะแนนที่ได้", 82],
    ["หมายเหตุ", 79],
  ] as const;
  const x = 36;
  const y = 145;
  const rowHeight = 50;
  drawTableHeader(doc, x, y, columns);
  let cursorY = y + 28;

  if (!rows.length) {
    doc.roundedRect(x, cursorY + 22, doc.page.width - x * 2, 80, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(fonts.bold).fontSize(14).fillColor(PDF_THEME.navy).text("ยังไม่มีข้อมูลคะแนนรวมคณะกรรมการ", x, cursorY + 52, {
      width: doc.page.width - x * 2,
      align: "center",
      lineBreak: false,
    });
  }

  rows.forEach((row) => {
    drawTableRow(doc, x, cursorY, rowHeight, columns, row);
    cursorY += rowHeight;
  });

  drawDocumentFooter(doc, pageNumber, totalPages, "ผลคะแนนคณะกรรมการรอบที่ 1", fonts);
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number, columns: readonly (readonly [string, number])[]) {
  const width = columns.reduce((sum, [, columnWidth]) => sum + columnWidth, 0);
  doc.roundedRect(x, y, width, 28, 5).fill(PDF_THEME.navy);
  doc.font(fonts.bold).fontSize(8.3).fillColor(PDF_THEME.goldSoft);
  let cursorX = x;
  for (const [label, columnWidth] of columns) {
    doc.text(label, cursorX + 5, y + 8, {
      width: columnWidth - 10,
      align: label === "ชื่อนวัตกรรม" ? "left" : "center",
      lineBreak: false,
    });
    cursorX += columnWidth;
  }
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  height: number,
  columns: readonly (readonly [string, number])[],
  row: CommitteeScoreSummaryRow,
) {
  const values = [
    row.rank.toLocaleString("th-TH"),
    row.averageScore === null ? "-" : row.averageScore.toFixed(2),
    row.judgeCount === 0 ? "ยังไม่มีคะแนน" : row.judgeCount === committeeJudges.length ? "คะแนนครบ" : `รอคะแนน ${committeeJudges.length - row.judgeCount} คน`,
  ];
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  const fill = row.averageScore === null ? "#f8fafc" : PDF_THEME.white;
  doc.rect(x, y, totalWidth, height).fillAndStroke(fill, PDF_THEME.line);
  let boundaryX = x;
  for (let index = 1; index < columns.length; index += 1) {
    boundaryX += columns[index - 1][1];
    doc.moveTo(boundaryX, y).lineTo(boundaryX, y + height).lineWidth(0.45).stroke(PDF_THEME.line);
  }
  const cells = [
    { index: 0, value: values[0] },
    { index: 2, value: values[1] },
    { index: 3, value: values[2] },
  ];
  cells.forEach(({ index, value }) => {
    const cursorX = x + columns.slice(0, index).reduce((sum, [, width]) => sum + width, 0);
    const [, width] = columns[index];
    const isScore = index === 2;
    doc.font(index === 0 || index === 2 ? fonts.bold : fonts.regular)
      .fontSize(isScore ? 9.5 : 8.8)
      .fillColor(index === 0 || index === 2 ? PDF_THEME.navy : PDF_THEME.text)
      .text(clean(value), cursorX + 5, y + 8, {
        width: width - 10,
        height: height - 10,
        align: index === 1 || index === 3 ? "left" : "center",
        ellipsis: true,
      });
  });

  const titleColumnX = x + columns[0][1];
  const titleColumnWidth = columns[1][1];
  doc.font(fonts.regular).fontSize(10).fillColor(PDF_THEME.text).text(clean(row.submissionTitle), titleColumnX + 5, y + 5, {
    width: titleColumnWidth - 10,
    height: 26,
    lineGap: 0,
    ellipsis: true,
  });
  if (row.submissionTitleEnglish) {
    doc.font(fonts.regular).fontSize(8.5).fillColor(PDF_THEME.muted).text(clean(row.submissionTitleEnglish), titleColumnX + 5, y + 32, {
      width: titleColumnWidth - 10,
      height: 12,
      lineBreak: false,
      ellipsis: true,
    });
  }
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function collectPdf(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
