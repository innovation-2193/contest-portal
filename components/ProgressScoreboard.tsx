import Link from "next/link";
import type { CSSProperties } from "react";
import { ChevronDown, Download, Eye, FileText, MessageSquareText, Trophy } from "lucide-react";
import type { SubmissionListItem } from "../lib/admin-store";
import { formatProgressDate, percent, progressScoreCriteria } from "../lib/progress-review";

type ProgressScoreboardProps = {
  submissions: SubmissionListItem[];
  total: number;
  mode?: "preview" | "full";
  searchQuery?: string;
};

export function ProgressScoreboardPanel({ submissions, total, mode = "preview", searchQuery = "" }: ProgressScoreboardProps) {
  const isPreview = mode === "preview";
  const isSearching = Boolean(searchQuery);
  const clearHref = isPreview ? "/progress1?view=scoreboard" : "/progress1/scoreboard";
  return <section className="admin-panel progress1-scoreboard-panel">
    <header className="admin-section-head">
      <Trophy/>
      <div>
        <h2>{isSearching ? "ผลการค้นหา Score Board" : isPreview ? "Score Board คะแนน Top 10" : "Score Board คะแนนทั้งหมด"}</h2>
        <p>{isSearching ? "ค้นจากชื่อโครงการ ชื่อผู้สมัคร รหัสใบสมัคร และข้อมูลผู้ตรวจเอกสาร โดยแสดงรายการรอตรวจเป็นการ์ด disabled" : isPreview ? "จัดอันดับผู้สมัครจากคะแนน Paper Screening สูงสุด 10 ลำดับแรก" : "แสดงผู้สมัครที่ส่งคะแนนแล้วทั้งหมด เรียงจากคะแนนสูงสุด"}</p>
      </div>
      <div className="admin-actions progress1-scoreboard-actions">
        <a className="secondary" href="/api/progress1/scoreboard/top10" target="_blank" rel="noreferrer"><Download/>Export Top 10 PDF</a>
        <a className="secondary" href="/api/progress1/scoreboard/results" target="_blank" rel="noreferrer"><Download/>ผลการตรวจ PDF</a>
        {isPreview ? <Link className="primary" href="/progress1/scoreboard"><Eye/>ดูทั้งหมด</Link> : <Link className="secondary" href="/progress1"><Eye/>กลับหน้าสรุป</Link>}
      </div>
    </header>
    <form className="audit-filter-form progress1-search-form" method="get">
      {isPreview && <input type="hidden" name="view" value="scoreboard"/>}
      <label className="audit-filter-search">ค้นหาโครงการ/ผู้สมัคร<input name="q" defaultValue={searchQuery} placeholder="ชื่อโครงการ ชื่อผู้สมัคร หรือรหัสใบสมัคร"/></label>
      <div className="audit-filter-actions">
        <button className="secondary" type="submit">ค้นหา</button>
        <Link className="ghost-action" href={clearHref}>ล้างคำค้น</Link>
      </div>
    </form>
    {isSearching && <p className="progress1-search-result-note">พบ {total.toLocaleString("th-TH")} รายการจากคำค้น “{searchQuery}”</p>}
    <ProgressScoreboardList submissions={submissions} isSearching={isSearching}/>
    {isPreview && !isSearching && total > submissions.length && <p className="progress1-scoreboard-more">มีคะแนนทั้งหมด {total.toLocaleString("th-TH")} รายการ กด “ดูทั้งหมด” เพื่อดูมากกว่า 10 ลำดับ</p>}
  </section>;
}

export function ProgressScoreboardList({ submissions, isSearching = false }: { submissions: SubmissionListItem[]; isSearching?: boolean }) {
  return <div className="scoreboard-list progress1-scoreboard-list">
    {submissions.length ? submissions.map((submission, index) => {
      const reviewed = Boolean(submission.review_submitted_at);
      return <details className={["scoreboard-row progress1-scoreboard-row progress1-scoreboard-disclosure", !reviewed ? "is-disabled" : ""].filter(Boolean).join(" ")} key={submission.submission_code} aria-disabled={!reviewed || undefined}>
      <summary>
        <b>#{index + 1}</b>
        <div>
          <strong>{submission.title_th}</strong>
          <small>{submission.submission_code} • {ownerName(submission)} • ผู้ตรวจเอกสาร {reviewerName(submission)}</small>
        </div>
        <span>{reviewed ? `${submission.review_total_score ?? "-"}/100` : "รอตรวจ"}</span>
        <i><ChevronDown/>{reviewed ? "รายละเอียดคะแนน" : "ยังไม่ได้ตรวจ"}</i>
      </summary>
      {reviewed ? <div className="progress1-scoreboard-detail">
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
            <p>{submission.review_note?.trim() || "ยังไม่มี comments จากผู้ตรวจเอกสาร"}</p>
            <small>ส่งคะแนนเมื่อ {formatProgressDate(submission.review_submitted_at)} • ผู้ตรวจเอกสาร {reviewerName(submission)}</small>
          </div>
        </div>
        <div className="scoreboard-actions progress1-scoreboard-detail-actions">
          <a className="secondary small-action" href={`/api/progress1/submissions/${encodeURIComponent(submission.submission_code)}/print`} target="_blank" rel="noreferrer"><FileText/>ดาวน์โหลดใบสมัคร</a>
        </div>
      </div> : <div className="progress1-scoreboard-detail progress1-scoreboard-pending">
        <MessageSquareText/>
        <div>
          <b>ยังไม่มีคะแนนจากผู้ตรวจเอกสาร</b>
          <p>{isSearching ? "รายการนี้ถูก assign แล้วแต่ยังไม่ได้ส่งคะแนน จึงแสดงแบบ disabled เฉพาะตอนค้นหา" : "รายการนี้ยังไม่มีคะแนน"}</p>
        </div>
      </div>}
    </details>;
    }) : <div className="participant-empty">{isSearching ? "ไม่พบโครงการหรือผู้สมัครตามคำค้น" : "ยังไม่มีคะแนนที่ส่งเข้ามา"}</div>}
  </div>;
}

function ownerName(submission: SubmissionListItem) {
  return `${submission.first_name} ${submission.last_name}`.replace(/\s+/g, " ").trim() || "-";
}

function reviewerName(submission: SubmissionListItem) {
  return submission.review_assigned_admin_email || submission.review_scored_by_email || "-";
}
