import PDFDocument from "pdfkit";
import { existsSync } from "fs";
import { getEventBoothImagePath, type EventBoothRecord } from "./event-booths";
import { drawDocumentFooter, drawDocumentHeader, formatPdfThaiDateTime, PDF_THEME, pdfFontBold, pdfFontRegular, pdfLogo, type PdfFontSet } from "./pdf-theme";

const fonts: PdfFontSet = { regular: pdfFontRegular, bold: pdfFontBold };

export async function buildExecutiveBoothReportPdf(booths: EventBoothRecord[]) {
  const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0, bufferPages: false });
  const pdf = collectPdf(doc);
  const summaryRowsPerPage = 14;
  const summaryPages = Math.max(1, Math.ceil(booths.length / summaryRowsPerPage));
  const totalPages = booths.length + summaryPages;
  for (let summaryPage = 0; summaryPage < summaryPages; summaryPage += 1) {
    if (summaryPage) doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
    drawExecutiveSummaryPage(doc, booths.slice(summaryPage * summaryRowsPerPage, (summaryPage + 1) * summaryRowsPerPage), summaryPage + 1, totalPages, booths.length, summaryPage * summaryRowsPerPage);
  }
  booths.forEach((booth, index) => {
    doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
    drawExecutivePage(doc, booth, summaryPages + index + 1, totalPages, index + 1, booths.length);
  });
  doc.info.Title = "รายงานข้อมูลบูธแสดงผลงานสำหรับผู้บังคับบัญชา";
  doc.info.Subject = "สรุปหน่วยงานและผลงานที่เข้าร่วมจัดบูธ";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

export async function buildUciBoothOverviewPdf(booths: EventBoothRecord[]) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: false });
  const pdf = collectPdf(doc);
  const rowsPerPage = 10;
  const pages = Math.max(1, Math.ceil(booths.length / rowsPerPage));
  for (let page = 0; page < pages; page += 1) {
    if (page) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawOverviewPage(doc, booths.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage), page + 1, pages, page * rowsPerPage);
  }
  doc.info.Title = "บัญชีภาพรวมบูธแสดงผลงานสำหรับเจ้าหน้าที่ UCI";
  doc.info.Subject = "ข้อมูลภาพรวมบูธแสดงผลงาน";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

export async function buildUciBoothLabelsPdf(booths: EventBoothRecord[]) {
  const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0, bufferPages: false });
  const pdf = collectPdf(doc);
  const rows = booths.length ? booths : [null];
  rows.forEach((booth, index) => {
    if (index) doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
    drawLabelPage(doc, booth, index + 1, rows.length);
  });
  doc.info.Title = "ป้ายประจำบูธแสดงผลงาน";
  doc.info.Subject = "ป้ายชื่อหน่วยงาน ชื่อบูธ และผู้ติดต่อหลัก";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

