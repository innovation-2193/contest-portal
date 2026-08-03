import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../lib/admin-api-response";
import { listSubmissions, type SubmissionListItem } from "../../../../../lib/admin-store";
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
const rowsPerPage = 10;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) return adminUnauthorizedResponse(request);
  if (session.role !== "super_admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const submissions = (await listSubmissions()).sort((left, right) => left.submitted_at.localeCompare(right.submitted_at));
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "submission.committee_score_form_pdf",
    entityType: "submission",
    summary: "Export แบบฟอร์มให้คะแนนสำหรับคณะกรรมการ",
    payload: { count: submissions.length },
  }, request.headers);

  const pdf = await committeeScoreFormPdf(submissions);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="committee-score-form-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function committeeScoreFormPdf(submissions: SubmissionListItem[]) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const totalPages = Math.max(1, Math.ceil(submissions.length / rowsPerPage));

  doc.info.Title = "แบบฟอร์มให้คะแนนสำหรับคณะกรรมการ";
  doc.info.Subject = "Committee score form";
  doc.info.Author = "Police Innovation Contest 2026";

  for (let page = 0; page < totalPages; page += 1) {
    if (page > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawPage(doc, submissions.slice(page * rowsPerPage, (page + 1) * rowsPerPage), submissions.length, generatedAt, page, totalPages);
  }

  doc.end();
  return pdf;
}

function drawPage(doc: PDFKit.PDFDocument, rows: SubmissionListItem[], total: number, generatedAt: Date, pageIndex: number, totalPages: number) {
  const tableX = 26;
  const tableY = 196;
  const rowHeight = 34;
  const columns = [
    ["ลำดับ", 38],
    ["ชื่อโครงการ", 380],
    ["ชื่อผู้สมัคร", 180],
    ["คะแนน", 190],
  ] as const;

  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "แบบฟอร์มให้คะแนนสำหรับคณะกรรมการ",
    subtitle: `ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "จำนวนโครงการ",
    metaValue: total.toLocaleString("th-TH"),
    showLogo: false,
    fonts,
  });
  drawCommitteeFields(doc);
  drawTableHeader(doc, tableX, tableY, columns);

  rows.forEach((item, index) => {
    drawScoreFormRow(doc, tableX, tableY + 28 + index * rowHeight, rowHeight, columns, item, pageIndex * rowsPerPage + index + 1, index);
  });

  if (!rows.length) {
    doc.roundedRect(tableX, tableY + 44, doc.page.width - tableX * 2, 72, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(fonts.bold).fontSize(14).fillColor(PDF_THEME.navy).text("ยังไม่มีใบสมัครประกวดที่ส่งเข้าระบบ", tableX, tableY + 72, {
      width: doc.page.width - tableX * 2,
      align: "center",
      lineBreak: false,
    });
  }

  drawDocumentFooter(doc, pageIndex + 1, totalPages, "Committee Score Form", fonts);
}

function drawCommitteeFields(doc: PDFKit.PDFDocument) {
  const labels = ["ชื่อ", "นามสกุล", "ตำแหน่ง"];
  let x = 30;
  doc.font(fonts.bold).fontSize(10).fillColor(PDF_THEME.navy).text("ข้อมูลคณะกรรมการผู้ให้คะแนน", x, 124, { width: 220, lineBreak: false });
  labels.forEach((label, index) => {
    const width = index === 2 ? 270 : 210;
    doc.font(fonts.bold).fontSize(9).fillColor(PDF_THEME.gold).text(label, x, 148, { width, lineBreak: false });
    doc.roundedRect(x, 162, width, 22, 5).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    x += width + 14;
  });
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number, columns: readonly (readonly [string, number])[]) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.roundedRect(x, y, totalWidth, 26, 5).fill(PDF_THEME.navy);
  let cursor = x;
  doc.font(fonts.bold).fontSize(9).fillColor(PDF_THEME.goldSoft);
  for (const [label, width] of columns) {
    doc.text(label, cursor + 7, y + 8, { width: width - 14, align: label === "คะแนน" ? "center" : "left", lineBreak: false });
    cursor += width;
  }
}

function drawScoreFormRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  height: number,
  columns: readonly (readonly [string, number])[],
  item: SubmissionListItem,
  runningNumber: number,
  index: number,
) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.rect(x, y, totalWidth, height).fill(index % 2 === 0 ? PDF_THEME.white : PDF_THEME.paleBlue);
  doc.moveTo(x, y + height).lineTo(x + totalWidth, y + height).lineWidth(0.45).stroke(PDF_THEME.line);

  const values = [String(runningNumber), item.title_th, ownerName(item), ""];
  let cursor = x;
  values.forEach((value, valueIndex) => {
    if (valueIndex > 0) doc.moveTo(cursor, y + 5).lineTo(cursor, y + height - 5).lineWidth(0.25).stroke("#e3e9f2");
    if (valueIndex === 3) {
      doc.roundedRect(cursor + 18, y + 7, columns[valueIndex][1] - 36, height - 14, 5).fillAndStroke("#ffffff", "#c8d3e2");
    } else {
      doc.font(valueIndex === 0 ? fonts.bold : fonts.regular).fontSize(valueIndex === 0 ? 9 : 8.8).fillColor(valueIndex === 0 ? PDF_THEME.navy : PDF_THEME.text).text(clean(value), cursor + 7, y + 9, {
        width: columns[valueIndex][1] - 14,
        lineGap: 1,
      });
    }
    cursor += columns[valueIndex][1];
  });
}

function ownerName(item: SubmissionListItem) {
  return `${item.first_name} ${item.last_name}`.replace(/\s+/g, " ").trim() || "-";
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim() || "-";
}

function collectPdf(doc: PDFKit.PDFDocument) {
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
