import PDFDocument from "pdfkit";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
  type PdfFontSet,
} from "./pdf-theme";
import { checklistDocuments, type SubmissionChecklistReportRow } from "./submission-checklist-report";

const fonts: PdfFontSet = {
  regular: pdfFontRegular,
  bold: pdfFontBold,
};

export async function submissionChecklistPdf(rows: SubmissionChecklistReportRow[]) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const rowsPerPage = 9;
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  doc.info.Title = "Police Innovation Contest 2026 checklist report";
  doc.info.Subject = "รายงานตรวจไฟล์แนบและลิงก์วิดีโอ";
  doc.info.Author = "Police Innovation Contest 2026";

  for (let page = 0; page < totalPages; page += 1) {
    if (page > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawChecklistPage(doc, rows.slice(page * rowsPerPage, (page + 1) * rowsPerPage), rows.length, generatedAt, page * rowsPerPage, page + 1, totalPages);
  }

  doc.end();
  return pdf;
}

export async function submissionVideoFollowUpPdf(rows: SubmissionChecklistReportRow[]) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const rowsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  doc.info.Title = "Police Innovation Contest 2026 video follow-up report";
  doc.info.Subject = "รายงานผู้สมัครที่ต้องประสานเรื่องวิดีโอ";
  doc.info.Author = "Police Innovation Contest 2026";

  for (let page = 0; page < totalPages; page += 1) {
    if (page > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawVideoPage(doc, rows.slice(page * rowsPerPage, (page + 1) * rowsPerPage), rows.length, generatedAt, page * rowsPerPage, page + 1, totalPages);
  }

  doc.end();
  return pdf;
}

function drawChecklistPage(
  doc: PDFKit.PDFDocument,
  rows: SubmissionChecklistReportRow[],
  total: number,
  generatedAt: Date,
  startIndex: number,
  pageNumber: number,
  totalPages: number,
) {
  const columns = [
    ["ลำดับ", 34],
    ["รหัส", 68],
    ["ชื่อนวัตกรรม", 164],
    ["ผู้สมัคร", 98],
    ["3.1", 40],
    ["3.2", 40],
    ["3.3", 40],
    ["3.4", 40],
    ["วิดีโอ", 80],
    ["หมายเหตุ", 162],
  ] as const;
  const tableX = 38;
  const tableY = 136;
  const rowHeight = 38;

  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "รายงานตรวจไฟล์แนบและลิงก์วิดีโอ",
    subtitle: `ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "จำนวนรายการ",
    metaValue: total.toLocaleString("th-TH"),
    fonts,
  });
  doc.font(fonts.regular).fontSize(8.6).fillColor(PDF_THEME.muted).text(
    "ตรวจสถานะไฟล์อัปโหลด 3.1-3.4 และการแนบ/เปิดลิงก์วิดีโอของทุกรายการที่ส่งประกวด",
    tableX,
    118,
    { width: 560, lineBreak: false },
  );
  drawTableHeader(doc, tableX, tableY, columns);
  if (!rows.length) drawEmptyState(doc, "ยังไม่มีรายการที่ส่งประกวด", tableY);
  rows.forEach((row, index) => drawChecklistRow(doc, tableX, tableY + 26 + index * rowHeight, rowHeight, columns, row, startIndex + index + 1, index));
  drawDocumentFooter(doc, pageNumber, totalPages, "Checklist Report", fonts);
}

function drawVideoPage(
  doc: PDFKit.PDFDocument,
  rows: SubmissionChecklistReportRow[],
  total: number,
  generatedAt: Date,
  startIndex: number,
  pageNumber: number,
  totalPages: number,
) {
  const columns = [
    ["ลำดับ", 38],
    ["ชื่อนวัตกรรม", 224],
    ["ชื่อผู้สมัคร", 120],
    ["เบอร์ติดต่อ", 82],
    ["สถานะลิงก์", 104],
    ["ลิงก์ที่แนบ / หมายเหตุ", 200],
  ] as const;
  const tableX = 36;
  const tableY = 136;
  const rowHeight = 39;

  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "รายงานประสานผู้สมัครเรื่องวิดีโอ",
    subtitle: `ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "ต้องประสาน",
    metaValue: total.toLocaleString("th-TH"),
    fonts,
  });
  doc.font(fonts.regular).fontSize(8.6).fillColor(PDF_THEME.muted).text(
    "แสดงเฉพาะรายการที่ไม่แนบลิงก์วิดีโอ ลิงก์ผิดรูปแบบ หรือระบบเปิดลิงก์ไม่ได้",
    tableX,
    118,
    { width: 560, lineBreak: false },
  );
  drawTableHeader(doc, tableX, tableY, columns);
  if (!rows.length) drawEmptyState(doc, "ไม่พบรายการวิดีโอที่ต้องประสาน", tableY);
  rows.forEach((row, index) => drawVideoRow(doc, tableX, tableY + 26 + index * rowHeight, rowHeight, columns, row, startIndex + index + 1, index));
  drawDocumentFooter(doc, pageNumber, totalPages, "Video Follow-up", fonts);
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number, columns: readonly (readonly [string, number])[]) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.roundedRect(x, y, totalWidth, 25, 5).fill(PDF_THEME.navy);
  let cursor = x;
  doc.font(fonts.bold).fontSize(7.8).fillColor(PDF_THEME.goldSoft);
  for (const [label, width] of columns) {
    doc.text(label, cursor + 5, y + 8, { width: width - 10, lineBreak: false });
    cursor += width;
  }
}

function drawChecklistRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  height: number,
  columns: readonly (readonly [string, number])[],
  row: SubmissionChecklistReportRow,
  runningNumber: number,
  index: number,
) {
  const note = row.fileComplete && row.videoStatus === "ok"
    ? "ครบถ้วน"
    : [
      row.missingDocuments.length ? `ขาด ${row.missingDocuments.map((item) => item.split(" ")[0]).join(", ")}` : "",
      row.videoStatus !== "ok" ? row.videoStatusLabel : "",
    ].filter(Boolean).join(" / ");
  const values = [
    String(runningNumber),
    row.submission_code,
    row.title_th,
    row.ownerName,
    ...checklistDocuments.map(([key]) => row.files[key] ? "มี" : "ขาด"),
    row.videoStatusLabel,
    note,
  ];
  drawGenericRow(doc, x, y, height, columns, values, index, [2, 3, 8, 9]);
}

function drawVideoRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  height: number,
  columns: readonly (readonly [string, number])[],
  row: SubmissionChecklistReportRow,
  runningNumber: number,
  index: number,
) {
  const values = [
    String(runningNumber),
    row.title_th,
    row.ownerName,
    row.phone || "-",
    row.videoStatusLabel,
    row.video_url || "ไม่แนบลิงก์วิดีโอ",
  ];
  drawGenericRow(doc, x, y, height, columns, values, index, [1, 2, 5]);
}

function drawGenericRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  height: number,
  columns: readonly (readonly [string, number])[],
  values: string[],
  index: number,
  multilineIndexes: number[],
) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.rect(x, y, totalWidth, height).fill(index % 2 === 0 ? PDF_THEME.white : PDF_THEME.paleBlue);
  doc.moveTo(x, y + height).lineTo(x + totalWidth, y + height).lineWidth(0.45).stroke(PDF_THEME.line);

  let cursor = x;
  values.forEach((value, valueIndex) => {
    if (valueIndex > 0) doc.moveTo(cursor, y + 5).lineTo(cursor, y + height - 5).lineWidth(0.25).stroke("#e3e9f2");
    const centered = valueIndex >= 4 && valueIndex <= 8 && values.length > 6;
    drawCellText(
      doc,
      clean(value),
      cursor + 5,
      y + 6,
      columns[valueIndex][1] - 10,
      centered ? 7.2 : 7.4,
      valueIndex === 0 || valueIndex === 1 ? fonts.bold : fonts.regular,
      value.includes("ขาด") || value.includes("ไม่ได้") || value.includes("ไม่แนบ") || value.includes("ไม่ถูกต้อง") ? PDF_THEME.red : PDF_THEME.text,
      multilineIndexes.includes(valueIndex) ? 2 : 1,
      centered ? "center" : "left",
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
  align: "left" | "center" = "left",
) {
  doc.font(font).fontSize(size).fillColor(color);
  fitCellLines(doc, value, width, maxLines).forEach((line, index) => {
    doc.text(line, x, y + index * (size + 2), { width, align, lineBreak: false });
  });
}

function drawEmptyState(doc: PDFKit.PDFDocument, text: string, tableY: number) {
  doc.roundedRect(42, tableY + 48, doc.page.width - 84, 76, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(14).fillColor(PDF_THEME.navy).text(text, 60, tableY + 78, {
    width: doc.page.width - 120,
    align: "center",
    lineBreak: false,
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
  return lines.length ? lines : ["-"];
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
