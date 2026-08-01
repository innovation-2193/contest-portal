import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Eye, Gauge, MessageSquareText, RefreshCw, ShieldCheck, Star, Trophy, UserCheck, UsersRound } from "lucide-react";
import { ProgressAutoRefresh } from "../../components/ProgressAutoRefresh";
import { listAdminAccounts } from "../../lib/admin-users";
import { listSubmissions, type SubmissionListItem } from "../../lib/admin-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const scoreCriteria = [
  { key: "review_rules_score", label: "ผลงานตำรวจ", max: 20 },
  { key: "review_problem_score", label: "ปัญหา/จำเป็น", max: 15 },
  { key: "review_innovation_score", label: "นวัตกรรม", max: 25 },
  { key: "review_evidence_score", label: "หลักฐานผลลัพธ์", max: 20 },
  { key: "review_impact_score", label: "ผลกระทบ", max: 20 },
] as const;

type ReviewerProgress = {
  email: string;
  name: string;
  assigned: SubmissionListItem[];
  scored: SubmissionListItem[];
  pending: SubmissionListItem[];
  averageScore: number | null;
  latestActivity: string | null;
};

export default async function Progress1Page() {
  const [submissions, adminAccounts] = await Promise.all([
    listSubmissions(),
    listAdminAccounts(),
  ]);
  const activeAdmins = adminAccounts.filter((admin) => !admin.disabled);
  const reviewerProgress = buildReviewerProgress(submissions, activeAdmins);
  const assignedSubmissions = submissions.filter((item) => Boolean(item.review_assigned_admin_email));
  const scoredSubmissions = assignedSubmissions.filter((item) => Boolean(item.review_submitted_at));
  const pendingSubmissions = assignedSubmissions.filter((item) => !item.review_submitted_at);
  const overallPercent = percent(scoredSubmissions.length, assignedSubmissions.length);
  const averageScore = average(scoredSubmissions.map((item) => item.review_total_score).filter(isNumber));
  const topReviewer = [...reviewerProgress].sort((a, b) => percent(b.scored.length, b.assigned.length) - percent(a.scored.length, a.assigned.length))[0] ?? null;
  const generatedAt = new Date().toISOString();
  const hasAssignedWork = assignedSubmissions.length > 0;

  return <div className="admin-page progress1-page">
    <ProgressAutoRefresh intervalMs={15000}/>
    <div className="wide">
      <div className="admin-topline progress1-topline">
        <div>
          <span className="eyebrow">Realtime Review Progress</span>
          <h1>สรุปความคืบหน้าการตรวจรอบที่ 1</h1>
          <p>ติดตามงานที่ assign ให้ผู้ตรวจแต่ละคน พร้อมคะแนน รายละเอียดใบสมัคร และ comments จากผู้ตรวจ</p>
        </div>
        <div className="admin-actions">
          <span className="progress1-live-badge"><RefreshCw/>อัปเดตอัตโนมัติทุก 15 วินาที</span>
          <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
        </div>
      </div>

      <section className="progress1-hero admin-panel" aria-label="ภาพรวมสถานะการตรวจ">
        <div className="progress1-hero-copy">
          <span><Gauge/>ภาพรวมการตรวจทั้งหมด</span>
          <h2>{overallPercent.toLocaleString("th-TH", { maximumFractionDigits: 0 })}%</h2>
          <p>{hasAssignedWork
            ? `ส่งคะแนนแล้ว ${scoredSubmissions.length.toLocaleString("th-TH")} จากงานที่ assign แล้ว ${assignedSubmissions.length.toLocaleString("th-TH")} รายการ`
            : "ยังไม่มีงานที่ assign ให้ผู้ตรวจในระบบ"}</p>
          <ProgressBar value={overallPercent} label="ความคืบหน้ารวม"/>
        </div>
        <div className="progress1-summary-grid">
          <SummaryCard icon="assigned" label="Assign แล้ว" value={assignedSubmissions.length} tone="cyan"/>
          <SummaryCard icon="done" label="ส่งคะแนนแล้ว" value={scoredSubmissions.length} tone="green"/>
          <SummaryCard icon="pending" label="รอตรวจ" value={pendingSubmissions.length} tone="gold"/>
          <SummaryCard icon="score" label="คะแนนเฉลี่ย" value={averageScore === null ? "N/A" : averageScore.toFixed(1)} suffix={averageScore === null ? "" : "/100"} tone="blue"/>
          <SummaryCard icon="reviewer" label="ผู้ตรวจที่มีงาน" value={reviewerProgress.filter((item) => item.assigned.length > 0).length} tone="violet"/>
        </div>
        <div className="progress1-status-strip">
          <span>ตรวจล่าสุด: {formatAdminDate(latestDate(scoredSubmissions.map((item) => item.review_submitted_at)))}</span>
          <span>ผู้ตรวจคืบหน้าสูงสุด: {topReviewer ? `${topReviewer.name} (${percent(topReviewer.scored.length, topReviewer.assigned.length).toFixed(0)}%)` : "-"}</span>
          <span>ข้อมูล ณ {formatAdminDate(generatedAt)}</span>
        </div>
      </section>

      <section className="admin-panel progress1-reviewer-panel">
        <header className="admin-section-head">
          <UsersRound/>
          <div>
            <h2>ความคืบหน้ารายผู้ตรวจ</h2>
            <p>แยกตามผู้ตรวจที่มีในระบบและผู้ที่ถูก assign ในใบสมัคร</p>
          </div>
        </header>
        <div className="progress1-reviewer-list">
          {reviewerProgress.length ? reviewerProgress.map((reviewer) => {
            const progress = percent(reviewer.scored.length, reviewer.assigned.length);
            return <details className="progress1-reviewer-card" key={reviewer.email} open={reviewer.pending.length > 0 || reviewer.scored.length > 0}>
              <summary>
                <div className="progress1-reviewer-avatar"><UserCheck/></div>
                <div className="progress1-reviewer-main">
                  <div>
                    <h3>{reviewer.name}</h3>
                    <span>{reviewer.email}</span>
                  </div>
                  <ProgressBar value={progress} label={`ตรวจแล้ว ${reviewer.scored.length} จาก ${reviewer.assigned.length}`}/>
                </div>
                <div className="progress1-reviewer-stats">
                  <b>{progress.toFixed(0)}%</b>
                  <span>{reviewer.scored.length.toLocaleString("th-TH")}/{reviewer.assigned.length.toLocaleString("th-TH")} รายการ</span>
                </div>
              </summary>
              <div className="progress1-reviewer-meta">
                <span className="status-pill attended"><CheckCircle2/>ส่งคะแนนแล้ว {reviewer.scored.length.toLocaleString("th-TH")}</span>
                <span className="status-pill registered"><Clock3/>รอตรวจ {reviewer.pending.length.toLocaleString("th-TH")}</span>
                <span className="status-pill"><Trophy/>เฉลี่ย {reviewer.averageScore === null ? "-" : reviewer.averageScore.toFixed(1)}/100</span>
                <span className="status-pill"><RefreshCw/>ล่าสุด {formatAdminDate(reviewer.latestActivity)}</span>
              </div>
              <SubmissionDetailList submissions={reviewer.assigned}/>
            </details>;
          }) : <ProgressEmptyState/>}
        </div>
      </section>
    </div>
  </div>;
}

