import QRCode from "qrcode";
import { sendAdminMail } from "./admin-mail";
import { publicBaseUrl } from "./public-url";
import type { EvaluationRecord } from "./evaluation-store";

export async function sendGiftQrEmail(evaluation: EvaluationRecord) {
  if (!evaluation.email || !evaluation.gift_qr_token) return { status: "skipped" as const };
  const qr = await QRCode.toBuffer(evaluation.gift_qr_token, { width: 720, margin: 2, errorCorrectionLevel: "H" });
  const name = evaluation.participant_name ?? evaluation.registration_code;
  const detailUrl = `${publicBaseUrl()}/profile/login`;
  return sendAdminMail({
    to: evaluation.email,
    subject: "QR Code สำหรับรับของชำร่วยจากแบบประเมินความพึงพอใจ",
    emailEyebrow: "SURVEY GIFT QR CODE",
    emailHeading: "QR Code สำหรับรับของชำร่วย",
    emailSubtitle: "ส่งแบบประเมินเรียบร้อยแล้ว · Police Innovation Contest 2026",
    outboxKey: `gift-qr-${evaluation.registration_code}`,
    text: [
      `เรียน ${name}`,
      "ขอบคุณที่ทำแบบประเมินความพึงพอใจ",
      "กรุณานำ QR Code นี้มาแสดงที่จุดรับของชำร่วย เจ้าหน้าที่จะสแกนเพื่อบันทึกการรับของชำร่วย",
      "QR Code นี้ใช้สำหรับรับของชำร่วยเท่านั้น และไม่ใช่ QR Code สำหรับเช็คอินเข้าร่วมงาน",
      `เปิดข้อมูลของคุณได้ที่ ${detailUrl}`,
    ].join("\n"),
    html: `<p style="margin:0 0 18px">เรียน <strong>${escapeHtml(name)}</strong></p>
      <p style="margin:0 0 18px;line-height:1.8">ขอบคุณที่ทำแบบประเมินความพึงพอใจเรียบร้อยแล้ว กรุณานำ QR Code นี้มาแสดงที่จุดรับของชำร่วย เจ้าหน้าที่จะสแกนเพื่อบันทึกการรับของชำร่วย</p>
      <div style="margin:22px 0;padding:24px;border:1px solid #d8b62f;border-radius:14px;background:#fff9ec;text-align:center">
        <h2 style="margin:0 0 8px;color:#0a2d63">QR Code รับของชำร่วย</h2>
        <p style="margin:0 0 18px;color:#4b5870">QR Code นี้ใช้สำหรับรับของชำร่วยเท่านั้น ไม่ใช่ QR Code สำหรับเช็คอินเข้าร่วมงาน</p>
        <img src="cid:gift-qr" alt="QR Code รับของชำร่วย" style="width:240px;height:240px;border-radius:12px;background:#fff;display:block;margin:0 auto 16px">
        <div style="display:inline-block;background:#0a2d63;color:#fff0a8;border-radius:999px;padding:8px 18px;font-weight:700">รหัสลงทะเบียน ${escapeHtml(evaluation.registration_code)}</div>
      </div>
      <p style="margin:0 0 20px;line-height:1.8">หากนำ QR Code นี้มาสแกนซ้ำหลังจากรับของชำร่วยแล้ว ระบบจะแจ้งเตือนว่า “รับของชำร่วยไปแล้ว”</p>
      <div style="text-align:center"><a href="${escapeHtml(detailUrl)}" style="display:inline-block;background:#d8b62f;color:#07142b;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:9px">เปิดข้อมูลของฉัน</a></div>`,
    attachments: [{ filename: "gift-qr.png", content: qr, cid: "gift-qr", contentType: "image/png" }],
  });
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
