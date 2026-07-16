import { mkdir, writeFile } from "fs/promises";
import path from "path";
import nodemailer from "nodemailer";

type MailStatus = "sent" | "outbox" | "skipped" | "failed";

export type SubmissionEmailRecord = {
  submission_code: string;
  submission_type: "individual" | "team";
  team_name?: string | null;
  title_th: string;
  title_en?: string | null;
  email: string;
  title: string;
  first_name: string;
  last_name: string;
  phone: string;
  position: string;
  division: string;
  bureau: string;
};

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");

export async function sendSubmissionConfirmation(record: SubmissionEmailRecord) {
  try {
    const smtpUrl = process.env.SMTP_URL;
    const smtpHost = process.env.SMTP_HOST;
    const from = process.env.SMTP_FROM ?? "Police Innovation Contest 2026 <no-reply@police.go.th>";

    if (!smtpUrl && !smtpHost) {
      await writeDevOutbox(record);
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
      subject: `ยืนยันการสมัครประกวดนวัตกรรม ${record.submission_code}`,
      html: confirmationHtml(record),
      text: confirmationText(record),
    });

    return { status: "sent" satisfies MailStatus };
  } catch (error) {
    console.error("submission email failed", error);
    return { status: "failed" satisfies MailStatus };
  }
}

function confirmationHtml(record: SubmissionEmailRecord) {
  const detailUrl = `${publicBaseUrl()}/submit/success?code=${encodeURIComponent(record.submission_code)}`;
  const submissionType = record.submission_type === "team" ? "ส่งแบบกลุ่ม" : "ส่งเดี่ยว";
  return `<div style="margin:0;background:#061127;padding:28px;font-family:Arial,'Noto Sans Thai',Tahoma,sans-serif;color:#172033;line-height:1.7">
    <div style="max-width:680px;margin:0 auto;border:1px solid #d8b62f;border-radius:14px;overflow:hidden;background:#ffffff">
      <div style="background:#123c73;color:#ffffff;padding:28px 30px;border-bottom:5px solid #d8b62f">
        <div style="font-size:13px;letter-spacing:2px;font-weight:700;text-transform:uppercase;color:#fff0a8">POLICE INNOVATION CONTEST 2026</div>
        <h1 style="margin:14px 0 6px;font-size:30px;line-height:1.25;color:#ffffff">ยืนยันการสมัครประกวดนวัตกรรม ${escapeHtml(record.submission_code)}</h1>
        <p style="margin:0;font-size:16px;color:#dfe8f7">ระบบได้รับผลงาน ${escapeHtml(record.title_th)} เรียบร้อยแล้ว</p>
      </div>
      <div style="padding:30px">
        <p style="margin:0 0 18px">เรียน ${escapeHtml(record.title)}${escapeHtml(record.first_name)} ${escapeHtml(record.last_name)}</p>
        <p style="margin:0 0 22px">ระบบได้รับข้อมูลสมัครประกวดนวัตกรรมเรียบร้อยแล้ว</p>
        <p style="margin:0 0 22px">
          เลขที่สมัคร: <strong>${escapeHtml(record.submission_code)}</strong><br>
          ชื่อผลงาน: <strong>${escapeHtml(record.title_th || "-")}</strong><br>
          หมวดหมู่: <strong>-</strong><br>
          ประเภทการส่ง: <strong>${escapeHtml(submissionType)}</strong><br>
          หน่วยงาน: <strong>${escapeHtml(record.division || "-")} / ${escapeHtml(record.bureau || "-")}</strong><br>
          ตำแหน่ง: <strong>${escapeHtml(record.position || "-")}</strong><br>
          เบอร์ติดต่อ: <strong>${escapeHtml(record.phone || "-")}</strong>
        </p>
        <p style="margin:0 0 24px">ทีมงานจะตรวจสอบเอกสารและแจ้งสถานะให้ทราบทางอีเมลนี้</p>
        <a href="${escapeHtml(detailUrl)}" style="display:inline-block;background:#d8b62f;color:#07142b;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:9px">ดูรายละเอียดการสมัคร</a>
      </div>
      <div style="padding:18px 30px;background:#f5f7fb;color:#5a6478;font-size:14px;border-top:1px solid #e6e9f0">
        อีเมลนี้ส่งจากระบบ Police Innovation Contest 2569 กรุณาอย่าตอบกลับอีเมลอัตโนมัตินี้ หากต้องการติดต่อทีมงานให้ใช้อีเมล <a href="mailto:innocontest@police.go.th">innocontest@police.go.th</a>
      </div>
    </div>
  </div>`;
}

function confirmationText(record: SubmissionEmailRecord) {
  return `ยืนยันการสมัครประกวดนวัตกรรม Police Innovation Contest 2026
เลขที่สมัคร: ${record.submission_code}
ชื่อผลงาน: ${record.title_th || "-"}
หมวดหมู่: -
ประเภทการส่ง: ${record.submission_type === "team" ? "ส่งแบบกลุ่ม" : "ส่งเดี่ยว"}
หน่วยงาน: ${record.division || "-"} / ${record.bureau || "-"}
ตำแหน่ง: ${record.position || "-"}
เบอร์ติดต่อ: ${record.phone || "-"}
ทีมงานจะตรวจสอบเอกสารและแจ้งสถานะให้ทราบทางอีเมลนี้`;
}

async function writeDevOutbox(record: SubmissionEmailRecord) {
  const outbox = path.join(storageDir, "email-outbox", record.submission_code);
  await mkdir(outbox, { recursive: true });
  await writeFile(
    path.join(outbox, "email.json"),
    `${JSON.stringify({ to: record.email, subject: `ยืนยันการสมัครประกวดนวัตกรรม ${record.submission_code}`, createdAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
}

function publicBaseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3003").replace(/\/$/, "");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
