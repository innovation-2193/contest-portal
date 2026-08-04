import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../lib/admin-api-response";
import { listSubmissions, type SubmissionListItem } from "../../../../../lib/admin-store";
import {
  drawDocumentFooter,
  formatPdfThaiDateTime,
  pdfFontBold,
  pdfFontRegular,
  type PdfFontSet,
} from "../../../../../lib/pdf-theme";
import { formatApplicantName } from "../../../../../lib/thai-rank-title";
import { createZip, type ZipEntry } from "../../../../../lib/zip";

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

const PRINT = {
  black: "#111827",
  text: "#1f2937",
  muted: "#6b7280",
  watermark: "#cbd5e1",
  line: "#9ca3af",
  lineLight: "#d1d5db",
  white: "#ffffff",
} as const;

const scoreHeaderHeight = 24;
const scoreGroupRowHeight = 18;
const scoreItemRowHeight = 18.4;

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
  const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 0, bufferPages: false });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const rows = submissions.length ? submissions : [null];
  const totalPages = rows.length;

  doc.info.Title = `แบบฟอร์มกรอกคะแนน Paper Screening - ${judge.rank}${judge.name}`;
  doc.info.Subject = "Police Innovation Contest 2026 Paper Screening score form";
  doc.info.Author = "Police Innovation Contest 2026";

  rows.forEach((submission, index) => {
    if (index > 0) doc.addPage({ size: "A4", layout: "portrait", margin: 0 });
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
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PRINT.white);
  drawPrintHeader(doc, submission, judge, generatedAt, submissionCount);

  if (!submission) {
    drawEmptyState(doc, judge, pageNumber, totalPages);
    return;
  }

  drawProjectInfo(doc, submission, 24, 86, pageNumber, totalPages);
  drawScoreTable(doc, 24, 150);
  drawSummaryBoxes(doc, 24, 672, 171);
  drawCompactJudgeSignature(doc, judge, 388, 672, 183);
  drawWatermark(doc);
  drawDocumentFooter(doc, pageNumber, totalPages, `${submission.submission_code} • ${judge.rank}${judge.name}`, fonts);
}

