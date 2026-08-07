import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { Car, ClipboardList, Download, Gift, LogIn, LogOut, Mail, Pencil, QrCode, ShieldCheck, UserPlus, Users } from "lucide-react";
import { SecretInput } from "../../components/SecretInput";
import { adminClientKey, adminCookieSecure, adminSessionMaxAgeSeconds, clearAdminLoginFailures, cookieName, getAdminSession, getAdminLoginStatus, recordAdminLoginFailure, createAdminSessionToken, slowFailedAdminLogin } from "../../lib/admin-auth";
import { createAdminAccount, createAdminPasswordLink, deleteAdminAccount, listUciAccounts, updateAdminAccount, verifyAdminAccountPassword } from "../../lib/admin-users";
import { actorFromAdminSession, recordAuditEvent } from "../../lib/audit-log";
import { getAdminSettings, listParticipants, listParkingReservations, saveAdminSettings } from "../../lib/admin-store";
import { getEvaluationSummary } from "../../lib/evaluation-store";

export const dynamic = "force-dynamic";

export default async function UciPage({ searchParams }: { searchParams: Promise<{ login?: string; notice?: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  const params = await searchParams;
  if (!session) {
    return <div className="admin-page"><div className="wide"><section className="admin-login">
      <span className="eyebrow">UCI / Admin Operations</span>
      <h1>เข้าสู่ระบบ UCI หรือ Admin</h1>
      <p>สำหรับเจ้าหน้าที่ UCI หรือ Admin ใช้จัดการลงทะเบียน เช็คอิน แบบสอบถาม Lucky Draw และรายการสำรองที่จอดรถ</p>
      {params.login && <div className="admin-login-alert">อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือบัญชีนี้ไม่มีสิทธิ์เข้าหน้าปฏิบัติงาน</div>}
      <form action={uciLoginAction} className="admin-login-card">
        <label>อีเมล UCI หรือ Admin<input type="email" name="email" required autoComplete="username"/></label>
        <label>รหัสผ่าน<SecretInput name="password" required autoComplete="current-password"/></label>
        <button className="primary" type="submit"><LogIn/>เข้าสู่ระบบ UCI หรือ Admin</button>
      </form>
      <p className="admin-login-help">หากยังไม่มีรหัสผ่าน ให้ขอลิงก์ตั้งรหัสผ่านจากผู้ดูแลทีม UCI หรือ Super Admin</p>
    </section></div></div>;
  }

  const [settings, participants, evaluation, parking, members] = await Promise.all([
    getAdminSettings(),
    listParticipants(),
    getEvaluationSummary(),
    listParkingReservations(),
    session.role === "uci" ? listUciAccounts() : Promise.resolve([]),
  ]);
  const attended = participants.filter((item) => item.status === "attended").length;

  return <div className="admin-page"><div className="wide">
    <div className="admin-topline"><div><span className="eyebrow">UCI Operations Console</span><h1>ระบบปฏิบัติการ UCI</h1><p>จัดการงานหน้างานและดูแลการปฏิบัติงานได้จากหน้านี้</p><small className="admin-role-badge"><ShieldCheck/>{session.role === "uci" ? "UCI" : session.role === "super_admin" ? "Super Admin" : "Admin"} • {session.email}</small></div><form action={uciLogoutAction}><button className="secondary" type="submit"><LogOut/>ออกจากระบบ</button></form></div>
    {params.notice && <div className="admin-login-alert success">{noticeLabel(params.notice)}</div>}

    <section className="admin-panel"><header className="admin-section-head"><Users/><div><h2>ภาพรวมหน้างาน</h2><p>ข้อมูลล่าสุดจากระบบลงทะเบียน</p></div></header><div className="evaluation-dashboard-summary"><div className="stat-panel"><Users/><b>{participants.length.toLocaleString("th-TH")}</b><span>ผู้ลงทะเบียน</span></div><div className="stat-panel"><QrCode/><b>{attended.toLocaleString("th-TH")}</b><span>เช็คอินแล้ว</span></div><div className="stat-panel"><ClipboardList/><b>{evaluation.total.toLocaleString("th-TH")}</b><span>ผู้ตอบแบบสอบถาม</span></div></div></section>

    <section className="admin-panel"><header className="admin-section-head"><Users/><div><h2>งานที่ UCI ดูแล</h2><p>เปิดเครื่องมือที่ใช้ในวันงานได้ทันที</p></div></header><div className="admin-detail-actions uci-action-grid">
      <Link className="primary" href="/admin/participants"><UserPlus/>ลงทะเบียนและจัดการผู้เข้าร่วม</Link>
      <Link className="primary" href="/admin/scan"><QrCode/>สแกน QR เช็คอิน</Link>
      <Link className="primary" href="/admin/evaluations"><ClipboardList/>แบบสอบถามและ Lucky Draw</Link>
      <a className="secondary" href="/api/admin/participants/export"><Download/>Export รายชื่อผู้เข้าร่วม PDF</a>
      {session.role === "uci" && <a className="secondary" href="/api/admin/parking/list-export"><Car/>Export รายการสำรองที่จอดรถ PDF ({parking.length})</a>}
    </div></section>

    <section className="admin-panel"><header className="admin-section-head"><ClipboardList/><div><h2>แบบสอบถามความพึงพอใจ</h2><p>{settings.satisfactionEvaluationEnabled ? "ขณะนี้ผู้เข้าร่วมงานสามารถตอบแบบสอบถามได้" : "ขณะนี้ยังไม่เปิดให้ผู้เข้าร่วมงานตอบแบบสอบถาม"}</p></div></header><div className="admin-detail-actions">{session.role === "uci" && <form action={toggleEvaluationAction}><input type="hidden" name="enabled" value={settings.satisfactionEvaluationEnabled ? "0" : "1"}/><button className={settings.satisfactionEvaluationEnabled ? "secondary" : "primary"} type="submit">{settings.satisfactionEvaluationEnabled ? "ปิดแบบสอบถาม" : "เปิดแบบสอบถาม"}</button></form>}<Link className="secondary" href="/admin/evaluations">ดูผลประเมินและกด Lucky Draw</Link></div></section>

    {session.role === "uci" && <section className="admin-panel"><header className="admin-section-head"><Users/><div><h2>สมาชิกทีม UCI</h2><p>เพิ่ม แก้ไข ลบสมาชิก และส่งลิงก์ตั้งรหัสผ่านให้สมาชิกในทีมได้เอง</p></div></header>
      <form action={createUciMemberAction} className="admin-form"><div className="form-grid compact-grid"><label>ชื่อสมาชิก<input name="name" required placeholder="ชื่อ-นามสกุล หรือหน้าที่"/></label><label>อีเมล<input type="email" name="email" required/></label><label>เบอร์ติดต่อ<input name="phone"/></label></div><button className="primary" type="submit"><UserPlus/>เพิ่มสมาชิกและส่งลิงก์ตั้งรหัสผ่าน</button></form>
      <div className="admin-table-wrap"><table className="admin-table compact-admin-table"><thead><tr><th>สมาชิก</th><th>อีเมล</th><th>สถานะ</th><th>แก้ไข</th><th></th></tr></thead><tbody>{members.length ? members.map((member) => <tr key={member.id}><td data-label="สมาชิก"><b>{member.name || "ไม่ระบุชื่อ"}</b><small>{member.phone || "-"}</small></td><td data-label="อีเมล">{member.email}</td><td data-label="สถานะ"><span className={`status-pill ${member.disabled ? "cancelled" : "attended"}`}>{member.disabled ? "ปิดใช้งาน" : "ใช้งานได้"}<br/>{member.passwordHash ? "ตั้งรหัสผ่านแล้ว" : "รอตั้งรหัสผ่าน"}</span></td><td data-label="แก้ไข"><form action={updateUciMemberAction} className="uci-inline-form"><input type="hidden" name="id" value={member.id}/><input name="name" defaultValue={member.name}/><input type="email" name="email" defaultValue={member.email}/><input name="phone" defaultValue={member.phone}/><label className="inline-check"><input type="checkbox" name="disabled" defaultChecked={member.disabled}/> ปิดใช้งาน</label><button className="secondary small-action" type="submit"><Pencil/>บันทึก</button></form></td><td data-label="การจัดการ"><div className="admin-detail-actions"><form action={resendUciPasswordAction}><input type="hidden" name="id" value={member.id}/><button className="ghost-action" type="submit"><Mail/>ส่งลิงก์ใหม่</button></form>{member.email !== session.email && <form action={deleteUciMemberAction}><input type="hidden" name="id" value={member.id}/><button className="danger-btn" type="submit">ลบ</button></form>}</div></td></tr>) : <tr><td colSpan={5}>ยังไม่มีสมาชิกทีม UCI</td></tr>}</tbody></table></div>
    </section>}
  </div></div>;
}

async function uciLoginAction(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  if (getAdminSession(cookieStore.get(cookieName)?.value)) redirect("/uci");
  const requestHeaders = await headers();
  const clientKey = adminClientKey(requestHeaders);
  const status = await getAdminLoginStatus(clientKey);
  if (status.locked) { await slowFailedAdminLogin(); redirect("/uci?login=locked"); }
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const account = await verifyAdminAccountPassword(email, String(formData.get("password") ?? ""));
  if (!account || (account.role !== "uci" && account.role !== "admin")) {
    const failure = await recordAdminLoginFailure(clientKey);
    await slowFailedAdminLogin();
    redirect(`/uci?login=${failure.locked ? "locked" : "failed"}`);
  }
  await clearAdminLoginFailures(clientKey);
  cookieStore.set(cookieName, createAdminSessionToken({ email: account.email, role: account.role }), { httpOnly: true, sameSite: "strict", secure: adminCookieSecure(), path: "/", maxAge: adminSessionMaxAgeSeconds(account.role) });
  await recordAuditEvent({ actor: { type: "admin", email: account.email }, action: "auth.uci_login", entityType: "auth", summary: `UCI เข้าสู่ระบบ ${account.email}` }, requestHeaders);
  redirect("/uci");
}

async function toggleEvaluationAction(formData: FormData) {
  "use server";
  "use server";
  const session = await requireUci();
  const settings = await getAdminSettings();
  const enabled = String(formData.get("enabled") ?? "") === "1";
  await saveAdminSettings({ ...settings, satisfactionEvaluationEnabled: enabled });
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "evaluation.availability_updated", entityType: "evaluation", summary: `${enabled ? "เปิด" : "ปิด"}แบบสอบถามความพึงพอใจ`, payload: { enabled } }, await headers());
  revalidatePath("/evaluation"); revalidatePath("/admin/evaluations"); revalidatePath("/uci");
  redirect(`/uci?notice=${enabled ? "evaluation_opened" : "evaluation_closed"}`);
}

