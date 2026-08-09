import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Eye, Mail, Pencil, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { ConfirmSubmitButton } from "../../../components/ConfirmSubmitButton";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { createAdminAccount, createAdminPasswordLink, deleteAdminAccount, listUciAccounts } from "../../../lib/admin-users";
import { actorFromAdminSession, recordAuditEvent } from "../../../lib/audit-log";

export const dynamic = "force-dynamic";

export default async function UciUsersPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireSuperAdmin();
  const params = await searchParams;
  const users = await listUciAccounts();
  return <div className="admin-page"><div className="wide">
    <div className="admin-topline"><div><span className="eyebrow">UCI Users</span><h1>ผู้ใช้ UCI</h1><p>Super Admin เพิ่ม ลบ แก้ไข และส่งลิงก์ตั้งรหัสผ่านให้ทีม UCI</p></div><Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link></div>
    {params.notice && <div className="admin-login-alert success">{noticeLabel(params.notice)}</div>}
    <section className="admin-panel uci-users-create-panel"><header className="admin-section-head"><Users/><div><h2>เพิ่มสมาชิก UCI</h2><p>กรอกข้อมูลสมาชิกใหม่ ระบบจะส่งลิงก์ตั้งรหัสผ่านไปยังอีเมลโดยอัตโนมัติ</p></div></header><form action={createUciAction} className="admin-form uci-user-create-form"><div className="uci-user-create-grid"><label>ชื่อสมาชิก<input name="name" required placeholder="ชื่อ-นามสกุล หรือหน้าที่"/></label><label>อีเมล<input name="email" type="email" required placeholder="name@example.com"/></label><label>เบอร์ติดต่อ<input name="phone" inputMode="tel" placeholder="เช่น 08x-xxx-xxxx"/></label></div><div className="uci-user-create-footer"><small>สมาชิกจะได้รับอีเมลสำหรับสร้างรหัสผ่านและเข้าสู่ระบบ UCI</small><button className="primary" type="submit"><UserPlus/>เพิ่มสมาชิกและส่งลิงก์ตั้งรหัสผ่าน</button></div></form></section>
    <section className="admin-panel uci-users-list-panel"><header className="admin-section-head"><ShieldCheck/><div><h2>สมาชิก UCI ทั้งหมด</h2><p>{users.length.toLocaleString("th-TH")} บัญชี • เลือก “ดูข้อมูล” เพื่อเปิดหน้ารายละเอียดย่อย</p></div></header><div className="admin-table-wrap"><table className="admin-table compact-admin-table uci-user-table"><thead><tr><th>สมาชิก</th><th>อีเมล / เบอร์ติดต่อ</th><th>สถานะ</th><th>การจัดการ</th></tr></thead><tbody>{users.length ? users.map((user) => <tr key={user.id}><td data-label="สมาชิก"><b>{user.name || "ไม่ระบุชื่อ"}</b><small>อัปเดต {formatDate(user.updatedAt)}</small></td><td data-label="อีเมล / เบอร์ติดต่อ"><b>{user.email}</b><small>{user.phone || "ไม่ระบุเบอร์ติดต่อ"}</small></td><td data-label="สถานะ"><span className={`status-pill uci-status-pill ${user.disabled ? "cancelled" : "attended"}`}>{user.disabled ? "ปิดใช้งาน" : "ใช้งานได้"} • {user.passwordHash ? "ตั้งรหัสผ่านแล้ว" : "รอตั้งรหัสผ่าน"}</span></td><td data-label="การจัดการ"><div className="uci-user-actions"><Link className="secondary small-action" href={`/admin/uci/${encodeURIComponent(user.id)}`}><Eye/>ดูข้อมูล</Link><Link className="secondary small-action" href={`/admin/uci/${encodeURIComponent(user.id)}`}><Pencil/>แก้ไข</Link><form action={resendUciPasswordAction}><input type="hidden" name="id" value={user.id}/><button className="ghost-action small-action" type="submit"><Mail/>ส่งลิงก์ใหม่</button></form><form action={deleteUciAction}><input type="hidden" name="id" value={user.id}/><ConfirmSubmitButton className="danger-btn small-action" type="submit" message="ยืนยันลบผู้ใช้ UCI นี้?"><Trash2/>ลบ</ConfirmSubmitButton></form></div></td></tr>) : <tr><td colSpan={4}>ยังไม่มีผู้ใช้ UCI</td></tr>}</tbody></table></div></section>
  </div></div>;
}

async function createUciAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const account = await createAdminAccount({ role: "uci", name: text(formData, "name"), email: text(formData, "email"), phone: text(formData, "phone") });
  await createAdminPasswordLink(account.id);
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "uci_user.created", entityType: "uci_user", entityId: account.id, summary: `เพิ่มผู้ใช้ UCI ${account.email}` }, await headers());
  revalidatePath("/admin/uci"); revalidatePath("/uci");
  redirect(`/admin/uci/${encodeURIComponent(account.id)}?notice=member_added`);
}

async function resendUciPasswordAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const result = await createAdminPasswordLink(text(formData, "id"));
  if (result.account.role !== "uci") throw new Error("บัญชีนี้ไม่ใช่ผู้ใช้ UCI");
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "uci_user.password_link_sent", entityType: "uci_user", entityId: result.account.id, summary: `ส่งลิงก์ตั้งรหัสผ่านให้ ${result.account.email}` }, await headers());
  revalidatePath("/admin/uci");
  redirect(`/admin/uci/${encodeURIComponent(result.account.id)}?notice=password_link_sent`);
}

async function deleteUciAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const id = text(formData, "id");
  const users = await listUciAccounts();
  if (!users.some((user) => user.id === id)) throw new Error("ไม่พบผู้ใช้ UCI");
  await deleteAdminAccount(id);
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "uci_user.deleted", entityType: "uci_user", entityId: id, summary: "ลบผู้ใช้ UCI" }, await headers());
  revalidatePath("/admin/uci"); revalidatePath("/uci");
  redirect("/admin/uci?notice=member_deleted");
}

async function requireSuperAdmin() {
  const session = getAdminSession((await cookies()).get(cookieName)?.value);
  if (!session || session.role !== "super_admin") redirect("/admin");
  return session;
}

function text(formData: FormData, name: string) { return String(formData.get(name) ?? "").replace(/\s+/g, " ").trim(); }
function formatDate(value: string) { return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value)); }
function noticeLabel(code: string) { return ({ member_added: "เพิ่มผู้ใช้ UCI และส่งลิงก์ตั้งรหัสผ่านแล้ว", member_deleted: "ลบผู้ใช้ UCI แล้ว", password_link_sent: "ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว" } as Record<string, string>)[code] || code; }