function drawWatermark(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.rotate(-38, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.font(fonts.bold).fontSize(38).fillColor(PRINT.watermark).fillOpacity(0.14).text(
    "Police innovation contest 2026",
    -80,
    doc.page.height / 2 - 18,
    {
      width: doc.page.width + 160,
      align: "center",
      lineBreak: false,
    },
  );
  doc.restore();
}

function drawPrintHeader(
  doc: PDFKit.PDFDocument,
  submission: SubmissionListItem | null,
  judge: CommitteeSignatory,
  generatedAt: Date,
  submissionCount: number,
) {
  const margin = 24;
  const width = doc.page.width - margin * 2;
  doc.font(fonts.bold).fontSize(14.2).fillColor(PRINT.black).text("แบบฟอร์มกรอกคะแนนประกวดนวัตกรรม รอบที่ 1 (Paper Screening)", margin, 24, {
    width,
    align: "center",
    lineBreak: false,
  });
  doc.font(fonts.regular).fontSize(8.4).fillColor(PRINT.text).text(
    `${judge.role} • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    margin,
    48,
    { width, align: "center", lineBreak: false },
  );
  doc.moveTo(margin, 70).lineTo(doc.page.width - margin, 70).lineWidth(0.8).stroke(PRINT.line);
  doc.font(fonts.bold).fontSize(10.6).fillColor(PRINT.black).text(
    submission ? `รหัสโครงการ: ${submission.submission_code}` : `จำนวนโครงการ: ${submissionCount.toLocaleString("th-TH")}`,
    margin,
    74,
    { width, align: "right", lineBreak: false },
  );
}

function drawProjectInfo(
  doc: PDFKit.PDFDocument,
  submission: SubmissionListItem,
  x: number,
  y: number,
  itemNumber: number,
  totalItems: number,
) {
  const width = doc.page.width - x * 2;
  doc.rect(x, y, width, 48).fillAndStroke(PRINT.white, PRINT.line);
  doc.font(fonts.bold).fontSize(8.6).fillColor(PRINT.black).text("ข้อมูลโครงการ", x + 10, y + 9, { width: 82, lineBreak: false });
  doc.font(fonts.bold).fontSize(8.4).fillColor(PRINT.black).text("ลำดับนวัตกรรม", x + 10, y + 24, { width: 82, lineBreak: false });
  doc.font(fonts.bold).fontSize(8.7).fillColor(PRINT.black).text(`รายการที่ ${itemNumber} จาก ${totalItems}`, x + 10, y + 36, {
    width: 82,
    lineBreak: false,
  });
  doc.font(fonts.bold).fontSize(11.3).fillColor(PRINT.black).text(clean(submission.title_th), x + 102, y + 8, {
    width: width - 114,
    height: 15,
    ellipsis: true,
  });
  doc.font(fonts.regular).fontSize(8).fillColor(PRINT.text).text(
    `ผู้สมัคร/ทีม: ${ownerName(submission)} • ประเภท: ${submission.submission_type === "team" ? `ทีม${submission.team_name ? ` ${submission.team_name}` : ""}` : "ส่งเดี่ยว"}`,
    x + 102,
    y + 27,
    { width: width - 114, height: 10, ellipsis: true },
  );
  doc.font(fonts.regular).fontSize(6.5).fillColor(PRINT.muted).text(
    `เอกสารประกอบการพิจารณา: ${documentReferences.join(" • ")}`,
    x + 102,
    y + 38,
    { width: width - 114, height: 8, ellipsis: true },
  );
}

function drawScoreTable(doc: PDFKit.PDFDocument, x: number, y: number) {
  const columns = [
    ["ข้อ", 42],
    ["รายการพิจารณา", 300],
    ["เต็ม", 54],
    ["คะแนน", 151],
  ] as const;
  const tableWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  let cursorY = y;

  doc.rect(x, cursorY, tableWidth, scoreHeaderHeight).fillAndStroke(PRINT.white, PRINT.black);
  doc.font(fonts.bold).fontSize(9.6).fillColor(PRINT.black);
  let cursorX = x;
  for (const [label, width] of columns) {
    if (cursorX > x) doc.moveTo(cursorX, cursorY).lineTo(cursorX, cursorY + scoreHeaderHeight).lineWidth(0.5).stroke(PRINT.line);
    doc.text(label, cursorX + 6, cursorY + 6.4, {
      width: width - 12,
      align: label === "รายการพิจารณา" ? "left" : "center",
      lineBreak: false,
    });
    cursorX += width;
  }
  cursorY += scoreHeaderHeight;

  for (const group of scoreGroups) {
    doc.rect(x, cursorY, tableWidth, scoreGroupRowHeight).fillAndStroke(PRINT.white, PRINT.black);
    doc.font(fonts.bold).fontSize(8.8).fillColor(PRINT.black).text(
      `${group.no}. ${group.title}`,
      x + 8,
      cursorY + 5.1,
      { width: tableWidth - 130, lineBreak: false },
    );
    doc.text(`${group.max} คะแนน`, x + tableWidth - 116, cursorY + 5.1, { width: 106, align: "right", lineBreak: false });
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
  doc.rect(x, y, totalWidth, scoreItemRowHeight).fillAndStroke(PRINT.white, PRINT.lineLight);

  let cursorX = x;
  columns.forEach(([, width], index) => {
    if (index > 0) doc.moveTo(cursorX, y).lineTo(cursorX, y + scoreItemRowHeight).lineWidth(0.35).stroke(PRINT.lineLight);
    cursorX += width;
  });

  doc.font(fonts.bold).fontSize(8.6).fillColor(PRINT.black).text(no, x + 6, y + 5.2, {
    width: columns[0][1] - 12,
    align: "center",
    lineBreak: false,
  });
  doc.font(fonts.regular).fontSize(8.4).fillColor(PRINT.text).text(label, x + columns[0][1] + 8, y + 5, {
    width: columns[1][1] - 14,
    height: 11,
    ellipsis: true,
  });
  doc.font(fonts.bold).fontSize(8.6).fillColor(PRINT.text).text(String(max), x + columns[0][1] + columns[1][1] + 5, y + 5.2, {
    width: columns[2][1] - 10,
    align: "center",
    lineBreak: false,
  });
}

function drawSummaryBoxes(doc: PDFKit.PDFDocument, x: number, y: number, width: number) {
  doc.rect(x, y, width, 90).fillAndStroke(PRINT.white, PRINT.line);
  doc.font(fonts.bold).fontSize(10).fillColor(PRINT.black).text("สรุปคะแนน", x + 10, y + 11, { width: width - 20, align: "center", lineBreak: false });
  drawScoreBox(doc, x + 18, y + 38, 108, 34);
  doc.font(fonts.bold).fontSize(9.8).fillColor(PRINT.black).text("/ 100", x + 132, y + 49, { width: 42, lineBreak: false });

  const noteX = x + width + 12;
  const noteWidth = 181;
  doc.rect(noteX, y, noteWidth, 90).fillAndStroke(PRINT.white, PRINT.line);
  doc.font(fonts.bold).fontSize(9.2).fillColor(PRINT.black).text("หมายเหตุผู้ตรวจ", noteX + 10, y + 11, { width: noteWidth - 20, lineBreak: false });
  for (let line = 0; line < 3; line += 1) {
    const lineY = y + 39 + line * 17;
    doc.moveTo(noteX + 10, lineY).lineTo(noteX + noteWidth - 10, lineY).lineWidth(0.45).stroke(PRINT.line);
  }
}

function drawCompactJudgeSignature(doc: PDFKit.PDFDocument, judge: CommitteeSignatory, x: number, y: number, width: number) {
  doc.rect(x, y, width, 90).fillAndStroke(PRINT.white, PRINT.line);
  doc.font(fonts.bold).fontSize(8.8).fillColor(PRINT.black).text("ลงนามผู้พิจารณา", x + 10, y + 10, {
    width: width - 20,
    align: "center",
    lineBreak: false,
  });
  doc.moveTo(x + 16, y + 43).lineTo(x + width - 16, y + 43).lineWidth(0.55).stroke(PRINT.line);
  doc.font(fonts.bold).fontSize(8.4).fillColor(PRINT.black).text(`${judge.rank}${judge.name}`, x + 10, y + 57, {
    width: width - 20,
    align: "center",
    lineBreak: false,
  });
  doc.font(fonts.regular).fontSize(7).fillColor(PRINT.text).text(`${judge.unit} / ${judge.role}`, x + 10, y + 73, {
    width: width - 20,
    align: "center",
    lineBreak: false,
  });
}

function drawJudgeSignature(doc: PDFKit.PDFDocument, judge: CommitteeSignatory, x: number, y: number, width: number) {
  doc.rect(x, y, width, 106).fillAndStroke(PRINT.white, PRINT.line);
  doc.font(fonts.bold).fontSize(8.6).fillColor(PRINT.black).text("ลงนามผู้พิจารณา", x + 12, y + 13, {
    width: width - 24,
    align: "center",
    lineBreak: false,
  });
  doc.moveTo(x + 18, y + 55).lineTo(x + width - 18, y + 55).lineWidth(0.55).stroke(PRINT.line);
  doc.font(fonts.bold).fontSize(8.6).fillColor(PRINT.black).text(`${judge.rank}${judge.name}`, x + 10, y + 68, {
    width: width - 20,
    align: "center",
    lineBreak: false,
  });
  doc.font(fonts.regular).fontSize(7.2).fillColor(PRINT.text).text(`${judge.unit} / ${judge.role}`, x + 10, y + 84, {
    width: width - 20,
    align: "center",
    lineBreak: false,
  });
}

function drawEmptyState(doc: PDFKit.PDFDocument, judge: CommitteeSignatory, pageNumber: number, totalPages: number) {
  doc.rect(80, 190, doc.page.width - 160, 110).fillAndStroke(PRINT.white, PRINT.line);
  doc.font(fonts.bold).fontSize(18).fillColor(PRINT.black).text("ยังไม่มีใบสมัครประกวดที่ส่งเข้าระบบ", 100, 224, {
    width: doc.page.width - 200,
    align: "center",
    lineBreak: false,
  });
  doc.font(fonts.regular).fontSize(10).fillColor(PRINT.muted).text(
    "เมื่อมีโครงการในระบบ ปุ่มนี้จะสร้างแบบฟอร์มกรอกคะแนนครบทุกโครงการให้กรรมการแต่ละท่านโดยอัตโนมัติ",
    120,
    258,
    { width: doc.page.width - 240, align: "center", lineGap: 2 },
  );
  drawJudgeSignature(doc, judge, doc.page.width - 186, 440, 158);
  drawWatermark(doc);
  drawDocumentFooter(doc, pageNumber, totalPages, `${judge.rank}${judge.name}`, fonts);
}

function drawScoreBox(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number) {
  doc.rect(x, y, width, height).fillAndStroke(PRINT.white, PRINT.line);
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
