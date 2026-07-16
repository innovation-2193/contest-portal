import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { cookieName, verifyAdminToken } from "../../../../../lib/admin-auth";
import { listParticipants } from "../../../../../lib/admin-store";
import type { RegistrationRecord } from "../../../../../lib/local-registrations";
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

const reportFonts: PdfFontSet = {
  regular: pdfFontRegular,
  bold: pdfFontBold,
};

export async function GET() {
  const cookieStore = await cookies();
  if (!verifyAdminToken(cookieStore.get(cookieName)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const participants = await listParticipants();
  const pdf = await participantsPdf(participants);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="participants-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function participantsPdf(participants: RegistrationRecord[]) {
  const pageHeight = Math.max(595.28, 190 + participants.length * 46 + 76);
  const doc = new PDFDocument({ size: [841.89, pageHeight], margin: 0 });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const columns = [
    ["เลขลงทะเบียน", 90],
    ["ชื่อ-สกุล", 110],
    ["บัตรประชาชน", 82],
    ["โทร", 74],
    ["ตำแหน่ง", 86],
    ["สังกัด / หน่วยงาน", 153],
    ["สถานะ", 82],
    ["เช็คอิน", 112],
  ] as const;
  const rowHeight = 42;
  const tableX = 26;
  let y = drawPageHeader(doc, participants, generatedAt, reportFonts);
  drawTableHeader(doc, tableX, y, columns, reportFonts);
  y += 30;

  participants.forEach((item, index) => {
    drawParticipantRow(doc, tableX, y, rowHeight, columns, item, index, reportFonts);
    y += rowHeight + 4;
  });

  if (!participants.length) {
    doc.roundedRect(26, y + 16, doc.page.width - 52, 72, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(reportFonts.bold).fontSize(14).fillColor(PDF_THEME.navy).text("ยังไม่มีข้อมูลผู้เข้าร่วมงาน", 44, y + 42, {
      width: doc.page.width - 88,
      align: "center",
      lineBreak: false,
    });
  }
  drawDocumentFooter(doc, 1, 1, `${participants.length} รายการ`, reportFonts);

  doc.info.Title = "Police Innovation Contest 2026 participants";
  doc.info.Subject = "รายชื่อผู้เข้าร่วมงาน";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

function drawPageHeader(
  doc: PDFKit.PDFDocument,
  participants: RegistrationRecord[],
  generatedAt: Date,
  fonts: PdfFontSet,
) {
  const attended = participants.filter((item) => item.status === "attended").length;
  const cancelled = participants.filter((item) => item.status === "cancelled").length;
  const registered = participants.length - attended - cancelled;

  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "รายชื่อผู้เข้าร่วมงาน",
    subtitle: `ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "จำนวนทั้งหมด",
    metaValue: `${participants.length} รายการ`,
    showLogo: false,
    fonts,
  });
  drawSummaryChip(doc, "ลงทะเบียนแล้ว", registered, 26, 120, PDF_THEME.goldSoft, "#80620b", fonts);
  drawSummaryChip(doc, "เข้าร่วมงานแล้ว", attended, 176, 120, PDF_THEME.greenSoft, PDF_THEME.green, fonts);
  drawSummaryChip(doc, "ยกเลิก", cancelled, 342, 120, PDF_THEME.redSoft, PDF_THEME.red, fonts);
  return 160;
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  columns: readonly (readonly [string, number])[],
  fonts: PdfFontSet,
) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.roundedRect(x, y, totalWidth, 28, 5).fill(PDF_THEME.navy);
  let cursor = x;
  doc.font(fonts.bold).fontSize(8.5).fillColor(PDF_THEME.goldSoft);
  for (const [label, width] of columns) {
    doc.text(label, cursor + 6, y + 9, { width: width - 12, align: "left", lineBreak: false });
    cursor += width;
  }
}

function drawParticipantRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  rowHeight: number,
  columns: readonly (readonly [string, number])[],
  item: RegistrationRecord,
  index: number,
  fonts: PdfFontSet,
) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.roundedRect(x, y, totalWidth, rowHeight, 4)
    .fillAndStroke(index % 2 === 0 ? PDF_THEME.white : PDF_THEME.paleBlue, PDF_THEME.line);

  const values = [
    item.registration_code,
    `${item.title}${item.first_name} ${item.last_name}`,
    item.citizen_id,
    item.phone,
    item.position || "-",
    `${item.division || "-"} / ${item.bureau || "-"}`,
    statusLabel(item.status),
    item.checked_in_at ? formatPdfThaiDateTime(item.checked_in_at, "short") : "-",
  ];
  let cursor = x;
  values.forEach((value, valueIndex) => {
    if (valueIndex > 0) {
      doc.moveTo(cursor, y + 6).lineTo(cursor, y + rowHeight - 6).lineWidth(0.4).stroke("#dfe5ef");
    }
    const font = valueIndex === 0 ? fonts.bold : fonts.regular;
    const color = valueIndex === 0 ? PDF_THEME.navy : PDF_THEME.text;
    drawCellText(
      doc,
      clean(value),
      cursor + 6,
      y + 8,
      columns[valueIndex][1] - 12,
      valueIndex === 7 ? 7.5 : 8,
      font,
      color,
      valueIndex === 1 || valueIndex === 4 || valueIndex === 5 ? 2 : 1,
    );
    cursor += columns[valueIndex][1];
  });
}

function drawCellText(
  doc: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  width: number,
  size: number,
  font: string,
  color: string,
  maxLines: number,
) {
  doc.font(font).fontSize(size).fillColor(color);
  const lines = fitCellLines(doc, value, width, maxLines);
  lines.forEach((line, index) => {
    doc.text(line, x, y + index * (size + 2), { width, lineBreak: false });
  });
}

function fitCellLines(doc: PDFKit.PDFDocument, value: string, width: number, maxLines: number) {
  const graphemes = Array.from(
    new Intl.Segmenter("th", { granularity: "grapheme" }).segment(value),
    (item) => item.segment,
  );
  const lines: string[] = [];
  let current = "";
  let index = 0;

  while (index < graphemes.length && lines.length < maxLines) {
    const next = `${current}${graphemes[index]}`;
    if (!current || doc.widthOfString(next) <= width) {
      current = next;
      index += 1;
      continue;
    }
    lines.push(current.trimEnd());
    current = "";
  }
  if (current && lines.length < maxLines) lines.push(current.trimEnd());

  if (index < graphemes.length && lines.length) {
    const ellipsis = "…";
    let last = lines[lines.length - 1];
    while (last && doc.widthOfString(`${last}${ellipsis}`) > width) {
      last = Array.from(
        new Intl.Segmenter("th", { granularity: "grapheme" }).segment(last),
        (item) => item.segment,
      ).slice(0, -1).join("");
    }
    lines[lines.length - 1] = `${last}${ellipsis}`;
  }
  return lines;
}

function drawSummaryChip(
  doc: PDFKit.PDFDocument,
  label: string,
  value: number,
  x: number,
  y: number,
  background: string,
  color: string,
  fonts: PdfFontSet,
) {
  doc.roundedRect(x, y, 138, 26, 6).fill(background);
  doc.font(fonts.regular).fontSize(8.5).fillColor(color).text(label, x + 10, y + 8, {
    width: 92,
    lineBreak: false,
  });
  doc.font(fonts.bold).fontSize(10).fillColor(color).text(String(value), x + 104, y + 7, {
    width: 24,
    align: "right",
    lineBreak: false,
  });
}

function statusLabel(status: string) {
  if (status === "attended") return "เข้าร่วมงานแล้ว";
  if (status === "cancelled") return "ยกเลิก";
  return "ลงทะเบียนแล้ว";
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
