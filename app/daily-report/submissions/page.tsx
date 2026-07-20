import Link from "next/link";
import { ArrowLeft, FileText, Search, X } from "lucide-react";
import { listSubmissions, type SubmissionListItem } from "../../../lib/admin-store";

export const dynamic = "force-dynamic";

const pageSize = 10;

export default async function DailyReportSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string; type?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const status = (params.status ?? "").trim();
  const type = (params.type ?? "").trim();
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const submissions = await listSubmissions();
  const filtered = filterSubmissions(submissions, { q, status, type });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const items = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return <div className="admin-page report-page">
    <div className="wide">
      <div className="admin-topline report-topline">
        <div>
          <span className="eyebrow">Daily Report</span>
          <h1>ผลงานที่ส่งมาแล้ว</h1>
          <p>ค้นหาและกรองผลงานทั้งหมดจากระบบรับสมัคร</p>
        </div>
        <div className="admin-actions">
          <Link className="secondary report-action-button" href="/daily-report"><ArrowLeft/>กลับรายงาน</Link>
        </div>
      </div>

      <section className="admin-panel report-panel">
        <header><Search/><div><h2>ค้นหาและกรองรายการ</h2><p>ทั้งหมด {filtered.length.toLocaleString("th-TH")} รายการ</p></div></header>
        <form className="audit-filter-form report-submission-filter" method="get">
          <label className="audit-filter-search">ค้นหา
            <div><Search/><input name="q" defaultValue={q} placeholder="ชื่อผลงาน รหัส SUB ผู้สมัคร ทีม หรือหน่วยงาน"/></div>
          </label>
          <label>ประเภท
            <select name="type" defaultValue={type}>
              <option value="">ทุกประเภท</option>
              <option value="individual">ส่งเดี่ยว</option>
              <option value="team">ส่งแบบทีม</option>
            </select>
          </label>
          <label>สถานะ
            <select name="status" defaultValue={status}>
              <option value="">ทุกสถานะ</option>
              <option value="submitted">ส่งแล้ว</option>
              <option value="screening">กำลังตรวจ</option>
              <option value="qualified">ผ่านเกณฑ์</option>
              <option value="rejected">ไม่ผ่านเกณฑ์</option>
              <option value="draft">ฉบับร่าง</option>
            </select>
          </label>
          <div className="audit-filter-actions">
            <button className="secondary" type="submit"><Search/>ค้นหา</button>
            <Link className="ghost-action" href="/daily-report/submissions"><X/>ล้าง</Link>
          </div>
        </form>
      </section>

      <section className="admin-panel report-panel">
        <header className="admin-section-head">
          <FileText/>
          <div><h2>รายการผลงาน</h2><p>หน้า {currentPage.toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}</p></div>
        </header>
        <div className="submission-report-list">
          {items.length ? items.map((item) => <SubmissionReportCard key={item.submission_code} item={item}/>) : <p className="report-empty">ไม่พบผลงานตามเงื่อนไขที่ค้นหา</p>}
        </div>
        <Pagination q={q} status={status} type={type} page={currentPage} totalPages={totalPages}/>
      </section>
    </div>
  </div>;
}

function SubmissionReportCard({ item }: { item: SubmissionListItem }) {
  return <article className="submission-report-item">
    <div>
      <b>{item.title_th}</b>
      <small>{item.submission_code} • {formatReportDate(item.submitted_at)}</small>
    </div>
    <span>{item.submission_type === "team" ? `ทีม ${item.team_name || "-"}` : "ส่งเดี่ยว"}</span>
    <p>{item.first_name} {item.last_name}<small>{item.division || "-"} / {item.bureau || "-"}</small></p>
    <em>{statusLabel(item.status)}</em>
  </article>;
}

function Pagination({ q, status, type, page, totalPages }: { q: string; status: string; type: string; page: number; totalPages: number }) {
  const href = (target: number) => `/daily-report/submissions?${new URLSearchParams({
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    page: String(target),
  })}`;
  return <nav className="audit-pagination" aria-label="pagination">
    <Link className={page <= 1 ? "disabled-action" : "secondary"} href={href(Math.max(1, page - 1))}>ก่อนหน้า</Link>
    <span>หน้า {page.toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}</span>
    <Link className={page >= totalPages ? "disabled-action" : "secondary"} href={href(Math.min(totalPages, page + 1))}>ถัดไป</Link>
  </nav>;
}

function filterSubmissions(records: SubmissionListItem[], filters: { q: string; status: string; type: string }) {
  const needle = filters.q.toLowerCase().replace(/\s+/g, " ").trim();
  return records.filter((item) => {
    if (filters.status && item.status !== filters.status) return false;
    if (filters.type && item.submission_type !== filters.type) return false;
    if (!needle) return true;
    return [
      item.submission_code,
      item.title_th,
      item.team_name,
      item.first_name,
      item.last_name,
      item.email,
      item.position,
      item.division,
      item.bureau,
      item.status,
    ].some((value) => String(value ?? "").toLowerCase().includes(needle));
  });
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "ฉบับร่าง",
    submitted: "ส่งแล้ว",
    screening: "กำลังตรวจ",
    qualified: "ผ่านเกณฑ์",
    rejected: "ไม่ผ่านเกณฑ์",
  };
  return labels[status] ?? (status || "-");
}

function formatReportDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}