function drawExecutiveSummaryPage(doc: PDFKit.PDFDocument, booths: EventBoothRecord[], page: number, total: number, boothTotal: number, offset: number) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  const headerHeight = 128;
  drawDocumentHeader(doc, { title: "บัญชีสรุปบูธแสดงผลงาน", titleFontSize: 19, headerHeight, subtitle: `สำหรับผู้บังคับบัญชา\nออกรายงานเมื่อ ${formatPdfThaiDateTime(new Date())}`, metaLabel: "จำนวนทั้งหมด", metaValue: `${boothTotal.toLocaleString("th-TH")} บูธ`, fonts });
  doc.font(fonts.bold).fontSize(12).fillColor(PDF_THEME.navy).text("ภาพรวมหน่วยงานและประเภทผลงาน", 32, 150, { width: 531, lineBreak: false });
  doc.font(fonts.regular).fontSize(8.5).fillColor(PDF_THEME.muted).text("รายการเรียงตามลำดับบูธที่กำหนดในระบบ รายละเอียดของแต่ละบูธแสดงในหน้าถัดไป", 32, 171, { width: 531, lineBreak: false });
  const columns = [["ลำดับ", 54], ["ชื่อหน่วยงาน", 304], ["ประเภทผลงาน", 173]] as const;
  const x = 32;
  let y = 198;
  const tableWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  const availableHeight = 574;
  const tableHeaderHeight = 38;
  const rowHeight = booths.length ? Math.max(30, Math.min(40, availableHeight / booths.length)) : 46;
  doc.rect(x, y, tableWidth, tableHeaderHeight).fillAndStroke(PDF_THEME.navy, PDF_THEME.navy);
  let headerX = x;
  columns.forEach(([label, width], index) => {
    doc.font(fonts.bold).fontSize(9).fillColor(PDF_THEME.goldSoft).text(label, headerX + 8, y + 12, { width: width - 16, align: index === 0 ? "center" : "left", lineBreak: false });
    headerX += width;
  });
  y += tableHeaderHeight;
  if (!booths.length) {
    doc.rect(x, y, tableWidth, rowHeight).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(fonts.bold).fontSize(11).fillColor(PDF_THEME.muted).text("ยังไม่มีข้อมูลบูธแสดงผลงาน", x, y + (rowHeight - 11) / 2, { width: tableWidth, align: "center", lineBreak: false });
  }
  booths.forEach((booth, index) => {
    doc.rect(x, y, tableWidth, rowHeight).fillAndStroke(index % 2 ? PDF_THEME.paleBlue : PDF_THEME.white, PDF_THEME.line);
    const entries = [String(offset + index + 1), booth.organizationName, value(booth.workType, "รอระบุประเภทผลงาน")];
    let cellX = x;
    entries.forEach((entry, cellIndex) => {
      const width = columns[cellIndex][1];
      const fontSize = rowHeight < 22 ? 6.7 : rowHeight < 28 ? 7.5 : 8.2;
      const cellWidth = width - 16;
      doc.font(cellIndex === 0 ? fonts.bold : fonts.regular).fontSize(fontSize).fillColor(PDF_THEME.text);
      const textHeight = Math.min(rowHeight - 8, doc.heightOfString(entry, { width: cellWidth, lineGap: 0 }));
      doc.text(entry, cellX + 8, y + Math.max(4, (rowHeight - textHeight) / 2), { width: cellWidth, height: rowHeight - 8, align: cellIndex === 0 ? "center" : "left", ellipsis: true, lineBreak: true });
      cellX += width;
    });
    y += rowHeight;
  });
  drawDocumentFooter(doc, page, total, "บัญชีสรุปบูธแสดงผลงาน", fonts);
}

