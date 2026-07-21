import { NextResponse } from "next/server";
import PDFKitDocument from "pdfkit";
import {
  listParticipants,
  listSubmissions,
  type SubmissionListItem,
} from "../../../../lib/admin-store";
import type { RegistrationRecord } from "../../../../lib/local-registrations";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
  type PdfFontSet,
} from "../../../../lib/pdf-theme";
import { getSiteStats, type SiteDailyStat, type SiteStats } from "../../../../lib/site-analytics";

export const runtime = "nodejs";

const fonts: PdfFontSet = { regular: pdfFontRegular, bold: pdfFontBold };

export async function GET() {
  const [participants, submissions, siteStats] = await Promise.all([
    listParticipants(),
    listSubmissions(),
    getSiteStats(),
  ]);
  const pdf = await dailyReportPdf(participants, submissions, siteStats);
  const fileDate = bangkokDayKey(new Date());

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="daily-report-${fileDate}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

async function dailyReportPdf(
  participants: RegistrationRecord[],
  submissions: SubmissionListItem[],
  siteStats: SiteStats,
) {
  const doc = new PDFKitDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: true });
  const pdf = collectPdf(doc);
  const width = doc.page.width;
  const height = doc.page.height;
  const margin = 30;
  const contentWidth = width - margin * 2;
  const todayKey = bangkokDayKey(new Date());
  const activeParticipants = participants.filter((item) => item.status !== "cancelled");
  const registeredToday = activeParticipants.filter((item) => bangkokDayKey(item.registered_at) === todayKey);
  const submittedToday = submissions.filter((item) => bangkokDayKey(item.submitted_at) === todayKey);
  const attended = activeParticipants.filter((item) => item.status === "attended");
  const scored = submissions.filter((item) => item.review_total_score !== null && item.review_total_score !== undefined);
  const teams = submissions.filter((item) => item.submission_type === "team");
  const recentSubmissions = submissions.slice(0, 10);

  doc.info.Title = "รายงานสรุปประจำวัน";
  doc.info.Subject = "Daily report for Police Innovation Contest 2026";
  doc.info.Author = "Police Innovation Contest 2026";

  drawPageChrome(doc);
  let y = drawDocumentHeader(doc, {
    title: "รายงานสรุปประจำวัน",
    subtitle: `ออกรายงานเมื่อ ${formatPdfThaiDateTime(new Date())}`,
    metaLabel: "ยอดเข้าชมวันนี้",
    metaValue: siteStats.today.toLocaleString("th-TH"),
    fonts,
  }) + 18;

  y = drawConfidentialStrip(doc, margin, y, contentWidth);
  y += 14;

  drawSummaryCards(doc, [
    ["ยอดเข้าชมวันนี้", siteStats.today, `เมื่อวาน ${siteStats.yesterday.toLocaleString("th-TH")} ครั้ง`],
    ["ยอดเข้าชมสะสม", siteStats.total, `เฉลี่ย 7 วัน ${siteStats.average7Days.toLocaleString("th-TH")} ครั้ง/วัน`],
    ["ลงทะเบียนเข้าร่วมงาน", activeParticipants.length, `วันนี้ลงทะเบียนเพิ่ม ${registeredToday.length.toLocaleString("th-TH")} คน`],
    ["เช็คอินเข้าร่วมงานแล้ว", attended.length, `ยังรอเช็คอิน ${(activeParticipants.length - attended.length).toLocaleString("th-TH")} คน`],
    ["ส่งผลงานประกวด", submissions.length, `วันนี้ส่งเพิ่ม ${submittedToday.length.toLocaleString("th-TH")} รายการ`],
    ["ผลงานที่มีคะแนนแล้ว", scored.length, `ส่งแบบทีม ${teams.length.toLocaleString("th-TH")} รายการ`],
  ], margin, y, contentWidth);

  y += 128;
  drawVisitChart(doc, siteStats.last7Days, margin, y, 474, 206);
  drawStatusPanel(doc, submissions, margin + 492, y, contentWidth - 492, 206);

  y += 230;
  if (y + 146 > height - 44) {
    doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawPageChrome(doc);
    y = drawDocumentHeader(doc, {
      title: "รายงานสรุปประจำวัน",
      subtitle: `ออกรายงานเมื่อ ${formatPdfThaiDateTime(new Date())}`,
      metaLabel: "ยอดเข้าชมวันนี้",
      metaValue: siteStats.today.toLocaleString("th-TH"),
      fonts,
    }) + 20;
  }
  drawRecentSubmissionsTable(doc, recentSubmissions, margin, y, contentWidth);

  const pageRange = doc.bufferedPageRange();
  for (let index = pageRange.start; index < pageRange.start + pageRange.count; index += 1) {
    doc.switchToPage(index);
    drawDocumentFooter(doc, index + 1, pageRange.count, "Daily Report", fonts);
  }

  doc.end();
  return pdf;
}

