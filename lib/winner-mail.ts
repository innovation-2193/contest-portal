import { sendAdminMail } from "./admin-mail";
import { publicBaseUrl } from "./public-url";
import { ensureSubmissionMemberParticipant, type AdminSubmissionDetail } from "./admin-store";
import { sendRegistrationConfirmation } from "./registration-artifacts";
import path from "path";

const lineCoordinationQrCid = "police-innovation-line-coordination-qr";
const lineCoordinationDeadline = "14 สิงหาคม 2569";
const lineCoordinationUrl = "https://line.me/ti/g/Fg6PscYxwQ";

type WinnerAnnouncementInput = {
  submission: AdminSubmissionDetail;
  award: string;
  ownerName: string;
};

type WinnerAnnouncementResult = {
  email: string;
  status: "sent" | "outbox" | "failed" | "skipped";
  registrationEmailStatus: "sent" | "outbox" | "failed" | "skipped";
};

export async function sendWinnerAnnouncementEmails(input: WinnerAnnouncementInput) {
  const recipients = winnerRecipients(input.submission);
  if (!recipients.length) return [] satisfies WinnerAnnouncementResult[];

  const results: WinnerAnnouncementResult[] = [];
  for (const recipient of recipients) {
    const registration = await ensureSubmissionMemberParticipant(input.submission.submission_code, recipient.memberOrder);
    const registrationEmail = registration.created
      ? await sendRegistrationConfirmation(registration.record)
      : { status: "skipped" as const };
    const mail = await sendAdminMail({
      to: recipient.email,
      subject: `ขอแสดงความยินดี ผลงานของท่านได้รับ${input.award}`,
      emailEyebrow: "WINNER ANNOUNCEMENT",
      emailHeading: "ขอแสดงความยินดี",
      emailSubtitle: "ผู้ได้รับรางวัล Police Innovation Contest 2026 | สำนักงานตำรวจแห่งชาติ ประจำปี พ.ศ. 2569",
      outboxKey: `winner-announcement-${input.submission.submission_code}-${safeOutboxKey(recipient.email)}-${Date.now()}`,
      text: winnerAnnouncementText(input, recipient.name),
      html: winnerAnnouncementHtml(input, recipient.name),
      attachments: [lineCoordinationQrAttachment()],
    });
    results.push({ email: recipient.email, status: winnerMailStatus(mail.status), registrationEmailStatus: winnerMailStatus(registrationEmail.status) });
  }
  return results;
}

function winnerMailStatus(status: string): WinnerAnnouncementResult["status"] {
  if (status === "sent" || status === "outbox" || status === "failed") return status;
  return "skipped";
}

function winnerRecipients(submission: AdminSubmissionDetail) {
  const recipients = [
    { email: submission.email, name: primaryRecipientName(submission), memberOrder: submission.members[0]?.member_order ?? 1 },
    ...submission.members.map((member) => ({
      email: member.email,
      name: `${member.title}${member.first_name} ${member.last_name}`.trim(),
      memberOrder: member.member_order,
    })),
  ];
  const seen = new Set<string>();
  return recipients
    .map((recipient) => ({
      email: recipient.email.trim().toLowerCase(),
      name: recipient.name.trim(),
      memberOrder: recipient.memberOrder,
    }))
    .filter((recipient) => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email) || seen.has(recipient.email)) return false;
      seen.add(recipient.email);
      return true;
    });
}

function primaryRecipientName(submission: AdminSubmissionDetail) {
  const primary = submission.members[0];
  if (primary) return `${primary.title}${primary.first_name} ${primary.last_name}`.trim();
  return `${submission.first_name} ${submission.last_name}`.trim();
}

function winnerAnnouncementText(input: WinnerAnnouncementInput, recipientName: string) {
  const detailUrl = publicBaseUrl();
  return [
    `เรียน ${recipientName || input.ownerName}`,
    "",
    "ทีมงาน Police Innovation Contest 2026 ขอแสดงความยินดี",
    `ผลงาน: ${input.submission.title_th}`,
    `รหัสผลงาน: ${input.submission.submission_code}`,
    `ผลรางวัล: ${input.award}`,
    "",
    `กรุณาเข้ากลุ่มประสานงาน LINE ตาม QR Code ที่แนบในอีเมลนี้ ภายในวันที่ ${lineCoordinationDeadline}`,
    `ลิงก์กลุ่ม LINE: ${lineCoordinationUrl}`,
    "ทีมงานจะใช้กลุ่มนี้ในการแจ้งรายละเอียดและประสานงานต่อเนื่องจนเสร็จสิ้นกระบวนการประกวดนวัตกรรม สำนักงานตำรวจแห่งชาติ ประจำปี พ.ศ. 2569",
    "",
    `ดูประกาศได้ที่ ${detailUrl}`,
  ].join("\n");
}