function drawExecutivePage(doc: PDFKit.PDFDocument, booth: EventBoothRecord, page: number, total: number, boothIndex: number, boothTotal: number) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, { title: "รายงานข้อมูลบูธแสดงผลงาน", titleFontSize: 18.5, headerHeight: 128, subtitle: `สำหรับผู้บังคับบัญชา\nออกรายงานเมื่อ ${formatPdfThaiDateTime(new Date())}`, metaLabel: "ลำดับบูธ", metaValue: `${boothIndex} / ${boothTotal}`, fonts });
  doc.font(fonts.bold).fontSize(8.5).fillColor(PDF_THEME.gold).text(booth.sourceType === "finalist" ? "ผลงานที่ผ่านการคัดเลือกรอบที่ 1" : "ผู้ลงทะเบียนจัดบูธ (Exhibitor)", 32, 150, { width: 530, lineBreak: false });
  doc.font(fonts.bold).fontSize(20).fillColor(PDF_THEME.navy).text(value(booth.workTitle, "รอระบุชื่อผลงานที่จัดบูธ"), 32, 171, { width: 530, height: 58, ellipsis: true });
  drawExecutiveDetail(doc, 32, 246, 531, "ชื่อหน่วยงาน", booth.organizationName);
  drawExecutiveDetail(doc, 32, 312, 531, "ประเภทผลงาน", value(booth.workType, "รอระบุประเภทผลงาน"));
  drawExecutiveDetail(doc, 32, 378, 531, "ผู้ติดต่อหลัก", value(booth.contactName, "รอระบุผู้ติดต่อหลัก"));
  drawExecutiveDetail(doc, 32, 444, 531, "ข้อมูลติดต่อ", [booth.contactPhone, booth.contactEmail].filter(Boolean).join(" • ") || "ไม่พบข้อมูลติดต่อ");
  doc.roundedRect(32, 522, 531, 240, 10).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(11).fillColor(PDF_THEME.navy).text("รูปภาพประกอบบูธ", 48, 538, { width: 499, lineBreak: false });
  const imagePath = booth.imageName ? getEventBoothImagePath(booth.imageName) : null;
  if (imagePath && existsSync(imagePath) && /\.(jpe?g|png)$/i.test(imagePath)) {
    try { doc.image(imagePath, 48, 566, { fit: [499, 174], align: "center", valign: "center" }); } catch { drawImagePlaceholder(doc, 48, 566, 499, 174); }
  } else {
    drawImagePlaceholder(doc, 48, 566, 499, 174);
  }
  drawDocumentFooter(doc, page, total, `${booth.organizationName} • บูธที่ ${booth.boothNumber}`, fonts);
}

function drawExecutiveDetail(doc: PDFKit.PDFDocument, x: number, y: number, width: number, label: string, text: string) {
  doc.roundedRect(x, y, width, 54, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(8).fillColor(PDF_THEME.muted).text(label, x + 14, y + 8, { width: 130, lineBreak: false });
  doc.font(fonts.bold).fontSize(12).fillColor(PDF_THEME.text).text(value(text, "-"), x + 14, y + 25, { width: width - 28, height: 18, ellipsis: true, lineBreak: false });
}

function drawOverviewPage(doc: PDFKit.PDFDocument, booths: EventBoothRecord[], page: number, total: number, offset: number) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, { title: "บัญชีภาพรวมบูธแสดงผลงาน", subtitle: `สำหรับการปฏิบัติงานของเจ้าหน้าที่ UCI • ออกรายงานเมื่อ ${formatPdfThaiDateTime(new Date())}`, metaLabel: "จำนวนในหน้านี้", metaValue: `${booths.length} บูธ`, fonts });
  const columns = [["ลำดับ", 44], ["หน่วยงาน", 205], ["ชื่อบูธ / ผลงาน", 250], ["ผู้ติดต่อหลัก", 170], ["เบอร์ติดต่อ", 120]] as const;
  const x = 26; let y = 132; const headerHeight = 38; const rowHeight = 37; const width = columns.reduce((sum, [, size]) => sum + size, 0);
  doc.roundedRect(x, y, width, headerHeight, 6).fill(PDF_THEME.navy);
  let cursor = x; columns.forEach(([label, size], index) => { doc.font(fonts.bold).fontSize(8.5).fillColor(PDF_THEME.goldSoft).text(label, cursor + 7, y + 13, { width: size - 14, align: index === 0 ? "center" : "left", lineBreak: false }); cursor += size; });
  y += headerHeight + 4;
  if (!booths.length) { doc.roundedRect(x, y, width, 70, 6).fillAndStroke(PDF_THEME.white, PDF_THEME.line); doc.font(fonts.bold).fontSize(12).fillColor(PDF_THEME.navy).text("ยังไม่มีข้อมูลบูธแสดงผลงาน", x, y + 26, { width, align: "center", lineBreak: false }); }
  booths.forEach((booth, index) => {
    doc.roundedRect(x, y, width, rowHeight, 5).fillAndStroke(index % 2 ? PDF_THEME.paleBlue : PDF_THEME.white, PDF_THEME.line);
    const values = [String(offset + index + 1), booth.organizationName, value(booth.workTitle, "รอระบุชื่อผลงาน"), value(booth.contactName, "รอระบุผู้ติดต่อ"), value(booth.contactPhone, "ไม่พบเบอร์ติดต่อ")];
    let cellX = x; values.forEach((text, cell) => { const size = columns[cell][1]; doc.font(cell === 0 ? fonts.bold : fonts.regular).fontSize(cell === 0 ? 9 : 7.5).fillColor(PDF_THEME.text).text(text, cellX + 7, y + 12, { width: size - 14, height: 13, align: cell === 0 ? "center" : "left", ellipsis: true, lineBreak: false }); cellX += size; });
    y += rowHeight + 2;
  });
  drawDocumentFooter(doc, page, total, "บัญชีภาพรวมบูธสำหรับ UCI", fonts);
}

