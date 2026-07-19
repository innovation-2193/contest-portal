import { mkdir, writeFile } from "fs/promises";
import path from "path";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { RegistrationRecord } from "./local-registrations";
import {
  drawDocumentFooter,
  drawDocumentHeader,
  formatPdfThaiDateTime,
  PDF_THEME,
  pdfFontBold,
  pdfFontRegular,
} from "./pdf-theme";
import { publicBaseUrl } from "./public-url";

type MailStatus = "sent" | "outbox" | "skipped" | "failed";

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");

export function registrationQrText(registrationCode: string) {
  return registrationCode.trim();
}

export async function registrationQrPng(registrationCode: string, width = 720) {
  return QRCode.toBuffer(registrationQrText(registrationCode), {
    width,
    margin: 2,
    errorCorrectionLevel: "H",
  });
}

export async function registrationTicketPdf(record: RegistrationRecord) {
  const qr = await registrationQrPng(record.registration_code, 720);
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  const pdf = collectPdf(doc);
  const width = 595.28;
  const height = 841.89;

  doc.info.Title = `ใบยืนยันการลงทะเบียน ${record.registration_code}`;
  doc.info.Subject = "Police Innovation Contest 2026 registration ticket";
  doc.info.Author = "Police Innovation Contest 2026";

  doc.rect(0, 0, width, height).fill(PDF_THEME.paper);
  drawDocumentHeader(doc, {
    title: "ใบยืนยันการลงทะเบียน",
    subtitle: "ใช้ยืนยันตัวตนและแสดงต่อเจ้าหน้าที่ ณ จุดเช็คอิน",
    metaLabel: "เลขลงทะเบียน",
    metaValue: record.registration_code,
  });

  const cardY = 138;
  doc.roundedRect(36, cardY, 205, 304, 9).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  doc.font(pdfFontBold).fontSize(10).fillColor(PDF_THEME.navy).text("QR CODE สำหรับเช็คอิน", 52, cardY + 18, {
    width: 173,
    align: "center",
    lineBreak: false,
  });
  doc.roundedRect(53, cardY + 46, 171, 171, 7).fillAndStroke(PDF_THEME.white, "#c8d2e1");
  doc.image(qr, 60, cardY + 53, { width: 157, height: 157 });
  doc.roundedRect(53, cardY + 232, 171, 38, 6).fill(PDF_THEME.navy);
  drawCenteredText(doc, record.registration_code, 53, cardY + 242, 171, 13, pdfFontBold, PDF_THEME.goldSoft);
  doc.font(pdfFontRegular).fontSize(9.5).fillColor(PDF_THEME.muted).text(
    "เก็บรหัสนี้ไว้จนจบกิจกรรม",
    52,
    cardY + 280,
    { width: 173, align: "center", lineBreak: false },
  );

  doc.roundedRect(257, cardY, 302, 304, 9).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  drawStatusPill(doc, record.status, 277, cardY + 18);
  doc.font(pdfFontBold).fontSize(19).fillColor(PDF_THEME.navy).text(
    `${record.title}${record.first_name} ${record.last_name}`,
    277,
    cardY + 52,
    { width: 262, height: 52, ellipsis: true, lineGap: 1 },
  );

  const rows: Array<[string, string]> = [
    ["ตำแหน่ง", record.position],
    ["สังกัด", record.division],
    ["หน่วยงาน", record.bureau],
    ["เบอร์ติดต่อ", record.phone],
    ["อีเมล", record.email],
  ];
  let y = cardY + 112;
  for (const [label, value] of rows) {
    drawDetailRow(doc, label, value || "-", 277, y, 262);
    y += 37;
  }

  doc.roundedRect(36, 466, width - 72, 132, 9).fillAndStroke(PDF_THEME.goldSoft, "#e5cd70");
  doc.font(pdfFontBold).fontSize(15).fillColor(PDF_THEME.navy).text("ขั้นตอนการเช็คอินหน้างาน", 56, 486, {
    width: width - 112,
    lineBreak: false,
  });
  drawCheckInStep(doc, 1, "เปิด QR Code หรือเอกสารฉบับนี้ให้เจ้าหน้าที่สแกน", 56, 520, 150);
  drawCheckInStep(doc, 2, "ตรวจสอบชื่อและหน่วยงานให้ตรงกับข้อมูลลงทะเบียน", 218, 520, 150);
  drawCheckInStep(doc, 3, "รับการยืนยันสถานะก่อนเข้าสู่พื้นที่จัดงาน", 380, 520, 150);

  doc.roundedRect(36, 620, width - 72, 100, 9).fillAndStroke(PDF_THEME.white, PDF_THEME.line);
  drawVerificationItem(doc, "ลงทะเบียนเมื่อ", formatPdfThaiDateTime(record.registered_at), 56, 642, 150);
  drawVerificationItem(doc, "สถานะปัจจุบัน", statusLabel(record.status), 223, 642, 140);
  drawVerificationItem(doc, "เอกสารอ้างอิง", record.registration_code, 380, 642, 159);
  doc.font(pdfFontRegular).fontSize(9).fillColor(PDF_THEME.muted).text(
    "เอกสารฉบับนี้สร้างจากข้อมูลที่ผู้สมัครบันทึกในระบบ กรุณาติดต่อทีมงานหากพบข้อมูลไม่ถูกต้อง",
    56,
    696,
    { width: width - 112, align: "center", lineBreak: false },
  );

  drawDocumentFooter(doc, 1, 1, record.registration_code);

  doc.end();
  return pdf;
}

