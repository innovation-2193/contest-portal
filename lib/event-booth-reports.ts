import PDFDocument from "pdfkit";
import { existsSync } from "fs";
import { getEventBoothImagePath, type EventBoothRecord } from "./event-booths";
import { drawDocumentFooter, drawDocumentHeader, formatPdfThaiDateTime, PDF_THEME, pdfFontBold, pdfFontRegular, pdfLogo, type PdfFontSet } from "./pdf-theme";

const fonts: PdfFontSet = { regular: pdfFontRegular, bold: pdfFontBold };

export async function buildExecutiveBoothReportPdf(booths: EventBoothRecord[]) {
  const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0, bufferPages: false });
  const pdf = collectPdf(doc);
  const summaryRowsPerPage = 16;
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
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: false });
  const pdf = collectPdf(doc);
  const rows = booths.length ? booths : [null];
  rows.forEach((booth, index) => {
    if (index) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
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
  drawDocumentHeader(doc, { title: "บัญชีสรุปบูธแสดงผลงาน", titleFontSize: 19, subtitle: `เอกสารภาพรวมสำหรับผู้บังคับบัญชา • ออกรายงานเมื่อ ${formatPdfThaiDateTime(new Date())}`, metaLabel: "จำนวนทั้งหมด", metaValue: `${boothTotal.toLocaleString("th-TH")} บูธ`, fonts });
  doc.font(fonts.bold).fontSize(12).fillColor(PDF_THEME.navy).text("ภาพรวมหน่วยงานและประเภทผลงาน", 32, 132, { width: 531, lineBreak: false });
  doc.font(fonts.regular).fontSize(8.5).fillColor(PDF_THEME.muted).text("รายการสรุปเรียงตามข้อมูลบูธทั้งหมดในระบบ รายละเอียดของแต่ละบูธแสดงในหน้าถัดไป", 32, 153, { width: 531, lineBreak: false });
  const columns = [["ลำดับ", 54], ["ชื่อหน่วยงาน", 304], ["ประเภทผลงาน", 173]] as const;
  const x = 32;
  let y = 184;
  const tableWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  const availableHeight = 558;
  const rowHeight = booths.length ? Math.max(18, Math.min(34, availableHeight / booths.length)) : 46;
  doc.roundedRect(x, y, tableWidth, 38, 7).fill(PDF_THEME.navy);
  let headerX = x;
  columns.forEach(([label, width], index) => {
    doc.font(fonts.bold).fontSize(9).fillColor(PDF_THEME.goldSoft).text(label, headerX + 8, y + 13, { width: width - 16, align: index === 0 ? "center" : "left", lineBreak: false });
    headerX += width;
  });
  y += 42;
  if (!booths.length) {
    doc.roundedRect(x, y, tableWidth, rowHeight, 6).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(fonts.bold).fontSize(11).fillColor(PDF_THEME.muted).text("ยังไม่มีข้อมูลบูธแสดงผลงาน", x, y + 16, { width: tableWidth, align: "center", lineBreak: false });
  }
  booths.forEach((booth, index) => {
    doc.rect(x, y, tableWidth, rowHeight).fillAndStroke(index % 2 ? PDF_THEME.paleBlue : PDF_THEME.white, PDF_THEME.line);
    const entries = [String(offset + index + 1), booth.organizationName, value(booth.workType, "รอระบุประเภทผลงาน")];
    let cellX = x;
    entries.forEach((entry, cellIndex) => {
      const width = columns[cellIndex][1];
      const fontSize = rowHeight < 22 ? 6.7 : rowHeight < 28 ? 7.5 : 8.2;
      doc.font(cellIndex === 0 ? fonts.bold : fonts.regular).fontSize(fontSize).fillColor(PDF_THEME.text).text(entry, cellX + 8, y + Math.max(5, (rowHeight - fontSize) / 2 - 1), { width: width - 16, height: rowHeight - 8, align: cellIndex === 0 ? "center" : "left", ellipsis: true, lineBreak: false });
      cellX += width;
    });
    y += rowHeight;
  });
  drawDocumentFooter(doc, page, total, "บัญชีสรุปบูธแสดงผลงาน", fonts);
}

function drawExecutivePage(doc: PDFKit.PDFDocument, booth: EventBoothRecord, page: number, total: number, boothIndex: number, boothTotal: number) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, { title: "รายงานข้อมูลบูธแสดงผลงาน", titleFontSize: 18.5, subtitle: `เอกสารประกอบการพิจารณาสำหรับผู้บังคับบัญชา • ออกรายงานเมื่อ ${formatPdfThaiDateTime(new Date())}`, metaLabel: "ลำดับบูธ", metaValue: `${boothIndex} / ${boothTotal}`, fonts });
  doc.font(fonts.bold).fontSize(8.5).fillColor(PDF_THEME.gold).text(booth.sourceType === "finalist" ? "ผลงานที่ผ่านการคัดเลือกรอบที่ 1" : "ผู้ลงทะเบียนจัดบูธ (Exhibitor)", 32, 130, { width: 530, lineBreak: false });
  doc.font(fonts.bold).fontSize(20).fillColor(PDF_THEME.navy).text(value(booth.workTitle, "รอระบุชื่อผลงานที่จัดบูธ"), 32, 151, { width: 530, height: 58, ellipsis: true });
  drawExecutiveDetail(doc, 32, 226, 531, "ชื่อหน่วยงาน", booth.organizationName);
  drawExecutiveDetail(doc, 32, 292, 531, "ประเภทผลงาน", value(booth.workType, "รอระบุประเภทผลงาน"));
  drawExecutiveDetail(doc, 32, 358, 531, "ผู้ติดต่อหลัก", value(booth.contactName, "รอระบุผู้ติดต่อหลัก"));
  drawExecutiveDetail(doc, 32, 424, 531, "ข้อมูลติดต่อ", [booth.contactPhone, booth.contactEmail].filter(Boolean).join(" • ") || "ไม่พบข้อมูลติดต่อ");
  doc.roundedRect(32, 502, 531, 260, 10).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(11).fillColor(PDF_THEME.navy).text("รูปภาพประกอบบูธ", 48, 518, { width: 499, lineBreak: false });
  const imagePath = booth.imageName ? getEventBoothImagePath(booth.imageName) : null;
  if (imagePath && existsSync(imagePath) && /\.(jpe?g|png)$/i.test(imagePath)) {
    try { doc.image(imagePath, 48, 546, { fit: [499, 194], align: "center", valign: "center" }); } catch { drawImagePlaceholder(doc, 48, 546, 499, 194); }
  } else {
    drawImagePlaceholder(doc, 48, 546, 499, 194);
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
  doc.rect(0, 0, width, height).fill(PDF_THEME.navy);
  doc.roundedRect(22, 22, width - 44, height - 44, 16).lineWidth(2).stroke(PDF_THEME.gold);
  doc.roundedRect(31, 31, width - 62, height - 62, 12).lineWidth(0.7).stroke("#6b5a25");
  doc.roundedRect(42, 42, width - 84, height - 84, 10).fill("#fbfaf4");
  doc.save();
  doc.roundedRect(42, 42, width - 84, height - 84, 10).clip();
  doc.rect(42, 42, width - 84, 102).fill(PDF_THEME.navyLight);
  doc.rect(42, 139, width - 84, 5).fill(PDF_THEME.gold);
  doc.restore();
  if (!booth) { drawEmpty(doc, "ยังไม่มีข้อมูลบูธแสดงผลงาน"); return; }
  doc.image(pdfLogo, 66, 57, { fit: [72, 72], align: "center", valign: "center" });
  doc.font(fonts.bold).fontSize(10).fillColor(PDF_THEME.gold).text("POLICE INNOVATION CONTEST 2026", 152, 61, { width: width - 218, align: "left", characterSpacing: 1, lineBreak: false });
  doc.font(fonts.bold).fontSize(27).fillColor(PDF_THEME.white).text("ป้ายประจำบูธแสดงผลงาน", 152, 82, { width: width - 218, align: "left", lineBreak: false });
  doc.roundedRect(width - 166, 57, 92, 58, 10).fillAndStroke("#101d36", PDF_THEME.gold);
  doc.font(fonts.regular).fontSize(8).fillColor("#cbd5e4").text("หมายเลขบูธ", width - 154, 68, { width: 68, align: "center", lineBreak: false });
  doc.font(fonts.bold).fontSize(23).fillColor(PDF_THEME.goldSoft).text(page.toLocaleString("th-TH"), width - 154, 83, { width: 68, align: "center", lineBreak: false });
  doc.font(fonts.bold).fontSize(10).fillColor(PDF_THEME.gold).text("หน่วยงานผู้จัดแสดง", 76, 174, { width: width - 152, align: "center", characterSpacing: 0.3, lineBreak: false });
  doc.font(fonts.bold).fontSize(24).fillColor(PDF_THEME.navy).text(booth.organizationName, 76, 199, { width: width - 152, height: 66, align: "center", ellipsis: true });
  doc.moveTo(96, 276).lineTo(width - 96, 276).lineWidth(1.3).stroke(PDF_THEME.gold);
  doc.font(fonts.regular).fontSize(9).fillColor(PDF_THEME.muted).text("ชื่อบูธ / ผลงานที่จัดแสดง", 76, 294, { width: width - 152, align: "center", lineBreak: false });
  doc.font(fonts.bold).fontSize(25).fillColor(PDF_THEME.text).text(value(booth.workTitle, "รอระบุชื่อบูธ"), 76, 322, { width: width - 152, height: 78, align: "center", ellipsis: true });
  doc.roundedRect(88, 418, width - 176, 90, 10).fillAndStroke("#f1ead2", "#cfad36");
  doc.font(fonts.bold).fontSize(9).fillColor(PDF_THEME.navy).text("ผู้ติดต่อหลักประจำบูธ", 108, 433, { width: width - 216, align: "center", lineBreak: false });
  doc.font(fonts.bold).fontSize(16).fillColor(PDF_THEME.text).text(value(booth.contactName, "รอระบุผู้ติดต่อหลัก"), 108, 457, { width: width - 216, align: "center", lineBreak: false });
  doc.font(fonts.regular).fontSize(10).fillColor(PDF_THEME.muted).text(booth.contactPhone || "ไม่พบเบอร์ติดต่อ", 108, 483, { width: width - 216, align: "center", lineBreak: false });
  doc.font(fonts.regular).fontSize(7.5).fillColor("#9a8854").text(`POLICE INNOVATION CONTEST 2026 • ${page} / ${total}`, 58, 536, { width: width - 116, align: "center", characterSpacing: 0.8, lineBreak: false });
}

function drawImagePlaceholder(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number) { doc.roundedRect(x, y, width, height, 8).fillAndStroke(PDF_THEME.paleBlue, PDF_THEME.line); doc.font(fonts.bold).fontSize(11).fillColor(PDF_THEME.muted).text("ยังไม่ได้อัปโหลดรูปภาพประกอบ", x, y + height / 2 - 7, { width, align: "center", lineBreak: false }); }
function drawEmpty(doc: PDFKit.PDFDocument, text: string) { doc.roundedRect(60, 180, doc.page.width - 120, 110, 12).fillAndStroke(PDF_THEME.white, PDF_THEME.line); doc.font(fonts.bold).fontSize(16).fillColor(PDF_THEME.navy).text(text, 80, 224, { width: doc.page.width - 160, align: "center", lineBreak: false }); }
function value(input: string, fallback: string) { return input.trim() || fallback; }
function collectPdf(doc: PDFKit.PDFDocument) { const chunks: Buffer[] = []; return new Promise<Buffer>((resolve, reject) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); }); }