function ProgressEmptyState() {
  return <div className="progress1-empty-state">
    <UserCheck/>
    <div>
      <b>ยังไม่มีงานที่ assign ให้ผู้ตรวจ</b>
      <p>เมื่อ Super Admin assign ใบสมัครให้ผู้ตรวจแล้ว ความคืบหน้าและรายละเอียดคะแนนจะแสดงในหน้านี้อัตโนมัติ</p>
    </div>
  </div>;
}

function SummaryCard({ icon, label, value, suffix = "", tone }: { icon: "assigned" | "done" | "pending" | "score" | "reviewer"; label: string; value: number | string; suffix?: string; tone: string }) {
  const Icon = icon === "done" ? CheckCircle2
    : icon === "pending" ? Clock3
      : icon === "score" ? Star
        : icon === "reviewer" ? UsersRound
          : ShieldCheck;
  return <article className={`progress1-summary-card ${tone}`}>
    <Icon/>
    <span>{label}</span>
    <b>{typeof value === "number" ? value.toLocaleString("th-TH") : value}{suffix}</b>
  </article>;
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const safeValue = clamp(value, 0, 100);
  return <div className="progress1-bar-wrap" aria-label={label} aria-valuenow={safeValue} aria-valuemin={0} aria-valuemax={100} role="progressbar">
    <div className="progress1-bar-track">
      <span className="progress1-bar-fill" style={{ "--progress": `${safeValue}%` } as CSSProperties}/>
    </div>
    <small>{label}</small>
  </div>;
}

