import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../lib/admin-api-response";
import { listSubmissions, type SubmissionListItem } from "../../../../../lib/admin-store";
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
import { createZip, type ZipEntry } from "../../../../../lib/zip";
import { workCategoryLabel } from "../../../../../lib/work-categories";

export const runtime = "nodejs";

const fonts: PdfFontSet = {
  regular: pdfFontRegular,
  bold: pdfFontBold,
};

type CommitteeSignatory = {
  order: number;
  rank: string;
  name: string;
  unit: string;
  role: string;
  fileLabel: string;
};

const committeeSignatories: CommitteeSignatory[] = [
  { order: 1, rank: "พล.ต.ท.", name: "ไพบูลย์ น้อยหุ่น", unit: "ผบช.สทส.", role: "ประธานกรรมการ", fileLabel: "01-Paiboon-Noihun" },
  { order: 2, rank: "พล.ต.ต.", name: "ฐากูร นิ่มสมบุญ", unit: "รอง ผบช.สทส.", role: "รองประธานกรรมการ", fileLabel: "02-Thakoon-Nimsomboon" },
  { order: 3, rank: "พล.ต.ต.", name: "กิตติศัพท์ ทองศรีวงศ์", unit: "ผบก.สส.", role: "กรรมการ", fileLabel: "03-Kittisap-Thongsriwong" },
  { order: 4, rank: "พล.ต.ต.", name: "ไพโรจน์ หมื่นกล้าหาญ", unit: "ผบก.ศทก.", role: "กรรมการ", fileLabel: "04-Pairoj-Muenklaharn" },
  { order: 5, rank: "พล.ต.ต.", name: "กัมพล ลีลาประภาภรณ์", unit: "ผบก.สสท.", role: "กรรมการและเลขานุการ", fileLabel: "05-Kampon-Leelaprapaporn" },
];

const scoreGroups = [
  {
    no: "1",
    title: "ความเป็นผลงานของตำรวจ",
    max: 20,
    color: "#e8f6ee",
    items: [
      ["1.1", "ที่มาและแรงบันดาลใจของผลงาน", 6],
      ["1.2", "สายงานที่รองรับ / หน่วยงานรับผิดชอบ", 2],
      ["1.3", "สอดคล้องกับหน้าที่และความรับผิดชอบของหน่วยงานในสังกัด สตช.", 6],
      ["1.4", "หลักฐานความเป็นเจ้าของผลงาน เช่น ผู้เกี่ยวข้อง ใบรับรอง สิทธิบัตร", 6],
    ],
  },
  {
    no: "2",
    title: "ปัญหาและความจำเป็น",
    max: 15,
    color: "#edf4fb",
    items: [
      ["2.1", "ปัญหาและอุปสรรคที่พบ", 5],
      ["2.2", "กลุ่มเป้าหมายหรือผู้ได้รับผลกระทบ และผลกระทบที่เกิดขึ้น", 5],
      ["2.3", "ผลลัพธ์ที่คาดหวังและความจำเป็นต่อภารกิจตำรวจ", 5],
    ],
  },
  {
    no: "3",
    title: "แนวคิดหรือรูปแบบนวัตกรรม",
    max: 25,
    color: "#fff7dc",
    items: [
      ["3.1", "แนวคิด หลักการ หรือทฤษฎีที่เกี่ยวข้อง", 5],
      ["3.2", "หลักการทำงานของผลงานนวัตกรรม", 5],
      ["3.3", "ขั้นตอนการดำเนินงาน", 5],
      ["3.4", "ความแตกต่างจากแนวทางหรือวิธีปฏิบัติเดิม", 5],
      ["3.5", "ความเป็นไปได้ในการนำไปใช้งานจริง", 5],
    ],
  },
  {
    no: "4",
    title: "หลักฐานผลลัพธ์เบื้องต้น",
    max: 20,
    color: "#f4f8fd",
    items: [
      ["4.1", "ภาพถ่ายหรือภาพประกอบอธิบายภาพรวมนวัตกรรม", 5],
      ["4.2", "คลิปวิดีโอ 3-5 นาทีตามลิงก์ที่แนบในระบบ", 5],
      ["4.3", "ผลการทดลองหรือข้อมูลทางสถิติที่เกี่ยวข้อง", 5],
      ["4.4", "สรุปผลการทดสอบจากการนำไปใช้งานจริง", 5],
    ],
  },
  {
    no: "5",
    title: "ความคุ้มค่าและการขยายผล",
    max: 20,
    color: "#fcecef",
    items: [
      ["5.1", "ข้อจำกัดและความเสี่ยงที่อาจเกิดจากการใช้งาน", 5],
      ["5.2", "แนวทางขยายผลและนำไปใช้งานในอนาคต", 5],
      ["5.3", "ระยะเวลาพัฒนาสู่การนำไปใช้งานจริง", 5],
      ["5.4", "งบประมาณที่คาดว่าต้องใช้เพื่อการใช้งานจริง", 5],
    ],
  },
] as const;

