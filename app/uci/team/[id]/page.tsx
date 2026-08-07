import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Mail, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { ConfirmSubmitButton } from "../../../../components/ConfirmSubmitButton";
import { cookieName, getAdminSession } from "../../../../lib/admin-auth";
import { createAdminPasswordLink, deleteAdminAccount, findAdminAccountById, updateAdminAccount } from "../../../../lib/admin-users";
import { actorFromAdminSession, recordAuditEvent } from "../../../../lib/audit-log";

export const dynamic = "force-dynamic";

export default async function UciTeamMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const session = await requireUci();
  const { id } = await params;
  const query = await searchParams;
  const account = await findAdminAccountById(id);

  if (!account || account.role !== "uci") {
    return <div className="admin-page"><div className="wide"><section className="admin-panel"><h1>ไม่พบสมาชิกทีม UCI</h1><p>สมาชิกนี้อาจถูกลบออกจากระบบแล้ว</p><Link className="secondary" href="/uci"><ArrowLeft/>กลับหน้าระบบ UCI</Link></section></div></div>;
  }

  return <div className="admin-page admin-detail-page"><div className="wide">
    <div className="admin-topline"><div><span className="eyebrow">UCI Team Member</span><h1>จัดการสมาชิกทีม UCI</h1><p>ตรวจสอบและแก้ไขข้อมูลสมาชิกในหน้านี้</p><small className="admin-role-badge"><ShieldCheck/>UCI • {session.email}</small></div><Link className="secondary" href="/uci"><ArrowLeft/>กลับรายการสมาชิก</Link></div>
    {query.notice && <div className={`admin-login-alert ${query.notice === "member_self_delete_forbidden" ? "warning" : "success"}`}>{noticeLabel(query.notice)}</div>}

    <article className="admin-panel">
      <section className="admin-detail-block">
        <h3>ข้อมูลปัจจุบัน</h3>
        <dl className="admin-detail-list">
          <div><dt>อีเมล</dt><dd>{account.email}</dd></div>
          <div><dt>ชื่อสมาชิก</dt><dd>{account.name || "-"}</dd></div>
          <div><dt>เบอร์ติดต่อ</dt><dd>{account.phone || "-"}</dd></div>
          <div><dt>สถานะ</dt><dd>{account.disabled ? "ปิดใช้งาน" : "ใช้งานได้"}</dd></div>
          <div><dt>รหัสผ่าน</dt><dd>{account.passwordHash ? "ตั้งรหัสผ่านแล้ว" : "รอตั้งรหัสผ่าน"}</dd></div>
        </dl>
      </section>

      <section className="admin-detail-block">
        <h3>แก้ไขข้อมูลสมาชิก</h3>
        <form action={updateUciTeamMemberAction} className="admin-form admin-account-detail-form">
          <input type="hidden" name="id" value={account.id}/>
          <div className="form-grid compact-grid"><label>ชื่อสมาชิก<input name="name" defaultValue={account.name} required/></label><label>อีเมล<input type="email" name="email" defaultValue={account.email} required/></label><label>เบอร์ติดต่อ<input name="phone" defaultValue={account.phone}/></label><label className="inline-check"><input type="checkbox" name="disabled" defaultChecked={account.disabled}/> ปิดใช้งานบัญชีนี้</label></div>
          <button className="primary" type="submit"><Pencil/>บันทึกข้อมูลสมาชิก</button>
        </form>
      </section>

      <section className="admin-detail-block">
        <h3>การจัดการบัญชี</h3>
        <div className="admin-detail-actions">
          <form action={resendUciPasswordAction}><input type="hidden" name="id" value={account.id}/><button className="secondary" type="submit"><Mail/>ส่งลิงก์ตั้งรหัสผ่านใหม่</button></form>
          {account.email !== session.email && <form action={deleteUciTeamMemberAction}><input type="hidden" name="id" value={account.id}/><ConfirmSubmitButton className="danger-btn" type="submit" message="ยืนยันลบสมาชิก UCI นี้?"><Trash2/>ลบสมาชิก UCI</ConfirmSubmitButton></form>}
        </div>
      </section>
    </article>
  </div></div>;
}

async function updateUciTeamMemberAction(formData: FormData) {
  "use server";
  const session = await requireUci();
  const id = text(formData, "id");
  const existing = await findAdminAccountById(id);
  if (!existing || existing.role !== "uci") throw new Error("ไม่พบสมาชิก UCI");
  const account = await updateAdminAccount(id, { name: text(formData, "name"), email: text(formData, "email"), phone: text(formData, "phone"), disabled: formData.get("disabled") === "on" });
  if (account.role !== "uci") throw new Error("บัญชีนี้ไม่ใช่สมาชิก UCI");
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "uci_user.updated", entityType: "uci_user", entityId: account.id, summary: `แก้ไขสมาชิก UCI ${account.email}`, payload: { disabled: account.disabled } }, await headers());
  revalidatePath("/uci");
  revalidatePath(`/uci/team/${encodeURIComponent(account.id)}`);
  revalidatePath(`/admin/uci/${encodeURIComponent(account.id)}`);
  redirect(`/uci/team/${encodeURIComponent(account.id)}?notice=member_saved`);
}

async function resendUciPasswordAction(formData: FormData) {
  "use server";
  const session = await requireUci();
  const id = text(formData, "id");
  const existing = await findAdminAccountById(id);
  if (!existing || existing.role !== "uci") throw new Error("ไม่พบสมาชิก UCI");
  const result = await createAdminPasswordLink(id);
  if (result.account.role !== "uci") throw new Error("บัญชีนี้ไม่ใช่สมาชิก UCI");
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "uci_user.password_link_sent", entityType: "uci_user", entityId: result.account.id, summary: `ส่งลิงก์ตั้งรหัสผ่านให้ ${result.account.email}` }, await headers());
  revalidatePath("/uci");
  revalidatePath(`/uci/team/${encodeURIComponent(id)}`);
  redirect(`/uci/team/${encodeURIComponent(id)}?notice=password_link_sent`);
}

async function deleteUciTeamMemberAction(formData: FormData) {
  "use server";
  const session = await requireUci();
  const id = text(formData, "id");
  const account = await findAdminAccountById(id);
  if (!account || account.role !== "uci") throw new Error("ไม่พบสมาชิก UCI");
  if (account.email === session.email) redirect(`/uci/team/${encodeURIComponent(id)}?notice=member_self_delete_forbidden`);
  await deleteAdminAccount(id);
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "uci_user.deleted", entityType: "uci_user", entityId: id, summary: "ลบสมาชิก UCI" }, await headers());
  revalidatePath("/uci");
  revalidatePath("/admin/uci");
  redirect("/uci?notice=member_deleted");
}

async function requireUci() {
  const session = getAdminSession((await cookies()).get(cookieName)?.value);
  if (!session || session.role !== "uci") redirect("/uci");
  return session;
}

function text(formData: FormData, name: string) { return String(formData.get(name) ?? "").replace(/\s+/g, " ").trim(); }

function noticeLabel(code: string) {
  const labels: Record<string, string> = { member_saved: "บันทึกข้อมูลสมาชิกเรียบร้อยแล้ว", password_link_sent: "ส่งลิงก์ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว", member_self_delete_forbidden: "ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้" };
  return labels[code] || code;
}
