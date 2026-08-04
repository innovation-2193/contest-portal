import PDFKitDocument from "pdfkit";
import { PDFDocument as PdfLibDocument } from "pdf-lib";
import {
  getSubmissionFile,
  type AdminSubmissionDetail,
} from "./admin-store";
import {
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
} from "./pdf-theme";
import { drawPdfLibIpWatermark, type PdfExportWatermark } from "./pdf-watermark";
import { progressScoreCriteria } from "./progress-review";
import {
  readSubmissionPdfFile,
  submissionDocumentTypes,
} from "./submission-file-reader";
import { formatApplicantName } from "./thai-rank-title";

const documentLabels: Record<string, string> = {
  ownership: "3.1 หลักฐานความเป็นเจ้าของผลงาน",
  concept: "3.2 แบบสรุปผลงานโดยย่อ",
  prototype: "3.3 หลักฐานต้นแบบหรือการทดลอง",
  implementation: "3.4 แผนต่อยอดใช้งานจริง",
};

const detailPageWidth = 595.28;
const detailPageHeight = 841.89;
const detailContentTop = 132;
const detailContentBottom = 782;

export type SubmissionPrintPacketOptions = {
  reviewerLabel?: string | null;
  watermark?: PdfExportWatermark | null;
  watermarkIp?: string | null;
  includeReview?: boolean;
};

export async function submissionPrintPacketPdf(submission: AdminSubmissionDetail, options: SubmissionPrintPacketOptions = {}) {
  const detailPdf = await submissionDetailPdf(submission, options);
  const merged = await PdfLibDocument.create();
  const missingAttachments: string[] = [];
  await appendPdf(merged, detailPdf);

  for (const type of submissionDocumentTypes) {
    const file = await getSubmissionFile(submission.submission_code, type);
    if (!file) {
      missingAttachments.push(documentLabels[type]);
      continue;
    }
    const bytes = await readSubmissionPdfFile(file);
    if (!bytes) {
      missingAttachments.push(`${documentLabels[type]} (${file.original_name})`);
      continue;
    }
    try {
      await appendPdf(merged, bytes);
    } catch {
      missingAttachments.push(`${documentLabels[type]} (${file.original_name})`);
    }
  }

  if (missingAttachments.length > 0) {
    await appendPdf(merged, await missingAttachmentSummaryPdf(submission, missingAttachments));
  }
  const watermark = options.watermark ?? options.watermarkIp;
  if (watermark) {
    await drawPdfLibIpWatermark(merged, watermark);
  }

  return Buffer.from(await merged.save());
}

async function appendPdf(target: PdfLibDocument, sourceBytes: Uint8Array | Buffer) {
  const source = await PdfLibDocument.load(sourceBytes, { ignoreEncryption: true });
  const pages = await target.copyPages(source, source.getPageIndices());
  pages.forEach((page) => target.addPage(page));
}

