import path from "path";
import { sendAdminMail } from "./admin-mail";
import { sendRegistrationReminder } from "./registration-artifacts";
import type { RegistrationRecord } from "./local-registrations";
import type { SubmissionApplicantExportRow } from "./admin-store";

type NonFinalistInvitationResult = {
  email: string;
  status: "sent" | "outbox" | "failed" | "skipped";
  withQr: boolean;
  projectCount: number;
};

const parkingMapPath = path.join(process.cwd(), "public", "email", "parking-map.png");

export async function sendNonFinalistInvitationEmails(input: {
  applicants: SubmissionApplicantExportRow[];
  finalistSubmissionCodes: Set<string>;
  participants: RegistrationRecord[];
}) {
  const grouped = new Map<string, { name: string; projects: Set<string> }>();
  for (const applicant of input.applicants) {
    const submissionCode = applicant.submission_code.trim();
    const email = applicant.email.trim().toLowerCase();
    if (!submissionCode || input.finalistSubmissionCodes.has(submissionCode) || !isValidEmail(email)) continue;
    const current = grouped.get(email) ?? { name: applicantName(applicant), projects: new Set<string>() };
    current.projects.add(`${applicant.title_th.trim()} (${submissionCode})`);
    if (!current.name) current.name = applicantName(applicant);
    grouped.set(email, current);
  }

  const participantByEmail = new Map(
    input.participants
      .filter((participant) => participant.status !== "cancelled" && isValidEmail(participant.email))
      .map((participant) => [participant.email.trim().toLowerCase(), participant] as const),
  );
  const results: NonFinalistInvitationResult[] = [];

  for (const [email, recipient] of grouped) {
    const registration = participantByEmail.get(email);
    if (registration) {
      const result = await sendRegistrationReminder(registration);
      results.push({
        email,
        status: normalizeMailStatus(result.status),
        withQr: true,
        projectCount: recipient.projects.size,
      });
      continue;
    }

    const result = await sendAdminMail({
      to: email,
      subject: "ขอเชิญเข้าร่วมงาน Police Innovation Contest 2026 วันที่ 24 สิงหาคม 2569",
      emailEyebrow: "EVENT INVITATION",
      emailHeading: "ขอเชิญเข้าร่วมงาน",
      emailSubtitle: "Police Innovation Contest 2026 | สำนักงานตำรวจแห่งชาติ ประจำปี พ.ศ. 2569",
      emailFooterExtra: "กลุ่มงานวิจัยและพัฒนานวัตกรรมฯ บก.สสท. โทร. 0 2205 2193",
      outboxKey: `non-finalist-invitation-${safeOutboxKey(email)}-${Date.now()}`,
      text: invitationText(recipient.name, recipient.projects),
      html: invitationHtml(recipient.name, recipient.projects),
      attachments: [{ filename: "parking-map.png", path: parkingMapPath, cid: "parking-map", contentType: "image/png" }],
    });
    results.push({ email, status: normalizeMailStatus(result.status), withQr: false, projectCount: recipient.projects.size });
  }

  return results;
}

function invitationText(name: string, projects: Set<string>) {
  return [
    `เรียน ${name || "ผู้สมัคร"}`,
    "",
    "ขอเชิญท่านเข้าร่วมงาน Police Innovation Contest 2026 ในวันที่ 24 สิงหาคม 2569",
    "แม้ผลงานของท่านไม่ได้รับการประกาศเป็น 10 ทีมรอบสุดท้าย แต่ทีมงานยินดีต้อนรับท่านเข้าร่วมงาน",
    "",
    `ผลงานที่เกี่ยวข้อง: ${[...projects].join(", ")}`,
    "วันที่: 24 สิงหาคม 2569 (24 ส.ค. 69)",
    "เริ่มลงทะเบียน: เวลา 08.00 น.",
    "สถานที่: สโมสรตำรวจ",
    "",
    "ลานจอดฝั่งวิภาวดี สำหรับ VIP, ผู้จัดแสดงผลงาน, คณะทำงานและเจ้าหน้าที่",
    "ลานจอดฝั่งลานมะพร้าว สำหรับ ผู้เข้าร่วมงาน, สื่อมวลชน, คณะทำงานและเจ้าหน้าที่",
    "กรุณานำบัตรประชาชนมาแสดงต่อเจ้าหน้าที่ ณ จุดลงทะเบียน",
  ].join("\n");
}

function invitationHtml(name: string, projects: Set<string>) {
  const projectList = [...projects].map((project) => `<li style="margin:0 0 6px">${escapeHtml(project)}</li>`).join("");
  return `<p style="margin:0 0 18px">เรียน <strong>${escapeHtml(name || "ผู้สมัคร")}</strong></p>
    <p style="margin:0 0 18px;line-height:1.8">ขอเชิญท่านเข้าร่วมงาน <strong>Police Innovation Contest 2026</strong> ในวันที่ 24 สิงหาคม 2569 แม้ผลงานของท่านไม่ได้รับการประกาศเป็น 10 ทีมรอบสุดท้าย แต่ทีมงานยินดีต้อนรับท่านเข้าร่วมงาน</p>
    <div style="margin:20px 0;padding:20px 22px;border:1px solid #d8b62f;border-radius:12px;background:#fff9ec;color:#172033">
      <p style="margin:0 0 8px"><strong>วันที่:</strong> 24 สิงหาคม 2569 (24 ส.ค. 69)</p>
      <p style="margin:0 0 8px"><strong>เริ่มลงทะเบียน:</strong> เวลา 08.00 น.</p>
      <p style="margin:0"><strong>สถานที่:</strong> สโมสรตำรวจ</p>
    </div>
    <p style="margin:0 0 8px"><strong>ผลงานที่เกี่ยวข้อง</strong></p>
    <ul style="margin:0 0 20px;padding-left:22px;line-height:1.7">${projectList}</ul>
    <div style="margin:0 0 20px;padding:18px;border:1px solid #dce3ed;border-radius:12px;background:#f6f8fc;line-height:1.8">
      <strong>การจอดรถ</strong><br>
      ลานจอดฝั่งวิภาวดี สำหรับ VIP, ผู้จัดแสดงผลงาน, คณะทำงานและเจ้าหน้าที่<br>
      ลานจอดฝั่งลานมะพร้าว สำหรับ ผู้เข้าร่วมงาน, สื่อมวลชน, คณะทำงานและเจ้าหน้าที่
      <img src="cid:parking-map" alt="แผนผังลานจอดรถ" style="display:block;width:100%;max-width:900px;height:auto;margin:16px auto 0;border-radius:8px">
    </div>
    <p style="margin:0;line-height:1.8">กรุณานำบัตรประชาชนมาแสดงต่อเจ้าหน้าที่ ณ จุดลงทะเบียน</p>`;
}

function applicantName(applicant: SubmissionApplicantExportRow) {
  return `${applicant.title}${applicant.first_name} ${applicant.last_name}`.trim();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeMailStatus(status: string): NonFinalistInvitationResult["status"] {
  if (status === "sent" || status === "outbox" || status === "failed") return status;
  return "skipped";
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
