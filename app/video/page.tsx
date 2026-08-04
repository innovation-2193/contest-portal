import Link from "next/link";
import { ArrowLeft, FileText, PhoneCall, Video, XCircle } from "lucide-react";
import { listSubmissionChecklistRows } from "../../lib/admin-store";
import { requireSuperAdminPage } from "../../lib/admin-guard";
import { buildSubmissionChecklistReport, videoProblemRows } from "../../lib/submission-checklist-report";

export const dynamic = "force-dynamic";

export default async function VideoPage() {
  await requireSuperAdminPage();
  const reportRows = await buildSubmissionChecklistReport(await listSubmissionChecklistRows());
  const rows = videoProblemRows(reportRows);

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div>
          <span className="eyebrow">Video Follow-up</span>
          <h1>รายการวิดีโอที่ต้องประสาน</h1>
          <p>แสดงเฉพาะใบสมัครที่ไม่แนบลิงก์วิดีโอ ลิงก์ผิดรูปแบบ หรือระบบเปิดลิงก์ไม่ได้</p>
        </div>
        <div className="admin-actions">
          <a className="primary" href="/api/admin/video/export"><FileText/>Export PDF ส่งต่อเจ้าหน้าที่</a>
          <Link className="secondary" href="/checklist"><Video/>ดู Checklist ทั้งหมด</Link>
          <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
        </div>
      </div>

      <section className="admin-panel">
        <header className="admin-section-head"><PhoneCall/><div><h2>รายการที่ต้องโทรประสาน</h2><p>ทั้งหมด {rows.length.toLocaleString("th-TH")} รายการ</p></div></header>
        <div className="admin-table-wrap"><table className="admin-table compact-admin-table video-follow-table">
          <thead><tr><th>ลำดับ</th><th>ชื่อนวัตกรรม</th><th>ชื่อผู้สมัคร</th><th>เบอร์ติดต่อ</th><th>สถานะลิงก์</th><th>ลิงก์ที่แนบ</th></tr></thead>
          <tbody>{rows.length ? rows.map((row, index) => <tr key={row.submission_code}>
            <td data-label="ลำดับ"><b>{(index + 1).toLocaleString("th-TH")}</b><small>{row.submission_code}</small></td>
            <td data-label="ชื่อนวัตกรรม">{row.title_th}<small>{row.submission_type === "team" ? `ทีม ${row.team_name ?? "-"}` : "ส่งเดี่ยว"}</small></td>
            <td data-label="ชื่อผู้สมัคร">{row.ownerName}<small>{row.email}</small></td>
            <td data-label="เบอร์ติดต่อ"><b>{row.phone || "-"}</b><small>{[row.division, row.bureau].filter(Boolean).join(" / ") || "-"}</small></td>
            <td data-label="สถานะลิงก์"><span className="status-pill cancelled"><XCircle/>{row.videoStatusLabel}</span></td>
            <td data-label="ลิงก์ที่แนบ">{row.video_url ? <a href={row.video_url} target="_blank" rel="noreferrer">{row.video_url}</a> : "-"}</td>
          </tr>) : <tr><td colSpan={6}>ไม่พบรายการวิดีโอที่ต้องประสาน</td></tr>}</tbody>
        </table></div>
      </section>
    </div>
  </div>;
}