function drawPageChrome(doc: PDFKit.PDFDocument) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  doc.save()
    .fillColor("#e8eef7")
    .opacity(0.55)
    .circle(doc.page.width - 54, 126, 126)
    .fill()
    .restore();
}

function drawConfidentialStrip(doc: PDFKit.PDFDocument, x: number, y: number, width: number) {
  doc.roundedRect(x, y, width, 42, 8).fillAndStroke(PDF_THEME.redSoft, "#d68a97");
  doc.font(pdfFontBold).fontSize(13).fillColor(PDF_THEME.red).text("ใช้ภายใน ห้ามเผยแพร่", x + 16, y + 10, {
    width: 158,
    lineBreak: false,
  });
  doc.font(pdfFontRegular).fontSize(10).fillColor("#6b2734").text(
    "ข้อมูลในรายงานนี้จัดทำเพื่อสรุปสำหรับผู้บังคับบัญชา กรุณาไม่ส่งต่อหรือเผยแพร่ภายนอกหน่วยงาน",
    x + 184,
    y + 12,
    { width: width - 200, lineBreak: false },
  );
  return y + 42;
}

function drawSummaryCards(
  doc: PDFKit.PDFDocument,
  cards: Array<[string, number, string]>,
  x: number,
  y: number,
  width: number,
) {
  const gap = 10;
  const cardWidth = (width - gap * 5) / 6;
  cards.forEach(([label, value, detail], index) => {
    const cardX = x + (cardWidth + gap) * index;
    doc.roundedRect(cardX, y, cardWidth, 110, 9).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.rect(cardX, y, cardWidth, 5).fill(index < 2 ? PDF_THEME.blue : PDF_THEME.gold);
    doc.font(pdfFontBold).fontSize(8.7).fillColor(PDF_THEME.muted).text(label, cardX + 11, y + 16, {
      width: cardWidth - 22,
      height: 24,
    });
    doc.font(pdfFontBold).fontSize(28).fillColor(PDF_THEME.navy).text(value.toLocaleString("th-TH"), cardX + 11, y + 42, {
      width: cardWidth - 22,
      align: "right",
      lineBreak: false,
    });
    doc.font(pdfFontRegular).fontSize(8.3).fillColor(PDF_THEME.muted).text(detail, cardX + 11, y + 81, {
      width: cardWidth - 22,
      height: 18,
      ellipsis: true,
    });
  });
}

