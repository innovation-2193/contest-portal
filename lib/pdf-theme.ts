import path from "path";

export const PDF_THEME = {
  navy: "#07142a",
  navyLight: "#0b2248",
  gold: "#dfba33",
  goldSoft: "#fff7dc",
  blue: "#2f9fda",
  paper: "#f4f7fb",
  white: "#ffffff",
  text: "#172033",
  muted: "#657083",
  line: "#d6deea",
  paleBlue: "#edf4fb",
  green: "#16794b",
  greenSoft: "#e8f6ee",
  red: "#a82e45",
  redSoft: "#fcecef",
} as const;

export const pdfFontRegular = path.join(process.cwd(), "public", "fonts", "Sarabun-Regular.ttf");
export const pdfFontBold = path.join(process.cwd(), "public", "fonts", "Sarabun-Bold.ttf");
export const pdfLogo = path.join(process.cwd(), "public", "favicon.png");

export type PdfFontSet = {
  regular: string;
  bold: string;
};

type HeaderOptions = {
  title: string;
  subtitle: string;
  eyebrow?: string;
  metaLabel?: string;
  metaValue?: string;
  showLogo?: boolean;
  fonts?: PdfFontSet;
};

export function drawDocumentHeader(doc: PDFKit.PDFDocument, options: HeaderOptions) {
  const width = doc.page.width;
  const fonts = options.fonts ?? { regular: pdfFontRegular, bold: pdfFontBold };
  const metaWidth = options.metaValue ? 174 : 0;
  const showLogo = options.showLogo !== false;
  const textX = showLogo ? 104 : 30;
  const titleWidth = width - textX - 20 - metaWidth;

  doc.rect(0, 0, width, 108).fill(PDF_THEME.navy);
  doc.rect(0, 104, width, 4).fill(PDF_THEME.gold);
  if (showLogo) {
    doc.image(pdfLogo, 30, 20, { fit: [60, 60], align: "center", valign: "center" });
  }

  doc.font(fonts.bold)
    .fontSize(8.5)
    .fillColor(PDF_THEME.gold)
    .text(options.eyebrow ?? "POLICE INNOVATION CONTEST 2026", textX, 21, {
      width: titleWidth,
      characterSpacing: 0.5,
      lineBreak: false,
    });
  doc.font(fonts.bold).fontSize(21).fillColor(PDF_THEME.white).text(options.title, textX, 38, {
    width: titleWidth,
    lineBreak: false,
  });
  doc.font(fonts.regular).fontSize(10.5).fillColor("#dce5f3").text(options.subtitle, textX, 70, {
    width: titleWidth,
    lineBreak: false,
  });

  if (options.metaValue) {
    const x = width - 198;
    doc.roundedRect(x, 20, 168, 66, 7).fillAndStroke(PDF_THEME.navyLight, "#345078");
    doc.font(fonts.regular).fontSize(8.5).fillColor("#b9c7da").text(options.metaLabel ?? "เลขที่เอกสาร", x + 12, 31, {
      width: 144,
      lineBreak: false,
    });
    doc.font(fonts.bold).fontSize(13).fillColor(PDF_THEME.goldSoft).text(options.metaValue, x + 12, 50, {
      width: 144,
      align: "right",
      lineBreak: false,
    });
  }
  return 108;
}

export function drawDocumentFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
  reference?: string,
  fonts: PdfFontSet = { regular: pdfFontRegular, bold: pdfFontBold },
) {
  const margin = 30;
  const y = doc.page.height - 30;

  doc.moveTo(margin, y - 9).lineTo(doc.page.width - margin, y - 9).lineWidth(0.7).stroke(PDF_THEME.line);
  doc.font(fonts.regular).fontSize(8).fillColor(PDF_THEME.muted).text(
    "เอกสารจากระบบ Police Innovation Contest 2026",
    margin,
    y,
    { width: 260, lineBreak: false },
  );
  const suffix = reference ? ` • ${reference}` : "";
  doc.text(`หน้า ${pageNumber} / ${totalPages}${suffix}`, doc.page.width - 260 - margin, y, {
    width: 260,
    align: "right",
    lineBreak: false,
  });
}

export function formatPdfThaiDateTime(value: string | Date, dateStyle: "short" | "medium" = "medium") {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle,
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(typeof value === "string" ? new Date(value) : value);
}
