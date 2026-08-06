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
  const roleSoft = reservation.participantRole === "VIP"
    ? PDF_THEME.goldSoft
    : reservation.participantRole === "Staff"
      ? PDF_THEME.greenSoft
      : PDF_THEME.paleBlue;
  doc.roundedRect(42, 42, pageWidth - 84, 468, 20)
    .fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.roundedRect(64, 70, pageWidth - 128, 228, 18)
    .fillAndStroke(PDF_THEME.navy, "#203a64");
  doc.image(pdfLogo, 88, 128, { fit: [106, 106], align: "center", valign: "center" });
  doc.font(fonts.bold).fontSize(18).fillColor(PDF_THEME.goldSoft).text("ทะเบียนรถ", 222, 108, {
    width: pageWidth - 286,
    align: "center",
    lineBreak: false,
  });
  drawPlateText(doc, reservation.carPlate, 222, 150, pageWidth - 286);

  drawDetailBox(doc, "ROLE / สิทธิ์จอดรถ", reservation.participantRole, 64, 324, 230, roleColor, 22);
  drawDetailBox(doc, "ชื่อผู้ใช้สิทธิ์", reservation.participantName, 310, 324, 468, PDF_THEME.gold, 16);

  const supportText = [reservation.note, [reservation.division, reservation.bureau].filter(Boolean).join(" / ")]
    .map(clean)
    .filter((item) => item !== "-")
    .join(" • ");
  if (supportText) {
    doc.roundedRect(64, 430, pageWidth - 128, 42, 10).fillAndStroke(PDF_THEME.goldSoft, "#e5cd70");
    doc.font(fonts.bold).fontSize(10).fillColor(PDF_THEME.gold).text("รายละเอียด", 82, 443, {
      width: 80,
      lineBreak: false,
    });
    doc.font(fonts.regular).fontSize(11).fillColor(PDF_THEME.text).text(supportText, 172, 441, {
      width: pageWidth - 254,
      lineGap: 1,
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
