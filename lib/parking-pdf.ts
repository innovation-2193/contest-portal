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
  const generatedAt = new Date();
  const pages = reservations.length ? reservations : [null];

  pages.forEach((reservation, index) => {
    if (index > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawParkingPage(doc, reservation, generatedAt);
  });

  const range = doc.bufferedPageRange();
  for (let pageIndex = 0; pageIndex < range.count; pageIndex += 1) {
    doc.switchToPage(range.start + pageIndex);
    drawDocumentFooter(doc, pageIndex + 1, range.count, "Parking Reservation", fonts);
  }

  doc.info.Title = "Police Innovation Contest 2026 parking reservations";
  doc.info.Subject = "ป้ายสำรองที่จอดรถ VIP / Exhibitor / Staff";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

function drawParkingPage(doc: PDFKit.PDFDocument, reservation: ParkingReservationRecord | null, generatedAt: Date) {
  doc.rect(0, 0, pageWidth, pageHeight).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "ป้ายสำรองที่จอดรถ",
    subtitle: `VIP / Exhibitor / Staff Parking • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "ประเภท",
    metaValue: reservation?.participantRole ?? "-",
    fonts,
  });

  if (!reservation) {
    doc.roundedRect(54, 198, pageWidth - 108, 124, 14).fillAndStroke(PDF_THEME.goldSoft, "#e5cd70");
    doc.font(fonts.bold).fontSize(26).fillColor(PDF_THEME.navy).text("ยังไม่มีรายการสำรองที่จอดรถ", 72, 244, {
      width: pageWidth - 128,
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
  doc.roundedRect(42, 130, pageWidth - 84, 416, 20)
    .fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.roundedRect(64, 154, pageWidth - 128, 56, 16).fillAndStroke(roleSoft, roleColor);
  doc.font(fonts.bold).fontSize(25).fillColor(PDF_THEME.navy).text("RESERVED PARKING", 82, 170, {
    width: pageWidth - 164,
    align: "center",
    lineBreak: false,
  });

  doc.roundedRect(64, 230, pageWidth - 128, 148, 18)
    .fillAndStroke(PDF_THEME.navy, "#203a64");
  doc.font(fonts.bold).fontSize(18).fillColor(PDF_THEME.goldSoft).text("ทะเบียนรถ", 84, 250, {
    width: pageWidth - 168,
    align: "center",
    lineBreak: false,
  });
  drawPlateText(doc, reservation.carPlate, 84, 278, pageWidth - 168);

  const detailY = 404;
  drawDetailBox(doc, "Role", reservation.participantRole, 64, detailY, 138, roleColor);
  drawDetailBox(doc, "เบอร์โทร", reservation.phone, 216, detailY, 200);
  drawDetailBox(doc, "ชื่อผู้ใช้สิทธิ์", reservation.participantName, 430, detailY, 348);

  const supportText = [reservation.note, [reservation.division, reservation.bureau].filter(Boolean).join(" / ")]
    .map(clean)
    .filter((item) => item !== "-")
    .join(" • ");
  if (supportText) {
    doc.roundedRect(64, 486, pageWidth - 128, 38, 10).fillAndStroke(PDF_THEME.goldSoft, "#e5cd70");
    doc.font(fonts.bold).fontSize(10).fillColor(PDF_THEME.gold).text("รายละเอียด", 82, 498, {
      width: 80,
      lineBreak: false,
    });
    doc.font(fonts.regular).fontSize(11).fillColor(PDF_THEME.text).text(supportText, 172, 496, {
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

function drawDetailBox(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number, accent: string = PDF_THEME.gold) {
  doc.roundedRect(x, y, width, 58, 10).fillAndStroke(PDF_THEME.paleBlue, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(9).fillColor(accent).text(label, x + 14, y + 12, {
    width: width - 28,
    lineBreak: false,
  });
  doc.font(fonts.bold).fontSize(14).fillColor(PDF_THEME.navy).text(clean(value), x + 14, y + 30, {
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
