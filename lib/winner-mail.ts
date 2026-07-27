import { sendAdminMail } from "./admin-mail";
import { publicBaseUrl } from "./public-url";
import type { AdminSubmissionDetail } from "./admin-store";

type WinnerAnnouncementInput = {
  submission: AdminSubmissionDetail;
  award: string;
  ownerName: string;
};

type WinnerAnnouncementResult = {
  email: string;
  status: "sent" | "outbox" | "failed" | "skipped";
};

export async function sendWinnerAnnouncementEmails(input: WinnerAnnouncementInput) {
  const recipients = winnerRecipients(input.submission);
  if (!recipients.length) return [] satisfies WinnerAnnouncementResult[];

  const results: WinnerAnnouncementResult[] = [];
  for (const recipient of recipients) {
    const mail = await sendAdminMail({
      to: recipient.email,
      subject: `ขอแสดงความยินดี ผลงานของท่านได้รับ${input.award}`,
      emailEyebrow: "WINNER ANNOUNCEMENT",
      emailHeading: "ประกาศผลการแข่งขัน",
      emailSubtitle: "Police Innovation Contest 2026",
      outboxKey: `winner-announcement-${input.submission.submission_code}-${safeOutboxKey(recipient.email)}-${Date.now()}`,
      text: winnerAnnouncementText(input, recipient.name),
      html: winnerAnnouncementHtml(input, recipient.name),
    });
    results.push({ email: recipient.email, status: winnerMailStatus(mail.status) });
  }
  return results;
}

function winnerMailStatus(status: string): WinnerAnnouncementResult["status"] {
  if (status === "sent" || status === "outbox" || status === "failed") return status;
  return "skipped";
}

function winnerRecipients(submission: AdminSubmissionDetail) {
  const recipients = [
    { email: submission.email, name: primaryRecipientName(submission) },
    ...submission.members.map((member) => ({
      email: member.email,
      name: `${member.title}${member.first_name} ${member.last_name}`.trim(),
    })),
  ];
  const seen = new Set<string>();
  return recipients
    .map((recipient) => ({
      email: recipient.email.trim().toLowerCase(),
      name: recipient.name.trim(),
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
    "รายละเอียดเพิ่มเติม ทีมงานจะประสานงานเพื่อให้ข้อมูลและขั้นตอนถัดไปเพิ่มเติม",
    `ดูประกาศได้ที่ ${detailUrl}`,
  ].join("\n");
}

function winnerAnnouncementHtml(input: WinnerAnnouncementInput, recipientName: string) {
  const detailUrl = publicBaseUrl();
  return `<p style="margin:0 0 16px">เรียน <strong>${escapeHtml(recipientName || input.ownerName)}</strong></p>
    <p style="margin:0 0 18px;line-height:1.8">ทีมงาน <strong>Police Innovation Contest 2026</strong> ขอแสดงความยินดี ผลงานของท่านได้รับรางวัลจากการประกวดนวัตกรรมสำนักงานตำรวจแห่งชาติ</p>
    <div style="margin:20px 0;padding:20px 18px;border:1px solid #d8b62f;border-radius:12px;background:#fff9e8">
      <div style="font-size:13px;font-weight:700;color:#6d5b16">ผลรางวัล</div>
      <div style="margin-top:5px;font-size:25px;font-weight:800;color:#0a2d63;line-height:1.35">${escapeHtml(input.award)}</div>
    </div>
    <div style="margin:0 0 20px;padding:16px 18px;border:1px solid #dce3ed;border-radius:10px;background:#f6f8fc">
      <div style="font-size:12px;font-weight:700;color:#657083">ผลงาน</div>
      <div style="margin-top:3px;font-size:18px;font-weight:800;color:#0a2d63;line-height:1.45">${escapeHtml(input.submission.title_th)}</div>
      <div style="margin-top:7px;color:#46536a">รหัสผลงาน: <strong>${escapeHtml(input.submission.submission_code)}</strong></div>
    </div>
    <p style="margin:0 0 22px;color:#46536a;line-height:1.8">รายละเอียดเพิ่มเติม ทีมงานจะประสานงานเพื่อให้ข้อมูลและขั้นตอนถัดไปเพิ่มเติม</p>
    <div style="text-align:center">
      <a href="${escapeHtml(detailUrl)}" style="display:inline-block;min-width:210px;background:#d8b62f;color:#07142b;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:9px;text-align:center">ดูประกาศบนเว็บไซต์</a>
    </div>`;
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