function SubmissionDetailList({ submissions }: { submissions: SubmissionListItem[] }) {
  if (!submissions.length) return <div className="participant-empty">ยังไม่มีงานที่ assign</div>;
  return <div className="progress1-submission-list">
    {submissions.map((item) => {
      const hasScore = Boolean(item.review_submitted_at);
      return <article className={`progress1-submission-item ${hasScore ? "is-scored" : "is-pending"}`} key={item.submission_code}>
        <div className="progress1-submission-head">
          <div>
            <span className={`status-pill ${hasScore ? "attended" : "registered"}`}>{hasScore ? "ส่งคะแนนแล้ว" : "รอตรวจ"}</span>
            <h4>{item.title_th}</h4>
            <p>{item.submission_code} • {item.submission_type === "team" ? `ทีม ${item.team_name ?? "-"}` : "ส่งเดี่ยว"}</p>
          </div>
          <Link className="secondary small-action" href={`/admin/submissions/${encodeURIComponent(item.submission_code)}`}><Eye/>รายละเอียด</Link>
        </div>
        <div className="progress1-submission-owner">
          <span><b>ผู้สมัคร</b>{item.first_name} {item.last_name}</span>
          <span><b>หน่วยงาน</b>{item.division || "-"} • {item.bureau || "-"}</span>
          <span><b>ผู้ตรวจ</b>{item.review_assigned_admin_email || item.review_scored_by_email || "-"}</span>
          <span><b>ส่งคะแนนเมื่อ</b>{formatAdminDate(item.review_submitted_at)}</span>
        </div>
        <div className="progress1-score-grid">
          {scoreCriteria.map((criterion) => {
            const scoreValue = item[criterion.key];
            const progress = scoreValue === null || scoreValue === undefined ? 0 : percent(Number(scoreValue), criterion.max);
            return <div key={criterion.key}>
              <span>{criterion.label}</span>
              <b>{scoreValue ?? "-"} / {criterion.max}</b>
              <i style={{ "--progress": `${progress}%` } as CSSProperties}/>
            </div>;
          })}
          <div className="total">
            <span>คะแนนรวม</span>
            <b>{item.review_total_score ?? "-"} / 100</b>
            <i style={{ "--progress": `${percent(item.review_total_score ?? 0, 100)}%` } as CSSProperties}/>
          </div>
        </div>
        <div className="progress1-comment">
          <MessageSquareText/>
          <div>
            <b>Comments</b>
            <p>{item.review_note?.trim() || "ยังไม่มี comments จากผู้ตรวจ"}</p>
          </div>
        </div>
      </article>;
    })}
  </div>;
}

function buildReviewerProgress(submissions: SubmissionListItem[], admins: Awaited<ReturnType<typeof listAdminAccounts>>): ReviewerProgress[] {
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

function sortByPendingThenDate(a: SubmissionListItem, b: SubmissionListItem) {
  const pendingDiff = Number(Boolean(a.review_submitted_at)) - Number(Boolean(b.review_submitted_at));
  if (pendingDiff !== 0) return pendingDiff;
  return new Date(b.review_submitted_at || b.review_assigned_at || b.submitted_at).getTime()
    - new Date(a.review_submitted_at || a.review_assigned_at || a.submitted_at).getTime();
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return clamp((value / total) * 100, 0, 100);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function latestDate(values: Array<string | Date | null | undefined>) {
  const dates = values
    .map((value) => value ? new Date(value) : null)
    .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  return dates[0]?.toISOString() ?? null;
}

function formatAdminDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}
