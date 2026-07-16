import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText, Users } from "lucide-react";
import { AdminPrintButton } from "../../../../components/AdminPrintButton";
import { cookieName, verifyAdminToken } from "../../../../lib/admin-auth";
import { getSubmissionDetail } from "../../../../lib/admin-store";

export const dynamic = "force-dynamic";

const documentLabels: Record<string, string> = {
  ownership: "3.1 หลักฐานความเป็นเจ้าของผลงาน",
  concept: "3.2 แบบสรุปผลงานโดยย่อ",
  prototype: "3.3 หลักฐานต้นแบบหรือการทดลอง",
  implementation: "3.4 แผนต่อยอดใช้งานจริง",
};

export default async function AdminSubmissionDetail({ params }: { params: Promise<{ code: string }> }) {
  const cookieStore = await cookies();
  if (!verifyAdminToken(cookieStore.get(cookieName)?.value)) redirect("/admin");

  const { code } = await params;
  const item = await getSubmissionDetail(code);
  const issuedAt = formatAdminDate(new Date().toISOString());

  return <div className="admin-page admin-detail-page">
    <div className="wide">
      <div className="admin-topline print-hidden">
        <div>
          <span className="eyebrow">Submission Detail</span>
          <h1>ข้อมูลสมัครประกวด</h1>
          <p>รายละเอียดใบสมัคร ผลงาน สมาชิกทีม และเอกสารแนบสำหรับตรวจสอบ/พิมพ์</p>
        </div>
        <div className="admin-actions"><Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>{item && <AdminPrintButton label="พิมพ์ข้อมูลใบสมัคร" />}</div>
      </div>
      {item ? <article className="admin-panel printable-sheet">
        <header className="print-heading"><img className="print-brand-mark" src="/favicon.png" alt="Police Innovation Contest"/><div className="print-heading-copy"><span className="eyebrow">Innovation Submission</span><h2>{item.submission_code}</h2><p>ส่งข้อมูลเมื่อ {formatAdminDate(item.submitted_at)} • สถานะ {item.status}</p></div><div className="print-heading-meta"><b>รายละเอียดใบสมัครประกวด</b><span>ออกเอกสาร {issuedAt}</span></div></header>
        <section className="admin-detail-block">
          <h3>ข้อมูลผลงาน</h3>
          <dl className="admin-detail-list">
            <Detail label="ชื่อผลงานภาษาไทย" value={item.title_th}/>
            <Detail label="Innovation Title" value={item.title_en || "-"}/>
            <Detail label="ประเภทการส่ง" value={item.submission_type === "team" ? `ส่งแบบกลุ่ม${item.team_name ? ` (${item.team_name})` : ""}` : "ส่งเดี่ยว"}/>
            <Detail label="บัญชีอีเมล" value={item.email}/>
            <Detail label="Link Video" value={item.video_url || "-"}/>
            <Detail label="คำอธิบายย่อ" value={item.summary} wide/>
          </dl>
        </section>
        <section className="admin-detail-block">
          <h3><Users/> ข้อมูลผู้สมัครและสมาชิกทีม</h3>
          <div className="admin-member-grid">
            {item.members.map((member) => <article key={`${member.member_order}-${member.citizen_id}`}>
              <b>{member.member_order === 1 ? "ผู้สมัครหลัก" : `สมาชิกคนที่ ${member.member_order}`}</b>
              <h4>{member.title}{member.first_name} {member.last_name}</h4>
              <dl>
                <Detail label="อีเมล" value={member.email}/>
                <Detail label="เลขบัตรประชาชน" value={member.citizen_id}/>
                <Detail label="เบอร์ติดต่อ" value={member.phone}/>
                <Detail label="ตำแหน่ง" value={member.position}/>
                <Detail label="กองบังคับการ" value={member.division}/>
                <Detail label="กองบัญชาการ" value={member.bureau}/>
              </dl>
            </article>)}
          </div>
        </section>
        <section className="admin-detail-block print-hidden">
          <h3>ไฟล์แนบในระบบ</h3>
          {item.files.length ? <div className="admin-file-list">{item.files.map((file) => <a key={file.document_type} href={`/api/admin/submissions/${encodeURIComponent(item.submission_code)}/files/${encodeURIComponent(file.document_type)}`} target="_blank" rel="noreferrer">
            <FileText/>
            <span><b>{documentLabels[file.document_type] ?? file.document_type}</b><small>เปิด/พิมพ์ PDF • {file.original_name} • {formatBytes(file.byte_size)}</small></span>
            <ExternalLink/>
          </a>)}</div> : <p>ยังไม่มีไฟล์แนบในระบบ</p>}
          <p className="admin-print-note">เปิดไฟล์ PDF ในแท็บใหม่ แล้วใช้คำสั่งพิมพ์ของเบราว์เซอร์หรือ PDF viewer เพื่อพิมพ์เอกสารแนบ</p>
        </section>
        <div className="print-document-footer"><span>เอกสารจากระบบ Police Innovation Contest 2026</span><b>{item.submission_code}</b></div>
      </article> : <article className="admin-panel"><h2>ไม่พบใบสมัครประกวด</h2><p>กรุณาตรวจสอบรหัสผลงาน</p></article>}
    </div>
  </div>;
}

function Detail({ label, value, wide = false }: { label: string; value?: string | null; wide?: boolean }) {
  return <div className={wide ? "wide-detail" : undefined}><dt>{label}</dt><dd>{value || "-"}</dd></div>;
}

function formatAdminDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}
