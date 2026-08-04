import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import PDFKitDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../lib/admin-api-response";
import { getSubmissionDetail, listSubmissions, type AdminSubmissionDetail } from "../../../../../lib/admin-store";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
  type PdfFontSet,
} from "../../../../../lib/pdf-theme";
import { sortScoreboardSubmissions } from "../../../../../lib/scoreboard-ranking";
import { formatApplicantName } from "../../../../../lib/thai-rank-title";

export const runtime = "nodejs";

const fonts: PdfFontSet = {
  regular: pdfFontRegular,
  bold: pdfFontBold,
};

const pageWidth = 595.28;
const pageHeight = 841.89;
const contentTop = 132;
const contentBottom = 784;
const marginX = 34;
const contentWidth = 527;
const infoLabelWidth = 154;
const infoValueX = marginX + 180;
const infoValueWidth = contentWidth - 198;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) return adminUnauthorizedResponse(request);

  const submissions = await listSubmissions({ assignedAdminEmail: session.role === "super_admin" ? null : session.email });
  const topSubmissions = sortScoreboardSubmissions(submissions).slice(0, 10);
  const details = (await Promise.all(topSubmissions.map((item) => getSubmissionDetail(item.submission_code))))
    .filter((item): item is AdminSubmissionDetail => Boolean(item));

  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "submission.scoreboard_top10_pdf",
    entityType: "submission",
    summary: "Export ผู้ส่งผลงานประกวด 10 อันดับจาก Score Board",
    payload: { count: details.length, submissionCodes: details.map((item) => item.submission_code) },
  }, request.headers);

  const pdf = await topTenScoreboardPdf(details);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="scoreboard-top-10-applicants-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function topTenScoreboardPdf(submissions: AdminSubmissionDetail[]) {
  const doc = new PDFKitDocument({ size: "A4", margin: 0, bufferPages: true });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();

  drawCoverPage(doc, submissions, generatedAt);
  submissions.forEach((submission, index) => {
    doc.addPage({ size: "A4", margin: 0 });
    drawSubmissionPages(doc, submission, index + 1, generatedAt);
  });

  const range = doc.bufferedPageRange();
  for (let pageIndex = 0; pageIndex < range.count; pageIndex += 1) {
    doc.switchToPage(range.start + pageIndex);
    drawDocumentFooter(doc, pageIndex + 1, range.count, "Top 10 Score Board", fonts);
  }

  doc.info.Title = "Police Innovation Contest 2026 Top 10 applicants";
  doc.info.Subject = "Top 10 Score Board รอบแรก";
  doc.info.Author = "Police Innovation Contest 2026";
  doc.end();
  return pdf;
}

