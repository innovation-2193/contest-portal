import PDFDocument from "pdfkit";
import {
  drawDocumentFooter,
  PDF_THEME,
  pdfFontBold,
  pdfLogo,
  pdfFontRegular,
  type PdfFontSet,
} from "./pdf-theme";
import type { ParkingReservationRecord } from "./admin-store";

const fonts: PdfFontSet = {
  regular: pdfFontRegular,
  bold: pdfFontBold,
};

const pageWidth = 841.89;
const pageHeight = 595.28;

export async function parkingReservationsPdf(reservations: ParkingReservationRecord[]) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: true });
  const pdf = collectPdf(doc);
  const pages = reservations.length ? reservations : [null];

  pages.forEach((reservation, index) => {
    if (index > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawParkingPage(doc, reservation);
  });

  const range = doc.bufferedPageRange();
  for (let pageIndex = 0; pageIndex < range.count; pageIndex += 1) {
    doc.switchToPage(range.start + pageIndex);
    drawDocumentFooter(doc, pageIndex + 1, range.count, undefined, fonts);
  }

  doc.info.Title = "Police Innovation Contest 2026 parking reservations";
  doc.info.Subject = "ป้ายสำรองที่จอดรถ VIP / Exhibitor / Staff";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

function drawParkingPage(doc: PDFKit.PDFDocument, reservation: ParkingReservationRecord | null) {
  doc.rect(0, 0, pageWidth, pageHeight).fill(PDF_THEME.paper);

  if (!reservation) {
    doc.roundedRect(42, 42, pageWidth - 84, 468, 20).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.image(pdfLogo, 64, 76, { fit: [82, 82], align: "center", valign: "center" });
    doc.font(fonts.bold).fontSize(24).fillColor(PDF_THEME.navy).text("ป้ายจอดรถ", 166, 86, {
      width: pageWidth - 230,
      lineBreak: false,
    });
    doc.roundedRect(64, 198, pageWidth - 128, 124, 14).fillAndStroke(PDF_THEME.goldSoft, "#e5cd70");
    doc.font(fonts.bold).fontSize(26).fillColor(PDF_THEME.navy).text("ยังไม่มีรายการสำรองที่จอดรถ", 72, 244, {
      width: pageWidth - 144,
      align: "center",
      lineBreak: false,
    });
    return;
  }

  const roleColor = parkingRoleColor(reservation.participantRole);
  doc.roundedRect(42, 30, pageWidth - 84, 510, 20)
    .fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.roundedRect(64, 54, pageWidth - 128, 246, 18)
    .fillAndStroke(PDF_THEME.navy, "#203a64");
  doc.image(pdfLogo, 88, 120, { fit: [106, 106], align: "center", valign: "center" });
  doc.font(fonts.bold).fontSize(18).fillColor(PDF_THEME.goldSoft).text("ทะเบียนรถ", 222, 82, {
    width: pageWidth - 286,
    align: "center",
    lineBreak: false,
  });
  drawPlateText(doc, reservation.carPlate, 222, 122, pageWidth - 286);
  drawPlateOwner(doc, reservation.participantName, 222, 202, pageWidth - 286);

  drawRoleBanner(doc, reservation.participantRole, 64, 318, pageWidth - 128, 84, roleColor);

  const affiliation = [reservation.division, reservation.bureau]
    .map(clean)
    .filter((item) => item !== "-")
    .join(" / ") || "-";
  drawDetailBox(doc, "สังกัด / หน่วยงาน", affiliation, 64, 414, pageWidth - 128, PDF_THEME.gold, 14);

  const note = clean(reservation.note);
  if (note !== "-") {
    doc.font(fonts.regular).fontSize(9).fillColor(PDF_THEME.muted).text(`หมายเหตุ: ${note}`, 78, 502, {
      width: pageWidth - 156,
      lineBreak: false,
    });
  }
}

function drawPlateText(doc: PDFKit.PDFDocument, value: string, x: number, y: number, width: number) {
  const text = clean(value);
  let size = 62;
  doc.font(fonts.bold).fontSize(size);
  while (size > 48 && doc.widthOfString(text) > width) {
    size -= 2;
    doc.font(fonts.bold).fontSize(size);
  }
  doc.fillColor(PDF_THEME.white).text(text, x, y, {
    width,
    align: "center",
    lineBreak: false,
  });
}

function drawPlateOwner(doc: PDFKit.PDFDocument, value: string, x: number, y: number, width: number) {
  const text = clean(value);
  let size = 16;
  doc.font(fonts.bold).fontSize(size);
  while (size > 11 && doc.widthOfString(text) > width) {
    size -= 1;
    doc.font(fonts.bold).fontSize(size);
  }
  doc.fillColor(PDF_THEME.white).text(text, x, y, {
    width,
    align: "center",
    lineBreak: false,
  });
}

function drawRoleBanner(doc: PDFKit.PDFDocument, role: ParkingReservationRecord["participantRole"], x: number, y: number, width: number, height: number, color: string) {
  doc.roundedRect(x, y, width, height, 14).fillAndStroke(color, color);
  doc.font(fonts.bold).fontSize(11).fillColor(PDF_THEME.navy).text("ROLE / สิทธิ์จอดรถ", x + 20, y + 14, {
    width: width - 40,
    lineBreak: false,
  });
  doc.font(fonts.bold).fontSize(30).fillColor(PDF_THEME.navy).text(role, x + 20, y + 32, {
    width: width - 40,
    lineBreak: false,
  });
}

function drawDetailBox(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number, accent: string = PDF_THEME.gold, valueSize = 14) {
  doc.roundedRect(x, y, width, 76, 10).fillAndStroke(PDF_THEME.paleBlue, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(9).fillColor(accent).text(label, x + 14, y + 12, {
    width: width - 28,
    lineBreak: false,
  });
  doc.font(fonts.bold).fontSize(valueSize).fillColor(PDF_THEME.navy).text(clean(value), x + 14, y + 34, {
    width: width - 28,
    lineGap: 1,
  });
}

function parkingRoleColor(role: ParkingReservationRecord["participantRole"]) {
  if (role === "VIP") return PDF_THEME.gold;
  if (role === "Staff") return "#20b7a6";
  return PDF_THEME.blue;
}

function clean(value: string) {
  return String(value ?? "").replace(/\s+/g, " ").trim() || "-";
}

function collectPdf(doc: PDFKit.PDFDocument) {
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