async function submissionDetailPdf(submission: AdminSubmissionDetail, options: SubmissionPrintPacketOptions) {
  const doc = new PDFKitDocument({ size: "A4", margin: 0 });
  const pdf = collectPdf(doc);
  const width = detailPageWidth;
  const height = detailPageHeight;
  let page = 1;
  const submittedAtLabel = `ยืนยันส่งประกวดเมื่อ ${formatPdfThaiDateTime(submission.submitted_at)}`;

  doc.info.Title = `ข้อมูลสมัครประกวด ${submission.submission_code}`;
  doc.info.Subject = "Police Innovation Contest 2026 submission print packet";
  doc.info.Author = "Police Innovation Contest 2026";

  const startPage = () => {
    doc.rect(0, 0, width, height).fill(PDF_THEME.paper);
    drawDocumentHeader(doc, {
      title: "ข้อมูลใบสมัครประกวดนวัตกรรม",
      subtitle: submittedAtLabel,
      metaLabel: "เลขที่สมัคร",
      metaValue: submission.submission_code,
    });
  };

  const footer = () => drawPacketFooter(doc, page, submission.submission_code);
  const nextPage = () => {
    footer();
    doc.addPage({ size: "A4", margin: 0 });
    page += 1;
    startPage();
    return detailContentTop;
  };
  const ensureRoom = (cursorY: number, neededHeight: number) => cursorY + neededHeight > detailContentBottom ? nextPage() : cursorY;

  startPage();
  let y = detailContentTop;
  y = drawSectionTitle(doc, "ข้อมูลผลงาน", y);
  const workInfoRows: Array<[string, string]> = [
    ["ชื่อผลงานภาษาไทย", submission.title_th],
    ["Innovation Title", submission.title_en || "-"],
    ["ประเภทการส่ง", submission.submission_type === "team" ? `ส่งแบบกลุ่ม${submission.team_name ? ` (${submission.team_name})` : ""}` : "ส่งเดี่ยว"],
    ["สถานะ", submission.status],
    ["บัญชีอีเมล", submission.email],
    ["Link Video", submission.video_url || "-"],
    ["Hashtag", submission.hashtags.map((tag) => `#${tag}`).join(" ") || "-"],
    ...(options.reviewerLabel ? [["แอดมินผู้ตรวจเอกสาร", options.reviewerLabel] as [string, string]] : []),
    ["คำอธิบายย่อ", submission.summary],
  ];
  y = drawInfoGrid(doc, workInfoRows, y, nextPage);

  if (options.includeReview !== false && hasReviewScore(submission)) {
    y += 4;
    y = ensureRoom(y, reviewScoreCardHeight());
    y = drawReviewScoreCard(doc, submission, options, y);
  }

  const reviewerComment = reviewCommentText(submission);
  if (options.includeReview !== false && reviewerComment) {
    const commentMeta = reviewCommentMeta(submission, options);
    y += 4;
    y = ensureRoom(y, reviewCommentCardHeight(doc, reviewerComment, commentMeta));
    y = drawReviewCommentCard(doc, submission, reviewerComment, commentMeta, y);
  }

  y += 6;
  y = ensureRoom(y, 34 + (submission.members[0] ? memberCardHeight(doc, submission.members[0]) : 0));
  y = drawSectionTitle(doc, "ข้อมูลผู้สมัครและสมาชิกทีม", y);
  for (const member of submission.members) {
    y = ensureRoom(y, memberCardHeight(doc, member));
    y = drawMemberCard(doc, member.member_order === 1 ? "ผู้สมัครหลัก" : `สมาชิกคนที่ ${member.member_order}`, member, y);
  }

  y += 4;
  y = ensureRoom(y, 34 + submissionDocumentTypes.length * 46);
  y = drawSectionTitle(doc, "ไฟล์แนบที่จะพิมพ์ต่อท้าย", y);
  for (const type of submissionDocumentTypes) {
    const file = submission.files.find((item) => item.document_type === type);
    y = ensureRoom(y, attachmentRowHeight(doc, documentLabels[type], file?.original_name ?? "-"));
    y = drawAttachmentRow(doc, documentLabels[type], file?.original_name ?? "-", y);
  }

  y = ensureRoom(y, 68);

  doc.roundedRect(34, y + 10, width - 68, 52, 8).fillAndStroke(PDF_THEME.goldSoft, "#e5cd70");
  doc.font(pdfFontBold).fontSize(11.5).fillColor(PDF_THEME.navy).text(
    "เอกสารนี้รวมหน้าข้อมูลใบสมัคร และแนบ PDF ทั้ง 4 รายการต่อท้ายในไฟล์เดียว",
    50,
    y + 28,
    { width: width - 100, align: "center", lineBreak: false },
  );

  footer();
  doc.end();
  return pdf;
}