function drawCoverPage(doc: PDFKit.PDFDocument, submissions: AdminSubmissionDetail[], generatedAt: Date) {
  paintPage(doc);
  drawDocumentHeader(doc, {
    title: "ผู้ส่งผลงานประกวด 10 อันดับ",
    subtitle: `Score Board รอบแรก • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "จำนวนรายการ",
    metaValue: `${submissions.length}/10`,
    fonts,
  });

  const introTitle = "ไฟล์นี้รวมข้อมูลผู้ส่งผลงานประกวดที่ได้คะแนน Paper Screening สูงสุด 10 อันดับแรก";
  const introBody = "แต่ละรายการคั่นด้วยเลขอันดับชัดเจน พร้อมข้อมูลผลงาน ผู้สมัคร สมาชิกทีม และคะแนน เพื่อใช้ประกอบการพิจารณาของกรรมการชุดถัดไป";
  const introTitleHeight = textHeight(doc, introTitle, 491, fonts.bold, 15, 3);
  const introBodyHeight = textHeight(doc, introBody, 491, fonts.regular, 10.5, 2);
  const introY = 138;
  const introHeight = Math.max(102, 36 + introTitleHeight + 12 + introBodyHeight + 24);
  doc.roundedRect(34, introY, 527, introHeight, 10).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(15).fillColor(PDF_THEME.navy).text(introTitle, 52, introY + 22, {
    width: 491,
    lineGap: 3,
  });
  doc.font(fonts.regular).fontSize(10.5).fillColor(PDF_THEME.text).text(introBody, 52, introY + 22 + introTitleHeight + 12, {
    width: 491,
    lineGap: 2,
  });

  let y = introY + introHeight + 30;
  if (!submissions.length) {
    doc.roundedRect(34, y, 527, 64, 8).fillAndStroke(PDF_THEME.goldSoft, "#e5cd70");
    doc.font(fonts.bold).fontSize(13).fillColor(PDF_THEME.navy).text("ยังไม่มีคะแนนที่ส่งเข้ามา", 52, y + 22, {
      width: 491,
      align: "center",
      lineBreak: false,
    });
    return;
  }

  submissions.forEach((submission, index) => {
    const height = Math.max(48, 18 + doc.font(fonts.bold).fontSize(10.8).heightOfString(clean(submission.title_th), { width: 330, lineGap: 1 }));
    if (y + height > contentBottom) {
      doc.addPage({ size: "A4", margin: 0 });
      paintPage(doc);
      drawDocumentHeader(doc, {
        title: "สารบัญผู้ส่งผลงาน Top 10 (ต่อ)",
        subtitle: `Score Board รอบแรก • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
        metaLabel: "จำนวนรายการ",
        metaValue: `${submissions.length}/10`,
        fonts,
      });
      y = contentTop;
    }
    doc.roundedRect(34, y, 527, height, 8).fillAndStroke(index % 2 === 0 ? PDF_THEME.white : PDF_THEME.paleBlue, PDF_THEME.line);
    doc.roundedRect(48, y + 12, 42, 24, 12).fill(index < 3 ? PDF_THEME.gold : PDF_THEME.navyLight);
    doc.font(fonts.bold).fontSize(10).fillColor(index < 3 ? PDF_THEME.navy : PDF_THEME.goldSoft).text(`#${index + 1}`, 48, y + 19, {
      width: 42,
      align: "center",
      lineBreak: false,
    });
    doc.font(fonts.bold).fontSize(10.8).fillColor(PDF_THEME.navy).text(clean(submission.title_th), 104, y + 11, {
      width: 330,
      lineGap: 1,
    });
    doc.font(fonts.regular).fontSize(8.7).fillColor(PDF_THEME.muted).text(
      `${submission.submission_code} • ${ownerName(submission)}`,
      104,
      y + height - 18,
      { width: 330, lineBreak: false },
    );
    doc.font(fonts.bold).fontSize(14).fillColor(PDF_THEME.navy).text(`${submission.review_total_score ?? "-"}/100`, 454, y + 17, {
      width: 78,
      align: "right",
      lineBreak: false,
    });
    y += height + 7;
  });
}

