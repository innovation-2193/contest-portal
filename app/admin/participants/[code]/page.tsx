import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { AdminPrintButton } from "../../../../components/AdminPrintButton";
import { cookieName, verifyAdminToken } from "../../../../lib/admin-auth";
import { findRegistrationByCode } from "../../../../lib/registration-lookup";

export const dynamic = "force-dynamic";

export default async function AdminParticipantDetail({ params }: { params: Promise<{ code: string }> }) {
  const cookieStore = await cookies();
  if (!verifyAdminToken(cookieStore.get(cookieName)?.value)) redirect("/admin");

  const { code } = await params;
  const item = await findRegistrationByCode(code);
  const issuedAt = formatAdminDate(new Date().toISOString());

  return <div className="admin-page admin-detail-page">
    <div className="wide">
      <div className="admin-topline print-hidden">
        <div>
          <span className="eyebrow">Participant Detail</span>
          <h1>ข้อมูลผู้เข้าร่วมงาน</h1>
          <p>รายละเอียดสำหรับตรวจสอบและพิมพ์เอกสารยืนยันการลงทะเบียน</p>
        </div>
        <div className="admin-actions"><Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>{item && <AdminPrintButton />}</div>
      </div>
      {item ? <article className="admin-panel printable-sheet">
        <header className="print-heading"><img className="print-brand-mark" src="/favicon.png" alt="Police Innovation Contest"/><div className="print-heading-copy"><span className="eyebrow">Registration Confirmation</span><h2>{item.registration_code}</h2><p>ลงทะเบียนเมื่อ {formatAdminDate(item.registered_at)}</p></div><div className="print-heading-meta"><b>ใบยืนยันการลงทะเบียน</b><span>ออกเอกสาร {issuedAt}</span></div></header>
        <section className="admin-detail-summary">
          <div className="qr admin-detail-qr"><img src={`/api/qr?text=${encodeURIComponent(item.registration_code)}`} alt={`QR Code ${item.registration_code}`}/><b>{item.registration_code}</b></div>
          <div className="admin-detail-block">
            <h3>{item.title}{item.first_name} {item.last_name}</h3>
            <dl className="admin-detail-list">
              <Detail label="อีเมล" value={item.email}/>
              <Detail label="เลขบัตรประชาชน" value={item.citizen_id}/>
              <Detail label="เบอร์ติดต่อ" value={item.phone}/>
              <Detail label="ตำแหน่ง" value={item.position}/>
              <Detail label="สังกัด" value={item.division}/>
              <Detail label="หน่วยงาน" value={item.bureau}/>
              <Detail label="สถานะ" value={statusLabel(item.status)}/>
              <Detail label="เช็คอิน" value={item.checked_in_at ? formatAdminDate(item.checked_in_at) : "-"}/>
            </dl>
            <div className="admin-actions print-hidden"><a className="secondary" href={`/api/register/${encodeURIComponent(item.registration_code)}/ticket`} target="_blank" rel="noreferrer"><Download/>เปิด PDF ยืนยัน</a></div>
          </div>
        </section>
        <div className="print-document-footer"><span>เอกสารจากระบบ Police Innovation Contest 2026</span><b>{item.registration_code}</b></div>
      </article> : <article className="admin-panel"><h2>ไม่พบข้อมูลผู้เข้าร่วมงาน</h2><p>กรุณาตรวจสอบรหัสลงทะเบียน</p></article>}
    </div>
  </div>;
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return <div><dt>{label}</dt><dd>{value || "-"}</dd></div>;
}

function statusLabel(status: string) {
  if (status === "attended") return "เข้าร่วมงานแล้ว";
  if (status === "cancelled") return "ยกเลิก";
  return "ลงทะเบียนแล้ว";
}

function formatAdminDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}