async function missingAttachmentSummaryPdf(submission: AdminSubmissionDetail, missingAttachments: string[]) {
  const doc = new PDFKitDocument({ size: "A4", margin: 0 });
  const pdf = collectPdf(doc);
  const width = 595.28;

  doc.info.Title = `รายการไฟล์แนบไม่พร้อม ${submission.submission_code}`;
  doc.rect(0, 0, width, 841.89).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "สรุปไฟล์แนบที่ไม่พร้อมพิมพ์",
    subtitle: `ยืนยันส่งประกวดเมื่อ ${formatPdfThaiDateTime(submission.submitted_at)}`,
    metaLabel: "เลขที่สมัคร",
    metaValue: submission.submission_code,
  });

  let y = 140;
  doc.roundedRect(34, y, width - 68, 78, 9).fillAndStroke(PDF_THEME.goldSoft, "#e5cd70");
  doc.font(pdfFontBold).fontSize(13).fillColor(PDF_THEME.navy).text(
    "ระบบสร้างไฟล์ข้อมูลผู้สมัครให้แล้ว แต่ไฟล์แนบบางรายการไม่พร้อมรวมใน PDF",
    52,
    y + 18,
    { width: width - 104, lineGap: 3 },
  );
  doc.font(pdfFontRegular).fontSize(10).fillColor(PDF_THEME.text).text(
    "ทีมงานสามารถตรวจสอบหรืออัปโหลดไฟล์แนบใหม่จากหน้ารายละเอียดใบสมัคร",
    52,
    y + 52,
    { width: width - 104 },
  );

  y += 108;
  y = drawSectionTitle(doc, "รายการที่ไม่พร้อม", y);
  missingAttachments.forEach((label, index) => {
    doc.font(pdfFontRegular).fontSize(10.5);
    const rowHeight = Math.max(38, 18 + doc.heightOfString(label, { width: width - 136, lineGap: 1 }));
    doc.roundedRect(34, y, width - 68, rowHeight, 7).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(pdfFontBold).fontSize(10).fillColor(PDF_THEME.gold).text(String(index + 1).padStart(2, "0"), 48, y + 13, {
      width: 34,
      lineBreak: false,
    });
    doc.font(pdfFontRegular).fontSize(10.5).fillColor(PDF_THEME.text).text(label, 88, y + 12, {
      width: width - 136,
      lineGap: 1,
    });
    y += rowHeight + 6;
  });

  drawPacketFooter(doc, 1, submission.submission_code);
  doc.end();
  return pdf;
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, y: number) {
  doc.font(pdfFontBold).fontSize(14).fillColor(PDF_THEME.navy).text(title, 34, y, {
    width: 527,
    lineBreak: false,
  });
  doc.moveTo(34, y + 22).lineTo(561, y + 22).lineWidth(0.8).stroke(PDF_THEME.line);
  return y + 34;
}

function drawInfoGrid(doc: PDFKit.PDFDocument, rows: Array<[string, string]>, y: number, nextPage: () => number) {
  const x = 34;
  const gap = 8;
  const cellWidth = (527 - gap) / 2;
  let cursorY = y;
  const regularRows = rows.slice(0, -1);
  for (let index = 0; index < regularRows.length; index += 2) {
    const leftHeight = infoCellHeight(doc, regularRows[index][1], cellWidth);
    const rightHeight = regularRows[index + 1] ? infoCellHeight(doc, regularRows[index + 1][1], cellWidth) : 50;
    const rowHeight = Math.max(leftHeight, rightHeight);
    if (cursorY + rowHeight > detailContentBottom) cursorY = nextPage();
    drawInfoCell(doc, regularRows[index][0], regularRows[index][1], x, cursorY, cellWidth, rowHeight);
    if (regularRows[index + 1]) {
      drawInfoCell(doc, regularRows[index + 1][0], regularRows[index + 1][1], x + cellWidth + gap, cursorY, cellWidth, rowHeight);
    }
    cursorY += rowHeight + 8;
  }

  const [wideLabel, wideValue] = rows[rows.length - 1];
  const wideHeight = infoCellHeight(doc, wideValue, 527);
  if (cursorY + wideHeight > detailContentBottom) cursorY = nextPage();
  drawInfoCell(doc, wideLabel, wideValue, x, cursorY, 527, wideHeight);
  return cursorY + wideHeight + 10;
}

function infoCellHeight(doc: PDFKit.PDFDocument, value: string, width: number) {
  doc.font(pdfFontRegular).fontSize(10.5);
  const valueHeight = doc.heightOfString(clean(value), { width: width - 22, lineGap: 1 });
  return Math.max(50, 25 + valueHeight + 13);
}

function drawInfoCell(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number, height: number) {
  doc.roundedRect(x, y, width, height, 7).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(pdfFontBold).fontSize(8.5).fillColor(PDF_THEME.gold).text(label, x + 11, y + 9, {
    width: width - 22,
    lineBreak: false,
  });
  doc.font(pdfFontRegular).fontSize(10.5).fillColor(PDF_THEME.text).text(clean(value), x + 11, y + 25, {
    width: width - 22,
    lineGap: 1,
  });
}

function reviewCommentText(submission: AdminSubmissionDetail) {
  const note = submission.review_note?.trim();
  if (!submission.review_submitted_at || !note) return null;
  return note;
}

