import path from "path";
import { sendAdminMail } from "./admin-mail";
import { publicBaseUrl } from "./public-url";
import type { AdminSubmissionDetail } from "./admin-store";

const committeeGuidePath = path.join(process.cwd(), "public", "documents", "committee-guide-round1.pdf");

type AssignmentMailResult = "sent" | "outbox" | "failed" | "skipped";

export async function sendSubmissionAssignmentEmail(submission: AdminSubmissionDetail | null, adminEmail: string | null) {
  const email = adminEmail?.trim().toLowerCase();
  if (!submission || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "skipped" as AssignmentMailResult };

  const detailUrl = `${publicBaseUrl()}/admin/submissions/${encodeURIComponent(submission.submission_code)}`;
  const mail = await sendAdminMail({
    to: email,
    subject: `มอบหมายงานตรวจผลงาน ${submission.submission_code}`,
    emailEyebrow: "REVIEW ASSIGNMENT",
    emailHeading: "มอบหมายงานตรวจผลงาน",
    emailSubtitle: "Police Innovation Contest 2026 | รอบที่ 1 การประเมินเอกสาร",
    outboxKey: `assignment-${submission.submission_code}-${safeOutboxKey(email)}-${Date.now()}`,
    text: assignmentText(submission, detailUrl),
    html: assignmentHtml(submission, detailUrl),
    attachments: [{
      filename: "คู่มือคณะกรรมการ_รอบที่1.pdf",
      path: committeeGuidePath,
      contentType: "application/pdf",
    }],
  });
  return { status: mail.status };
}

function assignmentText(submission: AdminSubmissionDetail, detailUrl: string) {
  const owner = primaryOwnerName(submission);
  return [
    "เรียนคณะกรรมการ/ผู้ตรวจเอกสาร",
    "",
    "ท่านได้รับมอบหมายให้ตรวจผลงานรอบที่ 1 การประเมินเอกสาร",
    `รหัสผลงาน: ${submission.submission_code}`,
    `ชื่อผลงาน: ${submission.title_th}`,
    `ผู้รับผิดชอบหลัก: ${owner}`,
    `หน่วยงาน: ${submission.division || "-"}`,
    "",
    `เปิดหน้าตรวจผลงาน: ${detailUrl}`,
    "",
    "เอกสารแนบ: คู่มือคณะกรรมการ รอบที่ 1",
  ].join("\n");
}

function assignmentHtml(submission: AdminSubmissionDetail, detailUrl: string) {
  const owner = primaryOwnerName(submission);
  return `<p style="margin:0 0 16px">เรียนคณะกรรมการ/ผู้ตรวจเอกสาร</p>
    <p style="margin:0 0 18px;line-height:1.8">ท่านได้รับมอบหมายให้ตรวจผลงาน <strong>รอบที่ 1 การประเมินเอกสาร</strong> กรุณาเข้าสู่ระบบหลังบ้านเพื่อเปิดข้อมูลผู้สมัคร เอกสารแนบ และบันทึกคะแนนตามเกณฑ์ที่กำหนด</p>
    <div style="margin:0 0 20px;padding:18px;border:1px solid #dce3ed;border-radius:12px;background:#f6f8fc">
      <div style="font-size:12px;font-weight:700;color:#657083">รหัสผลงาน</div>
      <div style="margin-top:3px;font-size:20px;font-weight:800;color:#0a2d63;overflow-wrap:anywhere">${escapeHtml(submission.submission_code)}</div>
      <div style="margin-top:14px;font-size:12px;font-weight:700;color:#657083">ชื่อผลงาน</div>
      <div style="margin-top:3px;font-size:18px;font-weight:800;color:#172033;line-height:1.45">${escapeHtml(submission.title_th)}</div>
      <div style="margin-top:14px;color:#46536a;line-height:1.7">ผู้รับผิดชอบหลัก: <strong>${escapeHtml(owner)}</strong><br>หน่วยงาน: <strong>${escapeHtml(submission.division || "-")}</strong></div>
    </div>
    <div style="margin:0 0 22px;padding:16px 18px;border-left:4px solid #d8b62f;background:#fff9e8;color:#314158;line-height:1.8">
      แนบคู่มือคณะกรรมการ รอบที่ 1 ไปพร้อมอีเมลฉบับนี้แล้ว
    </div>
    <div style="text-align:center">
      <a href="${escapeHtml(detailUrl)}" style="display:inline-block;min-width:230px;background:#d8b62f;color:#07142b;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:9px;text-align:center">เปิดหน้าตรวจผลงาน</a>
    </div>`;
}

function primaryOwnerName(submission: AdminSubmissionDetail) {
  const primary = submission.members[0];
  if (primary) return `${primary.title}${primary.first_name} ${primary.last_name}`.trim();
  return `${submission.first_name} ${submission.last_name}`.trim();
}

function safeOutboxKey(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 100) || "admin";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
