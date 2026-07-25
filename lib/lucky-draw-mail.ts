import { sendAdminMail } from "./admin-mail";
import { publicBaseUrl } from "./public-url";
import type { EvaluationRecord } from "./evaluation-store";

export async function sendLuckyDrawWinnerEmail(winner: EvaluationRecord) {
  if (!winner.email || !winner.lucky_draw_prize) return { status: "skipped" as const };
  const name = winner.participant_name ?? winner.registration_code;
  const prize = `รางวัลที่ ${winner.lucky_draw_prize}`;
  const detailUrl = `${publicBaseUrl()}/profile/login`;
  return sendAdminMail({
    to: winner.email,
    subject: `ยินดีด้วย คุณได้รับรางวัล Lucky Draw ${prize}`,
    emailHeading: "ยินดีด้วย คุณได้รับรางวัล Lucky Draw",
    emailSubtitle: `${name} ได้รับ ${prize}`,
    outboxKey: `lucky-draw-${winner.registration_code}`,
    text: `ยินดีด้วย ${name}\nคุณได้รับรางวัล Lucky Draw ${prize}\nรหัสลงทะเบียน: ${winner.registration_code}\nดูรายละเอียดได้ที่ ${detailUrl}`,
    html: `<div style="margin:0 0 22px;padding:22px;border:1px solid #d8b62f;border-radius:12px;background:#fff9e8;text-align:center">
        <div style="font-size:14px;color:#6d5b16">รางวัลของคุณ</div>
        <div style="margin-top:5px;font-size:29px;font-weight:800;color:#0a2d63">${escapeHtml(prize)}</div>
      </div>
      <p style="margin:0 0 18px">รหัสลงทะเบียน: <strong>${escapeHtml(winner.registration_code)}</strong></p>
      <p style="margin:0 0 22px">กรุณาติดต่อเจ้าหน้าที่ ณ จุดรับรางวัล พร้อมแสดงรหัสลงทะเบียนหรือ QR Code ของท่าน</p>
      <a href="${escapeHtml(detailUrl)}" style="display:inline-block;background:#d8b62f;color:#07142b;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:9px">เปิดข้อมูลลงทะเบียน</a>`,
  });
}

export async function sendLuckyDrawResetEmail(winner: EvaluationRecord) {
  if (!winner.email || !winner.lucky_draw_prize) return { status: "skipped" as const };
  const name = winner.participant_name ?? winner.registration_code;
  const prize = `รางวัลที่ ${winner.lucky_draw_prize}`;
  return sendAdminMail({
    to: winner.email,
    subject: `แจ้งยกเลิกผล Lucky Draw ${prize} เนื่องจากระบบขัดข้อง`,
    emailHeading: "แจ้งยกเลิกผล Lucky Draw เดิม",
    emailSubtitle: "ประกาศสำคัญจากทีมงาน Police Innovation Contest 2026",
    outboxKey: `lucky-draw-reset-${winner.registration_code}-${Date.now()}`,
    text: [
      `เรียน ${name}`,
      `ขอแจ้งยกเลิกผล Lucky Draw ${prize} ของรหัสลงทะเบียน ${winner.registration_code}`,
      "เนื่องจากเกิดข้อผิดพลาดของระบบ ทีมงานจำเป็นต้อง Reset ผลการจับฉลากเดิมและดำเนินการใหม่",
      "ขออภัยในความไม่สะดวก ทีมงานจะแจ้งผลที่ถูกต้องอีกครั้ง",
    ].join("\n"),
    html: `<p style="margin:0 0 16px">เรียน <strong>${escapeHtml(name)}</strong></p>
      <p style="margin:0 0 16px">ขอแจ้งยกเลิกผล <strong>${escapeHtml(prize)}</strong> ของรหัสลงทะเบียน <strong>${escapeHtml(winner.registration_code)}</strong></p>
      <div style="margin:20px 0;padding:16px 18px;border-left:4px solid #b42318;background:#fff4f2;color:#7a271a">
        เนื่องจากเกิดข้อผิดพลาดของระบบ ทีมงานจำเป็นต้อง Reset ผลการจับฉลากเดิมและดำเนินการใหม่
      </div>
      <p style="margin-bottom:0">ขออภัยในความไม่สะดวก ทีมงานจะแจ้งผลที่ถูกต้องอีกครั้ง</p>`,
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