function drawLabelPage(doc: PDFKit.PDFDocument, booth: EventBoothRecord | null, page: number, total: number) {
  const width = doc.page.width;
  const height = doc.page.height;
  const outer = 18;
  const middle = 26;
  const panel = 34;
  const panelWidth = width - panel * 2;
  const panelHeight = height - panel * 2;
  doc.rect(0, 0, width, height).fill(PDF_THEME.navy);
  doc.roundedRect(outer, outer, width - outer * 2, height - outer * 2, 16).lineWidth(2).stroke(PDF_THEME.gold);
  doc.roundedRect(middle, middle, width - middle * 2, height - middle * 2, 12).lineWidth(0.7).stroke("#6b5a25");
  doc.roundedRect(panel, panel, panelWidth, panelHeight, 10).fill("#fbfaf4");
  doc.save();
  doc.roundedRect(panel, panel, panelWidth, panelHeight, 10).clip();
  doc.rect(panel, panel, panelWidth, 156).fill(PDF_THEME.navyLight);
  doc.rect(panel, 189, panelWidth, 5).fill(PDF_THEME.gold);
  doc.restore();
  if (!booth) { drawEmpty(doc, "ยังไม่มีข้อมูลบูธแสดงผลงาน"); return; }
  doc.image(pdfLogo, 58, 56, { fit: [78, 78], align: "center", valign: "center" });
  doc.font(fonts.bold).fontSize(9.5).fillColor(PDF_THEME.gold).text("POLICE INNOVATION CONTEST 2026", 148, 59, { width: 274, align: "left", characterSpacing: 0.8, lineBreak: false });
  doc.font(fonts.bold).fontSize(22).fillColor(PDF_THEME.white).text("ป้ายประจำบูธแสดงผลงาน", 148, 82, { width: 274, height: 56, align: "left", lineGap: 1, ellipsis: true });
  doc.roundedRect(width - 134, 56, 96, 66, 10).fillAndStroke("#101d36", PDF_THEME.gold);
  doc.font(fonts.regular).fontSize(8).fillColor("#cbd5e4").text("หมายเลขบูธ", width - 124, 68, { width: 76, align: "center", lineBreak: false });
  doc.font(fonts.bold).fontSize(23).fillColor(PDF_THEME.goldSoft).text(page.toLocaleString("th-TH"), width - 124, 86, { width: 76, align: "center", lineBreak: false });
  doc.font(fonts.bold).fontSize(10).fillColor(PDF_THEME.gold).text("หน่วยงานผู้จัดแสดง", 58, 220, { width: width - 116, align: "center", characterSpacing: 0.3, lineBreak: false });
  doc.font(fonts.bold).fontSize(21).fillColor(PDF_THEME.navy).text(booth.organizationName, 58, 247, { width: width - 116, height: 76, align: "center", ellipsis: true });
  doc.moveTo(64, 344).lineTo(width - 64, 344).lineWidth(1.3).stroke(PDF_THEME.gold);
  doc.font(fonts.regular).fontSize(10).fillColor(PDF_THEME.muted).text("ชื่อบูธ / ผลงานที่จัดแสดง", 58, 363, { width: width - 116, align: "center", lineBreak: false });
  const workTitle = fitThaiText(doc, fonts.bold, value(booth.workTitle, "รอระบุชื่อบูธ"), width - 116, 142, 22, 17);
  doc.font(fonts.bold).fontSize(workTitle.fontSize).fillColor(PDF_THEME.text).text(workTitle.text, 58, 392, { width: width - 116, height: 142, align: "center", lineGap: 2, lineBreak: true });
  doc.roundedRect(60, 575, width - 120, 130, 10).fillAndStroke("#f1ead2", "#cfad36");
  doc.font(fonts.bold).fontSize(9).fillColor(PDF_THEME.navy).text("ผู้ติดต่อหลักประจำบูธ", 80, 594, { width: width - 160, align: "center", lineBreak: false });
  doc.font(fonts.bold).fontSize(15).fillColor(PDF_THEME.text).text(value(booth.contactName, "รอระบุผู้ติดต่อหลัก"), 80, 620, { width: width - 160, height: 25, align: "center", ellipsis: true, lineBreak: false });
  doc.font(fonts.regular).fontSize(10).fillColor(PDF_THEME.muted).text(booth.contactPhone || "ไม่พบเบอร์ติดต่อ", 80, 657, { width: width - 160, align: "center", lineBreak: false });
  doc.font(fonts.regular).fontSize(7.5).fillColor("#9a8854").text(`POLICE INNOVATION CONTEST 2026 • ${page} / ${total}`, 48, height - 59, { width: width - 96, align: "center", characterSpacing: 0.8, lineBreak: false });
}

