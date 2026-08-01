import Link from "next/link";
import { Download, Eye, FileText, Hash, Trophy } from "lucide-react";
import type { SubmissionListItem } from "../lib/admin-store";

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
    {submissions.length ? submissions.map((submission, index) => <article className="scoreboard-row progress1-scoreboard-row" key={submission.submission_code}>
      <b>#{index + 1}</b>
      <div>
        <strong>{submission.title_th}</strong>
        <small>{submission.submission_code} • {ownerName(submission)} • ผู้ตรวจ {submission.review_assigned_admin_email || submission.review_scored_by_email || "-"}</small>
        <HashtagPills tags={submission.hashtags}/>
      </div>
      <span>{submission.review_total_score}/100</span>
      <div className="scoreboard-actions">
        <a className="secondary small-action" href={`/api/progress1/submissions/${encodeURIComponent(submission.submission_code)}/print`} target="_blank" rel="noreferrer"><FileText/>ดาวน์โหลดใบสมัคร</a>
      </div>
    </article>) : <div className="participant-empty">ยังไม่มีคะแนนที่ส่งเข้ามา</div>}
  </div>;
}

function HashtagPills({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return <span className="admin-hashtag-list" aria-label="Hashtags"><Hash aria-hidden="true"/>{tags.map((tag) => <em key={tag}>#{tag}</em>)}</span>;
}

function ownerName(submission: SubmissionListItem) {
  return `${submission.first_name} ${submission.last_name}`.replace(/\s+/g, " ").trim() || "-";
}
