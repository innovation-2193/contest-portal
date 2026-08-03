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

export const runtime = "nodejs";

const fonts: PdfFontSet = {
  regular: pdfFontRegular,
  bold: pdfFontBold,
};
const rowsPerPage = 8;

const committeeCriteria = [
  {
    no: "1",
    label: "ความเป็นผลงานของตำรวจ",
    max: 20,
    guideline: "แสดงความชัดเจนว่าผลงานเกิดจากการริเริ่ม คิดค้น พัฒนา ทดลอง หรือประยุกต์ใช้โดยตำรวจ มีชื่อผู้รับผิดชอบหรือหน่วยงานรับผิดชอบชัดเจน มีหลักฐานยืนยันที่มา และอธิบายบทบาทของตำรวจได้ครบถ้วน",
    fill: "#c7f1cb",
  },
  {
    no: "2",
    label: "ปัญหาและความจำเป็น",
    max: 15,
    guideline: "ระบุปัญหาได้ชัดเจน ตรงประเด็น มีเหตุผลหรือข้อมูลสนับสนุน ระบุกลุ่มเป้าหมายหรือผู้ได้รับผลกระทบชัดเจน และแสดงให้เห็นว่าการแก้ปัญหามีความจำเป็นต่อภารกิจตำรวจหรือประชาชน",
    fill: "#c7eefe",
  },
  {
    no: "3",
    label: "แนวคิดหรือรูปแบบนวัตกรรม",
    max: 25,
    guideline: "แนวคิดหรือต้นแบบมีความชัดเจน เหมาะสมกับปัญหา อธิบายหลักการทำงาน ขั้นตอน หรือรูปแบบการใช้งานได้ครบถ้วน มีความแตกต่างหรือพัฒนาจากวิธีเดิม และมีเหตุผลรองรับว่าใช้งานได้จริง",
    fill: "#c7eefe",
  },
  {
    no: "4",
    label: "หลักฐานผลลัพธ์เบื้องต้น",
    max: 20,
    guideline: "มีการนำเสนอหลักฐานเชิงประจักษ์ที่ได้จากการทดลองนำต้นแบบไปใช้งานจริง เช่น ภาพถ่าย วิดีโอ ข้อมูลสถิติ บันทึกการปฏิบัติงาน หรือผลตอบรับจากผู้ใช้งาน สามารถพิสูจน์ได้ว่านวัตกรรมทำงานได้จริงตามที่ออกแบบไว้ และเริ่มแสดงให้เห็นถึงผลลัพธ์หรือแนวโน้มที่ดีในการแก้ปัญหา",
    fill: "#fbffd0",
  },
  {
    no: "5",
    label: "ความคุ้มค่าและการขยายผล",
    max: 20,
    guideline: "แสดงความคุ้มค่าได้ชัดเจน ใช้ทรัพยากรเหมาะสม มีแนวโน้มช่วยลดเวลา ลดขั้นตอน ลดค่าใช้จ่าย หรือเพิ่มประสิทธิภาพ และมีแนวทางขยายผลที่เป็นไปได้",
    fill: "#f2cce9",
  },
] as const;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) return adminUnauthorizedResponse(request);
  if (session.role !== "super_admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const submissions = (await listSubmissions()).sort(compareSubmittedAt);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "submission.committee_score_form_pdf",
    entityType: "submission",
    summary: "Export แบบฟอร์มให้คะแนนสำหรับคณะกรรมการ",
    payload: { count: submissions.length },
  }, request.headers);

  const pdf = await committeeScoreFormPdf(submissions);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="committee-score-form-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function committeeScoreFormPdf(submissions: SubmissionListItem[]) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
  const pdf = collectPdf(doc);
  const generatedAt = new Date();
  const scorePages = Math.max(1, Math.ceil(submissions.length / rowsPerPage));
  const totalPages = scorePages + 1;

  doc.info.Title = "แบบฟอร์มให้คะแนนสำหรับคณะกรรมการ";
  doc.info.Subject = "Committee score form";
  doc.info.Author = "Police Innovation Contest 2026";

  drawRubricPage(doc, submissions.length, generatedAt, totalPages);
  for (let page = 0; page < scorePages; page += 1) {
    doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawScorePage(doc, submissions.slice(page * rowsPerPage, (page + 1) * rowsPerPage), submissions.length, generatedAt, page, scorePages, totalPages);
  }

  doc.end();
  return pdf;
}