function drawVisitChart(
  doc: PDFKit.PDFDocument,
  days: SiteDailyStat[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  drawPanel(doc, x, y, width, height, "ยอดเข้าชมเว็บไซต์ 7 วันล่าสุด", "กราฟเส้นแสดงแนวโน้มรายวัน");
  const chartX = x + 32;
  const chartY = y + 58;
  const chartWidth = width - 58;
  const chartHeight = 92;
  const max = Math.max(1, ...days.map((item) => item.count));
  const points = days.map((item, index) => {
    const pointX = chartX + (chartWidth / Math.max(1, days.length - 1)) * index;
    const pointY = chartY + chartHeight - (item.count / max) * chartHeight;
    return { ...item, x: pointX, y: pointY };
  });

  doc.lineWidth(0.6).strokeColor(PDF_THEME.line);
  for (let index = 0; index <= 3; index += 1) {
    const gridY = chartY + (chartHeight / 3) * index;
    doc.moveTo(chartX, gridY).lineTo(chartX + chartWidth, gridY).stroke();
  }

  if (points.length > 1) {
    doc.save()
      .fillColor(PDF_THEME.blue)
      .opacity(0.1)
      .moveTo(points[0].x, chartY + chartHeight)
      .lineTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => doc.lineTo(point.x, point.y));
    doc.lineTo(points[points.length - 1].x, chartY + chartHeight).closePath().fill().restore();

    doc.lineWidth(3).strokeColor(PDF_THEME.blue).moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => doc.lineTo(point.x, point.y));
    doc.stroke();
  }

  points.forEach((point) => {
    doc.circle(point.x, point.y, 4).fillAndStroke(PDF_THEME.goldSoft, PDF_THEME.gold);
    doc.font(pdfFontBold).fontSize(8.2).fillColor(PDF_THEME.navy).text(point.count.toLocaleString("th-TH"), point.x - 22, point.y - 17, {
      width: 44,
      align: "center",
      lineBreak: false,
    });
    doc.font(pdfFontRegular).fontSize(8).fillColor(PDF_THEME.muted).text(point.label, point.x - 26, chartY + chartHeight + 18, {
      width: 52,
      align: "center",
      lineBreak: false,
    });
  });

  const peak = days.reduce((best, item) => item.count > best.count ? item : best, days[0] ?? { label: "-", count: 0, date: "" });
  doc.font(pdfFontBold).fontSize(9.5).fillColor(PDF_THEME.navy).text(
    `สูงสุด ${peak.count.toLocaleString("th-TH")} ครั้ง (${peak.label})`,
    x + 18,
    y + height - 30,
    { width: width - 36, align: "right", lineBreak: false },
  );
}

