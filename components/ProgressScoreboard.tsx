import Link from "next/link";
import type { CSSProperties } from "react";
import { ChevronDown, Download, Eye, FileText, Hash, MessageSquareText, Trophy } from "lucide-react";
import type { SubmissionListItem } from "../lib/admin-store";
import { formatProgressDate, percent, progressScoreCriteria } from "../lib/progress-review";

type ProgressScoreboardProps = {
  submissions: SubmissionListItem[];
  total: number;
  mode?: "preview" | "full";
};

export function ProgressScoreboardPanel({ submissions, total, mode = "preview" }: ProgressScoreboardProps) {
  const isPreview = mode === "preview";
  return <section className="admin-panel progress1-scoreboard-panel">
    <header className="admin-section-head">
      <Trophy/>
      <div>
        <h2>{isPreview ? "Score Board คะแนน Top 10" : "Score Board คะแนนทั้งหมด"}</h2>
        <p>{isPreview ? "จัดอันดับผู้สมัครจากคะแนน Paper Screening สูงสุด 10 ลำดับแรก" : "แสดงผู้สมัครที่ส่งคะแนนแล้วทั้งหมด เรียงจากคะแนนสูงสุด"}</p>
      </div>
      <div className="admin-actions">
        <a className="secondary" href="/api/progress1/scoreboard/top10" target="_blank" rel="noreferrer"><Download/>Export Top 10 PDF</a>
        {isPreview ? <Link className="primary" href="/progress1/scoreboard"><Eye/>ดูทั้งหมด</Link> : <Link className="secondary" href="/progress1"><Eye/>กลับหน้าสรุป</Link>}
      </div>
    </header>
    <ProgressScoreboardList submissions={submissions}/>
    {isPreview && total > submissions.length && <p className="progress1-scoreboard-more">มีคะแนนทั้งหมด {total.toLocaleString("th-TH")} รายการ กด “ดูทั้งหมด” เพื่อดูมากกว่า 10 ลำดับ</p>}
  </section>;
}

export function ProgressScoreboardList({ submissions }: { submissions: SubmissionListItem[] }) {
  return <div className="scoreboard-list progress1-scoreboard-list">
    {submissions.length ? submissions.map((submission, index) => <details className="scoreboard-row progress1-scoreboard-row progress1-scoreboard-disclosure" key={submission.submission_code}>
      <summary>
        <b>#{index + 1}</b>
        <div>
          <strong>{submission.title_th}</strong>
          <small>{submission.submission_code} • {ownerName(submission)} • ผู้ตรวจ {reviewerName(submission)}</small>
          <HashtagPills tags={submission.hashtags}/>
        </div>
        <span>{submission.review_total_score}/100</span>
        <i><ChevronDown/>รายละเอียดคะแนน</i>
      </summary>
      <div className="progress1-scoreboard-detail">
        <div className="progress1-scoreboard-score-grid">
          {progressScoreCriteria.map((criterion) => {
            const score = submission[criterion.key];
            const value = typeof score === "number" ? score : null;
            return <div key={criterion.key}>
              <span>{criterion.label}</span>
              <b>{value ?? "-"} / {criterion.max}</b>
              <em><i style={{ "--progress": `${percent(value ?? 0, criterion.max)}%` } as CSSProperties}/></em>
            </div>;
          })}
          <div className="total">
            <span>คะแนนรวม</span>
            <b>{submission.review_total_score ?? "-"} / 100</b>
            <em><i style={{ "--progress": `${percent(submission.review_total_score ?? 0, 100)}%` } as CSSProperties}/></em>
          </div>
        </div>
        <div className="progress1-scoreboard-note">
          <MessageSquareText/>
          <div>
            <b>Comments</b>
            <p>{submission.review_note?.trim() || "ยังไม่มี comments จากผู้ตรวจ"}</p>
            <small>ส่งคะแนนเมื่อ {formatProgressDate(submission.review_submitted_at)} • ผู้ตรวจ {reviewerName(submission)}</small>
          </div>
        </div>
        <div className="scoreboard-actions progress1-scoreboard-detail-actions">
          <a className="secondary small-action" href={`/api/progress1/submissions/${encodeURIComponent(submission.submission_code)}/print`} target="_blank" rel="noreferrer"><FileText/>ดาวน์โหลดใบสมัคร</a>
        </div>
      </div>
    </details>) : <div className="participant-empty">ยังไม่มีคะแนนที่ส่งเข้ามา</div>}
  </div>;
}

function HashtagPills({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return <span className="admin-hashtag-list" aria-label="Hashtags"><Hash aria-hidden="true"/>{tags.map((tag) => <em key={tag}>#{tag}</em>)}</span>;
}

function ownerName(submission: SubmissionListItem) {
  return `${submission.first_name} ${submission.last_name}`.replace(/\s+/g, " ").trim() || "-";
}

function reviewerName(submission: SubmissionListItem) {
  return submission.review_assigned_admin_email || submission.review_scored_by_email || "-";
}
