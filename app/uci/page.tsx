import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { Car, CheckCircle2, ClipboardList, Download, Eye, Gift, KeyRound, LayoutGrid, LogIn, LogOut, Mail, Pencil, Printer, QrCode, ShieldCheck, Sparkles, Trash2, UserPlus, Users } from "lucide-react";
import { ConfirmSubmitButton } from "../../components/ConfirmSubmitButton";
import { SecretInput } from "../../components/SecretInput";
import { UciOnboardingPrompt } from "../../components/UciOnboardingPrompt";
import { UciVideoCarousel } from "../../components/UciVideoCarousel";
import { adminClientKey, adminCookieSecure, adminSessionMaxAgeSeconds, clearAdminLoginFailures, cookieName, getAdminSession, getAdminLoginStatus, recordAdminLoginFailure, createAdminSessionToken, slowFailedAdminLogin } from "../../lib/admin-auth";
import { createAdminAccount, createAdminPasswordLink, deleteAdminAccount, findAdminAccountByEmail, listUciAccounts, verifyAdminAccountPassword } from "../../lib/admin-users";
import { actorFromAdminSession, recordAuditEvent } from "../../lib/audit-log";
import { getAdminSettings, listParticipants, listParkingReservations, saveAdminSettings } from "../../lib/admin-store";
import { getEvaluationSummary } from "../../lib/evaluation-store";
import { listUciVideos, uciVideoPlatform, youtubeThumbnailUrl } from "../../lib/uci-videos";
import { listEventBooths } from "../../lib/event-booths";

export const dynamic = "force-dynamic";