const documentReferences = [
  "แบบฟอร์ม/ไฟล์แนบ 1: ความเป็นผลงานของตำรวจ",
  "แบบฟอร์ม/ไฟล์แนบ 2: ปัญหาและความจำเป็น",
  "แบบฟอร์ม/ไฟล์แนบ 3: แนวคิดหรือรูปแบบนวัตกรรม",
  "แบบฟอร์ม/ไฟล์แนบ 4: หลักฐานผลลัพธ์และการขยายผล",
];

const scoreHeaderHeight = 18;
const scoreGroupRowHeight = 11;
const scoreItemRowHeight = 10.8;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) return adminUnauthorizedResponse(request);
  if (session.role !== "super_admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const submissions = (await listSubmissions()).sort(compareSubmittedAt);
  const zip = await committeeScoreFormZip(submissions);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "submission.committee_score_form_zip",
    entityType: "submission",
    summary: "Export ZIP แบบฟอร์มกรอกคะแนนรอบ Paper Screening แยกตามกรรมการ",
    payload: { submissionCount: submissions.length, committeeCount: committeeSignatories.length },
  }, request.headers);

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="committee-paper-screening-score-forms-${new Date().toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function committeeScoreFormZip(submissions: SubmissionListItem[]) {
  const entries: ZipEntry[] = [];
  for (const judge of committeeSignatories) {
    const pdf = await committeeScoreFormPdf(submissions, judge);
    entries.push({
      name: `${judge.fileLabel}/score-form-${judge.fileLabel}.pdf`,
      data: pdf,
    });
  }
  return createZip(entries);
}

async function committeeScoreFormPdf(submissions: SubmissionListItem[], judge: CommitteeSignatory) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: false });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const rows = submissions.length ? submissions : [null];
  const totalPages = rows.length;

  doc.info.Title = `แบบฟอร์มกรอกคะแนน Paper Screening - ${judge.rank}${judge.name}`;
  doc.info.Subject = "Police Innovation Contest 2026 Paper Screening score form";
  doc.info.Author = "Police Innovation Contest 2026";

  rows.forEach((submission, index) => {
    if (index > 0) doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawScoreSheet(doc, submission, judge, generatedAt, index + 1, totalPages, submissions.length);
  });

  doc.end();
  return pdf;
}

