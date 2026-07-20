import { sendAdminMail } from "./admin-mail";
import { publicBaseUrl } from "./public-url";
import type { EvaluationRecord } from "./evaluation-store";

export async function sendLuckyDrawWinnerEmail(winner: EvaluationRecord) {
  if (!winner.email || !winner.lucky_draw_prize) return { status: "skipped" as const };
  const name = winner.participant_name ?? winner.registration_code;
  const prize = `รางวัลที่ ${winner.lucky_draw_prize}`;
  const detailUrl = `${publicBaseUrl()}/register/success?code=${encodeURIComponent(winner.registration_code)}`;
  return sendAdminMail({
    to: winner.email,
    subject: `ยินดีด้วย คุณได้รับรางวัล Lucky Draw ${prize}`,
    outboxKey: `lucky-draw-${winner.registration_code}`,
    text: `ยินดีด้วย ${name}\nคุณได้รับรางวัล Lucky Draw ${prize}\nรหัสลงทะเบียน: ${winner.registration_code}\nดูรายละเอียดได้ที่ ${detailUrl}`,
    html: `<div style="margin:0;background:#061127;padding:28px;font-family:Arial,'Noto Sans Thai',Tahoma,sans-serif;color:#172033;line-height:1.7">
      <div style="max-width:680px;margin:0 auto;border:1px solid #d8b62f;border-radius:14px;overflow:hidden;background:#ffffff">
        <div style="background:#123c73;color:#ffffff;padding:28px 30px;border-bottom:5px solid #d8b62f">
          <div style="font-size:13px;letter-spacing:2px;font-weight:700;text-transform:uppercase;color:#fff0a8">POLICE INNOVATION CONTEST 2026</div>
          <h1 style="margin:14px 0 6px;font-size:30px;line-height:1.25;color:#ffffff">ยินดีด้วย คุณได้รับรางวัล Lucky Draw</h1>
          <p style="margin:0;font-size:16px;color:#dfe8f7">${escapeHtml(name)} ได้รับ ${escapeHtml(prize)}</p>
        </div>
        <div style="padding:30px">
          <p style="margin:0 0 18px">รหัสลงทะเบียน: <strong>${escapeHtml(winner.registration_code)}</strong></p>
          <p style="margin:0 0 22px">กรุณาติดต่อเจ้าหน้าที่ ณ จุดรับรางวัล พร้อมแสดงรหัสลงทะเบียนหรือ QR Code ของท่าน</p>
          <a href="${escapeHtml(detailUrl)}" style="display:inline-block;background:#d8b62f;color:#07142b;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:9px">เปิดข้อมูลลงทะเบียน</a>
        </div>
      </div>
    </div>`,
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
