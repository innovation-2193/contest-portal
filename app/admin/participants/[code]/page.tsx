import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Download, Pencil, Trash2 } from "lucide-react";
import { AdminPrintButton } from "../../../../components/AdminPrintButton";
import { ConfirmSubmitButton } from "../../../../components/ConfirmSubmitButton";
import { cookieName, getAdminSession } from "../../../../lib/admin-auth";
import { deleteParticipant, updateParticipant } from "../../../../lib/admin-store";
import { actorFromAdminSession, recordAuditEvent } from "../../../../lib/audit-log";
import { findRegistrationByCode } from "../../../../lib/registration-lookup";
import { isThaiCitizenId } from "../../../../lib/validation";

export const dynamic = "force-dynamic";

const participantStatuses = [
  ["registered", "ลงทะเบียนแล้ว"],
  ["attended", "เข้าร่วมงานแล้ว"],
  ["cancelled", "ยกเลิก"],
] as const;

export default async function AdminParticipantDetail({ params }: { params: Promise<{ code: string }> }) {
  await requireAdmin();

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
        <section className="admin-detail-block print-hidden">
          <details className="admin-edit-disclosure" open>
            <summary><Pencil/>แก้ไขข้อมูลผู้เข้าร่วมงาน</summary>
            <form action={updateParticipantAction} className="admin-form admin-participant-detail-form">
              <input type="hidden" name="registrationCode" value={item.registration_code}/>
              <input type="hidden" name="provider" value={item.provider ?? "local"}/>
              <div className="form-grid compact-grid">
                <label>คำนำหน้า<input name="title" defaultValue={item.title} required/></label>
                <label>ชื่อ<input name="firstName" defaultValue={item.first_name} required/></label>
                <label>นามสกุล<input name="lastName" defaultValue={item.last_name} required/></label>
                <label>อีเมล<input type="email" name="email" defaultValue={item.email} required/></label>
                <label>เลขบัตรประชาชน<input name="citizenId" defaultValue={item.citizen_id} inputMode="numeric" pattern="\d{13}" maxLength={13} required/></label>
                <label>เบอร์ติดต่อ<input name="phone" defaultValue={item.phone} inputMode="numeric" pattern="0[689]\d{8}" maxLength={10} required/></label>
                <label>ตำแหน่ง<input name="position" defaultValue={item.position} required/></label>
                <label>กองบังคับการ<input name="division" defaultValue={item.division} required/></label>
                <label>กองบัญชาการ<input name="bureau" defaultValue={item.bureau} required/></label>
                <label>สถานะ<select name="status" defaultValue={item.status}>{participantStatuses.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
              </div>
              <button className="primary" type="submit"><Pencil/>บันทึกข้อมูลผู้เข้าร่วมงาน</button>
            </form>
          </details>
        </section>
        <section className="admin-detail-block print-hidden">
          <h3>การจัดการรายการ</h3>
          <div className="admin-detail-actions">
            <form action={deleteParticipantAction}>
              <input type="hidden" name="registrationCode" value={item.registration_code}/>
              <ConfirmSubmitButton className="danger-btn" type="submit" message="ยืนยันลบข้อมูลผู้เข้าร่วมงานรายการนี้?"><Trash2/>ลบผู้เข้าร่วมงาน</ConfirmSubmitButton>
            </form>
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

async function updateParticipantAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const requestHeaders = await headers();
  const citizenId = text(formData, "citizenId");
  const phone = text(formData, "phone");
  const status = text(formData, "status") || "registered";
  if (!/^\d{13}$/.test(citizenId) || !isThaiCitizenId(citizenId)) throw new Error("หมายเลขบัตรประชาชนไม่ถูกต้อง");
  if (!/^0[689]\d{8}$/.test(phone)) throw new Error("เบอร์ติดต่อไม่ถูกต้อง");
  if (!["registered", "attended", "cancelled"].includes(status)) throw new Error("สถานะไม่ถูกต้อง");
  const registrationCode = text(formData, "registrationCode");
  await updateParticipant({
    registrationCode,
    email: text(formData, "email"),
    provider: text(formData, "provider") as "google" | "microsoft" | "local",
    title: text(formData, "title"),
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    citizenId,
    phone,
    position: text(formData, "position"),
    division: text(formData, "division"),
    bureau: text(formData, "bureau"),
    status: status as "registered" | "attended" | "cancelled",
  });
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "registration.updated",
    entityType: "registration",
    entityId: registrationCode,
    summary: `แก้ไขข้อมูลผู้เข้าร่วมงาน ${registrationCode}`,
    payload: { status },
  }, requestHeaders);
  revalidatePath("/admin");
  revalidatePath(`/admin/participants/${encodeURIComponent(registrationCode)}`);
  redirect(`/admin/participants/${encodeURIComponent(registrationCode)}`);
}

async function deleteParticipantAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const requestHeaders = await headers();
  const registrationCode = text(formData, "registrationCode");
  await deleteParticipant(registrationCode);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "registration.deleted",
    entityType: "registration",
    entityId: registrationCode,
    summary: `ลบข้อมูลผู้เข้าร่วมงาน ${registrationCode}`,
  }, requestHeaders);
  revalidatePath("/admin");
  redirect("/admin");
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");
  return session;
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").replace(/\s+/g, " ").trim();
}

function formatAdminDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}