function drawScoreSheet(
  doc: PDFKit.PDFDocument,
  submission: SubmissionListItem | null,
  judge: CommitteeSignatory,
  generatedAt: Date,
  pageNumber: number,
  totalPages: number,
  submissionCount: number,
) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "แบบฟอร์มกรอกคะแนนประกวดนวัตกรรม รอบที่ 1",
    subtitle: `Paper Screening • ${judge.role} • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: submission ? "รหัสโครงการ" : "จำนวนโครงการ",
    metaValue: submission ? submission.submission_code : submissionCount.toLocaleString("th-TH"),
    fonts,
  });

  if (!submission) {
    drawEmptyState(doc, judge, pageNumber, totalPages);
    return;
  }

  drawProjectInfo(doc, submission, 28, 118);
  drawScoreTable(doc, 28, 190);
  drawSummaryBoxes(doc, 678, 190);
  drawJudgeSignature(doc, judge, 508);
  drawDocumentFooter(doc, pageNumber, totalPages, `${submission.submission_code} • ${judge.rank}${judge.name}`, fonts);
}

function drawProjectInfo(doc: PDFKit.PDFDocument, submission: SubmissionListItem, x: number, y: number) {
  const width = doc.page.width - x * 2;
  doc.roundedRect(x, y, width, 58, 7).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(8.5).fillColor(PDF_THEME.gold).text("ข้อมูลโครงการ", x + 12, y + 8, { width: 88, lineBreak: false });
  const codeX = x + width - 174;
  doc.font(fonts.bold).fontSize(13).fillColor(PDF_THEME.navy).text(clean(submission.title_th), x + 102, y + 7, {
    width: codeX - x - 122,
    height: 19,
    ellipsis: true,
  });
  doc.font(fonts.regular).fontSize(8.4).fillColor(PDF_THEME.text).text(
    `ผู้สมัคร/ทีม: ${ownerName(submission)} • สายงาน: ${workCategoryLabel(submission.work_category)} • ประเภท: ${submission.submission_type === "team" ? `ทีม${submission.team_name ? ` ${submission.team_name}` : ""}` : "ส่งเดี่ยว"}`,
    x + 102,
    y + 29,
    { width: codeX - x - 122, height: 12, ellipsis: true },
  );

  doc.roundedRect(codeX, y + 9, 150, 34, 6).fillAndStroke(PDF_THEME.goldSoft, "#e5cd70");
  doc.font(fonts.regular).fontSize(7).fillColor(PDF_THEME.muted).text("รหัสโครงการ", codeX + 10, y + 14, { width: 130, lineBreak: false });
  doc.font(fonts.bold).fontSize(9.8).fillColor(PDF_THEME.navy).text(submission.submission_code, codeX + 10, y + 27, {
    width: 130,
    align: "right",
    lineBreak: false,
  });

  doc.font(fonts.regular).fontSize(6.9).fillColor(PDF_THEME.muted).text(
    `อ้างอิงเอกสารที่ผู้สมัคร submit ในระบบ: ${documentReferences.join(" • ")}`,
    x + 12,
    y + 45,
    { width: width - 24, height: 10, ellipsis: true },
  );
}

function drawScoreTable(doc: PDFKit.PDFDocument, x: number, y: number) {
  const columns = [
    ["ข้อ", 40],
    ["รายการพิจารณา", 430],
    ["เต็ม", 42],
    ["คะแนน", 58],
  ] as const;
  const tableWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  let cursorY = y;

  doc.roundedRect(x, cursorY, tableWidth, scoreHeaderHeight, 5).fill(PDF_THEME.navy);
  doc.font(fonts.bold).fontSize(7.2).fillColor(PDF_THEME.goldSoft);
  let cursorX = x;
  for (const [label, width] of columns) {
    doc.text(label, cursorX + 6, cursorY + 5.2, {
      width: width - 12,
      align: label === "รายการพิจารณา" ? "left" : "center",
      lineBreak: false,
    });
    cursorX += width;
  }
  cursorY += scoreHeaderHeight;

  for (const group of scoreGroups) {
    doc.rect(x, cursorY, tableWidth, scoreGroupRowHeight).fill(group.color).stroke(PDF_THEME.line);
    doc.font(fonts.bold).fontSize(6.5).fillColor(PDF_THEME.navy).text(
      `${group.no}. ${group.title}`,
      x + 8,
      cursorY + 2.2,
      { width: 386, lineBreak: false },
    );
    doc.text(`${group.max} คะแนน`, x + 462, cursorY + 2.2, { width: 98, align: "right", lineBreak: false });
    cursorY += scoreGroupRowHeight;

    for (const [no, label, max] of group.items) {
      drawCriterionRow(doc, x, cursorY, columns, no, label, max);
      cursorY += scoreItemRowHeight;
    }
  }
}

function drawCriterionRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  columns: readonly (readonly [string, number])[],
  no: string,
  label: string,
  max: number,
) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.rect(x, y, totalWidth, scoreItemRowHeight).fill(PDF_THEME.white).stroke(PDF_THEME.line);

  let cursorX = x;
  columns.forEach(([, width], index) => {
    if (index > 0) doc.moveTo(cursorX, y).lineTo(cursorX, y + scoreItemRowHeight).lineWidth(0.35).stroke("#d9e2ef");
    cursorX += width;
  });

  doc.font(fonts.bold).fontSize(6.3).fillColor(PDF_THEME.navy).text(no, x + 6, y + 2.8, {
    width: columns[0][1] - 12,
    align: "center",
    lineBreak: false,
  });
  doc.font(fonts.regular).fontSize(6.25).fillColor(PDF_THEME.text).text(label, x + columns[0][1] + 7, y + 2.8, {
    width: columns[1][1] - 14,
    height: 7.2,
    ellipsis: true,
  });
  doc.font(fonts.bold).fontSize(6.3).fillColor(PDF_THEME.text).text(String(max), x + columns[0][1] + columns[1][1] + 5, y + 2.8, {
    width: columns[2][1] - 10,
    align: "center",
    lineBreak: false,
  });
  drawScoreBox(doc, x + columns[0][1] + columns[1][1] + columns[2][1] + 8, y + 1.9, 42, 7.4);
}

function drawSummaryBoxes(doc: PDFKit.PDFDocument, x: number, y: number) {
  doc.roundedRect(x, y, 136, 93, 7).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(10.5).fillColor(PDF_THEME.navy).text("สรุปคะแนน", x + 12, y + 12, { width: 112, align: "center", lineBreak: false });
  drawScoreBox(doc, x + 22, y + 38, 92, 28);
  doc.font(fonts.bold).fontSize(10).fillColor(PDF_THEME.gold).text("/ 100", x + 22, y + 70, { width: 92, align: "center", lineBreak: false });

  doc.roundedRect(x, y + 105, 136, 162, 7).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(9).fillColor(PDF_THEME.navy).text("หมายเหตุผู้ตรวจ", x + 12, y + 117, { width: 112, lineBreak: false });
  for (let line = 0; line < 6; line += 1) {
    const lineY = y + 145 + line * 18;
    doc.moveTo(x + 14, lineY).lineTo(x + 122, lineY).lineWidth(0.45).stroke("#aeb8c7");
  }
}

function drawJudgeSignature(doc: PDFKit.PDFDocument, judge: CommitteeSignatory, y: number) {
  const x = 210;
  const width = 420;
  doc.roundedRect(x, y, width, 42, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(8).fillColor(PDF_THEME.gold).text("ลงนามผู้ตรวจ (ตรวจแล้ว)", x + 14, y + 9, { width: 110, lineBreak: false });
  doc.moveTo(x + 140, y + 24).lineTo(x + 292, y + 24).lineWidth(0.55).stroke("#7b8798");
  doc.font(fonts.bold).fontSize(8.4).fillColor(PDF_THEME.navy).text(`${judge.rank}${judge.name}`, x + 302, y + 9, {
    width: 104,
    align: "center",
    lineBreak: false,
  });
  doc.font(fonts.regular).fontSize(7.4).fillColor(PDF_THEME.text).text(`${judge.unit} / ${judge.role}`, x + 302, y + 24, {
    width: 104,
    align: "center",
    lineBreak: false,
  });
}

function drawEmptyState(doc: PDFKit.PDFDocument, judge: CommitteeSignatory, pageNumber: number, totalPages: number) {
  doc.roundedRect(80, 190, doc.page.width - 160, 110, 10).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(fonts.bold).fontSize(18).fillColor(PDF_THEME.navy).text("ยังไม่มีใบสมัครประกวดที่ส่งเข้าระบบ", 100, 224, {
    width: doc.page.width - 200,
    align: "center",
    lineBreak: false,
  });
  doc.font(fonts.regular).fontSize(10).fillColor(PDF_THEME.muted).text(
    "เมื่อมีโครงการในระบบ ปุ่มนี้จะสร้างแบบฟอร์มกรอกคะแนนครบทุกโครงการให้กรรมการแต่ละท่านโดยอัตโนมัติ",
    120,
    258,
    { width: doc.page.width - 240, align: "center", lineGap: 2 },
  );
  drawJudgeSignature(doc, judge, 506);
  drawDocumentFooter(doc, pageNumber, totalPages, `${judge.rank}${judge.name}`, fonts);
}

function drawScoreBox(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number) {
  doc.roundedRect(x, y, width, height, 3).fillAndStroke("#fbfdff", "#8fa0b6");
}

function ownerName(item: SubmissionListItem) {
  return formatApplicantName(item);
}

function compareSubmittedAt(left: SubmissionListItem, right: SubmissionListItem) {
  return new Date(left.submitted_at).getTime() - new Date(right.submitted_at).getTime();
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
