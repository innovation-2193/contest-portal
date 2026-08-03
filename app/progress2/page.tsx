import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, RefreshCw, Search, ShieldCheck, UserCheck } from "lucide-react";
import { ProgressAutoRefresh } from "../../components/ProgressAutoRefresh";
import { listSubmissions, type SubmissionListItem } from "../../lib/admin-store";
import { formatProgressDate, normalizeProgressSearchQuery } from "../../lib/progress-review";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ReviewStatusFilter = "all" | "reviewed" | "pending";

export default async function Progress2Page({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const params = await searchParams;
  const searchQuery = normalizeProgressSearchQuery(params.q);
  const statusFilter = normalizeStatusFilter(params.status);
  const submissions = await listSubmissions();
  const reviewed = submissions.filter((item) => Boolean(item.review_submitted_at));
  const pending = submissions.filter((item) => !item.review_submitted_at);
  const visibleSubmissions = submissions.filter((item) => {
    if (statusFilter === "reviewed" && !item.review_submitted_at) return false;
    if (statusFilter === "pending" && item.review_submitted_at) return false;
    if (searchQuery && !publicSubmissionMatchesSearch(item, searchQuery)) return false;
    return true;
  });
  const generatedAt = new Date().toISOString();

  return <div className="admin-page progress1-page progress2-page">
    <ProgressAutoRefresh intervalMs={60000}/>
    <div className="wide">
      <div className="admin-topline progress1-topline">
        <div>
          <span className="eyebrow">Review Status</span>
          <h1>สถานะการตรวจรอบที่ 1</h1>
          <p>แสดงเฉพาะสถานะตรวจแล้วหรือยังไม่ตรวจ ไม่มีคะแนน ไม่มี comments และไม่มีไฟล์ดาวน์โหลดในหน้านี้</p>
        </div>
        <div className="admin-actions">
          <span className="progress1-live-badge"><RefreshCw/>อัปเดตอัตโนมัติทุก 1 นาที</span>
          <Link className="secondary" href="/"><ArrowLeft/>กลับหน้าแรก</Link>
        </div>
      </div>

      <section className="progress1-hero admin-panel" aria-label="ภาพรวมสถานะการตรวจ">
        <div className="progress1-hero-copy">
          <span><ShieldCheck/>ภาพรวมสถานะ</span>
          <h2>{submissions.length.toLocaleString("th-TH")}</h2>
          <p>ใบสมัครประกวดทั้งหมดในระบบ • ข้อมูล ณ {formatProgressDate(generatedAt)}</p>
        </div>
        <div className="progress1-summary-grid progress2-summary-grid">
          <SummaryCard icon="done" label="ตรวจแล้ว" value={reviewed.length} tone="green"/>
          <SummaryCard icon="pending" label="ยังไม่ตรวจ" value={pending.length} tone="gold"/>
          <SummaryCard icon="all" label="ทั้งหมด" value={submissions.length} tone="cyan"/>
        </div>
      </section>

      <section className="admin-panel progress1-reviewer-panel">
        <header className="admin-section-head">
          <UserCheck/>
          <div>
            <h2>รายการใบสมัครประกวด</h2>
            <p>สถานะในตารางนี้มีเพียงตรวจแล้วและยังไม่ตรวจเท่านั้น</p>
          </div>
        </header>
        <form className="audit-filter-form progress2-filter-form public-progress2-filter-form" method="get">
          <label className="audit-filter-search">ค้นหา<div><Search/><input name="q" defaultValue={searchQuery} placeholder="ชื่อโครงการ ชื่อผู้สมัคร หรือรหัสใบสมัคร"/></div></label>
          <label>สถานะ<select name="status" defaultValue={statusFilter}>
            <option value="all">ทั้งหมด</option>
            <option value="reviewed">ตรวจแล้ว</option>
            <option value="pending">ยังไม่ตรวจ</option>
          </select></label>
          <div className="audit-filter-actions"><button className="secondary" type="submit">กรองข้อมูล</button><Link className="ghost-action" href="/progress2">ล้าง</Link></div>
        </form>
        <div className="admin-table-wrap progress2-table-wrap">
          <table className="admin-table compact-admin-table progress2-table">
            <thead><tr><th>ลำดับ</th><th>รหัส</th><th>ชื่อโครงการ</th><th>ผู้สมัคร</th><th>สถานะ</th></tr></thead>
            <tbody>{visibleSubmissions.length ? visibleSubmissions.map((item, index) => <tr key={item.submission_code}>
              <td data-label="ลำดับ"><b>{(index + 1).toLocaleString("th-TH")}</b></td>
              <td data-label="รหัส"><b>{item.submission_code}</b><small>{formatProgressDate(item.submitted_at)}</small></td>
              <td data-label="ชื่อโครงการ">{item.title_th}<small>{item.submission_type === "team" ? `ทีม ${item.team_name ?? "-"}` : "ส่งเดี่ยว"}</small></td>
              <td data-label="ผู้สมัคร">{ownerName(item)}<small>{item.division || "-"} • {item.bureau || "-"}</small></td>
              <td data-label="สถานะ"><ReviewStatus item={item}/></td>
            </tr>) : <tr><td colSpan={5}>ไม่พบข้อมูล</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </div>
  </div>;
}

function SummaryCard({ icon, label, value, tone }: { icon: "done" | "pending" | "all"; label: string; value: number; tone: string }) {
  const Icon = icon === "done" ? CheckCircle2 : icon === "pending" ? Clock3 : ShieldCheck;
  return <article className={`progress1-summary-card ${tone}`}>
    <Icon/>
    <span>{label}</span>
    <b>{value.toLocaleString("th-TH")}</b>
  </article>;
}

function ReviewStatus({ item }: { item: SubmissionListItem }) {
  return item.review_submitted_at
    ? <span className="status-pill attended"><CheckCircle2/>ตรวจแล้ว</span>
    : <span className="status-pill registered"><Clock3/>ยังไม่ตรวจ</span>;
}

function ownerName(submission: SubmissionListItem) {
  return `${submission.first_name} ${submission.last_name}`.replace(/\s+/g, " ").trim() || "-";
}

function normalizeStatusFilter(value?: string): ReviewStatusFilter {
  if (value === "reviewed" || value === "pending") return value;
  return "all";
}

function publicSubmissionMatchesSearch(item: SubmissionListItem, query: string) {
  const terms = normalizeProgressSearchQuery(query).split(" ").filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalizeProgressSearchQuery([
    item.submission_code,
    item.title_th,
    item.team_name,
    item.first_name,
    item.last_name,
    `${item.first_name} ${item.last_name}`,
    item.division,
    item.bureau,
    ...item.hashtags,
  ].filter(Boolean).join(" "));
  return terms.every((term) => haystack.includes(term));
}