function drawSubmissionPages(doc: PDFKit.PDFDocument, submission: AdminSubmissionDetail, rank: number, generatedAt: Date) {
  let y = startSubmissionPage(doc, submission, rank, generatedAt);
  const ensureRoom = (needed: number) => {
    if (y + needed <= contentBottom) return;
    doc.addPage({ size: "A4", margin: 0 });
    y = startSubmissionPage(doc, submission, rank, generatedAt, true);
  };

  const titleHeight = Math.max(84, 42 + textHeight(doc, clean(submission.title_th), 365, fonts.bold, 17));
  ensureRoom(titleHeight);
  doc.roundedRect(marginX, y, contentWidth, titleHeight, 10).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.roundedRect(marginX + 14, y + 15, 72, 36, 18).fill(rank <= 3 ? PDF_THEME.gold : PDF_THEME.navyLight);
  doc.font(fonts.bold).fontSize(14).fillColor(rank <= 3 ? PDF_THEME.navy : PDF_THEME.goldSoft).text(`อันดับ ${rank}`, marginX + 14, y + 25, {
    width: 72,
    align: "center",
    lineBreak: false,
  });
  doc.font(fonts.bold).fontSize(17).fillColor(PDF_THEME.navy).text(clean(submission.title_th), marginX + 104, y + 17, {
    width: 365,
    lineGap: 1,
  });
  doc.font(fonts.bold).fontSize(18).fillColor(PDF_THEME.gold).text(`${submission.review_total_score ?? "-"}`, marginX + 472, y + 21, {
    width: 42,
    align: "right",
    lineBreak: false,
  });
  doc.font(fonts.regular).fontSize(8.5).fillColor(PDF_THEME.muted).text("คะแนน", marginX + 472, y + 47, {
    width: 42,
    align: "right",
    lineBreak: false,
  });
  y += titleHeight + 12;

  y = drawSection(doc, "ข้อมูลผลงาน", y);
  for (const [label, value] of submissionInfoRows(submission)) {
    const height = infoRowHeight(doc, label, value);
    ensureRoom(height + 7);
    y = drawInfoRow(doc, label, value, y);
  }

  y += 5;
  ensureRoom(34);
  y = drawSection(doc, "คะแนนรอบแรก", y);
  for (const [label, value] of scoreRows(submission)) {
    const height = infoRowHeight(doc, label, value);
    ensureRoom(height + 7);
    y = drawInfoRow(doc, label, value, y);
  }

  y += 5;
  ensureRoom(34);
  y = drawSection(doc, "ข้อมูลผู้ส่งผลงานและสมาชิกทีม", y);
  for (const member of submission.members) {
    const height = memberCardHeight(doc, member);
    ensureRoom(height + 8);
    y = drawMemberCard(doc, member.member_order === 1 ? "ผู้สมัครหลัก" : `สมาชิกคนที่ ${member.member_order}`, member, y);
  }
}