function drawImagePlaceholder(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number) { doc.roundedRect(x, y, width, height, 8).fillAndStroke(PDF_THEME.paleBlue, PDF_THEME.line); doc.font(fonts.bold).fontSize(11).fillColor(PDF_THEME.muted).text("ยังไม่ได้อัปโหลดรูปภาพประกอบ", x, y + height / 2 - 7, { width, align: "center", lineBreak: false }); }
function drawEmpty(doc: PDFKit.PDFDocument, text: string) { doc.roundedRect(60, 180, doc.page.width - 120, 110, 12).fillAndStroke(PDF_THEME.white, PDF_THEME.line); doc.font(fonts.bold).fontSize(16).fillColor(PDF_THEME.navy).text(text, 80, 224, { width: doc.page.width - 160, align: "center", lineBreak: false }); }
function fitThaiText(doc: PDFKit.PDFDocument, font: string, text: string, width: number, maxHeight: number, maxFontSize: number, minFontSize: number) {
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 0.5) {
    doc.font(font).fontSize(fontSize);
    const lines = wrapThaiText(doc, text, width);
    const renderedText = lines.join("\n");
    if (doc.heightOfString(renderedText, { width, lineGap: 2 }) <= maxHeight) return { fontSize, text: renderedText };
  }
  doc.font(font).fontSize(minFontSize);
  return { fontSize: minFontSize, text: wrapThaiText(doc, text, width).join("\n") };
}
function wrapThaiText(doc: PDFKit.PDFDocument, text: string, width: number) {
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("th", { granularity: "word" }) : null;
  const segments = segmenter ? Array.from(segmenter.segment(text), ({ segment }) => segment) : Array.from(text);
  const lines: string[] = [];
  let current = "";
  segments.forEach((segment) => {
    const candidate = current + segment;
    if (current && doc.widthOfString(candidate) > width) {
      lines.push(current.trim());
      current = segment.trimStart();
    } else {
      current = candidate;
    }
  });
  if (current.trim()) lines.push(current.trim());
  return lines.length ? lines : [""];
}
function value(input: string, fallback: string) { return input.trim() || fallback; }
function collectPdf(doc: PDFKit.PDFDocument) { const chunks: Buffer[] = []; return new Promise<Buffer>((resolve, reject) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); }); }
