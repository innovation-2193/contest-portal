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
    emailEyebrow: "LUCKY DRAW WINNER",
    emailHeading: "ขอแสดงความยินดี",
    emailSubtitle: "คุณได้รับรางวัล Lucky Draw",
    outboxKey: `lucky-draw-${winner.registration_code}`,
    text: `ยินดีด้วย ${name}\nคุณได้รับรางวัล Lucky Draw ${prize}\nรหัสลงทะเบียน: ${winner.registration_code}\nดูรายละเอียดได้ที่ ${detailUrl}`,
    html: luckyDrawWinnerEmailContent(winner, detailUrl),
  });
}

export function luckyDrawWinnerEmailContent(winner: Pick<EvaluationRecord, "participant_name" | "registration_code" | "lucky_draw_prize">, detailUrl: string) {
  const name = winner.participant_name ?? winner.registration_code;
  return `<p style="margin:0 0 8px;text-align:center;color:#5a6478">Police Innovation Contest 2026</p>
      <h2 style="margin:0 0 22px;text-align:center;font-size:23px;line-height:1.45;color:#0a2d63">ขอแสดงความยินดีกับ<br>${escapeHtml(name)}</h2>
      <div style="margin:0 0 24px;padding:26px 18px;border:1px solid #d8b62f;border-radius:12px;background:#fff9e8;text-align:center">
        <div style="font-size:13px;font-weight:700;color:#6d5b16">ผลรางวัล Lucky Draw</div>
        <div style="margin:8px 0 2px;font-size:24px;font-weight:800;color:#0a2d63">รางวัลที่</div>
        <div style="font-size:54px;font-weight:800;line-height:1;color:#0a2d63">${winner.lucky_draw_prize}</div>
      </div>
      <div style="margin:0 0 22px;padding:16px 18px;border:1px solid #dce3ed;border-radius:10px;background:#f6f8fc">
        <div style="font-size:12px;font-weight:700;color:#657083">รหัสลงทะเบียน</div>
        <div style="margin-top:3px;font-size:19px;font-weight:800;color:#0a2d63;overflow-wrap:anywhere">${escapeHtml(winner.registration_code)}</div>
      </div>
      <p style="margin:0 0 24px;color:#46536a;line-height:1.8">กรุณาติดต่อเจ้าหน้าที่ ณ จุดรับรางวัล พร้อมแสดงรหัสลงทะเบียนหรือ QR Code ของท่าน</p>
      <div style="text-align:center">
        <a href="${escapeHtml(detailUrl)}" style="display:inline-block;min-width:210px;background:#d8b62f;color:#07142b;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:9px;text-align:center">เปิดข้อมูลลงทะเบียน</a>
      </div>`;
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
