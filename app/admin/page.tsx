import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { CalendarClock, Download, Eye, LogOut, QrCode, Search, Settings, Trophy, Users } from "lucide-react";
import { adminPassword, adminToken, cookieName, verifyAdminToken } from "../../lib/admin-auth";
import {
  addWinner,
  deleteWinner,
  deleteParticipant,
  getAdminSettings,
  listParticipants,
  listSubmissions,
  listWinners,
  saveAdminSettings,
  updateParticipant,
} from "../../lib/admin-store";
import { isThaiCitizenId } from "../../lib/validation";

export const dynamic = "force-dynamic";

const awardLabels: Record<string, string> = {
  finalist: "ผ่านเข้ารอบที่ 2",
  "1": "รางวัลที่ 1",
  "2": "รางวัลที่ 2",
  "3": "รางวัลที่ 3",
  honorable: "รางวัลชมเชย",
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ participantSearch?: string; submissionSearch?: string }> }) {
  const cookieStore = await cookies();
  const loggedIn = verifyAdminToken(cookieStore.get(cookieName)?.value);

  if (!loggedIn) {
    return <AdminShell><LoginPanel passwordConfigured={Boolean(adminPassword())} /></AdminShell>;
  }

  const [settings, participants, submissions, winners] = await Promise.all([
    getAdminSettings(),
    listParticipants(),
    listSubmissions(),
    listWinners(),
  ]);
  const params = await searchParams;
  const participantSearch = (params.participantSearch ?? "").trim();
  const submissionSearch = (params.submissionSearch ?? "").trim();
  const filteredParticipants = filterRecords(participants, participantSearch, (item) => [
    item.registration_code,
    item.email,
    item.citizen_id,
    item.phone,
    item.title,
    item.first_name,
    item.last_name,
    item.position,
    item.division,
    item.bureau,
    item.status,
  ]);
  const filteredSubmissions = filterRecords(submissions, submissionSearch, (item) => [
    item.submission_code,
    item.email,
    item.title_th,
    item.team_name ?? "",
    item.first_name,
    item.last_name,
    item.position,
    item.division,
    item.bureau,
    item.status,
  ]);

  return <AdminShell>
    <div className="admin-topline"><div><span className="eyebrow">Admin Console</span><h1>ระบบหลังบ้าน</h1><p>จัดการเวลาเปิดหน้า pre-lander ตรวจสอบรายชื่อผู้เข้าร่วมงาน ผู้สมัครประกวดนวัตกรรม และประกาศผู้ชนะเลิศ</p></div><form action={logoutAction}><button className="secondary" type="submit"><LogOut/>ออกจากระบบ</button></form></div>
    <section className="admin-grid">
      <article className="admin-panel settings-panel">
        <header><CalendarClock/><div><h2>ตั้งค่า Pre-lander</h2><p>เมื่อเปิดใช้งาน หน้าแรกจะแสดงหน้าเตรียมเปิดระบบก่อนถึงเวลาเปิด หรือหลังเวลาปิด</p></div></header>
        <form action={saveSettingsAction} className="admin-form">
          <label><input type="checkbox" name="prelanderEnabled" defaultChecked={settings.prelanderEnabled}/> เปิดใช้งาน pre-lander</label>
          <label><input type="checkbox" name="eventRegistrationEnabled" defaultChecked={settings.eventRegistrationEnabled}/> เปิดลงทะเบียนเข้าร่วมงาน</label>
          <label><input type="checkbox" name="contestSubmissionEnabled" defaultChecked={settings.contestSubmissionEnabled}/> เปิดรับสมัครประกวดนวัตกรรม</label>
          <div className="form-grid compact-grid"><label>เปิดระบบเมื่อ<input type="datetime-local" name="openAt" defaultValue={toInputDate(settings.openAt)}/></label><label>ปิดระบบเมื่อ<input type="datetime-local" name="closeAt" defaultValue={toInputDate(settings.closeAt)}/></label></div>
          <label>หัวข้อ<input name="prelanderTitle" defaultValue={settings.prelanderTitle}/></label>
          <label>ข้อความ<textarea name="prelanderMessage" defaultValue={settings.prelanderMessage}/></label>
          <button className="primary" type="submit"><Settings/>บันทึกการตั้งค่า</button>
        </form>
      </article>
      <aside className="admin-panel stats-panel"><span className="eyebrow">ภาพรวมระบบ</span><div className="stat-panel"><Users/><b>{participants.length}</b><span>ผู้เข้าร่วมงาน</span></div><div className="stat-panel"><Settings/><b>{submissions.length}</b><span>ผู้สมัครประกวด</span></div><div className="stat-panel"><Trophy/><b>{winners.length}</b><span>ผู้ชนะที่บันทึก</span></div></aside>
    </section>
    <section className="admin-panel">
      <header><Trophy/><div><h2>ประกาศผลการแข่งขัน</h2><p>ใช้ “ผ่านเข้ารอบที่ 2” สำหรับรอบคัดเลือก และใช้รางวัลที่ 1-3/ชมเชย สำหรับรอบประกาศผลรางวัล</p></div></header>
      <form action={addWinnerAction} className="admin-form winner-form">
        <label>ประเภทรางวัล<select name="rank" defaultValue="honorable">{Object.entries(awardLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>ชื่อผลงาน<input name="projectTitle" placeholder="เช่น ระบบตรวจการณ์อัจฉริยะ" required/></label>
        <label>เจ้าของผลงาน / ทีม<input name="ownerName" placeholder="ชื่อผู้สมัครหรือชื่อทีม" required/></label>
        <label>หน่วยงาน<input name="division" placeholder="เช่น บก.สสท." required/></label>
        <label className="inline-check"><input type="checkbox" name="published" defaultChecked/> เผยแพร่</label>
        <button className="primary" type="submit">เพิ่มผู้ชนะ</button>
      </form>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>รอบ / รางวัล</th><th>ผลงาน</th><th>เจ้าของ</th><th>หน่วยงาน</th><th>สถานะ</th><th></th></tr></thead><tbody>{winners.map(winner=><tr key={winner.id}><td>{formatAward(winner.rank)}</td><td>{winner.projectTitle}</td><td>{winner.ownerName}</td><td>{winner.division}</td><td>{winner.published?"เผยแพร่":"ฉบับร่าง"}</td><td><form action={deleteWinnerAction}><input type="hidden" name="id" value={winner.id}/><button className="danger-btn" type="submit">ลบ</button></form></td></tr>)}</tbody></table></div>
    </section>
    <section className="admin-panel">
      <header className="admin-section-head"><Users/><div><h2>ผู้เข้าร่วมงาน</h2><p>แก้ไขข้อมูล ลบรายการ ค้นหา ดาวน์โหลดรายชื่อ และตรวจสถานะเช็คอินหน้างาน</p></div><div className="admin-actions"><Link className="secondary" href="/admin/scan"><QrCode/>สแกน QR เช็คอิน</Link><a className="primary" href="/api/admin/participants/export"><Download/>ดาวน์โหลดข้อมูลผู้เข้าร่วมงาน (PDF)</a></div></header>
      <SearchBox name="participantSearch" value={participantSearch} label="ค้นหาผู้เข้าร่วมงาน" placeholder="ชื่อ อีเมล เบอร์โทร เลขบัตร หรือรหัส REG"/>
      <ParticipantsTable participants={filteredParticipants}/>
    </section>
    <section className="admin-panel">
      <header><Settings/><div><h2>ผู้สมัครประกวดนวัตกรรม</h2><p>ดูรายละเอียดใบสมัคร ข้อมูลที่กรอก เอกสารแนบ และค้นหารายการผลงาน</p></div></header>
      <SearchBox name="submissionSearch" value={submissionSearch} label="ค้นหาใบสมัครประกวด" placeholder="ชื่อผลงาน ชื่อผู้สมัคร ทีม อีเมล หรือรหัส SUB"/>
      <SubmissionsTable submissions={filteredSubmissions}/>
    </section>
  </AdminShell>;
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="admin-page"><div className="wide">{children}</div></div>;
}

function LoginPanel({ passwordConfigured }: { passwordConfigured: boolean }) {
  return <section className="admin-login"><span className="eyebrow">Admin Console</span><h1>เข้าสู่ระบบหลังบ้าน</h1><p>{passwordConfigured ? "กรอกรหัสผ่านผู้ดูแลระบบเพื่อจัดการข้อมูลโครงการ" : "ยังไม่ได้ตั้งค่า ADMIN_PASSWORD ใน .env.local"}</p><form action={loginAction}><input type="password" name="password" placeholder="Admin password" required/><button className="primary" type="submit">เข้าสู่ระบบ</button></form></section>;
}

function AdminTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{headers.map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length?rows.map((row,index)=><tr key={index}>{row.map((cell,cellIndex)=><td key={cellIndex}>{cell || "-"}</td>)}</tr>):<tr><td colSpan={headers.length}>ยังไม่มีข้อมูล</td></tr>}</tbody></table></div>;
}

function SearchBox({ name, value, label, placeholder }: { name: string; value: string; label: string; placeholder: string }) {
  return <form className="admin-search" action="/admin">
    <label>{label}<div><Search/><input name={name} defaultValue={value} placeholder={placeholder}/><button className="secondary" type="submit">ค้นหา</button>{value && <Link className="ghost-action" href="/admin">ล้าง</Link>}</div></label>
  </form>;
}

function ParticipantsTable({ participants }: { participants: Awaited<ReturnType<typeof listParticipants>> }) {
  const statuses = [
    ["registered", "ลงทะเบียนแล้ว"],
    ["attended", "เข้าร่วมงานแล้ว"],
    ["cancelled", "ยกเลิก"],
  ];
  if (!participants.length) return <div className="participant-empty">ยังไม่มีข้อมูลผู้เข้าร่วมงาน</div>;
  return <div className="participant-card-list">{participants.map(item => {
    const formId = `participant-${item.registration_code}`;
    return <article className="participant-card" key={item.registration_code}>
      <div className="participant-card-meta">
        <span className={`status-pill ${item.status}`}>{statuses.find(([value]) => value === item.status)?.[1] ?? item.status}</span>
        <b>{item.registration_code}</b>
        <small>ลงทะเบียน {formatAdminDate(item.registered_at)}</small>
        {item.checked_in_at && <small>เช็คอิน {formatAdminDate(item.checked_in_at)}</small>}
      </div>
      <form id={formId} action={updateParticipantAction} className="participant-card-form">
        <input type="hidden" name="registrationCode" value={item.registration_code}/>
        <input type="hidden" name="provider" value={item.provider ?? "local"}/>
        <label className="field-title">คำนำหน้า<input name="title" defaultValue={item.title} required/></label>
        <label className="field-name">ชื่อ<input name="firstName" defaultValue={item.first_name} required/></label>
        <label className="field-name">นามสกุล<input name="lastName" defaultValue={item.last_name} required/></label>
        <label className="field-wide">เลขบัตรประชาชน<input name="citizenId" defaultValue={item.citizen_id} inputMode="numeric" pattern="\d{13}" maxLength={13} required/></label>
        <label className="field-wide">ตำแหน่ง<input name="position" defaultValue={item.position} required/></label>
        <label className="field-wide">อีเมล<input type="email" name="email" defaultValue={item.email} required/></label>
        <label>เบอร์ติดต่อ<input name="phone" defaultValue={item.phone} inputMode="numeric" pattern="0[689]\d{8}" maxLength={10} required/></label>
        <label className="field-wide">สังกัด<input name="division" defaultValue={item.division} required/></label>
        <label className="field-wide">หน่วยงาน<input name="bureau" defaultValue={item.bureau} required/></label>
        <label>สถานะ<select name="status" defaultValue={item.status}>{statuses.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      </form>
      <div className="participant-card-actions">
        <button className="primary small-action" form={formId} type="submit">บันทึก</button>
        <Link className="secondary small-action" href={`/admin/participants/${encodeURIComponent(item.registration_code)}`}><Eye/>ดูข้อมูล</Link>
        <form action={deleteParticipantAction}><input type="hidden" name="registrationCode" value={item.registration_code}/><button className="danger-btn" type="submit">ลบ</button></form>
      </div>
    </article>;
  })}</div>;
}

function SubmissionsTable({ submissions }: { submissions: Awaited<ReturnType<typeof listSubmissions>> }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>รหัส</th><th>ผลงาน</th><th>ประเภท</th><th>ผู้สมัคร</th><th>ตำแหน่ง</th><th>กองบังคับการ</th><th>กองบัญชาการ</th><th>สถานะ</th><th></th></tr></thead><tbody>{submissions.length?submissions.map(item=><tr key={item.submission_code}><td><b>{item.submission_code}</b><small>{formatAdminDate(item.submitted_at)}</small></td><td>{item.title_th}</td><td>{item.submission_type === "team" ? `ทีม ${item.team_name ?? ""}` : "เดี่ยว"}</td><td>{item.first_name} {item.last_name}<small>{item.email}</small></td><td>{item.position}</td><td>{item.division}</td><td>{item.bureau}</td><td>{item.status}</td><td><Link className="secondary small-action" href={`/admin/submissions/${encodeURIComponent(item.submission_code)}`}><Eye/>ดูข้อมูล</Link></td></tr>):<tr><td colSpan={9}>ยังไม่มีข้อมูล</td></tr>}</tbody></table></div>;
}

async function loginAction(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  if (!adminPassword() || password !== adminPassword()) redirect("/admin?error=1");
  const cookieStore = await cookies();
  cookieStore.set(cookieName, adminToken(), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
  redirect("/admin");
}

async function logoutAction() {
  "use server";
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
  redirect("/admin");
}

async function saveSettingsAction(formData: FormData) {
  "use server";
  await requireAdmin();
  await saveAdminSettings({
    prelanderEnabled: formData.get("prelanderEnabled") === "on",
    eventRegistrationEnabled: formData.get("eventRegistrationEnabled") === "on",
    contestSubmissionEnabled: formData.get("contestSubmissionEnabled") === "on",
    openAt: String(formData.get("openAt") ?? ""),
    closeAt: String(formData.get("closeAt") ?? ""),
    prelanderTitle: String(formData.get("prelanderTitle") ?? ""),
    prelanderMessage: String(formData.get("prelanderMessage") ?? ""),
  });
  revalidatePath("/");
  revalidatePath("/register");
  revalidatePath("/register/form");
  revalidatePath("/submit");
  revalidatePath("/admin");
}

async function addWinnerAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const rank = String(formData.get("rank") ?? "honorable").trim();
  await addWinner({
    rank,
    award: formatAward(rank),
    projectTitle: String(formData.get("projectTitle") ?? "").trim(),
    ownerName: String(formData.get("ownerName") ?? "").trim(),
    division: String(formData.get("division") ?? "").trim(),
    published: formData.get("published") === "on",
  });
  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}

async function deleteWinnerAction(formData: FormData) {
  "use server";
  await requireAdmin();
  await deleteWinner(String(formData.get("id") ?? ""));
  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}

async function updateParticipantAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const citizenId = String(formData.get("citizenId") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const status = String(formData.get("status") ?? "registered").trim();
  if (!/^\d{13}$/.test(citizenId) || !isThaiCitizenId(citizenId)) throw new Error("หมายเลขบัตรประชาชนไม่ถูกต้อง");
  if (!/^0[689]\d{8}$/.test(phone)) throw new Error("เบอร์ติดต่อไม่ถูกต้อง");
  if (!["registered", "attended", "cancelled"].includes(status)) throw new Error("สถานะไม่ถูกต้อง");
  await updateParticipant({
    registrationCode: String(formData.get("registrationCode") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    provider: String(formData.get("provider") ?? "local") as "google" | "microsoft" | "local",
    title: String(formData.get("title") ?? "").trim(),
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    citizenId,
    phone,
    position: String(formData.get("position") ?? "").trim(),
    division: String(formData.get("division") ?? "").trim(),
    bureau: String(formData.get("bureau") ?? "").trim(),
    status: status as "registered" | "attended" | "cancelled",
  });
  revalidatePath("/admin");
}

async function deleteParticipantAction(formData: FormData) {
  "use server";
  await requireAdmin();
  await deleteParticipant(String(formData.get("registrationCode") ?? ""));
  revalidatePath("/admin");
}

async function requireAdmin() {
  const cookieStore = await cookies();
  if (!verifyAdminToken(cookieStore.get(cookieName)?.value)) redirect("/admin");
}

function filterRecords<T>(records: T[], query: string, pickFields: (record: T) => Array<string | null | undefined>) {
  const needle = normalizeSearch(query);
  if (!needle) return records;
  return records.filter((record) => pickFields(record).some((value) => normalizeSearch(value ?? "").includes(needle)));
}

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function toInputDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function formatAward(rank: string) {
  return awardLabels[rank] ?? awardLabels.honorable;
}

function formatAdminDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}
