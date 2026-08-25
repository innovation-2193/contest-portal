import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../lib/admin-api-response";
import { listParticipants } from "../../../../../lib/admin-store";
import { participantRoles, type ParticipantRole, type RegistrationRecord } from "../../../../../lib/local-registrations";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
  type PdfFontSet,
} from "../../../../../lib/pdf-theme";
import { formatApplicantName } from "../../../../../lib/thai-rank-title";

export const runtime = "nodejs";

const reportFonts: PdfFontSet = {
  regular: pdfFontRegular,
  bold: pdfFontBold,
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) {
    return adminUnauthorizedResponse(request);
  }

  const requestedRole = new URL(request.url).searchParams.get("role")?.trim() || "";
  if (requestedRole && !participantRoles.includes(requestedRole as ParticipantRole)) {
    return NextResponse.json({ ok: false, message: "Role ไม่ถูกต้อง" }, { status: 400 });
  }
  const participants = (await listParticipants()).filter((participant) => !requestedRole || participant.participant_role === requestedRole);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "registration.export_pdf",
    entityType: "registration",
    summary: `Export บัญชีรายชื่อผู้เข้าร่วมงานทั้งหมดจากระบบลงทะเบียนออนไลน์เป็น PDF${requestedRole ? ` Role ${requestedRole}` : ""}`,
    payload: { count: participants.length, role: requestedRole || "all" },
  }, request.headers);
  const pdf = await participantsPdf(participants, requestedRole);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="participants${requestedRole ? `-${requestedRole.toLowerCase()}` : ""}-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function participantsPdf(participants: RegistrationRecord[], role = "") {
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const rowsPerPage = 10;
  const sortedParticipants = [...participants].sort(compareCheckInTime);
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: true });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const columns = [
    ["ลำดับ", 36],
    ["ชื่อ-นามสกุล", 205],
    ["Role", 60],
    ["ตำแหน่ง", 120],
    ["สังกัด", 188],
    ["สถานะ", 84],
    ["เวลาในการเช็คอิน", 89],
  ] as const;
  const rowHeight = 32;
  const tableX = 30;
  const pageCount = Math.max(1, Math.ceil(sortedParticipants.length / rowsPerPage));

  for (let page = 0; page < pageCount; page += 1) {
    if (page > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    doc.rect(0, 0, pageWidth, pageHeight).fill(PDF_THEME.paper);
    let y = drawPageHeader(doc, sortedParticipants, generatedAt, reportFonts, role);
    drawTableHeader(doc, tableX, y, columns, reportFonts);
    y += 30;

    const pageParticipants = sortedParticipants.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
    pageParticipants.forEach((item, index) => {
      drawParticipantRow(doc, tableX, y, rowHeight, columns, item, page * rowsPerPage + index, reportFonts);
      y += rowHeight + 4;
    });

    if (!pageParticipants.length) {
      doc.roundedRect(tableX, y + 16, doc.page.width - tableX * 2, 72, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
      doc.font(reportFonts.bold).fontSize(14).fillColor(PDF_THEME.navy).text("ยังไม่มีข้อมูลผู้เข้าร่วมงาน", tableX + 18, y + 42, {
        width: doc.page.width - tableX * 2 - 36,
        align: "center",
        lineBreak: false,
      });
    }
  }

  const range = doc.bufferedPageRange();
  for (let pageIndex = 0; pageIndex < range.count; pageIndex += 1) {
    doc.switchToPage(range.start + pageIndex);
    drawDocumentFooter(doc, pageIndex + 1, range.count, `${sortedParticipants.length} รายการ`, reportFonts);
  }

  doc.info.Title = "Police Innovation Contest 2026 participants";
  doc.info.Subject = "บัญชีรายชื่อผู้เข้าร่วมงานทั้งหมดจากระบบลงทะเบียนออนไลน์";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

function drawPageHeader(
  doc: PDFKit.PDFDocument,
  participants: RegistrationRecord[],
  generatedAt: Date,
  fonts: PdfFontSet,
  role: string,
) {
  const attended = participants.filter((item) => item.status === "attended").length;

  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: `บัญชีรายชื่อผู้เข้าร่วมงานทั้งหมดจากระบบลงทะเบียนออนไลน์${role ? ` · Role ${role}` : ""}`,
    titleFontSize: role ? 16 : 21,
    subtitle: `${role ? `เฉพาะ Role ${role} • ` : ""}ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "จำนวนทั้งหมด",
    metaValue: `${participants.length} รายการ`,
    fonts,
  });
  drawSummaryChip(doc, "ลงทะเบียนทั้งหมด", participants.length, 30, 120, PDF_THEME.goldSoft, "#80620b", fonts);
  drawSummaryChip(doc, "เข้าร่วมงาน", attended, 178, 120, PDF_THEME.greenSoft, PDF_THEME.green, fonts);
  drawSummaryChip(doc, "ไม่เข้าร่วมงาน", participants.length - attended, 326, 120, PDF_THEME.redSoft, PDF_THEME.red, fonts);
  return 160;
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  columns: readonly (readonly [string, number])[],
  fonts: PdfFontSet,
) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.roundedRect(x, y, totalWidth, 28, 5).fill(PDF_THEME.navy);
  let cursor = x;
  doc.font(fonts.bold).fontSize(8.5).fillColor(PDF_THEME.goldSoft);
  for (const [label, width] of columns) {
    doc.text(label, cursor + 5, y + 8, { width: width - 10, align: "center", lineBreak: false });
    cursor += width;
  }
}

function drawParticipantRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  rowHeight: number,
  columns: readonly (readonly [string, number])[],
  item: RegistrationRecord,
  index: number,
  fonts: PdfFontSet,
) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.roundedRect(x, y, totalWidth, rowHeight, 4)
    .fillAndStroke(index % 2 === 0 ? PDF_THEME.white : PDF_THEME.paleBlue, PDF_THEME.line);

  const values = [
    String(index + 1),
    formatApplicantName(item),
    item.participant_role,
    item.position || "-",
    `${item.division || "-"} / ${item.bureau || "-"}`,
    statusLabel(item.status),
    item.checked_in_at ? formatPdfThaiDateTime(item.checked_in_at, "short") : "-",
  ];
  let cursor = x;
  values.forEach((value, valueIndex) => {
    if (valueIndex > 0) {
      doc.moveTo(cursor, y + 6).lineTo(cursor, y + rowHeight - 6).lineWidth(0.4).stroke("#dfe5ef");
    }
    const font = valueIndex === 0 || valueIndex === 1 ? fonts.bold : fonts.regular;
    const color = valueIndex === 0 || valueIndex === 1 ? PDF_THEME.navy : PDF_THEME.text;
    drawCellText(
      doc,
      clean(value),
      cursor + 6,
      y + 8,
      columns[valueIndex][1] - 12,
      valueIndex === 6 ? 7.4 : 8,
      font,
      color,
      valueIndex === 1 || valueIndex === 3 || valueIndex === 4 ? 2 : 1,
      valueIndex === 0 || valueIndex === 2 || valueIndex === 5 || valueIndex === 6 ? "center" : "left",
    );
    cursor += columns[valueIndex][1];
  });
}

function drawCellText(
  doc: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  width: number,
  size: number,
  font: string,
  color: string,
  maxLines: number,
  align: "left" | "center" = "left",
) {
  doc.font(font).fontSize(size).fillColor(color);
  const lines = fitCellLines(doc, value, width, maxLines);
  lines.forEach((line, index) => {
    doc.text(line, x, y + index * (size + 2), { width, align, lineBreak: false });
  });
}

function fitCellLines(doc: PDFKit.PDFDocument, value: string, width: number, maxLines: number) {
  const graphemes = Array.from(
    new Intl.Segmenter("th", { granularity: "grapheme" }).segment(value),
    (item) => item.segment,
  );
  const lines: string[] = [];
  let current = "";
  let index = 0;

  while (index < graphemes.length && lines.length < maxLines) {
    const next = `${current}${graphemes[index]}`;
    if (!current || doc.widthOfString(next) <= width) {
      current = next;
      index += 1;
      continue;
    }
    lines.push(current.trimEnd());
    current = "";
  }
  if (current && lines.length < maxLines) lines.push(current.trimEnd());

  if (index < graphemes.length && lines.length) {
    const ellipsis = "…";
    let last = lines[lines.length - 1];
    while (last && doc.widthOfString(`${last}${ellipsis}`) > width) {
      last = Array.from(
        new Intl.Segmenter("th", { granularity: "grapheme" }).segment(last),
        (item) => item.segment,
      ).slice(0, -1).join("");
    }
    lines[lines.length - 1] = `${last}${ellipsis}`;
  }
  return lines;
}

function drawSummaryChip(
  doc: PDFKit.PDFDocument,
  label: string,
  value: number,
  x: number,
  y: number,
  background: string,
  color: string,
  fonts: PdfFontSet,
) {
  doc.roundedRect(x, y, 138, 26, 6).fill(background);
  doc.font(fonts.regular).fontSize(8.5).fillColor(color).text(label, x + 10, y + 8, {
    width: 92,
    lineBreak: false,
  });
  doc.font(fonts.bold).fontSize(10).fillColor(color).text(String(value), x + 104, y + 7, {
    width: 24,
    align: "right",
    lineBreak: false,
  });
}

function statusLabel(status: string) {
  return status === "attended" ? "เข้าร่วมงาน" : "ไม่เข้าร่วมงาน";
}

function compareCheckInTime(a: RegistrationRecord, b: RegistrationRecord) {
  const aTime = a.checked_in_at ? new Date(a.checked_in_at).getTime() : Number.NEGATIVE_INFINITY;
  const bTime = b.checked_in_at ? new Date(b.checked_in_at).getTime() : Number.NEGATIVE_INFINITY;
  if (aTime !== bTime) return bTime - aTime;
  return new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime();
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim() || "-";
}

function collectPdf(doc: PDFKit.PDFDocument) {
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
