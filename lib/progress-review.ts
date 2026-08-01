import { findAdminAccountByEmail, listAdminAccounts } from "./admin-users";
import { superAdminEmails } from "./admin-auth";
import type { SubmissionListItem } from "./admin-store";

export const progressScoreCriteria = [
  { key: "review_rules_score", label: "ความเป็นผลงานของตำรวจ", max: 20 },
  { key: "review_problem_score", label: "ปัญหาและความจำเป็น", max: 15 },
  { key: "review_innovation_score", label: "แนวคิดหรือรูปแบบนวัตกรรม", max: 25 },
  { key: "review_evidence_score", label: "หลักฐานผลลัพธ์เบื้องต้น", max: 20 },
  { key: "review_impact_score", label: "ความคุ้มค่าและการขยายผล", max: 20 },
] as const;

export type ReviewerProgress = {
  email: string;
  name: string;
  assigned: SubmissionListItem[];
  scored: SubmissionListItem[];
  pending: SubmissionListItem[];
  averageScore: number | null;
  latestActivity: string | null;
  completedAt: string | null;
  firstScoredAt: string | null;
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
        completedAt: pending.length === 0 ? latestDate(scored.map((item) => item.review_submitted_at)) : null,
        firstScoredAt: firstDate(scored.map((item) => item.review_submitted_at)),
      };
    })
    .filter((reviewer) => reviewer.assigned.length > 0)
    .sort(sortReviewers);
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
  const scoredDiff = Number(Boolean(b.review_submitted_at)) - Number(Boolean(a.review_submitted_at));
  if (scoredDiff !== 0) return scoredDiff;
  if (a.review_submitted_at && b.review_submitted_at) {
    return new Date(a.review_submitted_at).getTime() - new Date(b.review_submitted_at).getTime();
  }
  return new Date(a.review_assigned_at || a.submitted_at).getTime()
    - new Date(b.review_assigned_at || b.submitted_at).getTime();
}

export function reviewerStatus(reviewer: ReviewerProgress): "completed" | "in_progress" | "pending" {
  if (reviewer.pending.length === 0) return "completed";
  if (reviewer.scored.length > 0) return "in_progress";
  return "pending";
}

function sortReviewers(a: ReviewerProgress, b: ReviewerProgress) {
  const statusOrder = { completed: 0, in_progress: 1, pending: 2 };
  const statusDiff = statusOrder[reviewerStatus(a)] - statusOrder[reviewerStatus(b)];
  if (statusDiff !== 0) return statusDiff;

  const aDoneTime = reviewerTimestamp(a.completedAt || a.firstScoredAt || a.latestActivity);
  const bDoneTime = reviewerTimestamp(b.completedAt || b.firstScoredAt || b.latestActivity);
  if (aDoneTime !== bDoneTime) return aDoneTime - bDoneTime;
  return a.name.localeCompare(b.name, "th") || a.email.localeCompare(b.email);
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

export function firstDate(values: Array<string | Date | null | undefined>) {
  const dates = values
    .map((value) => value ? new Date(value) : null)
    .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
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

function reviewerTimestamp(value: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}
