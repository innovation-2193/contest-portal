import PDFDocument from "pdfkit";
import { existsSync } from "fs";
import { getEventBoothImagePath, type EventBoothRecord } from "./event-booths";
import { drawDocumentFooter, drawDocumentHeader, formatPdfThaiDateTime, PDF_THEME, pdfFontBold, pdfFontRegular, type PdfFontSet } from "./pdf-theme";

const fonts: PdfFontSet = { regular: pdfFontRegular, bold: pdfFontBold };

export async function buildExecutiveBoothReportPdf(booths: EventBoothRecord[]) {
  const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0, bufferPages: false });
  const pdf = collectPdf(doc);
  const rows = booths.length ? booths : [null];
  rows.forEach((booth, index) => {
    if (index) doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
    drawExecutivePage(doc, booth, index + 1, rows.length);
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

function drawExecutivePage(doc: PDFKit.PDFDocument, booth: EventBoothRecord | null, page: number, total: number) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, { title: "รายงานข้อมูลบูธแสดงผลงาน", titleFontSize: 18.5, subtitle: `เอกสารประกอบการพิจารณาสำหรับผู้บังคับบัญชา • ออกรายงานเมื่อ ${formatPdfThaiDateTime(new Date())}`, metaLabel: "ลำดับบูธ", metaValue: booth ? `${page} / ${total}` : "0 / 0", fonts });
  if (!booth) {
    drawEmpty(doc, "ยังไม่มีข้อมูลบูธแสดงผลงาน");
    drawDocumentFooter(doc, 1, 1, "รายงานบูธแสดงผลงาน", fonts);
    return;
  }
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
  const columns = [["ลำดับ", 44], ["หน่วยงาน", 210], ["ชื่อบูธ / ผลงาน", 250], ["ประเภทผลงาน", 145], ["ผู้ติดต่อหลัก", 140]] as const;
  const x = 26; let y = 132; const headerHeight = 38; const rowHeight = 37; const width = columns.reduce((sum, [, size]) => sum + size, 0);
  doc.roundedRect(x, y, width, headerHeight, 6).fill(PDF_THEME.navy);
  let cursor = x; columns.forEach(([label, size], index) => { doc.font(fonts.bold).fontSize(8.5).fillColor(PDF_THEME.goldSoft).text(label, cursor + 7, y + 13, { width: size - 14, align: index === 0 ? "center" : "left", lineBreak: false }); cursor += size; });
  y += headerHeight + 4;
  if (!booths.length) { doc.roundedRect(x, y, width, 70, 6).fillAndStroke(PDF_THEME.white, PDF_THEME.line); doc.font(fonts.bold).fontSize(12).fillColor(PDF_THEME.navy).text("ยังไม่มีข้อมูลบูธแสดงผลงาน", x, y + 26, { width, align: "center", lineBreak: false }); }
  booths.forEach((booth, index) => {
    doc.roundedRect(x, y, width, rowHeight, 5).fillAndStroke(index % 2 ? PDF_THEME.paleBlue : PDF_THEME.white, PDF_THEME.line);
    const values = [String(offset + index + 1), booth.organizationName, value(booth.workTitle, "รอระบุชื่อผลงาน"), value(booth.workType, "รอระบุประเภท"), value(booth.contactName, "รอระบุผู้ติดต่อ")];
    let cellX = x; values.forEach((text, cell) => { const size = columns[cell][1]; doc.font(cell === 0 ? fonts.bold : fonts.regular).fontSize(cell === 0 ? 9 : 7.5).fillColor(PDF_THEME.text).text(text, cellX + 7, y + 12, { width: size - 14, height: 13, align: cell === 0 ? "center" : "left", ellipsis: true, lineBreak: false }); cellX += size; });
    y += rowHeight + 2;
  });
  drawDocumentFooter(doc, page, total, "บัญชีภาพรวมบูธสำหรับ UCI", fonts);
}

