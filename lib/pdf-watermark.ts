import { degrees, rgb, StandardFonts, type PDFDocument as PdfLibDocument } from "pdf-lib";
import { pdfFontBold, PDF_THEME } from "./pdf-theme";

export type PdfExportWatermark = {
  ip: string;
  exportedAt: Date;
  networkLabel: string;
};

type WatermarkInput = PdfExportWatermark | string;

export function exportWatermarkFromRequest(request: Request): PdfExportWatermark {
  return {
    ip: clientIpFromRequest(request),
    exportedAt: new Date(),
    networkLabel: networkLabelFromRequest(request),
  };
}

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

export function drawPdfKitIpWatermark(doc: PDFKit.PDFDocument, watermark: WatermarkInput) {
  const payload = normalizeWatermark(watermark);
  const label = watermarkLabel(payload.ip);
  const detailLabel = watermarkDetailLabel(payload);
  const width = doc.page.width;
  const height = doc.page.height;
  const fontSize = Math.max(42, Math.min(68, width / 11));
  const detailFontSize = Math.max(10, Math.min(15, fontSize * 0.24));
  const labelY = height / 2 - fontSize / 2;

  doc.save();
  doc.opacity(0.085);
  doc.rotate(-32, { origin: [width / 2, height / 2] });
  doc.font(pdfFontBold)
    .fontSize(fontSize)
    .fillColor(PDF_THEME.navy)
    .text(label, 0, labelY, {
      width,
      align: "center",
      lineBreak: false,
    });
  doc.opacity(0.11);
  doc.font(pdfFontBold)
    .fontSize(detailFontSize)
    .fillColor(PDF_THEME.navy)
    .text(detailLabel, 0, labelY + fontSize + 8, {
      width,
      align: "center",
      lineBreak: false,
    });
  doc.restore();
}

export async function drawPdfLibIpWatermark(pdf: PdfLibDocument, watermark: WatermarkInput) {
  const payload = normalizeWatermark(watermark);
  const label = watermarkLabel(payload.ip);
  const detailLabel = watermarkDetailLabel(payload);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const fontSize = Math.max(42, Math.min(68, width / 11));
    const detailFontSize = Math.max(9, Math.min(14, fontSize * 0.23));
    const textWidth = font.widthOfTextAtSize(label, fontSize);
    const detailTextWidth = font.widthOfTextAtSize(detailLabel, detailFontSize);
    const angle = -32 * Math.PI / 180;
    const labelPosition = rotatedTextPosition(width / 2, height / 2, textWidth, fontSize, angle);
    const detailOffset = fontSize / 2 + 8 + detailFontSize / 2;
    const detailCenterX = width / 2 + detailOffset * Math.sin(angle);
    const detailCenterY = height / 2 - detailOffset * Math.cos(angle);
    const detailPosition = rotatedTextPosition(detailCenterX, detailCenterY, detailTextWidth, detailFontSize, angle);
    page.drawText(label, {
      x: labelPosition.x,
      y: labelPosition.y,
      size: fontSize,
      font,
      color: rgb(0.03, 0.08, 0.16),
      opacity: 0.085,
      rotate: degrees(-32),
    });
    page.drawText(detailLabel, {
      x: detailPosition.x,
      y: detailPosition.y,
      size: detailFontSize,
      font,
      color: rgb(0.03, 0.08, 0.16),
      opacity: 0.11,
      rotate: degrees(-32),
    });
  }
}

function watermarkLabel(ip: string) {
  return `IP: ${cleanIp(ip)}`;
}

function watermarkDetailLabel(watermark: PdfExportWatermark) {
  return `Exported: ${formatExportedAt(watermark.exportedAt)} | ISP: ${cleanDetailText(watermark.networkLabel)}`;
}

function normalizeWatermark(watermark: WatermarkInput): PdfExportWatermark {
  if (typeof watermark !== "string") {
    return {
      ip: cleanIp(watermark.ip),
      exportedAt: watermark.exportedAt,
      networkLabel: cleanDetailText(watermark.networkLabel),
    };
  }
  return {
    ip: cleanIp(watermark),
    exportedAt: new Date(),
    networkLabel: "unknown-network",
  };
}

function networkLabelFromRequest(request: Request) {
  const headers = request.headers;
  const organization =
    headers.get("x-vercel-ip-as-organization")
    || headers.get("x-vercel-ip-as-org")
    || headers.get("x-client-isp")
    || headers.get("x-isp");
  if (organization) return cleanDetailText(organization);

  const asn =
    headers.get("x-vercel-ip-as-number")
    || headers.get("x-vercel-ip-asn")
    || headers.get("cf-asn");
  if (asn) return `ASN ${cleanDetailText(asn).replace(/^ASN\s+/i, "")}`;

  return "unknown-network";
}

function formatExportedAt(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(value).replace(",", "") + " Asia/Bangkok";
}

function rotatedTextPosition(centerX: number, centerY: number, textWidth: number, fontSize: number, angle: number) {
  return {
    x: centerX - (textWidth / 2 * Math.cos(angle) - fontSize / 2 * Math.sin(angle)),
    y: centerY - (textWidth / 2 * Math.sin(angle) + fontSize / 2 * Math.cos(angle)),
  };
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

function cleanDetailText(value: string) {
  return String(value || "unknown-network")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    || "unknown-network";
}
