import PDFDocument from "pdfkit";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfLogo,
  pdfFontRegular,
  type PdfFontSet,
} from "./pdf-theme";
import type { ParkingReservationRecord } from "./admin-store";
import { participantRoleFormalLabel } from "./participant-role-labels";

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
  doc.info.Subject = "ป้ายสำรองที่จอดรถสำหรับผู้บริหารและแขกผู้มีเกียรติ ผู้จัดแสดงผลงาน และคณะทำงานและเจ้าหน้าที่";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

export async function parkingReservationsListPdf(reservations: ParkingReservationRecord[]) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: true });
  const pdf = collectPdf(doc);
  const rowsPerPage = 12;
  const pageCount = Math.max(1, Math.ceil(reservations.length / rowsPerPage));

  doc.info.Title = "Police Innovation Contest 2026 parking reservation list";
  doc.info.Subject = "รายการสำรองที่จอดรถจำแนกตามประเภทผู้เข้าร่วมงาน";
  doc.info.Author = "Police Innovation Contest 2026";

  for (let page = 0; page < pageCount; page += 1) {
    if (page > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    doc.rect(0, 0, pageWidth, pageHeight).fill(PDF_THEME.paper);
    drawDocumentHeader(doc, {
      title: "รายการสำรองที่จอดรถ",
      subtitle: `จำแนกตามประเภท: ผู้บริหารและแขกผู้มีเกียรติ • ผู้จัดแสดงผลงาน • คณะทำงานและเจ้าหน้าที่ • ออกรายการเมื่อ ${formatPdfThaiDateTime(new Date())}`,
      metaLabel: "จำนวนรายการ",
      metaValue: `${reservations.length.toLocaleString("th-TH")} รายการ`,
    });
    drawParkingRoleSummary(doc, reservations);
    drawParkingReservationListTable(
      doc,
      reservations.slice(page * rowsPerPage, (page + 1) * rowsPerPage),
      page * rowsPerPage,
    );
  }

  const range = doc.bufferedPageRange();
  for (let pageIndex = 0; pageIndex < range.count; pageIndex += 1) {
    doc.switchToPage(range.start + pageIndex);
    drawDocumentFooter(doc, pageIndex + 1, range.count, "Parking Reservation List", fonts);
  }
  doc.end();
  return pdf;
}

function drawParkingReservationListTable(doc: PDFKit.PDFDocument, reservations: ParkingReservationRecord[], offset: number) {
  const x = 30;
  const y = 162;
  const rowHeight = 28;
  const columns = [
    { label: "ลำดับ", width: 42, align: "center" as const },
    { label: "ทะเบียนรถ", width: 100, align: "left" as const },
    { label: "ผู้ใช้สิทธิ์", width: 170, align: "left" as const },
    { label: "เลขลงทะเบียน", width: 115, align: "left" as const },
    { label: "ประเภทผู้เข้าร่วมงาน", width: 145, align: "center" as const },
    { label: "สังกัด / หน่วยงาน", width: 150, align: "left" as const },
    { label: "เบอร์ติดต่อ", width: 60, align: "left" as const },
  ];
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);

  doc.roundedRect(x, y, tableWidth, rowHeight, 5).fill(PDF_THEME.navy);
  let cursor = x;
  columns.forEach((column) => {
    doc.font(fonts.bold).fontSize(9).fillColor(PDF_THEME.goldSoft).text(column.label, cursor + 6, y + 8, {
      width: column.width - 12,
      align: column.align,
      lineBreak: false,
    });
    cursor += column.width;
  });

  if (!reservations.length) {
    doc.roundedRect(x, y + rowHeight + 4, tableWidth, 48, 5).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(fonts.regular).fontSize(10).fillColor(PDF_THEME.muted).text("ยังไม่มีรายการสำรองที่จอดรถ", x, y + rowHeight + 22, {
      width: tableWidth,
      align: "center",
      lineBreak: false,
    });
    return;
  }

  reservations.forEach((reservation, index) => {
    const rowY = y + rowHeight + index * rowHeight;
    doc.rect(x, rowY, tableWidth, rowHeight).fillAndStroke(
      index % 2 ? PDF_THEME.paleBlue : PDF_THEME.white,
      PDF_THEME.line,
    );
    const affiliation = [reservation.division, reservation.bureau].map(clean).filter((item) => item !== "-").join(" / ") || "-";
    const values = [
      String(offset + index + 1),
      reservation.carPlate,
      reservation.participantName,
      reservation.registrationCode,
      participantRoleFormalLabel(reservation.participantRole),
      affiliation,
      reservation.phone,
    ];
    let cellX = x;
    columns.forEach((column, columnIndex) => {
      doc.font(columnIndex === 0 || columnIndex === 1 ? fonts.bold : fonts.regular)
        .fontSize(8.5)
        .fillColor(columnIndex === 1 ? PDF_THEME.navy : PDF_THEME.text)
        .text(clean(values[columnIndex]), cellX + 6, rowY + 8, {
          width: column.width - 12,
          height: 12,
          align: column.align,
          ellipsis: true,
          lineBreak: false,
        });
      cellX += column.width;
    });
  });
}

function drawParkingRoleSummary(doc: PDFKit.PDFDocument, reservations: ParkingReservationRecord[]) {
  const roles = [
    ["ผู้บริหารและแขกผู้มีเกียรติ", "VIP"],
    ["ผู้จัดแสดงผลงาน", "Exhibitor"],
    ["คณะทำงานและเจ้าหน้าที่", "Staff"],
  ] as const;
  const x = 30;
  const gap = 10;
  const width = (pageWidth - x * 2 - gap * 2) / 3;
  roles.forEach(([label, role], index) => {
    const count = reservations.filter((reservation) => reservation.participantRole === role).length;
    const boxX = x + index * (width + gap);
    doc.roundedRect(boxX, 120, width, 30, 6).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(fonts.bold).fontSize(8.2).fillColor(PDF_THEME.navy).text(label, boxX + 8, 126, { width: width - 62, lineBreak: false });
    doc.font(fonts.bold).fontSize(10).fillColor(PDF_THEME.gold).text(count.toLocaleString("th-TH"), boxX + width - 48, 125, { width: 40, align: "right", lineBreak: false });
  });
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
  doc.font(fonts.bold).fontSize(11).fillColor(PDF_THEME.navy).text("ประเภทผู้เข้าร่วมงาน / สิทธิ์จอดรถ", x + 20, y + 14, {
    width: width - 40,
    lineBreak: false,
  });
  doc.font(fonts.bold).fontSize(24).fillColor(PDF_THEME.navy).text(participantRoleFormalLabel(role), x + 20, y + 36, {
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