function drawRubricPage(doc: PDFKit.PDFDocument, total: number, generatedAt: Date, totalPages: number) {
  const tableX = 26;
  const tableY = 184;
  const columns = [
    ["เกณฑ์การประเมิน", 246],
    ["คะแนนเต็ม", 92],
    ["แนวทางการพิจารณา", 452],
  ] as const;
  const rowHeights = [72, 60, 76, 92, 72];

  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "เกณฑ์การประเมินเอกสาร (Paper Screening)",
    subtitle: `คะแนนเต็ม 100 คะแนน • ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "จำนวนโครงการ",
    metaValue: total.toLocaleString("th-TH"),
    showLogo: false,
    fonts,
  });
  doc.font(fonts.bold).fontSize(13).fillColor(PDF_THEME.navy).text("รอบที่ 1: การประเมินเอกสาร (Paper Screening) โดยมีคะแนนเต็ม 100 คะแนน", 34, 124, {
    width: doc.page.width - 68,
    align: "center",
    lineBreak: false,
  });
  doc.font(fonts.regular).fontSize(10.5).fillColor(PDF_THEME.text).text(
    "พิจารณาจากรายการเอกสาร หลักฐานประกอบ และข้อมูลที่ผู้ส่งผลงานยื่นต่อคณะกรรมการผ่านระบบรับสมัคร โดยให้ความสำคัญกับความชัดเจนของปัญหา ความเป็นผลงานของตำรวจ แนวคิดนวัตกรรม หลักฐานผลลัพธ์เบื้องต้น ความคุ้มค่า และความครบถ้วนของเอกสาร",
    48,
    146,
    { width: doc.page.width - 96, align: "center", lineGap: 2 },
  );
  drawRubricHeader(doc, tableX, tableY, columns);

  let y = tableY + 28;
  committeeCriteria.forEach((criterion, index) => {
    drawRubricRow(doc, tableX, y, rowHeights[index], columns, criterion);
    y += rowHeights[index];
  });
  drawDocumentFooter(doc, 1, totalPages, "Paper Screening Criteria", fonts);
}

function drawRubricHeader(doc: PDFKit.PDFDocument, x: number, y: number, columns: readonly (readonly [string, number])[]) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.rect(x, y, totalWidth, 28).fill("#eeeeee").stroke(PDF_THEME.text);
  let cursor = x;
  doc.font(fonts.bold).fontSize(10.5).fillColor("#111111");
  for (const [label, width] of columns) {
    doc.rect(cursor, y, width, 28).stroke("#111111");
    doc.text(label, cursor + 8, y + 8, { width: width - 16, lineBreak: false });
    cursor += width;
  }
}

function drawRubricRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  height: number,
  columns: readonly (readonly [string, number])[],
  criterion: typeof committeeCriteria[number],
) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.rect(x, y, totalWidth, height).fill(criterion.fill).stroke("#111111");
  let cursor = x;
  columns.forEach(([, width]) => {
    doc.rect(cursor, y, width, height).stroke("#111111");
    cursor += width;
  });
  doc.font(fonts.bold).fontSize(11).fillColor("#111111").text(`${criterion.no}. ${criterion.label}`, x + 10, y + 10, {
    width: columns[0][1] - 20,
    lineGap: 2,
  });
  doc.font(fonts.bold).fontSize(12).fillColor("#111111").text(String(criterion.max), x + columns[0][1], y + 10, {
    width: columns[1][1],
    align: "center",
    lineBreak: false,
  });
  doc.font(fonts.regular).fontSize(10.2).fillColor("#111111").text(criterion.guideline, x + columns[0][1] + columns[1][1] + 10, y + 8, {
    width: columns[2][1] - 20,
    lineGap: 1.5,
  });
}

function drawScorePage(doc: PDFKit.PDFDocument, rows: SubmissionListItem[], total: number, generatedAt: Date, pageIndex: number, scorePages: number, totalPages: number) {
  const tableX = 26;
  const tableY = 196;
  const rowHeight = 42;
  const columns = [
    ["ลำดับ", 32],
    ["ชื่อโครงการ", 250],
    ["ชื่อผู้สมัคร", 124],
    ["1 (20)", 55],
    ["2 (15)", 55],
    ["3 (25)", 60],
    ["4 (20)", 55],
    ["5 (20)", 55],
    ["รวม (100)", 78],
  ] as const;

  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "แบบฟอร์มให้คะแนนสำหรับคณะกรรมการ",
    subtitle: `ออกรายงานเมื่อ ${formatPdfThaiDateTime(generatedAt)}`,
    metaLabel: "จำนวนโครงการ",
    metaValue: total.toLocaleString("th-TH"),
    showLogo: false,
    fonts,
  });
  drawCommitteeFields(doc);
  drawTableHeader(doc, tableX, tableY, columns);

  rows.forEach((item, index) => {
    drawScoreFormRow(doc, tableX, tableY + 28 + index * rowHeight, rowHeight, columns, item, pageIndex * rowsPerPage + index + 1, index);
  });

  if (!rows.length) {
    doc.roundedRect(tableX, tableY + 44, doc.page.width - tableX * 2, 72, 8).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    doc.font(fonts.bold).fontSize(14).fillColor(PDF_THEME.navy).text("ยังไม่มีใบสมัครประกวดที่ส่งเข้าระบบ", tableX, tableY + 72, {
      width: doc.page.width - tableX * 2,
      align: "center",
      lineBreak: false,
    });
  }

  drawDocumentFooter(doc, pageIndex + 2, totalPages, `Committee Score Form • หน้าแบบฟอร์ม ${pageIndex + 1}/${scorePages}`, fonts);
}

function drawCommitteeFields(doc: PDFKit.PDFDocument) {
  const labels = ["ชื่อ", "นามสกุล", "ตำแหน่ง"];
  let x = 30;
  doc.font(fonts.bold).fontSize(10).fillColor(PDF_THEME.navy).text("ข้อมูลคณะกรรมการผู้ให้คะแนน", x, 124, { width: 220, lineBreak: false });
  labels.forEach((label, index) => {
    const width = index === 2 ? 270 : 210;
    doc.font(fonts.bold).fontSize(9).fillColor(PDF_THEME.gold).text(label, x, 148, { width, lineBreak: false });
    doc.roundedRect(x, 162, width, 22, 5).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
    x += width + 14;
  });
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number, columns: readonly (readonly [string, number])[]) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.roundedRect(x, y, totalWidth, 26, 5).fill(PDF_THEME.navy);
  let cursor = x;
  doc.font(fonts.bold).fontSize(8.1).fillColor(PDF_THEME.goldSoft);
  for (const [label, width] of columns) {
    doc.text(label, cursor + 7, y + 8, { width: width - 14, align: label === "คะแนน" ? "center" : "left", lineBreak: false });
    cursor += width;
  }
}

function drawScoreFormRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  height: number,
  columns: readonly (readonly [string, number])[],
  item: SubmissionListItem,
  runningNumber: number,
  index: number,
) {
  const totalWidth = columns.reduce((sum, [, width]) => sum + width, 0);
  doc.rect(x, y, totalWidth, height).fill(index % 2 === 0 ? PDF_THEME.white : PDF_THEME.paleBlue);
  doc.moveTo(x, y + height).lineTo(x + totalWidth, y + height).lineWidth(0.45).stroke(PDF_THEME.line);

  const values = [String(runningNumber), item.title_th, ownerName(item), "", "", "", "", "", ""];
  let cursor = x;
  values.forEach((value, valueIndex) => {
    if (valueIndex > 0) doc.moveTo(cursor, y + 5).lineTo(cursor, y + height - 5).lineWidth(0.25).stroke("#e3e9f2");
    if (valueIndex >= 3) {
      doc.roundedRect(cursor + 7, y + 9, columns[valueIndex][1] - 14, height - 18, 5).fillAndStroke("#ffffff", "#c8d3e2");
    } else {
      doc.font(valueIndex === 0 ? fonts.bold : fonts.regular).fontSize(valueIndex === 0 ? 9 : 8.8).fillColor(valueIndex === 0 ? PDF_THEME.navy : PDF_THEME.text).text(clean(value), cursor + 7, y + 9, {
        width: columns[valueIndex][1] - 14,
        lineGap: 1,
      });
    }
    cursor += columns[valueIndex][1];
  });
}

function ownerName(item: SubmissionListItem) {
  return `${item.first_name} ${item.last_name}`.replace(/\s+/g, " ").trim() || "-";
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
