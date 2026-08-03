import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Download, FileText, MessageSquareText, RefreshCw, Trophy, UserCheck } from "lucide-react";
import { ProgressAutoRefresh } from "../../../../components/ProgressAutoRefresh";
import { requireSuperAdminPage } from "../../../../lib/admin-guard";
import { listAdminAccounts } from "../../../../lib/admin-users";
import { listSubmissions, type SubmissionListItem } from "../../../../lib/admin-store";
import {
  buildReviewerProgress,
  formatProgressDate,
  percent,
  progressScoreCriteria,
  type ReviewerProgress,
} from "../../../../lib/progress-review";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProgressReviewerPage({ params }: { params: Promise<{ email: string }> }) {
  await requireSuperAdminPage();
  const { email } = await params;
  const reviewerEmail = decodeURIComponent(email).trim().toLowerCase();
  const [submissions, adminAccounts] = await Promise.all([
    listSubmissions(),
    listAdminAccounts(),
  ]);
  const activeAdmins = adminAccounts.filter((admin) => !admin.disabled);
  const reviewer = buildReviewerProgress(submissions, activeAdmins).find((item) => item.email === reviewerEmail);
  if (!reviewer) notFound();

  const progress = percent(reviewer.scored.length, reviewer.assigned.length);

  return <div className="admin-page progress1-page progress1-detail-page">
    <ProgressAutoRefresh intervalMs={60000}/>
    <div className="wide">
      <div className="admin-topline progress1-topline">
        <div>
          <span className="eyebrow">Reviewer Detail</span>
          <h1>{reviewer.name}</h1>
          <p>{reviewer.email} • รายการใบสมัครที่ได้รับมอบหมายสำหรับผู้บังคับบัญชา</p>
        </div>
        <div className="admin-actions">
          <span className="progress1-live-badge"><RefreshCw/>อัปเดตอัตโนมัติทุก 1 นาที</span>
          <Link className="secondary" href="/progress1"><ArrowLeft/>กลับหน้ารายชื่อผู้ตรวจเอกสาร</Link>
        </div>
      </div>

      <section className="admin-panel progress1-reviewer-detail-hero">
        <div className="progress1-reviewer-avatar"><UserCheck/></div>
        <div>
          <h2>ความคืบหน้าของผู้ตรวจเอกสาร</h2>
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
      </section>

      <section className="admin-panel progress1-reviewer-panel">
        <header className="admin-section-head">
          <FileText/>
          <div>
            <h2>รายการใบสมัครที่รับผิดชอบ</h2>
            <p>แสดงรายละเอียดแบบสรุปสำหรับผู้บังคับบัญชา พร้อมดาวน์โหลดชุดข้อมูลผู้สมัครเป็น PDF</p>
          </div>
        </header>
        <SubmissionExecutiveList reviewer={reviewer}/>
      </section>
    </div>
  </div>;
}

function SubmissionExecutiveList({ reviewer }: { reviewer: ReviewerProgress }) {
  if (!reviewer.assigned.length) return <div className="progress1-empty-state"><FileText/><div><b>ยังไม่มีรายการตรวจ</b><p>เมื่อมีใบสมัครที่ assign ให้ผู้ตรวจเอกสารคนนี้ รายการจะแสดงที่นี่</p></div></div>;

  return <div className="progress1-submission-list progress1-executive-list">
    {reviewer.assigned.map((item) => <SubmissionExecutiveCard key={item.submission_code} item={item} reviewer={reviewer}/>)}
  </div>;
}

function SubmissionExecutiveCard({ item, reviewer }: { item: SubmissionListItem; reviewer: ReviewerProgress }) {
  const hasScore = Boolean(item.review_submitted_at);
  return <article className={`progress1-submission-item progress1-executive-item ${hasScore ? "is-scored" : "is-pending"}`}>
    <div className="progress1-submission-head">
      <div>
        <span className={`status-pill ${hasScore ? "attended" : "registered"}`}>{hasScore ? "ส่งคะแนนแล้ว" : "รอตรวจ"}</span>
        <h4>{item.title_th}</h4>
        <p>{item.submission_code} • {item.submission_type === "team" ? `ทีม ${item.team_name ?? "-"}` : "ส่งเดี่ยว"}</p>
      </div>
      <a className="primary small-action" href={`/api/progress1/submissions/${encodeURIComponent(item.submission_code)}/print`} target="_blank" rel="noreferrer">
        <Download/>ดาวน์โหลด PDF
      </a>
    </div>

    <div className="progress1-submission-owner">
      <span><b>ผู้สมัคร</b>{item.first_name} {item.last_name}</span>
      <span><b>หน่วยงาน</b>{item.division || "-"} • {item.bureau || "-"}</span>
      <span className="progress1-reviewer-owner"><b>ผู้ตรวจเอกสาร</b><strong>{reviewer.name}</strong><small>{reviewer.email}</small></span>
      <span><b>ส่งคะแนนเมื่อ</b>{formatProgressDate(item.review_submitted_at)}</span>
    </div>

    <div className="progress1-score-grid">
      {progressScoreCriteria.map((criterion) => {
        const scoreValue = item[criterion.key];
        const scorePercent = scoreValue === null || scoreValue === undefined ? 0 : percent(Number(scoreValue), criterion.max);
        return <div key={criterion.key}>
          <span>{criterion.label}</span>
          <b>{scoreValue ?? "-"} / {criterion.max}</b>
          <i style={{ "--progress": `${scorePercent}%` } as CSSProperties}/>
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
        <p>{item.review_note?.trim() || "ยังไม่มี comments จากผู้ตรวจเอกสาร"}</p>
      </div>
    </div>
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