function startSubmissionPage(
  doc: PDFKit.PDFDocument,
  submission: AdminSubmissionDetail,
  rank: number,
  generatedAt: Date,
  continuation = false,
) {
  paintPage(doc);
  drawDocumentHeader(doc, {
    title: continuation ? `อันดับ ${rank} (ต่อ)` : `อันดับ ${rank}: ข้อมูลผู้ส่งผลงาน`,
    subtitle: `${submission.submission_code} • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "คะแนนรวม",
    metaValue: `${submission.review_total_score ?? "-"}/100`,
    fonts,
  });
  return contentTop;
}

function paintPage(doc: PDFKit.PDFDocument) {
  doc.rect(0, 0, pageWidth, pageHeight).fill(PDF_THEME.paper);
}

function drawSection(doc: PDFKit.PDFDocument, title: string, y: number) {
  doc.font(fonts.bold).fontSize(13).fillColor(PDF_THEME.navy).text(title, marginX, y, {
    width: contentWidth,
    lineBreak: false,
  });
  doc.moveTo(marginX, y + 21).lineTo(marginX + contentWidth, y + 21).lineWidth(0.8).stroke(PDF_THEME.line);
  return y + 32;
}

function drawInfoRow(doc: PDFKit.PDFDocument, label: string, value: string, y: number) {
  const height = infoRowHeight(doc, label, value);
  doc.roundedRect(marginX, y, contentWidth, height, 7).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(8.5).fillColor(PDF_THEME.gold).text(label, marginX + 12, y + 10, {
    width: infoLabelWidth,
    lineGap: 1,
  });
  doc.font(fonts.regular).fontSize(10.2).fillColor(PDF_THEME.text).text(clean(value), infoValueX, y + 9, {
    width: infoValueWidth,
    lineGap: 1.3,
  });
  return y + height + 7;
}

function infoRowHeight(doc: PDFKit.PDFDocument, label: string, value: string) {
  return Math.max(
    38,
    18 + Math.max(
      textHeight(doc, label, infoLabelWidth, fonts.bold, 8.5, 1),
      textHeight(doc, clean(value), infoValueWidth, fonts.regular, 10.2, 1.3),
    ),
  );
}

function submissionInfoRows(submission: AdminSubmissionDetail): Array<[string, string]> {
  return [
    ["รหัสใบสมัคร", submission.submission_code],
    ["ชื่ออังกฤษ", submission.title_en || "-"],
    ["ประเภทการส่ง", submission.submission_type === "team" ? `ส่งแบบกลุ่ม${submission.team_name ? ` (${submission.team_name})` : ""}` : "ส่งเดี่ยว"],
    ["บัญชีอีเมล", submission.email],
    ["ผู้ส่งหลัก", ownerName(submission)],
    ["หน่วยงานหลัก", [submission.division, submission.bureau].filter(Boolean).join(" / ") || "-"],
    ["Link Video", submission.video_url || "-"],
    ["Hashtag", submission.hashtags.map((tag) => `#${tag}`).join(" ") || "-"],
    ["คำอธิบายย่อ", submission.summary],
  ];
}

function scoreRows(submission: AdminSubmissionDetail): Array<[string, string]> {
  return [
    ["ความเป็นผลงานของตำรวจ", `${submission.review_rules_score ?? "-"} / 20`],
    ["ปัญหาและความจำเป็น", `${submission.review_problem_score ?? "-"} / 15`],
    ["แนวคิดหรือรูปแบบนวัตกรรม", `${submission.review_innovation_score ?? "-"} / 25`],
    ["หลักฐานผลลัพธ์เบื้องต้น", `${submission.review_evidence_score ?? "-"} / 20`],
    ["ความคุ้มค่าและการขยายผล", `${submission.review_impact_score ?? "-"} / 20`],
    ["ผู้ตรวจเอกสาร", submission.review_assigned_admin_email || submission.review_scored_by_email || "-"],
    ["หมายเหตุการตรวจ", submission.review_note || "-"],
  ];
}

function memberCardHeight(doc: PDFKit.PDFDocument, member: AdminSubmissionDetail["members"][number]) {
  const details = memberRows(member);
  const nameHeight = textHeight(doc, formatApplicantName(member), 354, fonts.bold, 13.2, 1);
  const detailHeight = details.reduce((sum, [, value]) => sum + Math.max(16, textHeight(doc, value, 254, fonts.regular, 8.8, 1) + 8), 0);
  return Math.max(92, 42 + nameHeight + detailHeight);
}

function drawMemberCard(doc: PDFKit.PDFDocument, title: string, member: AdminSubmissionDetail["members"][number], y: number) {
  const height = memberCardHeight(doc, member);
  doc.roundedRect(marginX, y, contentWidth, height, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.roundedRect(marginX + 12, y + 12, 92, 24, 12).fill(PDF_THEME.paleBlue);
  doc.font(fonts.bold).fontSize(8.8).fillColor(PDF_THEME.navy).text(title, marginX + 20, y + 20, {
    width: 76,
    align: "center",
    lineBreak: false,
  });
  doc.font(fonts.bold).fontSize(13.2).fillColor(PDF_THEME.navy).text(
    formatApplicantName(member),
    marginX + 124,
    y + 13,
    { width: 354, lineGap: 1 },
  );
  let cursorY = y + 45;
  for (const [label, value] of memberRows(member)) {
    const rowHeight = Math.max(16, textHeight(doc, value, 254, fonts.regular, 8.8, 1) + 8);
    doc.font(fonts.bold).fontSize(7.5).fillColor(PDF_THEME.muted).text(label, marginX + 124, cursorY + 2, {
      width: 84,
      lineBreak: false,
    });
    doc.font(fonts.regular).fontSize(8.8).fillColor(PDF_THEME.text).text(clean(value), marginX + 214, cursorY + 1, {
      width: 254,
      lineGap: 1,
    });
    cursorY += rowHeight;
  }
  return y + height + 8;
}

function memberRows(member: AdminSubmissionDetail["members"][number]): Array<[string, string]> {
  return [
    ["อีเมล", member.email],
    ["โทร", member.phone],
    ["เลขบัตร", member.citizen_id],
    ["ตำแหน่ง", member.position],
    ["กองบังคับการ", member.division],
    ["กองบัญชาการ", member.bureau],
  ];
}

function ownerName(submission: AdminSubmissionDetail) {
  return formatApplicantName(submission);
}

function textHeight(doc: PDFKit.PDFDocument, value: string, width: number, font: string, size: number, lineGap = 1) {
  doc.font(font).fontSize(size);
  return doc.heightOfString(clean(value), { width, lineGap });
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
