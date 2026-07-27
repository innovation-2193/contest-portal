import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../lib/admin-api-response";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { listEvaluationRespondents, type EvaluationRespondent } from "../../../../../lib/evaluation-store";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
} from "../../../../../lib/pdf-theme";

export const runtime = "nodejs";

const pageSize = 20;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) return adminUnauthorizedResponse(request);

  const respondents = await listEvaluationRespondents();
  const pdf = await evaluationRespondentsPdf(respondents);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "evaluation.report_exported",
    entityType: "evaluation",
    summary: `Export PDF รายงานผู้ตอบแบบประเมิน ${respondents.length} คน`,
    payload: { respondents: respondents.length },
  }, request.headers);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="evaluation-respondents-${date}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function evaluationRespondentsPdf(respondents: EvaluationRespondent[]) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: true });
  const pdf = collectPdf(doc);
  const pages = Math.max(1, Math.ceil(respondents.length / pageSize));
  const overallAverage = respondents.length
    ? respondents.reduce((sum, item) => sum + item.overallAverage, 0) / respondents.length
    : 0;

  doc.info.Title = "รายงานผู้ตอบแบบประเมินความพึงพอใจ";
  doc.info.Subject = "Satisfaction evaluation respondents report";
  doc.info.Author = "Police Innovation Contest 2026";

  for (let page = 0; page < pages; page += 1) {
    if (page > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
    drawDocumentHeader(doc, {
      title: "รายงานผู้ตอบแบบประเมินความพึงพอใจ",
      subtitle: `ออกรายงานเมื่อ ${formatPdfThaiDateTime(new Date())}`,
      metaLabel: "ผู้ตอบทั้งหมด",
      metaValue: `${respondents.length.toLocaleString("th-TH")} คน`,
    });

    drawSummary(doc, respondents.length, overallAverage);
    drawTable(doc, respondents.slice(page * pageSize, (page + 1) * pageSize), page * pageSize);
  }

  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    doc.switchToPage(page);
    drawDocumentFooter(doc, page + 1, range.count, "Evaluation Report");
  }
  doc.end();
  return pdf;
}

function drawSummary(doc: PDFKit.PDFDocument, total: number, overallAverage: number) {
  const y = 126;
  doc.roundedRect(30, y, 376, 54, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(pdfFontRegular).fontSize(9).fillColor(PDF_THEME.muted).text("จำนวนผู้ส่งแบบประเมิน", 46, y + 12, {
    width: 180,
    lineBreak: false,
  });
  doc.font(pdfFontBold).fontSize(19).fillColor(PDF_THEME.navy).text(`${total.toLocaleString("th-TH")} คน`, 226, y + 12, {
    width: 160,
    align: "right",
    lineBreak: false,
  });

  doc.roundedRect(424, y, 388, 54, 8).fillAndStroke(PDF_THEME.goldSoft, "#e5cd70");
  doc.font(pdfFontRegular).fontSize(9).fillColor(PDF_THEME.muted).text("คะแนนภาพรวมการจัดงาน", 440, y + 12, {
    width: 190,
    lineBreak: false,
  });
  doc.font(pdfFontBold).fontSize(19).fillColor(PDF_THEME.navy).text(
    overallAverage ? `${overallAverage.toFixed(2)} / 5` : "-",
    632,
    y + 12,
    { width: 160, align: "right", lineBreak: false },
  );
}

function drawTable(doc: PDFKit.PDFDocument, rows: EvaluationRespondent[], offset: number) {
  const x = 30;
  const y = 198;
  const rowHeight = 27;
  const columns = [
    { label: "ลำดับ", x, width: 44, align: "center" as const },
    { label: "ผู้ประเมิน", x: x + 44, width: 178, align: "left" as const },
    { label: "รหัสลงทะเบียน", x: x + 222, width: 135, align: "left" as const },
    { label: "อีเมล", x: x + 357, width: 190, align: "left" as const },
    { label: "วันที่ประเมิน", x: x + 547, width: 145, align: "left" as const },
    { label: "คะแนน", x: x + 692, width: 90, align: "center" as const },
  ];

  doc.roundedRect(x, y, 782, rowHeight, 5).fill(PDF_THEME.navy);
  columns.forEach((column) => {
    doc.font(pdfFontBold).fontSize(9).fillColor(PDF_THEME.goldSoft).text(
      column.label,
      column.x + 7,
      y + 8,
      { width: column.width - 14, align: column.align, lineBreak: false },
    );
  });

  if (!rows.length) {
    doc.roundedRect(x, y + rowHeight + 4, 782, 46, 5).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(pdfFontRegular).fontSize(10).fillColor(PDF_THEME.muted).text("ยังไม่มีผู้ตอบแบบประเมิน", x, y + 44, {
      width: 782,
      align: "center",
      lineBreak: false,
    });
    return;
  }

  rows.forEach((respondent, index) => {
    const rowY = y + rowHeight + index * rowHeight;
    doc.rect(x, rowY, 782, rowHeight)
      .fillAndStroke(index % 2 ? PDF_THEME.paleBlue : PDF_THEME.white, PDF_THEME.line);
    const values = [
      String(offset + index + 1),
      respondent.name,
      respondent.registrationCode,
      respondent.email,
      formatPdfThaiDateTime(respondent.submittedAt, "short"),
      `${respondent.overallAverage.toFixed(2)} / 5`,
    ];
    columns.forEach((column, columnIndex) => {
      doc.font(columnIndex === 5 ? pdfFontBold : pdfFontRegular)
        .fontSize(8.5)
        .fillColor(columnIndex === 5 ? PDF_THEME.navy : PDF_THEME.text)
        .text(values[columnIndex], column.x + 7, rowY + 8, {
          width: column.width - 14,
          height: 12,
          align: column.align,
          ellipsis: true,
          lineBreak: false,
        });
    });
  });
}

function collectPdf(doc: PDFKit.PDFDocument) {
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