function winnerAnnouncementHtml(input: WinnerAnnouncementInput, recipientName: string) {
  const detailUrl = publicBaseUrl();
  const awardParts = splitAward(input.award);
  return `<p style="margin:0 0 16px">เรียน <strong>${escapeHtml(recipientName || input.ownerName)}</strong></p>
    <p style="margin:0 0 18px;line-height:1.8">ทีมงาน <strong>Police Innovation Contest 2026</strong> ขอแสดงความยินดีเป็นอย่างยิ่ง ผลงานของท่านได้รับรางวัลจากการประกวดนวัตกรรมสำนักงานตำรวจแห่งชาติ ประจำปี พ.ศ. 2569</p>
    <div style="margin:20px 0;padding:22px 20px;border:1px solid #d8b62f;border-radius:14px;background:#fff9e8">
      <div style="font-size:13px;font-weight:700;color:#6d5b16">ผลรางวัล</div>
      <div class="winner-award-title" style="margin-top:5px;font-size:25px;font-weight:800;color:#0a2d63;line-height:1.35">${escapeHtml(awardParts.title)}</div>
      ${awardParts.note ? `<div style="margin-top:6px;font-size:18px;font-weight:700;color:#314158;line-height:1.55">${escapeHtml(awardParts.note)}</div>` : ""}
    </div>
    <div style="margin:0 0 20px;padding:16px 18px;border:1px solid #dce3ed;border-radius:10px;background:#f6f8fc">
      <div style="font-size:12px;font-weight:700;color:#657083">ผลงาน</div>
      <div style="margin-top:3px;font-size:18px;font-weight:800;color:#0a2d63;line-height:1.45">${escapeHtml(input.submission.title_th)}</div>
      <div style="margin-top:7px;color:#46536a">รหัสผลงาน: <strong>${escapeHtml(input.submission.submission_code)}</strong></div>
    </div>
    <div style="margin:0 0 22px;padding:18px;border:1px solid #dce3ed;border-radius:14px;background:#f6f8fc">
      <table class="winner-line-grid" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td class="winner-line-qr" width="164" valign="top" align="center" style="padding:0 18px 0 0">
            <a href="${escapeHtml(lineCoordinationUrl)}" style="display:inline-block;text-decoration:none">
              <img src="cid:${lineCoordinationQrCid}" width="148" height="148" alt="QR Code กลุ่มประสานงาน LINE" style="display:block;width:148px;height:148px;border:1px solid #dce3ed;border-radius:10px;background:#ffffff">
            </a>
            <div style="margin-top:6px;font-size:12px;font-weight:800;color:#657083">LINE Group</div>
          </td>
          <td class="winner-line-copy" valign="top" style="padding:0">
            <div style="font-size:13px;font-weight:800;color:#6d5b16">ขั้นตอนถัดไป</div>
            <div style="margin-top:6px;font-size:18px;font-weight:800;color:#0a2d63;line-height:1.45">เข้ากลุ่มประสานงาน LINE ภายในวันที่ ${escapeHtml(lineCoordinationDeadline)}</div>
            <p style="margin:10px 0 0;color:#46536a;line-height:1.8">กรุณาสแกนหรือกดที่ QR Code เพื่อเข้ากลุ่มประสานงานผู้ได้รับรางวัล ทีมงานจะใช้กลุ่มนี้ในการแจ้งรายละเอียดและประสานงานต่อเนื่องจนเสร็จสิ้นกระบวนการประกวดนวัตกรรม สำนักงานตำรวจแห่งชาติ ประจำปี พ.ศ. 2569</p>
          </td>
        </tr>
      </table>
      <div style="margin-top:16px;text-align:center">
        <a href="${escapeHtml(lineCoordinationUrl)}" style="display:inline-block;min-width:210px;background:#06c755;color:#ffffff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:9px;text-align:center">เข้ากลุ่มประสานงาน LINE</a>
      </div>
    </div>
    <div style="text-align:center">
      <a href="${escapeHtml(detailUrl)}" style="display:inline-block;min-width:210px;background:#d8b62f;color:#07142b;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:9px;text-align:center">ดูประกาศบนเว็บไซต์</a>
    </div>`;
}

function splitAward(award: string) {
  const [title, ...noteParts] = award.split(":");
  return {
    title: title.trim() || award,
    note: noteParts.join(":").trim(),
  };
}

function lineCoordinationQrAttachment() {
  return {
    filename: "line-coordination-qr.jpg",
    path: path.join(process.cwd(), "public", "line-coordination-qr.jpg"),
    cid: lineCoordinationQrCid,
    contentType: "image/jpeg",
  };
}

function safeOutboxKey(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 80) || "recipient";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