export async function sendRegistrationConfirmation(record: RegistrationRecord) {
  try {
    const [qr, pdf] = await Promise.all([
      registrationQrPng(record.registration_code),
      registrationTicketPdf(record),
    ]);

    const smtpUrl = process.env.SMTP_URL;
    const smtpHost = process.env.SMTP_HOST;
    const from = process.env.SMTP_FROM ?? "Police Innovation Contest 2026 <no-reply@police.go.th>";

    if (!smtpUrl && !smtpHost) {
      await writeDevOutbox(record, qr, pdf);
      return { status: "outbox" satisfies MailStatus };
    }

    const transporter = smtpUrl
      ? nodemailer.createTransport(smtpUrl)
      : nodemailer.createTransport({
          host: smtpHost,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: process.env.SMTP_SECURE === "true",
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
            : undefined,
          tls: process.env.SMTP_TLS_REJECT_UNAUTHORIZED === "false"
            ? { rejectUnauthorized: false }
            : undefined,
        });

    await transporter.sendMail({
      from,
      to: record.email,
      subject: `ยืนยันการลงทะเบียนเข้าร่วมงาน ${record.registration_code}`,
      html: confirmationHtml(record),
      text: confirmationText(record),
      attachments: [
        { filename: `${record.registration_code}.png`, content: qr, contentType: "image/png", cid: "registration-qr" },
        { filename: `${record.registration_code}.pdf`, content: pdf, contentType: "application/pdf" },
      ],
    });

    return { status: "sent" satisfies MailStatus };
  } catch (error) {
    console.error("registration email failed", error);
    return { status: "failed" satisfies MailStatus };
  }
}

function confirmationHtml(record: RegistrationRecord) {
  const detailUrl = `${publicBaseUrl()}/register/success?code=${encodeURIComponent(record.registration_code)}`;
  return `<div style="margin:0;background:#061127;padding:28px;font-family:Arial,'Noto Sans Thai',Tahoma,sans-serif;color:#172033;line-height:1.7">
    <div style="max-width:680px;margin:0 auto;border:1px solid #d8b62f;border-radius:14px;overflow:hidden;background:#ffffff">
      <div style="background:#123c73;color:#ffffff;padding:28px 30px;border-bottom:5px solid #d8b62f">
        <div style="font-size:13px;letter-spacing:2px;font-weight:700;text-transform:uppercase;color:#fff0a8">POLICE INNOVATION CONTEST 2026</div>
        <h1 style="margin:14px 0 6px;font-size:30px;line-height:1.25;color:#ffffff">ยืนยันการลงทะเบียนเข้าร่วมงาน ${escapeHtml(record.registration_code)}</h1>
        <p style="margin:0;font-size:16px;color:#dfe8f7">บันทึกการลงทะเบียนของ ${escapeHtml(record.title)}${escapeHtml(record.first_name)} ${escapeHtml(record.last_name)} เรียบร้อยแล้ว</p>
      </div>
      <div style="padding:30px">
        <p style="margin:0 0 18px">เรียน ${escapeHtml(record.title)}${escapeHtml(record.first_name)} ${escapeHtml(record.last_name)}</p>
        <p style="margin:0 0 22px">ระบบได้รับการลงทะเบียนเข้าร่วมงาน Police Innovation Contest 2026 เรียบร้อยแล้ว</p>
        <p style="margin:0 0 22px">
          เลขลงทะเบียน: <strong>${escapeHtml(record.registration_code)}</strong><br>
          หน่วยงาน: <strong>${escapeHtml(record.bureau || record.division || "-")}</strong><br>
          ตำแหน่ง: <strong>${escapeHtml(record.position || "-")}</strong><br>
          เบอร์ติดต่อ: <strong>${escapeHtml(record.phone || "-")}</strong>
        </p>
        <div style="margin:24px 0;padding:24px;border:1px solid #d8b62f;border-radius:12px;background:#fff9ec;text-align:center">
          <h2 style="margin:0 0 6px;font-size:22px;color:#0a2d63">QR Code สำหรับเช็คอิน</h2>
          <p style="margin:0 0 18px;color:#4b5870">โปรดแสดง QR Code นี้ต่อเจ้าหน้าที่ ณ จุดลงทะเบียน</p>
          <img src="cid:registration-qr" alt="QR Code ${escapeHtml(record.registration_code)}" style="width:220px;height:220px;border-radius:12px;background:#fff;display:block;margin:0 auto 16px">
          <div style="display:inline-block;background:#0a2d63;color:#fff0a8;border-radius:999px;padding:8px 18px;font-weight:700">${escapeHtml(record.registration_code)}</div>
        </div>
        <a href="${escapeHtml(detailUrl)}" style="display:inline-block;background:#d8b62f;color:#07142b;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:9px">ดู QR Code และรายละเอียด</a>
      </div>
      <div style="padding:18px 30px;background:#f5f7fb;color:#5a6478;font-size:14px;border-top:1px solid #e6e9f0">
        อีเมลนี้ส่งจากระบบ Police Innovation Contest 2569 กรุณาอย่าตอบกลับอีเมลอัตโนมัตินี้ หากต้องการติดต่อทีมงานให้ใช้อีเมล <a href="mailto:innocontest@police.go.th">innocontest@police.go.th</a>
      </div>
    </div>
  </div>`;
}