export default async function UciPage({ searchParams }: { searchParams: Promise<{ login?: string; notice?: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  const params = await searchParams;
  if (!session) {
    return <div className="admin-page"><div className="wide"><section className="admin-login admin-login-uci">
      <div className="admin-login-uci-orb admin-login-uci-orb-one" aria-hidden="true"/>
      <div className="admin-login-uci-orb admin-login-uci-orb-two" aria-hidden="true"/>
      <div className="admin-login-uci-grid">
        <div className="admin-login-uci-intro">
          <div className="admin-login-uci-brand"><span><ShieldCheck/></span><div><b>POLICE INNOVATION CONTEST 2026</b><small>SECURE OPERATIONS PORTAL</small></div></div>
          <span className="eyebrow"><Sparkles/> UCI / Admin Operations</span>
          <h1>เข้าสู่ระบบ<br/><em>UCI หรือ Admin</em></h1>
          <p>ศูนย์ควบคุมงานหน้างานสำหรับจัดการลงทะเบียน เช็คอิน แบบสอบถาม Lucky Draw และข้อมูลสำคัญของการประกวด</p>
          <div className="admin-login-uci-features">
            <div><CheckCircle2/><span><b>จัดการหน้างานได้ในที่เดียว</b><small>ข้อมูลพร้อมใช้งานแบบเรียลไทม์</small></span></div>
            <div><CheckCircle2/><span><b>ปลอดภัยสำหรับทีมปฏิบัติการ</b><small>ระบบแยกสิทธิ์ UCI และ Admin</small></span></div>
          </div>
          <div className="admin-login-uci-footer"><span>AUTHORIZED PERSONNEL ONLY</span><span>•</span><span>UCI OPERATIONS CENTER</span></div>
        </div>
        <div className="admin-login-uci-panel">
          <div className="admin-login-uci-panel-head"><div><span className="eyebrow">Welcome back</span><h2>ยินดีต้อนรับกลับมา</h2></div><span className="admin-login-uci-live"><i/> Live</span></div>
          {params.login && <div className="admin-login-alert">อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือบัญชีนี้ไม่มีสิทธิ์เข้าหน้าปฏิบัติงาน</div>}
          {params.notice && <div className="admin-login-alert success">{noticeLabel(params.notice)}</div>}
          <form action={uciLoginAction} className="admin-login-card">
            <label><span>อีเมล UCI หรือ Admin</span><input type="email" name="email" required autoComplete="username" placeholder="name@example.com"/></label>
            <label><span>รหัสผ่าน</span><SecretInput name="password" required autoComplete="current-password"/></label>
            <label className="admin-login-remember"><input type="checkbox" name="remember"/><span>จำการเข้าสู่ระบบไว้ 30 วัน</span></label>
            <button className="primary" type="submit"><LogIn/>เข้าสู่ระบบ UCI หรือ Admin</button>
            <div className="admin-login-uci-secure"><ShieldCheck/><span>การเชื่อมต่อปลอดภัยสำหรับเจ้าหน้าที่ที่ได้รับอนุญาต</span></div>
          </form>
          <div className="admin-login-forgot"><div><KeyRound/><span><b>ลืมรหัสผ่าน?</b><small>ส่งลิงก์สร้างรหัสผ่านใหม่ไปยังอีเมลของคุณ</small></span></div><form action={forgotPasswordAction}><label><span className="sr-only">อีเมลสำหรับรับลิงก์ตั้งรหัสผ่าน</span><input type="email" name="email" required autoComplete="email" placeholder="กรอกอีเมลที่ใช้เข้าสู่ระบบ"/></label><button className="secondary" type="submit"><Mail/>ส่งลิงก์ตั้งรหัสผ่าน</button></form></div>
          <p className="admin-login-help">หากยังไม่มีรหัสผ่าน ให้ขอลิงก์ตั้งรหัสผ่านจากผู้ดูแลทีม UCI หรือ Super Admin</p>
        </div>
      </div>
    </section></div></div>;
  }

  const [settings, participants, evaluation, parking, members, videos, booths] = await Promise.all([
    getAdminSettings(),
    listParticipants(),
    getEvaluationSummary(),
    listParkingReservations(),
    session.role === "uci" ? listUciAccounts() : Promise.resolve([]),
    listUciVideos(),
    listEventBooths(session.email),
  ]);
  const attended = participants.filter((item) => item.status === "attended").length;

  return <div className="admin-page"><div className="wide">
    <div className="admin-topline"><div><span className="eyebrow">UCI Operations Console</span><h1>ระบบปฏิบัติการ UCI</h1><p>จัดการงานหน้างานและดูแลการปฏิบัติงานได้จากหน้านี้</p><small className="admin-role-badge"><ShieldCheck/>{session.role === "uci" ? "UCI" : session.role === "super_admin" ? "Super Admin" : "Admin"} • {session.email}</small></div><form action={uciLogoutAction}><button className="secondary" type="submit"><LogOut/>ออกจากระบบ</button></form></div>
    {params.notice && <div className="admin-login-alert success">{noticeLabel(params.notice)}</div>}

    <section className="admin-panel"><header className="admin-section-head"><Users/><div><h2>ภาพรวมหน้างาน</h2><p>ข้อมูลล่าสุดจากระบบลงทะเบียน</p></div></header><div className="evaluation-dashboard-summary"><div className="stat-panel"><Users/><b>{participants.length.toLocaleString("th-TH")}</b><span>ผู้ลงทะเบียน</span></div><div className="stat-panel"><QrCode/><b>{attended.toLocaleString("th-TH")}</b><span>เช็คอินแล้ว</span></div><div className="stat-panel"><ClipboardList/><b>{evaluation.total.toLocaleString("th-TH")}/{participants.length.toLocaleString("th-TH")}</b><span>ผู้ตอบแบบสอบถาม</span></div></div></section>

    <UciOnboardingPrompt accountEmail={session.email} hasVideos={videos.length > 0}/>

    <section className="admin-panel admin-checkin-cta">
      <div className="admin-checkin-copy"><QrCode/><div><span className="eyebrow">Event Check-in</span><h2>หน้าเช็คอินหน้างาน</h2><p>สแกน QR Code หรือค้นหาชื่อผู้เข้าร่วม แล้วกดเช็คอินได้ทันที</p></div></div>
      <Link className="primary" href="/admin/scan?from=uci"><QrCode/>เปิดหน้าเช็คอิน</Link>
    </section>

    <section className="admin-panel admin-checkin-cta admin-walkin-cta">
      <div className="admin-checkin-copy"><UserPlus/><div><span className="eyebrow">Walk-in Registration</span><h2>ลงทะเบียน Walk-in หน้างาน</h2><p>กรอกข้อมูลผู้เข้าร่วมที่มาหน้างาน แล้วระบบจะเช็คอินให้อัตโนมัติทันที</p></div></div>
      <Link className="primary" href="/admin/participants?from=uci"><UserPlus/>เปิด Walk-in</Link>
    </section>

    {(session.role === "uci" || session.role === "super_admin") && <section className="admin-panel admin-checkin-cta admin-lucky-draw-cta">
      <div className="admin-checkin-copy"><Gift/><div><span className="eyebrow">Live Lucky Draw</span><h2>Lucky Draw หน้างาน</h2><p>เปิดวงล้อจับฉลากรางวัลที่ 1–3 พร้อมบันทึกผล เวลา และผู้ดำเนินการเหมือน Super Admin</p></div></div>
      <Link className="primary" href="/admin/evaluations?from=uci#lucky-draw"><Gift/>เปิดหน้า Lucky Draw</Link>
    </section>}

    <UciVideoCarousel videos={videos.map((video) => ({ ...video, thumbnailUrl: video.thumbnailName ? `/api/uci-video-images/${encodeURIComponent(video.thumbnailName)}` : youtubeThumbnailUrl(video.url), sourceLabel: uciVideoPlatform(video.url) ?? "วิดีโอ" }))}/>

    <section className="admin-panel"><header className="admin-section-head"><Users/><div><h2>งานที่ UCI ดูแล</h2><p>เปิดเครื่องมือที่ใช้ในวันงานได้ทันที</p></div></header><div className="admin-detail-actions uci-action-grid">
      <Link className="primary" href="/admin/participants?from=uci"><UserPlus/>ลงทะเบียนหน้างานและเช็คอิน</Link>
      <Link className="secondary" href="/admin/evaluations?from=uci"><ClipboardList/>ดูแบบสอบถามและผล Lucky Draw</Link>
      <a className="secondary" href="/api/admin/participants/export"><Download/>Export รายชื่อผู้เข้าร่วม PDF</a>
      <a className="secondary" href="/api/admin/parking/list-export"><Car/>Export รายการสำรองที่จอดรถ PDF ({parking.length})</a>
    </div></section>

    <section className="admin-panel uci-booth-report-panel"><header className="admin-section-head"><LayoutGrid/><div><span className="eyebrow">Exhibition Booths</span><h2>รายงานบูธแสดงผลงาน</h2><p>ข้อมูลล่าสุด {booths.length.toLocaleString("th-TH")} บูธ จากผู้ลงทะเบียน Exhibitor และผลงานที่ผ่านการคัดเลือกรอบแรก</p></div></header><div className="admin-detail-actions uci-action-grid"><a className="primary" href="/api/uci/booths/overview" target="_blank" rel="noreferrer"><Download/>Export PDF ภาพรวมบูธ</a><a className="secondary" href="/api/uci/booths/labels" target="_blank" rel="noreferrer"><Printer/>พิมพ์ป้ายประจำบูธแนวนอน</a></div></section>

    <section className="admin-panel"><header className="admin-section-head"><ClipboardList/><div><h2>แบบสอบถามความพึงพอใจ</h2><p>{settings.satisfactionEvaluationEnabled ? "ขณะนี้ผู้เข้าร่วมงานสามารถตอบแบบสอบถามได้" : "ขณะนี้ยังไม่เปิดให้ผู้เข้าร่วมงานตอบแบบสอบถาม"}</p></div></header><div className="admin-detail-actions">{session.role === "uci" && <form action={toggleEvaluationAction}><input type="hidden" name="enabled" value={settings.satisfactionEvaluationEnabled ? "0" : "1"}/><button className={settings.satisfactionEvaluationEnabled ? "secondary" : "primary"} type="submit">{settings.satisfactionEvaluationEnabled ? "ปิดแบบสอบถาม" : "เปิดแบบสอบถาม"}</button></form>}<Link className="secondary" href="/admin/evaluations?from=uci">ดูผลประเมินและกด Lucky Draw</Link></div></section>

    {session.role === "uci" && <section className="admin-panel"><header className="admin-section-head"><Users/><div><h2>สมาชิกทีม UCI</h2><p>เพิ่ม แก้ไข ลบสมาชิก และส่งลิงก์ตั้งรหัสผ่านให้สมาชิกในทีมได้เอง</p></div></header>
      <form action={createUciMemberAction} className="admin-form uci-user-create-form"><div className="uci-user-create-grid"><label>ชื่อสมาชิก<input name="name" required placeholder="ชื่อ-นามสกุล หรือหน้าที่"/></label><label>อีเมล<input type="email" name="email" required placeholder="name@example.com"/></label><label>เบอร์ติดต่อ<input name="phone" placeholder="เบอร์โทรศัพท์ (ถ้ามี)"/></label></div><div className="uci-user-create-footer"><small>ระบบจะส่งลิงก์ตั้งรหัสผ่านไปยังอีเมลของสมาชิกโดยอัตโนมัติ</small><button className="primary" type="submit"><UserPlus/>เพิ่มสมาชิกและส่งลิงก์ตั้งรหัสผ่าน</button></div></form>
      <div className="admin-table-wrap"><table className="admin-table compact-admin-table uci-user-table"><thead><tr><th>สมาชิก</th><th>อีเมล / เบอร์ติดต่อ</th><th>สถานะ</th><th>การจัดการ</th></tr></thead><tbody>{members.length ? members.map((member) => <tr key={member.id}><td data-label="สมาชิก"><b>{member.name || "ไม่ระบุชื่อ"}</b><small>เพิ่มเมื่อ {formatDate(member.createdAt)}</small></td><td data-label="อีเมล / เบอร์ติดต่อ"><b>{member.email}</b><small>{member.phone || "ไม่ระบุเบอร์ติดต่อ"}</small></td><td data-label="สถานะ"><span className={`status-pill ${member.disabled ? "cancelled" : "attended"}`}>{member.disabled ? "ปิดใช้งาน" : "ใช้งานได้"}<br/>{member.passwordHash ? "ตั้งรหัสผ่านแล้ว" : "รอตั้งรหัสผ่าน"}</span></td><td data-label="การจัดการ"><div className="uci-user-actions"><Link className="secondary small-action" href={`/uci/team/${encodeURIComponent(member.id)}`}><Eye/>ดูข้อมูล</Link><Link className="secondary small-action" href={`/uci/team/${encodeURIComponent(member.id)}`}><Pencil/>แก้ไข</Link><form action={resendUciPasswordAction}><input type="hidden" name="id" value={member.id}/><button className="ghost-action small-action" type="submit"><Mail/>ส่งลิงก์ใหม่</button></form>{member.email !== session.email && <form action={deleteUciMemberAction}><input type="hidden" name="id" value={member.id}/><ConfirmSubmitButton className="danger-btn small-action" type="submit" message="ยืนยันลบสมาชิก UCI นี้?"><Trash2/>ลบสมาชิก</ConfirmSubmitButton></form>}</div></td></tr>) : <tr><td colSpan={4}>ยังไม่มีสมาชิกทีม UCI</td></tr>}</tbody></table></div>
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
  const remember = formData.get("remember") === "on";
  const account = await verifyAdminAccountPassword(email, String(formData.get("password") ?? ""));
  if (!account || (account.role !== "uci" && account.role !== "admin")) {
    const failure = await recordAdminLoginFailure(clientKey);
    await slowFailedAdminLogin();
    redirect(`/uci?login=${failure.locked ? "locked" : "failed"}`);
  }
  await clearAdminLoginFailures(clientKey);
  cookieStore.set(cookieName, createAdminSessionToken({ email: account.email, role: account.role, remember }), { httpOnly: true, sameSite: "strict", secure: adminCookieSecure(), path: "/", maxAge: adminSessionMaxAgeSeconds(account.role, remember) });
  await recordAuditEvent({ actor: { type: "admin", email: account.email }, action: "auth.uci_login", entityType: "auth", summary: `UCI เข้าสู่ระบบ ${account.email}` }, requestHeaders);
  redirect("/uci");
}

async function forgotPasswordAction(formData: FormData) {
  "use server";
  const email = text(formData, "email").toLowerCase();
  const account = await findAdminAccountByEmail(email);
  if (account && !account.disabled) {
    try {
      await createAdminPasswordLink(account.id);
    } catch (error) {
      console.error("UCI forgot-password mail failed", error);
    }
  }
  redirect("/uci?notice=password_reset_requested");
}

async function toggleEvaluationAction(formData: FormData) {
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
  const member = members.find((item) => item.id === id);
  if (!member) throw new Error("ไม่พบสมาชิก UCI");
  if (member.email === session.email) redirect("/uci?notice=member_self_delete_forbidden");
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(value));
}

function noticeLabel(code: string) {
  const labels: Record<string, string> = { evaluation_opened: "เปิดแบบสอบถามเรียบร้อยแล้ว", evaluation_closed: "ปิดแบบสอบถามเรียบร้อยแล้ว", member_added: "เพิ่มสมาชิกและส่งลิงก์ตั้งรหัสผ่านแล้ว", member_saved: "บันทึกข้อมูลสมาชิกแล้ว", member_deleted: "ลบสมาชิกแล้ว", password_link_sent: "ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว", password_reset_requested: "หากอีเมลนี้มีบัญชีในระบบ ระบบได้ส่งลิงก์ตั้งรหัสผ่านใหม่ให้แล้ว กรุณาตรวจสอบกล่องจดหมาย", member_self_delete_forbidden: "ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้" };
  return labels[code] || code;
}