function hasReviewScore(submission: AdminSubmissionDetail) {
  return typeof submission.review_total_score === "number";
}

function reviewerLabelForComment(submission: AdminSubmissionDetail, options: SubmissionPrintPacketOptions) {
  return options.reviewerLabel
    || submission.review_scored_by_email
    || submission.review_assigned_admin_email
    || "-";
}

function reviewCommentMeta(submission: AdminSubmissionDetail, options: SubmissionPrintPacketOptions) {
  const submittedAt = submission.review_submitted_at ? formatPdfThaiDateTime(submission.review_submitted_at) : "-";
  return `ผู้ตรวจเอกสาร ${reviewerLabelForComment(submission, options)} • ส่งคะแนนเมื่อ ${submittedAt}`;
}

function reviewScoreCardHeight() {
  return 228;
}

function drawReviewScoreCard(
  doc: PDFKit.PDFDocument,
  submission: AdminSubmissionDetail,
  options: SubmissionPrintPacketOptions,
  y: number,
) {
  const x = 34;
  const width = 527;
  const height = reviewScoreCardHeight();
  const totalScore = submission.review_total_score ?? 0;
  const submittedAt = submission.review_submitted_at ? formatPdfThaiDateTime(submission.review_submitted_at) : "-";
  const meta = `ผู้ตรวจเอกสาร ${reviewerLabelForComment(submission, options)} • ส่งคะแนนเมื่อ ${submittedAt}`;
  const rowX = x + 16;
  const rowWidth = width - 32;
  const rowTop = y + 68;
  const rowHeight = 25;
  const barWidth = 138;
  const noteY = rowTop + progressScoreCriteria.length * rowHeight + 8;

  doc.roundedRect(x, y, width, height, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.rect(x, y, width, 5).fill(PDF_THEME.gold);
  doc.font(pdfFontBold).fontSize(13).fillColor(PDF_THEME.navy).text("คะแนนจากผู้ตรวจเอกสาร", x + 16, y + 18, {
    width: 240,
    lineBreak: false,
  });
  doc.font(pdfFontBold).fontSize(20).fillColor(PDF_THEME.gold).text(`${totalScore}/100`, x + width - 130, y + 15, {
    width: 112,
    align: "right",
    lineBreak: false,
  });
  doc.font(pdfFontRegular).fontSize(8.8).fillColor(PDF_THEME.muted).text(clean(meta), x + 16, y + 40, {
    width: width - 32,
    lineBreak: false,
  });

  progressScoreCriteria.forEach((criterion, index) => {
    const score = submission[criterion.key];
    const value = typeof score === "number" ? score : null;
    const cursorY = rowTop + index * rowHeight;
    const scoreText = `${value ?? "-"} / ${criterion.max}`;
    const progress = value === null ? 0 : clampPercent(value, criterion.max);

    doc.roundedRect(rowX, cursorY, rowWidth, 20, 5).fill(index % 2 === 0 ? "#f8fafc" : "#eef4fb");
    doc.font(pdfFontBold).fontSize(8.9).fillColor(PDF_THEME.text).text(criterion.label, rowX + 10, cursorY + 6, {
      width: 190,
      lineBreak: false,
    });
    doc.font(pdfFontBold).fontSize(9.3).fillColor(PDF_THEME.navy).text(scoreText, rowX + 214, cursorY + 6, {
      width: 62,
      align: "right",
      lineBreak: false,
    });
    doc.roundedRect(rowX + 292, cursorY + 7, barWidth, 7, 4).fill("#dde8f4");
    doc.roundedRect(rowX + 292, cursorY + 7, Math.max(progress ? 5 : 0, progress * barWidth), 7, 4).fill(PDF_THEME.gold);
    doc.font(pdfFontRegular).fontSize(7.6).fillColor(PDF_THEME.muted).text(`${Math.round(progress * 100)}%`, rowX + 440, cursorY + 5.5, {
      width: 44,
      align: "right",
      lineBreak: false,
    });
  });

  doc.font(pdfFontRegular).fontSize(8).fillColor(PDF_THEME.muted).text(
    "คะแนนรวมคำนวณจากคะแนนรายด้าน 5 เกณฑ์ตามแบบฟอร์ม Paper Screening ที่บันทึกในระบบ",
    x + 16,
    noteY,
    { width: width - 32, lineBreak: false },
  );

  return y + height + 10;
}

function reviewCommentCardHeight(doc: PDFKit.PDFDocument, comment: string, meta: string) {
  const outerPaddingX = 22;
  const commentInnerPaddingX = 18;
  const metaTop = 42;
  const commentGap = 16;
  const bottomPadding = 22;
  doc.font(pdfFontRegular).fontSize(8.8);
  const metaHeight = doc.heightOfString(clean(meta), { width: 527 - outerPaddingX * 2, lineGap: 1 });
  doc.font(pdfFontRegular).fontSize(10);
  const commentHeight = doc.heightOfString(clean(comment), { width: 527 - outerPaddingX * 2 - commentInnerPaddingX * 2, lineGap: 2 });
  return Math.max(116, metaTop + metaHeight + commentGap + Math.max(52, commentHeight + 32) + bottomPadding);
}

function drawReviewCommentCard(
  doc: PDFKit.PDFDocument,
  submission: AdminSubmissionDetail,
  comment: string,
  meta: string,
  y: number,
) {
  const x = 34;
  const width = 527;
  const height = reviewCommentCardHeight(doc, comment, meta);
  const outerPaddingX = 22;
  const commentInnerPaddingX = 18;
  const metaTop = 42;
  const commentGap = 16;
  const scoreLabel = typeof submission.review_total_score === "number"
    ? `คะแนนรวม ${submission.review_total_score}/100`
    : "คะแนนรวม -/100";
  doc.font(pdfFontRegular).fontSize(8.8);
  const metaHeight = doc.heightOfString(clean(meta), { width: width - outerPaddingX * 2, lineGap: 1 });
  doc.font(pdfFontRegular).fontSize(10);
  const commentTextWidth = width - outerPaddingX * 2 - commentInnerPaddingX * 2;
  const commentHeight = doc.heightOfString(clean(comment), { width: commentTextWidth, lineGap: 2 });
  const commentBoxX = x + outerPaddingX;
  const commentBoxWidth = width - outerPaddingX * 2;
  const commentBoxY = y + metaTop + metaHeight + commentGap;
  const commentBoxHeight = Math.max(52, 32 + commentHeight);

  doc.roundedRect(x, y, width, height, 8).fillAndStroke(PDF_THEME.goldSoft, "#e5cd70");
  doc.font(pdfFontBold).fontSize(12.5).fillColor(PDF_THEME.navy).text("Comments ของผู้ตรวจเอกสาร", x + outerPaddingX, y + 18, {
    width: 240,
    lineBreak: false,
  });
  doc.font(pdfFontBold).fontSize(9.2).fillColor(PDF_THEME.gold).text(scoreLabel, x + width - outerPaddingX - 134, y + 20, {
    width: 134,
    align: "right",
    lineBreak: false,
  });
  doc.font(pdfFontRegular).fontSize(8.8).fillColor(PDF_THEME.muted).text(clean(meta), x + outerPaddingX, y + metaTop, {
    width: width - outerPaddingX * 2,
    lineGap: 1,
  });
  doc.roundedRect(commentBoxX, commentBoxY, commentBoxWidth, commentBoxHeight, 7).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(pdfFontRegular).fontSize(10).fillColor(PDF_THEME.text).text(clean(comment), commentBoxX + commentInnerPaddingX, commentBoxY + 16, {
    width: commentTextWidth,
    lineGap: 2,
  });

  return y + height + 10;
}

function memberCardHeight(doc: PDFKit.PDFDocument, member: AdminSubmissionDetail["members"][number]) {
  const nameWidth = 527 - 146;
  doc.font(pdfFontBold).fontSize(14);
  const nameHeight = doc.heightOfString(formatApplicantName(member), { width: nameWidth, lineGap: 1 });
  const details = memberDetails(member);
  const detailWidth = (527 - 146 - 12) / 2;
  const detailRows = chunkPairs(details).map((pair) => Math.max(...pair.map(([, value]) => tinyDetailHeight(doc, value, detailWidth))));
  return Math.max(108, 18 + Math.max(24, nameHeight) + 14 + detailRows.reduce((sum, item) => sum + item + 8, 0) + 8);
}

function drawMemberCard(
  doc: PDFKit.PDFDocument,
  title: string,
  member: AdminSubmissionDetail["members"][number],
  y: number,
) {
  const x = 34;
  const width = 527;
  const height = memberCardHeight(doc, member);
  doc.roundedRect(x, y, width, height, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.roundedRect(x + 12, y + 12, 98, 24, 12).fill(PDF_THEME.paleBlue);
  doc.font(pdfFontBold).fontSize(9).fillColor(PDF_THEME.navy).text(title, x + 22, y + 20, {
    width: 78,
    align: "center",
    lineBreak: false,
  });
  doc.font(pdfFontBold).fontSize(14).fillColor(PDF_THEME.navy).text(
    formatApplicantName(member),
    x + 124,
    y + 14,
    { width: width - 146, lineGap: 1 },
  );

  const detailWidth = (width - 146 - 12) / 2;
  let cursorY = y + 50;
  for (const pair of chunkPairs(memberDetails(member))) {
    const rowHeight = Math.max(...pair.map(([, value]) => tinyDetailHeight(doc, value, detailWidth)));
    pair.forEach(([label, value], index) => {
      drawTinyDetail(doc, label, value, x + 124 + index * (detailWidth + 12), cursorY, detailWidth);
    });
    cursorY += rowHeight + 8;
  }
  return y + height + 10;
}

function memberDetails(member: AdminSubmissionDetail["members"][number]): Array<[string, string]> {
  return [
    ["อีเมล", member.email],
    ["โทร", member.phone],
    ["เลขบัตรประชาชน", member.citizen_id],
    ["ตำแหน่ง", member.position],
    ["กองบังคับการ", member.division],
    ["กองบัญชาการ", member.bureau],
  ];
}

function chunkPairs<T>(items: T[]) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += 2) chunks.push(items.slice(index, index + 2));
  return chunks;
}

