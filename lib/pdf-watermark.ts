import { degrees, rgb, StandardFonts, type PDFDocument as PdfLibDocument } from "pdf-lib";
import { pdfFontBold, PDF_THEME } from "./pdf-theme";

export function clientIpFromRequest(request: Request) {
  const headers = request.headers;
  const forwardedFor = firstHeaderIp(headers.get("x-forwarded-for"));
  const forwarded = forwardedHeaderIp(headers.get("forwarded"));
  const ip =
    headers.get("cf-connecting-ip")
    || headers.get("true-client-ip")
    || headers.get("x-real-ip")
    || forwardedFor
    || forwarded
    || "unknown-ip";
  return cleanIp(ip);
}

export function drawPdfKitIpWatermark(doc: PDFKit.PDFDocument, ip: string) {
  const label = watermarkLabel(ip);
  const width = doc.page.width;
  const height = doc.page.height;
  const fontSize = Math.max(42, Math.min(68, width / 11));

  doc.save();
  doc.opacity(0.085);
  doc.rotate(-32, { origin: [width / 2, height / 2] });
  doc.font(pdfFontBold)
    .fontSize(fontSize)
    .fillColor(PDF_THEME.navy)
    .text(label, 0, height / 2 - fontSize / 2, {
      width,
      align: "center",
      lineBreak: false,
    });
  doc.restore();
}

export async function drawPdfLibIpWatermark(pdf: PdfLibDocument, ip: string) {
  const label = watermarkLabel(ip);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const fontSize = Math.max(42, Math.min(68, width / 11));
    const textWidth = font.widthOfTextAtSize(label, fontSize);
    page.drawText(label, {
      x: (width - textWidth) / 2,
      y: height / 2 - fontSize / 2,
      size: fontSize,
      font,
      color: rgb(0.03, 0.08, 0.16),
      opacity: 0.085,
      rotate: degrees(-32),
    });
  }
}

function watermarkLabel(ip: string) {
  return `IP: ${cleanIp(ip)}`;
}

function firstHeaderIp(value: string | null) {
  return value?.split(",").map((item) => item.trim()).filter(Boolean)[0] ?? "";
}

function forwardedHeaderIp(value: string | null) {
  if (!value) return "";
  const match = value.match(/(?:^|;|,)\s*for=(?:"?\[?)([^;"\],]+)(?:\]?"?)/i);
  return match?.[1] ?? "";
}

function cleanIp(value: string) {
  return String(value || "unknown-ip")
    .replace(/^::ffff:/i, "")
    .replace(/[^a-zA-Z0-9:._-]/g, "")
    .slice(0, 80)
    || "unknown-ip";
}