function confirmationText(record: RegistrationRecord) {
  return `ยืนยันการลงทะเบียนเข้าร่วมงาน Police Innovation Contest 2026
เลขลงทะเบียน: ${record.registration_code}
ชื่อ: ${record.title}${record.first_name} ${record.last_name}
หน่วยงาน: ${record.bureau || record.division || "-"}
ตำแหน่ง: ${record.position || "-"}
เบอร์ติดต่อ: ${record.phone || "-"}
กรุณาแสดง QR Code หรือ PDF ที่แนบมากับอีเมลนี้ต่อเจ้าหน้าที่เพื่อลงทะเบียนเช็คอินหน้างาน`;
}

async function writeDevOutbox(record: RegistrationRecord, qr: Buffer, pdf: Buffer) {
  const outbox = path.join(storageDir, "email-outbox", record.registration_code);
  await mkdir(outbox, { recursive: true });
  await writeFile(path.join(outbox, "qr.png"), qr);
  await writeFile(path.join(outbox, "ticket.pdf"), pdf);
  await writeFile(
    path.join(outbox, "email.json"),
    `${JSON.stringify({ to: record.email, subject: `ยืนยันการลงทะเบียนเข้าร่วมงาน ${record.registration_code}`, createdAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
}

function statusLabel(status: string) {
  if (status === "attended") return "เข้าร่วมงานแล้ว";
  if (status === "cancelled") return "ยกเลิก";
  return "ลงทะเบียนแล้ว";
}

function drawStatusPill(doc: PDFKit.PDFDocument, status: string, x: number, y: number) {
  const attended = status === "attended";
  const cancelled = status === "cancelled";
  const background = attended ? PDF_THEME.greenSoft : cancelled ? PDF_THEME.redSoft : PDF_THEME.goldSoft;
  const color = attended ? PDF_THEME.green : cancelled ? PDF_THEME.red : "#80620b";
  const label = statusLabel(status);
  const width = Math.max(88, doc.font(pdfFontBold).fontSize(9.5).widthOfString(label) + 24);

  doc.roundedRect(x, y, width, 24, 12).fill(background);
  doc.font(pdfFontBold).fontSize(9.5).fillColor(color).text(label, x + 12, y + 7, {
    width: width - 24,
    align: "center",
    lineBreak: false,
  });
}

function drawDetailRow(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  doc.font(pdfFontRegular).fontSize(8.5).fillColor(PDF_THEME.muted).text(label, x, y, {
    width: 74,
    lineBreak: false,
  });
  doc.font(pdfFontBold).fontSize(10.5).fillColor(PDF_THEME.text).text(value, x + 78, y - 1, {
    width: width - 78,
    height: 27,
    ellipsis: true,
    lineGap: 1,
  });
  doc.moveTo(x, y + 27).lineTo(x + width, y + 27).lineWidth(0.55).stroke(PDF_THEME.line);
}

function drawCheckInStep(
  doc: PDFKit.PDFDocument,
  step: number,
  text: string,
  x: number,
  y: number,
  width: number,
) {
  doc.circle(x + 13, y + 13, 13).fill(PDF_THEME.navy);
  drawCenteredText(doc, String(step), x, y + 5, 26, 10, pdfFontBold, PDF_THEME.goldSoft);
  doc.font(pdfFontRegular).fontSize(9.5).fillColor(PDF_THEME.text).text(text, x + 34, y + 1, {
    width: width - 34,
    height: 52,
    ellipsis: true,
    lineGap: 2,
  });
}

function drawVerificationItem(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  doc.font(pdfFontRegular).fontSize(8.5).fillColor(PDF_THEME.muted).text(label, x, y, {
    width,
    align: "center",
    lineBreak: false,
  });
  doc.font(pdfFontBold).fontSize(11).fillColor(PDF_THEME.navy).text(value, x, y + 19, {
    width,
    height: 22,
    align: "center",
    ellipsis: true,
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function drawCenteredText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  font: string,
  color: string,
) {
  doc.font(font).fontSize(size).fillColor(color);
  const textWidth = doc.widthOfString(text);
  doc.text(text, x + Math.max(0, (width - textWidth) / 2), y, { width, lineBreak: false });
}

function collectPdf(doc: PDFKit.PDFDocument) {
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