async function createUciMemberAction(formData: FormData) {
  "use server";
  const session = await requireUci();
  const account = await createAdminAccount({ role: "uci", name: text(formData, "name"), email: text(formData, "email"), phone: text(formData, "phone") });
  await createAdminPasswordLink(account.id);
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "uci_user.created", entityType: "uci_user", entityId: account.id, summary: `เพิ่มสมาชิก UCI ${account.email}` }, await headers());
  revalidatePath("/uci"); revalidatePath("/admin/uci");
  redirect("/uci?notice=member_added");
}

async function updateUciMemberAction(formData: FormData) {
  "use server";
  const session = await requireUci();
  const account = await updateAdminAccount(text(formData, "id"), { name: text(formData, "name"), email: text(formData, "email"), phone: text(formData, "phone"), disabled: formData.get("disabled") === "on" });
  if (account.role !== "uci") throw new Error("บัญชีนี้ไม่ใช่สมาชิก UCI");
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "uci_user.updated", entityType: "uci_user", entityId: account.id, summary: `แก้ไขสมาชิก UCI ${account.email}`, payload: { disabled: account.disabled } }, await headers());
  revalidatePath("/uci"); revalidatePath(`/admin/uci/${encodeURIComponent(account.id)}`);
  redirect("/uci?notice=member_saved");
}