function drawLabelPage(doc: PDFKit.PDFDocument, booth: EventBoothRecord | null, page: number, total: number) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.white);
  doc.rect(0, 0, doc.page.width, 16).fill(PDF_THEME.gold);
  doc.rect(0, 16, doc.page.width, 82).fill(PDF_THEME.navy);
  doc.font(fonts.bold).fontSize(10).fillColor(PDF_THEME.gold).text("POLICE INNOVATION CONTEST 2026", 40, 32, { width: doc.page.width - 80, align: "center", characterSpacing: 1, lineBreak: false });
  doc.font(fonts.bold).fontSize(25).fillColor(PDF_THEME.white).text("ป้ายประจำบูธแสดงผลงาน", 40, 54, { width: doc.page.width - 80, align: "center", lineBreak: false });
  if (!booth) { drawEmpty(doc, "ยังไม่มีข้อมูลบูธแสดงผลงาน"); drawDocumentFooter(doc, 1, 1, "ป้ายประจำบูธ", fonts); return; }
  doc.font(fonts.bold).fontSize(11).fillColor(PDF_THEME.gold).text(`บูธที่ ${booth.boothNumber.toLocaleString("th-TH")}`, 55, 128, { width: doc.page.width - 110, align: "center", lineBreak: false });
  doc.font(fonts.bold).fontSize(22).fillColor(PDF_THEME.navy).text(booth.organizationName, 55, 155, { width: doc.page.width - 110, height: 62, align: "center", ellipsis: true });
  doc.moveTo(80, 225).lineTo(doc.page.width - 80, 225).lineWidth(1.2).stroke(PDF_THEME.gold);
  doc.font(fonts.regular).fontSize(11).fillColor(PDF_THEME.muted).text("ชื่อบูธ / ผลงาน", 80, 248, { width: doc.page.width - 160, align: "center", lineBreak: false });
  doc.font(fonts.bold).fontSize(28).fillColor(PDF_THEME.text).text(value(booth.workTitle, "รอระบุชื่อบูธ"), 65, 276, { width: doc.page.width - 130, height: 94, align: "center", ellipsis: true });
  doc.roundedRect(86, 396, doc.page.width - 172, 100, 10).fillAndStroke(PDF_THEME.paleBlue, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(10).fillColor(PDF_THEME.navy).text("ผู้ติดต่อหลักประจำบูธ", 105, 414, { width: doc.page.width - 210, align: "center", lineBreak: false });
  doc.font(fonts.bold).fontSize(16).fillColor(PDF_THEME.text).text(value(booth.contactName, "รอระบุผู้ติดต่อหลัก"), 105, 439, { width: doc.page.width - 210, align: "center", lineBreak: false });
  doc.font(fonts.regular).fontSize(10).fillColor(PDF_THEME.muted).text([booth.contactPhone, booth.contactEmail].filter(Boolean).join(" • ") || "ไม่พบข้อมูลติดต่อ", 105, 468, { width: doc.page.width - 210, align: "center", lineBreak: false });
  drawDocumentFooter(doc, page, total, `${booth.organizationName} • บูธที่ ${booth.boothNumber}`, fonts);
}

function drawImagePlaceholder(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number) { doc.roundedRect(x, y, width, height, 8).fillAndStroke(PDF_THEME.paleBlue, PDF_THEME.line); doc.font(fonts.bold).fontSize(11).fillColor(PDF_THEME.muted).text("ยังไม่ได้อัปโหลดรูปภาพประกอบ", x, y + height / 2 - 7, { width, align: "center", lineBreak: false }); }
function drawEmpty(doc: PDFKit.PDFDocument, text: string) { doc.roundedRect(60, 180, doc.page.width - 120, 110, 12).fillAndStroke(PDF_THEME.white, PDF_THEME.line); doc.font(fonts.bold).fontSize(16).fillColor(PDF_THEME.navy).text(text, 80, 224, { width: doc.page.width - 160, align: "center", lineBreak: false }); }
function value(input: string, fallback: string) { return input.trim() || fallback; }
function collectPdf(doc: PDFKit.PDFDocument) { const chunks: Buffer[] = []; return new Promise<Buffer>((resolve, reject) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); }); }
