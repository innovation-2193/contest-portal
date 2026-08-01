import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Users } from "lucide-react";
import { getSubmissionDetail, type AdminSubmissionDetail } from "../../../../lib/admin-store";

export const dynamic = "force-dynamic";

export default async function DailyReportSubmissionDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const item = await getSubmissionDetail(decodeURIComponent(code));
  if (!item) notFound();

  return <div className="admin-page report-page">
    <div className="wide">
      <div className="admin-topline report-topline">
        <div>
          <span className="eyebrow">Submission Detail</span>
          <h1>{item.submission_code}</h1>
          <p>รายละเอียดผลงานที่ส่งเข้าระบบรับสมัคร</p>
        </div>
        <div className="admin-actions">
          <Link className="secondary report-action-button" href="/daily-report/submissions"><ArrowLeft/>กลับรายการ</Link>
        </div>
      </div>

      <article className="admin-panel report-panel">
        <header><FileText/><div><h2>{item.title_th}</h2><p>{item.submission_type === "team" ? `ทีม ${item.team_name || "-"}` : "ส่งเดี่ยว"} • ส่งเมื่อ {formatReportDate(item.submitted_at)}</p></div></header>
        <dl className="admin-detail-list report-detail-list">
          <Detail label="ชื่อผลงานภาษาไทย" value={item.title_th} wide/>
          <Detail label="Innovation Title" value={item.title_en || "-"}/>
          <Detail label="รหัสผลงาน" value={item.submission_code}/>
          <Detail label="ประเภทการส่ง" value={item.submission_type === "team" ? `ส่งแบบทีม${item.team_name ? ` (${item.team_name})` : ""}` : "ส่งเดี่ยว"}/>
          <Detail label="สถานะ" value={statusLabel(item.status)}/>
          <Detail label="อีเมลผู้สมัคร" value={item.email}/>
          <Detail label="Link Video" value={item.video_url || "-"} wide/>
          <Detail label="คำอธิบายย่อ" value={item.summary} wide/>
        </dl>
      </article>

      <section className="admin-panel report-panel">
        <header><Users/><div><h2>ผู้สมัครและสมาชิกทีม</h2><p>ข้อมูลบุคคลตามใบสมัคร</p></div></header>
        <div className="admin-member-grid">
          {item.members.map((member) => <article key={`${member.member_order}-${member.email}`}>
            <b>{member.member_order === 1 ? "ผู้สมัครหลัก" : `สมาชิกคนที่ ${member.member_order}`}</b>
            <h4>{member.title}{member.first_name} {member.last_name}</h4>
            <dl>
              <Detail label="อีเมล" value={member.email}/>
              <Detail label="โทรศัพท์" value={member.phone}/>
              <Detail label="ตำแหน่ง" value={member.position}/>
              <Detail label="กองบังคับการ" value={member.division}/>
              <Detail label="กองบัญชาการ" value={member.bureau}/>
            </dl>
          </article>)}
        </div>
      </section>

      <section className="admin-panel report-panel">
        <header><FileText/><div><h2>ไฟล์แนบ</h2><p>แสดงชื่อไฟล์ที่ผู้สมัครส่งเข้าระบบ</p></div></header>
        {item.files.length ? <div className="report-file-list">
          {item.files.map((file) => <div key={file.document_type}>
            <b>{documentLabel(file.document_type)}</b>
            <span>{file.original_name}</span>
            <small>{formatBytes(file.byte_size)}</small>
          </div>)}
        </div> : <p className="report-empty">ยังไม่มีไฟล์แนบในระบบ</p>}
      </section>
    </div>
  </div>;
}

function Detail({ label, value, wide = false }: { label: string; value?: string | null; wide?: boolean }) {
  return <div className={wide ? "wide-detail" : undefined}><dt>{label}</dt><dd>{value || "-"}</dd></div>;
}

function documentLabel(type: string) {
  const labels: Record<string, string> = {
    ownership: "หลักฐานความเป็นเจ้าของผลงาน",
    concept: "แบบสรุปผลงานโดยย่อ",
    prototype: "หลักฐานต้นแบบหรือการทดลอง",
    implementation: "แผนต่อยอดใช้งานจริง",
  };
  return labels[type] ?? type;
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

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}