function tinyDetailHeight(doc: PDFKit.PDFDocument, value: string, width: number) {
  doc.font(pdfFontRegular).fontSize(8.8);
  return 11 + doc.heightOfString(clean(value), { width, lineGap: 1 });
}

function drawTinyDetail(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number) {
  doc.font(pdfFontBold).fontSize(7.5).fillColor(PDF_THEME.muted).text(label, x, y, {
    width,
    lineBreak: false,
  });
  doc.font(pdfFontRegular).fontSize(8.8).fillColor(PDF_THEME.text).text(clean(value), x, y + 11, {
    width,
    lineGap: 1,
  });
}

function attachmentRowHeight(doc: PDFKit.PDFDocument, label: string, filename: string) {
  doc.font(pdfFontBold).fontSize(9.5);
  const labelHeight = doc.heightOfString(label, { width: 214 });
  doc.font(pdfFontRegular).fontSize(9);
  const filenameHeight = doc.heightOfString(filename, { width: 276, lineGap: 1 });
  return Math.max(34, 12 + Math.max(labelHeight, filenameHeight) + 12);
}

function drawAttachmentRow(doc: PDFKit.PDFDocument, label: string, filename: string, y: number) {
  const height = attachmentRowHeight(doc, label, filename);
  doc.roundedRect(34, y, 527, height, 6).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(pdfFontBold).fontSize(9.5).fillColor(PDF_THEME.navy).text(label, 46, y + 11, {
    width: 214,
  });
  doc.font(pdfFontRegular).fontSize(9).fillColor(PDF_THEME.muted).text(filename, 270, y + 11, {
    width: 276,
    lineGap: 1,
  });
  return y + height + 6;
}

function drawPacketFooter(doc: PDFKit.PDFDocument, pageNumber: number, reference: string) {
  const margin = 30;
  const y = doc.page.height - 30;
  doc.moveTo(margin, y - 9).lineTo(doc.page.width - margin, y - 9).lineWidth(0.7).stroke(PDF_THEME.line);
  doc.font(pdfFontRegular).fontSize(8).fillColor(PDF_THEME.muted).text(
    "เอกสารจากระบบ Police Innovation Contest 2026",
    margin,
    y,
    { width: 260, lineBreak: false },
  );
  doc.text(`หน้าข้อมูล ${pageNumber} • ${reference}`, doc.page.width - 260 - margin, y, {
    width: 260,
    align: "right",
    lineBreak: false,
  });
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim() || "-";
}

function clampPercent(value: number, max: number) {
  if (!max) return 0;
  return Math.min(1, Math.max(0, value / max));
}

function collectPdf(doc: PDFKit.PDFDocument) {
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
