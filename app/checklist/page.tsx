import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileCheck2, FileText, Video, XCircle } from "lucide-react";
import { listSubmissionChecklistRows } from "../../lib/admin-store";
import { requireSuperAdminPage } from "../../lib/admin-guard";
import { buildSubmissionChecklistReport, checklistDocuments } from "../../lib/submission-checklist-report";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  await requireSuperAdminPage();
  const rows = await buildSubmissionChecklistReport(await listSubmissionChecklistRows());
  const completeFiles = rows.filter((row) => row.fileComplete).length;
  const openVideos = rows.filter((row) => row.videoStatus === "ok").length;

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div>
          <span className="eyebrow">Submission Checklist</span>
          <h1>ตรวจเอกสารแนบและวิดีโอ</h1>
          <p>ตรวจไฟล์อัปโหลด 3.1-3.4 และสถานะลิงก์วิดีโอของทุกรายการที่ส่งประกวด</p>
        </div>
        <div className="admin-actions">
          <a className="primary" href="/api/admin/checklist/export"><FileText/>Export PDF รายงานทั้งหมด</a>
          <Link className="secondary" href="/video"><Video/>รายการวิดีโอมีปัญหา</Link>
          <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
        </div>
      </div>

      <section className="admin-panel">
        <header className="admin-section-head"><FileCheck2/><div><h2>ภาพรวม</h2><p>ทั้งหมด {rows.length.toLocaleString("th-TH")} รายการ</p></div></header>
        <div className="checklist-summary-grid">
          <SummaryCard label="ส่งไฟล์ 3.1-3.4 ครบ" value={completeFiles} total={rows.length}/>
          <SummaryCard label="มีวิดีโอที่เปิดได้" value={openVideos} total={rows.length}/>
          <SummaryCard label="ต้องติดตามเอกสาร/วิดีโอ" value={rows.filter((row) => !row.fileComplete || row.videoStatus !== "ok").length} total={rows.length}/>
        </div>
      </section>

      <section className="admin-panel">
        <header className="admin-section-head"><FileCheck2/><div><h2>รายการที่ส่งประกวด</h2><p>แสดงสถานะไฟล์ 3.1-3.4 และลิงก์วิดีโอ</p></div></header>
        <div className="admin-table-wrap"><table className="admin-table compact-admin-table checklist-table">
          <thead><tr><th>ลำดับ</th><th>รหัส</th><th>ชื่อนวัตกรรม</th><th>ผู้สมัคร</th>{checklistDocuments.map(([key, label]) => <th key={key}>{label.split(" ")[0]}</th>)}<th>วิดีโอ</th><th>หมายเหตุ</th></tr></thead>
          <tbody>{rows.length ? rows.map((row, index) => <tr key={row.submission_code}>
            <td data-label="ลำดับ"><b>{(index + 1).toLocaleString("th-TH")}</b></td>
            <td data-label="รหัส"><b>{row.submission_code}</b><small>{formatDate(row.submitted_at)}</small></td>
            <td data-label="ชื่อนวัตกรรม">{row.title_th}<small>{row.submission_type === "team" ? `ทีม ${row.team_name ?? "-"}` : "ส่งเดี่ยว"}</small></td>
            <td data-label="ผู้สมัคร">{row.ownerName}<small>{row.email}</small></td>
            {checklistDocuments.map(([key]) => <td key={key} data-label={key}><DocStatus ok={row.files[key]}/></td>)}
            <td data-label="วิดีโอ"><VideoStatus status={row.videoStatusLabel} ok={row.videoStatus === "ok"}/>{row.video_url && <small><a href={row.video_url} target="_blank" rel="noreferrer">เปิดลิงก์</a></small>}</td>
            <td data-label="หมายเหตุ">{row.fileComplete && row.videoStatus === "ok" ? "ครบถ้วน" : [
              row.missingDocuments.length ? `ขาด ${row.missingDocuments.map((item) => item.split(" ")[0]).join(", ")}` : "",
              row.videoStatus !== "ok" ? row.videoStatusLabel : "",
            ].filter(Boolean).join(" • ")}</td>
          </tr>) : <tr><td colSpan={10}>ไม่พบข้อมูลใบสมัครประกวด</td></tr>}</tbody>
        </table></div>
      </section>
    </div>
  </div>;
}

function SummaryCard({ label, value, total }: { label: string; value: number; total: number }) {
  return <div>
    <span>{label}</span>
    <b>{value.toLocaleString("th-TH")}</b>
    <small>จากทั้งหมด {total.toLocaleString("th-TH")} รายการ</small>
  </div>;
}

function DocStatus({ ok }: { ok: boolean }) {
  return <span className={`status-pill ${ok ? "attended" : "cancelled"}`}>{ok ? <CheckCircle2/> : <XCircle/>}{ok ? "มีไฟล์" : "ไม่มีไฟล์"}</span>;
}

function VideoStatus({ status, ok }: { status: string; ok: boolean }) {
  return <span className={`status-pill ${ok ? "attended" : "cancelled"}`}>{ok ? <CheckCircle2/> : <XCircle/>}{status}</span>;
}

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}
