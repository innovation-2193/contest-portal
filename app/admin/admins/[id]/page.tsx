import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Mail, Pencil, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { ConfirmSubmitButton } from "../../../../components/ConfirmSubmitButton";
import { cookieName, getAdminSession } from "../../../../lib/admin-auth";
import {
  createAdminPasswordLink,
  deleteAdminAccount,
  findAdminAccountById,
  updateAdminAccount,
  type AdminAccount,
} from "../../../../lib/admin-users";
import { actorFromAdminSession, recordAuditEvent } from "../../../../lib/audit-log";

export const dynamic = "force-dynamic";

export default async function AdminAccountDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin();
  const { id } = await params;
  const account = await findAdminAccountById(id);

  return <div className="admin-page admin-detail-page">
    <div className="wide">
      <div className="admin-topline">
        <div>
          <span className="eyebrow">Admin Account</span>
          <h1>ข้อมูลแอดมิน</h1>
          <p>ดูข้อมูลบัญชี แก้ไขชื่อ/อีเมล ปิดใช้งาน ส่งลิงก์รีเซ็ต หรือจัดการบัญชีแอดมินรายนี้</p>
          <small className="admin-role-badge"><ShieldCheck/>Super Admin • {session.email}</small>
        </div>
        <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
      </div>

      {account ? <article className="admin-panel printable-sheet">
        <header className="print-heading">
          <div className="print-heading-copy">
            <span className="eyebrow">Admin Profile</span>
            <h2>{account.email}</h2>
            <p>สร้างเมื่อ {formatAdminDate(account.createdAt)} • อัปเดตล่าสุด {formatAdminDate(account.updatedAt)}</p>
          </div>
          <div className="print-heading-meta">
            <b>{account.disabled ? "ปิดใช้งาน" : "ใช้งานได้"}</b>
            <span>{account.passwordHash ? "ตั้งรหัสผ่านแล้ว" : "รอตั้งรหัสผ่าน"}</span>
          </div>
        </header>

        <section className="admin-detail-block">
          <h3>ข้อมูลบัญชี</h3>
          <dl className="admin-detail-list">
            <Detail label="อีเมล" value={account.email}/>
            <Detail label="ชื่อ" value={account.name || "-"}/>
            <Detail label="Role" value="Admin"/>
            <Detail label="สถานะ" value={account.disabled ? "ปิดใช้งาน" : "ใช้งานได้"}/>
            <Detail label="รหัสผ่าน" value={account.passwordHash ? "ตั้งรหัสผ่านแล้ว" : "รอตั้งรหัสผ่าน"}/>
            <Detail label="ลิงก์ล่าสุดหมดอายุ" value={account.resetTokenExpiresAt ? formatAdminDate(account.resetTokenExpiresAt) : "-"}/>
          </dl>
        </section>

        <section className="admin-detail-block">
          <details className="admin-edit-disclosure" open>
            <summary><Pencil/>แก้ไขข้อมูลแอดมิน</summary>
            <AdminAccountEditForm account={account}/>
          </details>
        </section>

        <section className="admin-detail-block">
          <h3>การจัดการรหัสผ่านและบัญชี</h3>
          <div className="admin-detail-actions">
            <form action={resendPasswordLinkAction}>
              <input type="hidden" name="id" value={account.id}/>
              <button className="secondary" type="submit"><RefreshCw/>ส่งลิงก์รีเซ็ตรหัสผ่าน</button>
            </form>
            <form action={deleteAccountAction}>
              <input type="hidden" name="id" value={account.id}/>
              <ConfirmSubmitButton className="danger-btn" type="submit" message="ยืนยันลบบัญชีแอดมินนี้?"><Trash2/>ลบแอดมิน</ConfirmSubmitButton>
            </form>
          </div>
        </section>
      </article> : <article className="admin-panel"><h2>ไม่พบข้อมูลแอดมิน</h2><p>กรุณาตรวจสอบรายการแอดมินอีกครั้ง</p></article>}
    </div>
  </div>;
}

function AdminAccountEditForm({ account }: { account: AdminAccount }) {
  return <form action={updateAccountAction} className="admin-form admin-account-detail-form">
    <input type="hidden" name="id" value={account.id}/>
    <div className="form-grid compact-grid">
      <label>ชื่อ<input name="name" defaultValue={account.name} placeholder="ชื่อหรือหน้าที่ของแอดมิน"/></label>
      <label>อีเมล<input type="email" name="email" defaultValue={account.email} required/></label>
      <label className="inline-check"><input type="checkbox" name="disabled" defaultChecked={account.disabled}/> ปิดใช้งานแอดมินนี้</label>
    </div>
    <button className="primary" type="submit"><Mail/>บันทึกข้อมูลแอดมิน</button>
  </form>;
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return <div><dt>{label}</dt><dd>{value || "-"}</dd></div>;
}

async function updateAccountAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const id = text(formData, "id");
  const account = await updateAdminAccount(id, {
    name: text(formData, "name"),
    email: text(formData, "email"),
    disabled: formData.get("disabled") === "on",
  });
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "admin_user.updated",
    entityType: "admin_user",
    entityId: id,
    summary: `แก้ไขแอดมิน ${account.email}`,
    payload: { disabled: account.disabled },
  }, requestHeaders);
  revalidatePath("/admin");
  revalidatePath(`/admin/admins/${encodeURIComponent(id)}`);
  redirect(`/admin/admins/${encodeURIComponent(id)}`);
}

async function resendPasswordLinkAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const id = text(formData, "id");
  const result = await createAdminPasswordLink(id);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "admin_user.password_link_sent",
    entityType: "admin_user",
    entityId: id,
    summary: `ส่งลิงก์ตั้ง/รีเซ็ตรหัสผ่านให้ ${result.account.email}`,
  }, requestHeaders);
  revalidatePath("/admin");
  revalidatePath(`/admin/admins/${encodeURIComponent(id)}`);
  redirect(`/admin/admins/${encodeURIComponent(id)}`);
}

async function deleteAccountAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const id = text(formData, "id");
  await deleteAdminAccount(id);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "admin_user.deleted",
    entityType: "admin_user",
    entityId: id,
    summary: "ลบแอดมิน",
  }, requestHeaders);
  revalidatePath("/admin");
  redirect("/admin");
}

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") redirect("/admin");
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
