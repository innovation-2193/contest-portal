import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Eye, Gauge, RefreshCw, ShieldCheck, Star, Trophy, UserCheck, UsersRound } from "lucide-react";
import { ProgressAutoRefresh } from "../../components/ProgressAutoRefresh";
import { listAdminAccounts } from "../../lib/admin-users";
import { listSubmissions } from "../../lib/admin-store";
import {
  average,
  buildReviewerProgress,
  formatProgressDate,
  isNumber,
  latestDate,
  percent,
  reviewerStatus,
  type ReviewerProgress,
} from "../../lib/progress-review";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProgressStatusFilter = "all" | "completed" | "in_progress" | "pending";

export default async function Progress1Page({ searchParams }: { searchParams: Promise<{ status?: string; reviewer?: string }> }) {
  const params = await searchParams;
  const statusFilter = normalizeStatusFilter(params.status);
  const reviewerFilter = (params.reviewer ?? "").trim().toLowerCase();
  const [submissions, adminAccounts] = await Promise.all([
    listSubmissions(),
    listAdminAccounts(),
  ]);
  const activeAdmins = adminAccounts.filter((admin) => !admin.disabled);
  const reviewerProgress = buildReviewerProgress(submissions, activeAdmins);
  const filteredReviewers = reviewerProgress.filter((reviewer) => {
    const statusOk = statusFilter === "all" || reviewerStatus(reviewer) === statusFilter;
    const reviewerOk = !reviewerFilter || reviewer.email === reviewerFilter;
    return statusOk && reviewerOk;
  });
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
          <p>ดูรายชื่อผู้ตรวจ ความคืบหน้ารายคน และเปิดเข้าไปตรวจรายการที่ได้รับมอบหมาย</p>
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
          <SummaryCard icon="reviewer" label="ผู้ตรวจที่มีงาน" value={reviewerProgress.length} tone="violet"/>
        </div>
        <div className="progress1-status-strip">
          <span>ตรวจล่าสุด: {formatProgressDate(latestDate(scoredSubmissions.map((item) => item.review_submitted_at)))}</span>
          <span>ผู้ตรวจคืบหน้าสูงสุด: {topReviewer ? `${topReviewer.name} (${percent(topReviewer.scored.length, topReviewer.assigned.length).toFixed(0)}%)` : "-"}</span>
          <span>ข้อมูล ณ {formatProgressDate(generatedAt)}</span>
        </div>
      </section>

      <section className="admin-panel progress1-reviewer-panel">
        <header className="admin-section-head">
          <UsersRound/>
          <div>
            <h2>รายชื่อผู้ตรวจ</h2>
            <p>เรียงผู้ตรวจที่ตรวจครบแล้วขึ้นก่อน และเรียงตามเวลาที่ส่งคะแนนก่อน</p>
          </div>
        </header>
        <form className="audit-filter-form progress1-filter-form" method="get">
          <label>สถานะการตรวจ<select name="status" defaultValue={statusFilter}>
            <option value="all">ทั้งหมด</option>
            <option value="completed">ตรวจเสร็จแล้ว</option>
            <option value="in_progress">กำลังตรวจ</option>
            <option value="pending">รอตรวจ</option>
          </select></label>
          <label>รายชื่อผู้ตรวจ<select name="reviewer" defaultValue={reviewerFilter}>
            <option value="">ผู้ตรวจทั้งหมด</option>
            {reviewerProgress.map((reviewer) => <option key={reviewer.email} value={reviewer.email}>{reviewer.name} • {reviewer.email}</option>)}
          </select></label>
          <div className="audit-filter-actions">
            <button className="secondary" type="submit">กรองข้อมูล</button>
            <Link className="ghost-action" href="/progress1">ล้างตัวกรอง</Link>
          </div>
        </form>
        <div className="progress1-reviewer-list">
          {filteredReviewers.length ? filteredReviewers.map((reviewer) => <ReviewerCard key={reviewer.email} reviewer={reviewer}/>) : <ProgressEmptyState filtered={reviewerProgress.length > 0}/>}
        </div>
      </section>
    </div>
  </div>;
}

function ReviewerCard({ reviewer }: { reviewer: ReviewerProgress }) {
  const progress = percent(reviewer.scored.length, reviewer.assigned.length);
  return <article className="progress1-reviewer-card progress1-reviewer-link-card">
    <div className="progress1-reviewer-card-shell">
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
      <div className="progress1-reviewer-meta">
        <span className="status-pill attended"><CheckCircle2/>ส่งคะแนนแล้ว {reviewer.scored.length.toLocaleString("th-TH")}</span>
        <span className="status-pill registered"><Clock3/>รอตรวจ {reviewer.pending.length.toLocaleString("th-TH")}</span>
        <span className="status-pill"><Trophy/>เฉลี่ย {reviewer.averageScore === null ? "-" : reviewer.averageScore.toFixed(1)}/100</span>
        <span className="status-pill"><RefreshCw/>ล่าสุด {formatProgressDate(reviewer.latestActivity)}</span>
      </div>
      <Link className="primary progress1-reviewer-detail-link" href={`/progress1/reviewer/${encodeURIComponent(reviewer.email)}`}><Eye/>ดูรายการตรวจ</Link>
    </div>
  </article>;
}

function ProgressEmptyState({ filtered = false }: { filtered?: boolean }) {
  return <div className="progress1-empty-state">
    <UserCheck/>
    <div>
      <b>{filtered ? "ไม่พบผู้ตรวจตามตัวกรอง" : "ยังไม่มีงานที่ assign ให้ผู้ตรวจ"}</b>
      <p>{filtered ? "ลองเปลี่ยนสถานะการตรวจหรือเลือกผู้ตรวจทั้งหมดอีกครั้ง" : "เมื่อ Super Admin assign ใบสมัครให้ผู้ตรวจแล้ว ความคืบหน้าและรายละเอียดคะแนนจะแสดงในหน้านี้อัตโนมัติ"}</p>
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
  const safeValue = Math.min(100, Math.max(0, value));
  return <div className="progress1-bar-wrap" aria-label={label} aria-valuenow={safeValue} aria-valuemin={0} aria-valuemax={100} role="progressbar">
    <div className="progress1-bar-track">
      <span className="progress1-bar-fill" style={{ "--progress": `${safeValue}%` } as CSSProperties}/>
    </div>
    <small>{label}</small>
  </div>;
}

function normalizeStatusFilter(value?: string): ProgressStatusFilter {
  if (value === "completed" || value === "in_progress" || value === "pending") return value;
  return "all";
}