async function resendUciPasswordAction(formData: FormData) {
  "use server";
  const session = await requireUci();
  const account = await createAdminPasswordLink(text(formData, "id"));
  if (account.account.role !== "uci") throw new Error("บัญชีนี้ไม่ใช่สมาชิก UCI");
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "uci_user.password_link_sent", entityType: "uci_user", entityId: account.account.id, summary: `ส่งลิงก์ตั้งรหัสผ่านให้ ${account.account.email}` }, await headers());
  revalidatePath("/uci");
  redirect("/uci?notice=password_link_sent");
}

async function deleteUciMemberAction(formData: FormData) {
  "use server";
  const session = await requireUci();
  const id = text(formData, "id");
  const members = await listUciAccounts();
  if (!members.some((member) => member.id === id)) throw new Error("ไม่พบสมาชิก UCI");
  await deleteAdminAccount(id);
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "uci_user.deleted", entityType: "uci_user", entityId: id, summary: "ลบสมาชิก UCI" }, await headers());
  revalidatePath("/uci"); revalidatePath("/admin/uci");
  redirect("/uci?notice=member_deleted");
}

async function uciLogoutAction() {
  "use server";
  const cookieStore = await cookies(); cookieStore.delete(cookieName); redirect("/uci");
}

async function requireUci() {
  const session = getAdminSession((await cookies()).get(cookieName)?.value);
  if (!session || session.role !== "uci") redirect("/uci");
  return session;
}

function text(formData: FormData, name: string) { return String(formData.get(name) ?? "").replace(/\s+/g, " ").trim(); }

function noticeLabel(code: string) {
  const labels: Record<string, string> = { evaluation_opened: "เปิดแบบสอบถามเรียบร้อยแล้ว", evaluation_closed: "ปิดแบบสอบถามเรียบร้อยแล้ว", member_added: "เพิ่มสมาชิกและส่งลิงก์ตั้งรหัสผ่านแล้ว", member_saved: "บันทึกข้อมูลสมาชิกแล้ว", member_deleted: "ลบสมาชิกแล้ว", password_link_sent: "ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว" };
  return labels[code] || code;
}
