import { findAdminAccountByEmail, listAdminAccounts } from "./admin-users";
import { superAdminEmails } from "./admin-auth";
import type { SubmissionListItem } from "./admin-store";

export const progressScoreCriteria = [
  { key: "review_rules_score", label: "ผลงานตำรวจ", max: 20 },
  { key: "review_problem_score", label: "ปัญหา/จำเป็น", max: 15 },
  { key: "review_innovation_score", label: "นวัตกรรม", max: 25 },
  { key: "review_evidence_score", label: "หลักฐานผลลัพธ์", max: 20 },
  { key: "review_impact_score", label: "ผลกระทบ", max: 20 },
] as const;

export type ReviewerProgress = {
  email: string;
  name: string;
  assigned: SubmissionListItem[];
  scored: SubmissionListItem[];
  pending: SubmissionListItem[];
  averageScore: number | null;
  latestActivity: string | null;
};

export function buildReviewerProgress(submissions: SubmissionListItem[], admins: Awaited<ReturnType<typeof listAdminAccounts>>): ReviewerProgress[] {
  const labels = new Map(admins.map((admin) => [admin.email.toLowerCase(), admin.name || admin.email]));
  const reviewerEmails = new Set([
    ...admins.map((admin) => admin.email.toLowerCase()),
    ...submissions.map((item) => item.review_assigned_admin_email?.toLowerCase() ?? "").filter(Boolean),
  ]);

  return [...reviewerEmails]
    .map((email) => {
      const assigned = submissions
        .filter((item) => item.review_assigned_admin_email?.toLowerCase() === email)
        .sort(sortByPendingThenDate);
      const scored = assigned.filter((item) => Boolean(item.review_submitted_at));
      const pending = assigned.filter((item) => !item.review_submitted_at);
      return {
        email,
        name: labels.get(email) ?? email,
        assigned,
        scored,
        pending,
        averageScore: average(scored.map((item) => item.review_total_score).filter(isNumber)),
        latestActivity: latestDate(assigned.map((item) => item.review_submitted_at || item.review_assigned_at)),
      };
    })
    .filter((reviewer) => reviewer.assigned.length > 0)
    .sort((a, b) => b.pending.length - a.pending.length || b.assigned.length - a.assigned.length || a.email.localeCompare(b.email));
}

export async function reviewerLabel(input: { assignedEmail: string | null; scoredEmail: string | null }) {
  const scoredEmail = input.scoredEmail?.trim().toLowerCase() || "";
  const assignedEmail = input.assignedEmail?.trim().toLowerCase() || "";
  const email = assignedEmail || scoredEmail;
  if (!email) return "ยังไม่ได้ระบุผู้ตรวจ";

  if (superAdminEmails.some((item) => item === email)) return `Super Admin (${email}) • ผู้ตรวจ`;
  const account = await findAdminAccountByEmail(email);
  return `${account?.name ? `${account.name} (${account.email})` : email} • ผู้ตรวจ`;
}

export function sortByPendingThenDate(a: SubmissionListItem, b: SubmissionListItem) {
  const pendingDiff = Number(Boolean(a.review_submitted_at)) - Number(Boolean(b.review_submitted_at));
  if (pendingDiff !== 0) return pendingDiff;
  return new Date(b.review_submitted_at || b.review_assigned_at || b.submitted_at).getTime()
    - new Date(a.review_submitted_at || a.review_assigned_at || a.submitted_at).getTime();
}

export function percent(value: number, total: number) {
  if (!total) return 0;
  return clamp((value / total) * 100, 0, 100);
}

export function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function latestDate(values: Array<string | Date | null | undefined>) {
  const dates = values
    .map((value) => value ? new Date(value) : null)
    .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  return dates[0]?.toISOString() ?? null;
}

export function formatProgressDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}