function drawStatusPanel(
  doc: PDFKit.PDFDocument,
  submissions: SubmissionListItem[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  drawPanel(doc, x, y, width, height, "สถานะผลงาน", "นับตามสถานะล่าสุดในระบบรับสมัคร");
  const rows = buildStatusStats(submissions);
  const max = Math.max(1, ...rows.map((item) => item.count));
  let cursorY = y + 58;
  rows.forEach((item) => {
    const barWidth = width - 126;
    doc.font(pdfFontBold).fontSize(9.4).fillColor(PDF_THEME.text).text(item.label, x + 18, cursorY, {
      width: 86,
      lineBreak: false,
    });
    doc.roundedRect(x + 108, cursorY + 2, barWidth, 9, 5).fill("#e8eef7");
    doc.roundedRect(x + 108, cursorY + 2, Math.max(item.count ? 8 : 0, (item.count / max) * barWidth), 9, 5).fill(item.color);
    doc.font(pdfFontBold).fontSize(10).fillColor(PDF_THEME.navy).text(item.count.toLocaleString("th-TH"), x + width - 50, cursorY - 1, {
      width: 34,
      align: "right",
      lineBreak: false,
    });
    cursorY += 27;
  });
}

function drawRecentSubmissionsTable(
  doc: PDFKit.PDFDocument,
  submissions: SubmissionListItem[],
  x: number,
  y: number,
  width: number,
) {
  doc.font(pdfFontBold).fontSize(14).fillColor(PDF_THEME.navy).text("ผลงานที่ส่งมาแล้ว 10 รายการล่าสุด", x, y, {
    width,
    lineBreak: false,
  });
  y += 28;
  const columns = [74, 248, 96, 158, 126, 70];
  const headers = ["รหัส", "ชื่อผลงาน", "ประเภท", "ผู้สมัคร", "หน่วยงาน", "สถานะ"];
  drawTableRow(doc, headers, columns, x, y, 28, true);
  y += 28;

  if (!submissions.length) {
    doc.roundedRect(x, y, width, 48, 6).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(pdfFontRegular).fontSize(10).fillColor(PDF_THEME.muted).text("ยังไม่มีผลงานที่ส่งเข้าระบบ", x + 14, y + 16, {
      width: width - 28,
      align: "center",
      lineBreak: false,
    });
    return;
  }

  submissions.forEach((item, index) => {
    const values = [
      item.submission_code,
      item.title_th,
      item.submission_type === "team" ? `ทีม ${item.team_name || "-"}` : "ส่งเดี่ยว",
      `${item.first_name} ${item.last_name}`,
      compactOrg(item),
      statusLabel(item.status),
    ];
    drawTableRow(doc, values, columns, x, y, 30, false, index % 2 === 1);
    y += 30;
  });
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  values: string[],
  columns: number[],
  x: number,
  y: number,
  height: number,
  isHeader: boolean,
  shaded = false,
) {
  let cursorX = x;
  const background = isHeader ? PDF_THEME.navy : shaded ? "#f0f4fa" : PDF_THEME.white;
  doc.rect(x, y, columns.reduce((sum, item) => sum + item, 0), height).fill(background);
  doc.strokeColor(isHeader ? PDF_THEME.navy : PDF_THEME.line).lineWidth(0.5).rect(x, y, columns.reduce((sum, item) => sum + item, 0), height).stroke();
  values.forEach((value, index) => {
    doc.font(isHeader ? pdfFontBold : pdfFontRegular)
      .fontSize(isHeader ? 9 : 8.2)
      .fillColor(isHeader ? PDF_THEME.white : PDF_THEME.text)
      .text(clean(value), cursorX + 7, y + (isHeader ? 8 : 7), {
        width: columns[index] - 14,
        height: height - 10,
        ellipsis: true,
      });
    cursorX += columns[index];
  });
}

function drawPanel(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  subtitle: string,
) {
  doc.roundedRect(x, y, width, height, 10).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(pdfFontBold).fontSize(12.5).fillColor(PDF_THEME.navy).text(title, x + 18, y + 17, {
    width: width - 36,
    lineBreak: false,
  });
  doc.font(pdfFontRegular).fontSize(8.8).fillColor(PDF_THEME.muted).text(subtitle, x + 18, y + 35, {
    width: width - 36,
    lineBreak: false,
  });
}

function buildStatusStats(submissions: SubmissionListItem[]) {
  const labels: Record<string, { label: string; color: string }> = {
    submitted: { label: "ส่งแล้ว", color: PDF_THEME.blue },
    screening: { label: "กำลังตรวจ", color: PDF_THEME.gold },
    qualified: { label: "ผ่านเกณฑ์", color: PDF_THEME.green },
    rejected: { label: "ไม่ผ่านเกณฑ์", color: PDF_THEME.red },
    draft: { label: "ฉบับร่าง", color: PDF_THEME.muted },
  };
  const order = ["submitted", "screening", "qualified", "rejected", "draft"];
  const counts = submissions.reduce<Record<string, number>>((memo, item) => {
    memo[item.status] = (memo[item.status] ?? 0) + 1;
    return memo;
  }, {});
  return order.map((status) => ({
    label: labels[status].label,
    color: labels[status].color,
    count: counts[status] ?? 0,
  })).filter((item) => item.count > 0 || submissions.length === 0);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "ฉบับร่าง",
    submitted: "ส่งแล้ว",
    screening: "กำลังตรวจ",
    qualified: "ผ่านเกณฑ์",
    rejected: "ไม่ผ่านเกณฑ์",
  };
  return labels[status] ?? (status || "-");
}

function compactOrg(item: SubmissionListItem) {
  if (item.division && item.bureau) return `${item.division} / ${item.bureau}`;
  return item.division || item.bureau || "-";
}

function bangkokDayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
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
