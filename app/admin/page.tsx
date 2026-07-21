import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { CalendarClock, ClipboardList, Download, Eye, FileSpreadsheet, Gift, Image as ImageIcon, LogOut, Mail, Megaphone, Newspaper, Printer, QrCode, Search, Settings, ShieldCheck, Star, Trash2, Trophy, UserCheck, UserPlus, Users } from "lucide-react";
import { AdminNotice } from "../../components/AdminNotice";
import { ConfirmSubmitButton } from "../../components/ConfirmSubmitButton";
import {
  adminClientKey,
  adminCookieSecure,
  createAdminSessionToken,
  adminSessionMaxAgeSeconds,
  clearAdminLoginFailures,
  cookieName,
  genericAdminLoginError,
  getAdminSession,
  getAdminLoginStatus,
  recordAdminLoginFailure,
  requestSuperAdminOtp,
  slowFailedAdminLogin,
  verifySuperAdminOtp,
  type AdminSession,
} from "../../lib/admin-auth";
import {
  createAdminAccount,
  createAdminPasswordLink,
  listAdminAccounts,
  verifyAdminAccountPassword,
} from "../../lib/admin-users";
import { actorFromAdminSession, listAuditEvents, recordAuditEvent, type AuditEventRecord } from "../../lib/audit-log";
import { adminNoticePath } from "../../lib/admin-flash";
import {
  addWinner,
  addNews,
  assignSubmissionReviewer,
  deleteWinner,
  deleteNews,
  getAdminSettings,
  listNews,
  listParticipants,
  listSubmissions,
  listWinners,
  saveAdminSettings,
} from "../../lib/admin-store";
import { getEvaluationSummary, type EvaluationSummary } from "../../lib/evaluation-store";

export const dynamic = "force-dynamic";

const awardLabels: Record<string, string> = {
  finalist: "ผ่านเข้ารอบที่ 2",
  "1": "รางวัลที่ 1",
  "2": "รางวัลที่ 2",
  "3": "รางวัลที่ 3",
  honorable: "รางวัลชมเชย",
};

type ParticipantSort = "newest" | "oldest";
const dashboardLimit = 10;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ login?: string; notice?: string; participantSearch?: string; participantSort?: string; submissionSearch?: string; adminSearch?: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  const params = await searchParams;

  if (!session) {
    return <AdminShell><LoginPanel message={genericAdminLoginError(params.login)} /></AdminShell>;
  }

  const { settings, participants, submissions, winners, news, adminAccounts, auditEvents, evaluationSummary } = await loadAdminPageData(session);
  const isSuperAdmin = session.role === "super_admin";
  const participantSearch = (params.participantSearch ?? "").trim();
  const participantSort: ParticipantSort = params.participantSort === "oldest" ? "oldest" : "newest";
  const submissionSearch = (params.submissionSearch ?? "").trim();
  const adminSearch = (params.adminSearch ?? "").trim();
  const filteredParticipantsAll = sortParticipants(filterRecords(participants, participantSearch, (item) => [
    item.registration_code,
    item.email,
    item.citizen_id,
    item.phone,
    item.title,
    item.first_name,
    item.last_name,
    item.participant_role,
    item.position,
    item.division,
    item.bureau,
    item.status,
  ]), participantSort);
  const filteredSubmissionsAll = filterRecords(submissions, submissionSearch, (item) => [
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
  const filteredAdminAccounts = filterRecords(adminAccounts, adminSearch, (item) => [
    item.email,
    item.name,
    item.disabled ? "ปิดใช้งาน disabled" : "ใช้งาน active",
    item.passwordHash ? "ตั้งรหัสผ่านแล้ว password set" : "รอตั้งรหัสผ่าน pending",
  ]);
  const filteredParticipants = filteredParticipantsAll.slice(0, dashboardLimit);
  const filteredSubmissions = filteredSubmissionsAll.slice(0, dashboardLimit);
  const attendedParticipants = participants.filter((item) => item.status === "attended");
  const activeRegistrations = participants.filter((item) => item.status !== "cancelled");
  const waitingCheckInCount = activeRegistrations.length - attendedParticipants.length;
  const visibleNews = news.slice(0, dashboardLimit);
  const visibleAdmins = filteredAdminAccounts.slice(0, dashboardLimit);
  const scoreBoard = submissions
    .filter((item) => item.review_total_score !== null && item.review_total_score !== undefined)
    .sort((a, b) => Number(b.review_total_score ?? 0) - Number(a.review_total_score ?? 0) || a.submitted_at.localeCompare(b.submitted_at));

  return <AdminShell>
    <div className="admin-topline"><div><span className="eyebrow">Admin Console</span><h1>ระบบหลังบ้าน</h1><p>{isSuperAdmin ? "Super Admin สามารถจัดการทุกส่วนของระบบ รวมถึง Pre-lander ประกาศผล และบัญชีแอดมิน" : "Admin สามารถจัดการข้อมูลระบบได้ ยกเว้นการตั้งค่า Pre-lander และประกาศผลการแข่งขัน"}</p><small className="admin-role-badge"><ShieldCheck/>{isSuperAdmin ? "Super Admin" : "Admin"} • {session.email}</small></div><form action={logoutAction}><button className="secondary" type="submit"><LogOut/>ออกจากระบบ</button></form></div>
    <AdminNotice code={params.notice}/>
    {isSuperAdmin && <SettingsControlPanel settings={settings}/>}
    <ReviewQueuePanel submissions={filteredSubmissions} total={filteredSubmissionsAll.length} allSubmissions={submissions} search={submissionSearch} isSuperAdmin={isSuperAdmin}/>
    {isSuperAdmin && <SystemOverview registrations={activeRegistrations.length} attended={attendedParticipants.length} waiting={waitingCheckInCount} submissions={submissions.length}/>}
    <EvaluationAdminPanel summary={evaluationSummary} evaluationEnabled={settings.satisfactionEvaluationEnabled}/>
    {isSuperAdmin && <AdminManagementPanel admins={visibleAdmins} search={adminSearch} total={filteredAdminAccounts.length}/>}
    {isSuperAdmin && <AuditLogPanel events={auditEvents.events} total={auditEvents.total}/>}
    {isSuperAdmin && <section className="admin-panel">
      <header><Newspaper/><div><h2>ข่าวประชาสัมพันธ์</h2><p>เพิ่มภาพ ข้อความสรุป เนื้อหา และกำหนดวันที่ต้องการให้ข่าวปรากฏบนหน้าบ้าน</p></div></header>
      <form action={addNewsAction} className="admin-form news-form">
        <label className="field-wide">ภาพข่าว<input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" required/></label>
        <label>วันที่ต้องการโพสต์<input type="datetime-local" name="publishAt" defaultValue={toInputDate(new Date().toISOString())} required/></label>
        <label className="field-wide">หัวข้อข่าว<input name="title" placeholder="เช่น เปิดรับสมัครผลงานนวัตกรรมตำรวจ ประจำปี 2569" required maxLength={255}/></label>
        <label className="field-wide">ข้อความสรุป<input name="excerpt" placeholder="ข้อความสั้นสำหรับแสดงบนการ์ดข่าว" required maxLength={500}/></label>
        <label className="field-wide">เนื้อหา<textarea name="body" placeholder="รายละเอียดข่าวประชาสัมพันธ์" required rows={5}/></label>
        <label className="inline-check"><input type="checkbox" name="published" defaultChecked/> เผยแพร่เมื่อถึงวันที่กำหนด</label>
        <button className="primary" type="submit"><Megaphone/>เพิ่มข่าวประชาสัมพันธ์</button>
      </form>
      <NewsTable news={visibleNews} total={news.length}/>
    </section>}
    {!isSuperAdmin && <section className="admin-panel admin-notice-panel"><header><Newspaper/><div><h2>ข่าวประชาสัมพันธ์</h2><p>การเพิ่ม/ลบข่าวประชาสัมพันธ์ถูกจำกัดให้ Super Admin เท่านั้น</p></div></header></section>}
    {isSuperAdmin && <ReviewAssignmentPanel submissions={submissions.slice(0, dashboardLimit)} admins={adminAccounts.filter((admin) => !admin.disabled)} total={submissions.length}/>}
    {isSuperAdmin && <ScoreBoardPanel submissions={scoreBoard.slice(0, dashboardLimit)} total={scoreBoard.length}/>}
    {isSuperAdmin && <section className="admin-panel">
      <header><Trophy/><div><h2>ประกาศผลการแข่งขัน</h2><p>ใช้ “ผ่านเข้ารอบที่ 2” สำหรับรอบคัดเลือก และใช้รางวัลที่ 1-3/ชมเชย สำหรับรอบประกาศผลรางวัล</p></div></header>
      <form action={addWinnerAction} className="admin-form winner-form">
        <label>ประเภทรางวัล<select name="rank" defaultValue="honorable">{Object.entries(awardLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>ชื่อผลงาน<input name="projectTitle" placeholder="เช่น ระบบตรวจการณ์อัจฉริยะ" required/></label>
        <label>เจ้าของผลงาน / ทีม<input name="ownerName" placeholder="ชื่อผู้สมัครหรือชื่อทีม" required/></label>
        <label>หน่วยงาน<input name="division" placeholder="เช่น บก.สสท." required/></label>
        <label className="inline-check"><input type="checkbox" name="published" defaultChecked/> เผยแพร่</label>
        <button className="primary" type="submit">เพิ่มผู้ชนะ</button>
      </form>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>รอบ / รางวัล</th><th>ผลงาน</th><th>เจ้าของ</th><th>หน่วยงาน</th><th>สถานะ</th><th></th></tr></thead><tbody>{winners.map(winner=><tr key={winner.id}><td>{formatAward(winner.rank)}</td><td>{winner.projectTitle}</td><td>{winner.ownerName}</td><td>{winner.division}</td><td>{winner.published?"เผยแพร่":"ฉบับร่าง"}</td><td><form action={deleteWinnerAction}><input type="hidden" name="id" value={winner.id}/><ConfirmSubmitButton className="danger-btn" type="submit" message="ยืนยันลบประกาศผลการแข่งขันรายการนี้?">ลบ</ConfirmSubmitButton></form></td></tr>)}</tbody></table></div>
    </section>}
    <section className="admin-panel">
      <header className="admin-section-head"><Users/><div><h2>ผู้เข้าร่วมงาน</h2><p>แก้ไขข้อมูล ลบรายการ ค้นหา ดาวน์โหลดรายชื่อ และตรวจสถานะเช็คอินหน้างาน</p></div><div className="admin-actions"><Link className="secondary" href="/admin/scan"><QrCode/>สแกน QR เช็คอิน</Link><a className="secondary" href="/api/admin/participants/export"><Download/>Export PDF</a><a className="primary" href="/api/admin/participants/export/xlsx"><FileSpreadsheet/>Export Excel</a></div></header>
      <ParticipantFilterBar search={participantSearch} sort={participantSort}/>
      <ParticipantsTable participants={filteredParticipants}/>
      <CardMore total={filteredParticipantsAll.length} shown={filteredParticipants.length} href="/admin/participants"/>
    </section>
  </AdminShell>;
}

const fallbackAdminSettings: Awaited<ReturnType<typeof getAdminSettings>> = {
  prelanderEnabled: false,
  eventRegistrationEnabled: true,
  contestSubmissionEnabled: true,
  satisfactionEvaluationEnabled: false,
  showSiteStats: true,
  openAt: "",
  closeAt: "",
  prelanderTitle: "Police Innovation Contest 2026",
  prelanderMessage: "ระบบจะเปิดให้ใช้งานตามเวลาที่กำหนด โปรดกลับมาใหม่อีกครั้ง",
};

const emptyAuditEvents: Awaited<ReturnType<typeof listAuditEvents>> = {
  events: [],
  total: 0,
  limit: 10,
  offset: 0,
};

const emptyEvaluationSummary: EvaluationSummary = {
  total: 0,
  average: 0,
  sections: [],
  questions: [],
  profiles: {
    gender: [],
    ageRange: [],
    organizationType: [],
    attendeeStatus: [],
  },
  comments: [],
  winners: [],
};

async function loadAdminPageData(session: AdminSession) {
  const isSuperAdmin = session.role === "super_admin";
  const [settings, participants, submissions, winners, news, adminAccounts, auditEvents] = await Promise.all([
    withAdminFallback("settings", getAdminSettings(), fallbackAdminSettings),
    withAdminFallback("participants", listParticipants(), []),
    withAdminFallback("submissions", listSubmissions({ assignedAdminEmail: isSuperAdmin ? null : session.email }), []),
    withAdminFallback("winners", listWinners(), []),
    withAdminFallback("news", listNews(), []),
    isSuperAdmin ? withAdminFallback("admin accounts", listAdminAccounts(), []) : Promise.resolve([]),
    isSuperAdmin ? withAdminFallback("audit events", listAuditEvents({ limit: 10 }), emptyAuditEvents) : Promise.resolve(emptyAuditEvents),
  ]);
  const evaluationSummary = await withAdminFallback("evaluation summary", getEvaluationSummary(), emptyEvaluationSummary);
  return { settings, participants, submissions, winners, news, adminAccounts, auditEvents, evaluationSummary };
}

async function withAdminFallback<T>(label: string, promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch (error) {
    console.error(`admin ${label} failed`, error);
    return fallback;
  }
}

function AuditLogPanel({ events, total }: { events: AuditEventRecord[]; total: number }) {
  return <section className="admin-panel">
    <header className="admin-section-head"><ClipboardList/><div><h2>Audit Log</h2><p>แสดงเฉพาะ 10 รายการล่าสุดของการสร้าง แก้ไข ลบ หรือเปลี่ยนสถานะข้อมูล ย้อนหลังสูงสุด 90 วัน</p></div><div className="admin-actions"><Link className="secondary" href="/admin/audit-log"><Eye/>ดูทั้งหมด</Link></div></header>
    <form className="audit-quick-search" action="/admin/audit-log" method="get">
      <label>ค้นหา Audit Log
        <div><Search/><input name="q" placeholder="ค้นอีเมล รหัส REG/SUB หรือข้อความใน log"/><button className="secondary" type="submit">ค้นหา</button></div>
      </label>
    </form>
    <div className="audit-log-list">{events.length ? events.map((event) => <article className="audit-log-row" key={event.id}>
      <time>{formatAdminDate(event.createdAt)}</time>
      <div>
        <b>{event.summary}</b>
        <small>{auditActionLabel(event.action)} • {event.entityType}{event.entityId ? ` • ${event.entityId}` : ""}</small>
      </div>
      <span>{actorLabel(event.actor)}</span>
      <small>{auditEntityLabel(event.entityType)}</small>
    </article>) : <div className="participant-empty">ยังไม่มี log การเปลี่ยนแปลงข้อมูลใน 90 วันที่ผ่านมา</div>}</div>
    {total > events.length && <p className="audit-log-more">มีทั้งหมด {total.toLocaleString("th-TH")} รายการ กด “ดูทั้งหมด” เพื่อเปิดหน้ารายการย้อนหลังแบบแบ่งหน้า</p>}
  </section>;
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="admin-page"><div className="wide">{children}</div></div>;
}

function SystemOverview({
  registrations,
  attended,
  waiting,
  submissions,
}: {
  registrations: number;
  attended: number;
  waiting: number;
  submissions: number;
}) {
  return <aside className="admin-panel stats-panel system-overview">
    <span className="eyebrow">ภาพรวมระบบ</span>
    <div className="stat-panel"><Users/><b>{registrations.toLocaleString("th-TH")}</b><span>ลงทะเบียนเข้าร่วมงาน</span></div>
    <div className="stat-panel"><UserCheck/><b>{attended.toLocaleString("th-TH")}</b><span>เช็คอินเข้าร่วมงานแล้ว</span></div>
    <div className="stat-panel"><QrCode/><b>{waiting.toLocaleString("th-TH")}</b><span>ลงทะเบียนแล้ว รอเช็คอิน</span></div>
    <div className="stat-panel"><Settings/><b>{submissions.toLocaleString("th-TH")}</b><span>สมัครประกวดนวัตกรรม</span></div>
  </aside>;
}

function SettingsControlPanel({ settings }: { settings: Awaited<ReturnType<typeof getAdminSettings>> }) {
  return <article className="admin-panel settings-panel admin-control-panel">
    <header className="admin-section-head"><CalendarClock/><div><span className="eyebrow">System Control</span><h2>จัดการเปิด / ปิดระบบ</h2><p>ควบคุม Pre-lander การลงทะเบียน สมัครประกวด แบบประเมิน และสถิติหน้าเว็บ</p></div></header>
    <form action={saveSettingsAction} className="admin-form">
      <div className="settings-toggle-grid">
        <label className="settings-toggle">
          <input type="checkbox" name="prelanderEnabled" defaultChecked={settings.prelanderEnabled}/>
          <span><b>เปิดใช้งาน pre-lander</b><small>แสดงหน้าเตรียมเปิดระบบตามช่วงเวลาที่กำหนด</small></span>
        </label>
        <label className="settings-toggle">
          <input type="checkbox" name="eventRegistrationEnabled" defaultChecked={settings.eventRegistrationEnabled}/>
          <span><b>เปิดลงทะเบียนเข้าร่วมงาน</b><small>ผู้เข้าร่วมงานสามารถกรอกข้อมูลและรับ QR Code</small></span>
        </label>
        <label className="settings-toggle">
          <input type="checkbox" name="contestSubmissionEnabled" defaultChecked={settings.contestSubmissionEnabled}/>
          <span><b>เปิดรับสมัครประกวดนวัตกรรม</b><small>ผู้สมัครสามารถส่งข้อมูลผลงานและไฟล์แนบ</small></span>
        </label>
        <label className="settings-toggle">
          <input type="checkbox" name="satisfactionEvaluationEnabled" defaultChecked={settings.satisfactionEvaluationEnabled}/>
          <span><b>เปิดแบบประเมินความพึงพอใจ</b><small>เฉพาะผู้เข้าร่วมงานที่เช็คอินแล้วจึงจะเห็นปุ่มทำแบบประเมิน</small></span>
        </label>
        <label className="settings-toggle">
          <input type="checkbox" name="showSiteStats" defaultChecked={settings.showSiteStats}/>
          <span><b>แสดงสถิติการเข้าเว็บ</b><small>แสดงยอดเข้าชมทั้งหมดและรายวันใน footer หน้าเว็บ</small></span>
        </label>
      </div>
      <div className="form-grid compact-grid"><label>เปิดระบบเมื่อ<input type="datetime-local" name="openAt" defaultValue={toInputDate(settings.openAt)}/></label><label>ปิดระบบเมื่อ<input type="datetime-local" name="closeAt" defaultValue={toInputDate(settings.closeAt)}/></label></div>
      <label>หัวข้อ<input name="prelanderTitle" defaultValue={settings.prelanderTitle}/></label>
      <label>ข้อความ<textarea name="prelanderMessage" defaultValue={settings.prelanderMessage}/></label>
      <button className="primary" type="submit"><Settings/>บันทึกการตั้งค่า</button>
    </form>
  </article>;
}

function ReviewQueuePanel({
  submissions,
  total,
  allSubmissions,
  search,
  isSuperAdmin,
}: {
  submissions: Awaited<ReturnType<typeof listSubmissions>>;
  total: number;
  allSubmissions: Awaited<ReturnType<typeof listSubmissions>>;
  search: string;
  isSuperAdmin: boolean;
}) {
  const pendingReview = allSubmissions.filter((item) => !item.review_submitted_at).length;
  const completedReview = allSubmissions.filter((item) => item.review_submitted_at).length;
  const assignedCount = allSubmissions.filter((item) => item.review_assigned_admin_email).length;
  const assignmentLabel = isSuperAdmin ? "assign ผู้ตรวจแล้ว" : "assign ให้คุณแล้ว";
  const description = isSuperAdmin
    ? "ตรวจสถานะใบสมัคร Assign ผู้ตรวจ และเปิดรายละเอียดผลงานจากจุดนี้ได้ทันที"
    : "รายการที่ได้รับมอบหมายให้ตรวจรอบแรกอยู่ตรงนี้ เปิดตรวจได้ทันที";

  return <section className="admin-panel review-focus-panel">
    <header className="admin-section-head review-focus-head">
      <ClipboardList/>
      <div><span className="eyebrow">Review Queue</span><h2>ใบสมัครประกวดที่ต้องตรวจ</h2><p>{description}</p></div>
      <div className="admin-actions"><Link className="primary" href="/admin/submissions"><Eye/>เปิดรายการทั้งหมด</Link></div>
    </header>
    <div className="review-focus-summary">
      <div className="stat-panel review-stat urgent"><ClipboardList/><b>{pendingReview.toLocaleString("th-TH")}</b><span>รายการรอตรวจ</span></div>
      <div className="stat-panel review-stat"><Trophy/><b>{completedReview.toLocaleString("th-TH")}</b><span>ส่งคะแนนแล้ว</span></div>
      <div className="stat-panel review-stat"><UserCheck/><b>{assignedCount.toLocaleString("th-TH")}</b><span>{assignmentLabel}</span></div>
      <div className="stat-panel review-stat"><Settings/><b>{allSubmissions.length.toLocaleString("th-TH")}</b><span>ใบสมัครในคิวนี้</span></div>
    </div>
    <SearchBox name="submissionSearch" value={search} label="ค้นหาใบสมัครประกวด" placeholder="ชื่อผลงาน ชื่อผู้สมัคร ทีม อีเมล หรือรหัส SUB"/>
    <ReviewQueueTable submissions={submissions}/>
    <CardMore total={total} shown={submissions.length} href="/admin/submissions"/>
  </section>;
}

function LoginPanel({ message }: { message: string }) {
  return <section className="admin-login"><span className="eyebrow">Admin Console</span><h1>เข้าสู่ระบบหลังบ้าน</h1><p>Super Admin ใช้รหัส OTP ทางอีเมล ส่วน Admin ใช้อีเมลและรหัสผ่านที่ได้รับจากลิงก์เชิญ</p>{message && <div className="admin-login-alert">{message}</div>}
    <div className="admin-login-grid">
      <form action={requestOtpAction} className="admin-login-card">
        <h2><ShieldCheck/>Super Admin OTP</h2>
        <p>ระบบจะส่งรหัส 6 หลักไปยังอีเมล Super Admin ทั้ง 2 บัญชี และรหัสจะหมดอายุใน 5 นาที</p>
        <button className="primary" type="submit"><Mail/>ส่งรหัส OTP</button>
      </form>
      <form action={verifyOtpAction} className="admin-login-card">
        <h2>ยืนยัน OTP</h2>
        <input name="otp" inputMode="numeric" pattern="[0-9๐-๙ -]{6,20}" maxLength={20} placeholder="กรอกรหัส 6 หลัก" required autoComplete="one-time-code"/>
        <button className="primary" type="submit">ยืนยันและเข้าสู่ระบบ</button>
      </form>
      <form action={loginAction} className="admin-login-card">
        <h2><Users/>Admin</h2>
        <input type="email" name="email" placeholder="admin@example.com" required autoComplete="username"/>
        <input type="password" name="password" placeholder="รหัสผ่าน" required autoComplete="current-password"/>
        <button className="secondary" type="submit">เข้าสู่ระบบ Admin</button>
      </form>
    </div>
  </section>;
}

function AdminManagementPanel({ admins, search, total }: { admins: Awaited<ReturnType<typeof listAdminAccounts>>; search: string; total: number }) {
  return <section className="admin-panel">
    <header><UserPlus/><div><h2>จัดการแอดมิน</h2><p>ค้นหาแอดมิน ดูรายละเอียด แล้วเข้าไปแก้ไขข้อมูล ส่งลิงก์รีเซ็ต หรือลบรายการในหน้ารายละเอียด</p></div></header>
    <form action={addAdminAction} className="admin-form admin-user-form">
      <label>ชื่อแอดมิน<input name="name" placeholder="เช่น ฝ่ายประสานงาน" maxLength={120}/></label>
      <label>อีเมล<input type="email" name="email" placeholder="admin@example.com" required/></label>
      <button className="primary" type="submit"><Mail/>เพิ่มและส่งลิงก์ตั้งรหัสผ่าน</button>
    </form>
    <SearchBox name="adminSearch" value={search} label="ค้นหาแอดมิน" placeholder="ชื่อ อีเมล สถานะ หรือรหัสผ่าน"/>
    <AdminAccountsTable admins={admins}/>
    <CardMore total={total} shown={admins.length} href="/admin/admins"/>
  </section>;
}

function EvaluationAdminPanel({ summary, evaluationEnabled }: { summary: EvaluationSummary; evaluationEnabled: boolean }) {
  return <section className="admin-panel evaluation-admin-panel">
    <header className="admin-section-head">
      <Star/>
      <div><h2>แบบประเมินความพึงพอใจ</h2><p>สรุปภาพรวมแบบย่อ ดูคะแนนรายข้อ คำตอบ และ Lucky Draw ได้ในหน้ารายละเอียด</p></div>
      <div className="admin-actions">
        <span className={`status-pill ${evaluationEnabled ? "attended" : "registered"}`}>{evaluationEnabled ? "เปิดให้ประเมิน" : "ยังไม่เปิด"}</span>
        <Link className="primary" href="/admin/evaluations"><Eye/>ดูสรุปคะแนน</Link>
      </div>
    </header>
    <div className="evaluation-dashboard-summary">
      <div className="stat-panel"><Star/><b>{summary.total.toLocaleString("th-TH")}</b><span>ผู้ทำแบบประเมิน</span></div>
      <div className="stat-panel"><Trophy/><b>{summary.average ? summary.average.toFixed(2) : "-"}</b><span>คะแนนเฉลี่ยรวม / 5</span></div>
      <div className="stat-panel"><Gift/><b>{summary.winners.length.toLocaleString("th-TH")}/3</b><span>ผู้โชคดี Lucky Draw</span></div>
    </div>
    <div className="evaluation-dashboard-section">
      {summary.sections.length ? summary.sections.map((section) => <article key={section.key}>
        <span>{section.title}</span>
        <b>{section.average ? section.average.toFixed(2) : "-"}/5</b>
      </article>) : <div className="participant-empty">ยังไม่มีผลประเมิน</div>}
    </div>
  </section>;
}

function ReviewAssignmentPanel({ submissions, admins, total }: { submissions: Awaited<ReturnType<typeof listSubmissions>>; admins: Awaited<ReturnType<typeof listAdminAccounts>>; total: number }) {
  return <section className="admin-panel">
    <header className="admin-section-head"><UserCheck/><div><h2>แจกงานตรวจรอบแรก</h2><p>Super Admin เลือก Admin ผู้รับผิดชอบตรวจ Paper Screening ในแต่ละใบสมัคร</p></div><div className="admin-actions"><Link className="secondary" href="/admin/submissions"><Eye/>ดูทั้งหมด</Link></div></header>
    <div className="assignment-list">
      {submissions.length ? submissions.map((submission) => <form className="assignment-row" action={assignSubmissionAction} key={submission.submission_code}>
        <input type="hidden" name="submissionCode" value={submission.submission_code}/>
        <div className="assignment-copy">
          <b>{submission.submission_code}</b>
          <span>{submission.title_th}</span>
          <small>{submission.first_name} {submission.last_name} • {submission.review_total_score ?? "-"} คะแนน</small>
          <em className={`status-pill ${submission.review_assigned_admin_email ? "registered" : "cancelled"}`}>{submission.review_assigned_admin_email || "ยังไม่ assign"}</em>
        </div>
        <div className="assignment-controls">
          <label>ผู้ตรวจ<select name="adminEmail" defaultValue={submission.review_assigned_admin_email ?? ""}>
            <option value="">ยังไม่ assign</option>
            {admins.map((admin) => <option key={admin.id} value={admin.email}>{admin.name ? `${admin.name} • ${admin.email}` : admin.email}</option>)}
          </select></label>
          <button className="secondary" type="submit"><UserCheck/>บันทึก</button>
        </div>
      </form>) : <div className="participant-empty">ยังไม่มีใบสมัครประกวด</div>}
    </div>
    <CardMore total={total} shown={submissions.length} href="/admin/submissions"/>
  </section>;
}

function ScoreBoardPanel({ submissions, total }: { submissions: Awaited<ReturnType<typeof listSubmissions>>; total: number }) {
  return <section className="admin-panel">
    <header className="admin-section-head"><Trophy/><div><h2>Score Board รอบแรก</h2><p>จัดอันดับผู้สมัครจากคะแนน Paper Screening รวม 100 คะแนน</p></div><div className="admin-actions"><a className="primary" href="/api/admin/scoreboard" target="_blank" rel="noreferrer"><Printer/>พิมพ์ PDF</a><Link className="secondary" href="/admin/submissions"><Eye/>ดูทั้งหมด</Link></div></header>
    <div className="scoreboard-list">
      {submissions.length ? submissions.map((submission, index) => <article className="scoreboard-row" key={submission.submission_code}>
        <b>#{index + 1}</b>
        <div><strong>{submission.title_th}</strong><small>{submission.submission_code} • {submission.first_name} {submission.last_name}</small></div>
        <span>{submission.review_total_score}/100</span>
        <Link className="secondary small-action" href={`/admin/submissions/${encodeURIComponent(submission.submission_code)}`}><Eye/>ดูคะแนน</Link>
      </article>) : <div className="participant-empty">ยังไม่มีคะแนนที่ส่งเข้ามา</div>}
    </div>
    <CardMore total={total} shown={submissions.length} href="/admin/submissions"/>
  </section>;
}

function AdminAccountsTable({ admins }: { admins: Awaited<ReturnType<typeof listAdminAccounts>> }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>อีเมล</th><th>ชื่อ</th><th>สถานะ</th><th>รหัสผ่าน</th><th>อัปเดตล่าสุด</th><th></th></tr></thead><tbody>{admins.length ? admins.map((admin) => <tr key={admin.id}>
    <td><b>{admin.email}</b><small>สร้างเมื่อ {formatAdminDate(admin.createdAt)}</small></td>
    <td>{admin.name || "-"}</td>
    <td><span className={`status-pill ${admin.disabled ? "cancelled" : "attended"}`}>{admin.disabled ? "ปิดใช้งาน" : "ใช้งานได้"}</span></td>
    <td><span className={`status-pill ${admin.passwordHash ? "attended" : "registered"}`}>{admin.passwordHash ? "ตั้งรหัสผ่านแล้ว" : "รอตั้งรหัสผ่าน"}</span></td>
    <td>{formatAdminDate(admin.updatedAt)}</td>
    <td><Link className="secondary small-action" href={`/admin/admins/${encodeURIComponent(admin.id)}`}><Eye/>ดูข้อมูล</Link></td>
  </tr>) : <tr><td colSpan={6}>ยังไม่มีแอดมินหรือไม่พบผลการค้นหา</td></tr>}</tbody></table></div>;
}

function AdminTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{headers.map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length?rows.map((row,index)=><tr key={index}>{row.map((cell,cellIndex)=><td key={cellIndex}>{cell || "-"}</td>)}</tr>):<tr><td colSpan={headers.length}>ยังไม่มีข้อมูล</td></tr>}</tbody></table></div>;
}

function SearchBox({ name, value, label, placeholder }: { name: string; value: string; label: string; placeholder: string }) {
  return <form className="admin-search" action="/admin">
    <label>{label}<div><Search/><input name={name} defaultValue={value} placeholder={placeholder}/><button className="secondary" type="submit">ค้นหา</button>{value && <Link className="ghost-action" href="/admin">ล้าง</Link>}</div></label>
  </form>;
}

function ParticipantFilterBar({ search, sort }: { search: string; sort: ParticipantSort }) {
  return <form className="admin-search participant-filter-bar" action="/admin">
    <label>ค้นหาผู้เข้าร่วมงาน<div><Search/><input name="participantSearch" defaultValue={search} placeholder="ชื่อ อีเมล เบอร์โทร เลขบัตร หรือรหัส REG"/><button className="secondary" type="submit">ค้นหา</button>{search && <Link className="ghost-action" href="/admin">ล้าง</Link>}</div></label>
    <label>เรียงลำดับ<select name="participantSort" defaultValue={sort}>
      <option value="newest">ใหม่ไปเก่า</option>
      <option value="oldest">เก่าไปใหม่</option>
    </select></label>
  </form>;
}

function ParticipantsTable({ participants }: { participants: Awaited<ReturnType<typeof listParticipants>> }) {
  const statuses = [
    ["registered", "ลงทะเบียนแล้ว"],
    ["attended", "เข้าร่วมงานแล้ว"],
    ["cancelled", "ยกเลิก"],
  ];
  return <form action="/api/admin/participants/bulk-delete" method="post" className="bulk-delete-form">
    <input type="hidden" name="returnTo" value="/admin"/>
    <div className="bulk-delete-bar">
      <span>ติ๊ก checkbox หน้าแถวที่ต้องการลบ แล้วกดลบรายการที่เลือก</span>
      <ConfirmSubmitButton className="danger-btn small-action" type="submit" message="ยืนยันลบผู้เข้าร่วมงานที่เลือก?"><Trash2/>ลบรายการที่เลือก</ConfirmSubmitButton>
    </div>
    <div className="admin-table-wrap"><table className="admin-table participants-manage-table"><thead><tr><th>รหัส</th><th>ผู้เข้าร่วมงาน</th><th>Role</th><th>ติดต่อ</th><th>ตำแหน่ง</th><th>กองบังคับการ</th><th>กองบัญชาการ</th><th>สถานะ</th><th></th></tr></thead><tbody>{participants.length ? participants.map(item => <tr key={item.registration_code}>
      <td><label className="row-check code-check"><input type="checkbox" name="registrationCode" value={item.registration_code}/><span><b>{item.registration_code}</b><small>ลงทะเบียน {formatAdminDate(item.registered_at)}</small>{item.checked_in_at && <small>เช็คอิน {formatAdminDate(item.checked_in_at)}</small>}</span></label></td>
      <td>{item.title}{item.first_name} {item.last_name}<small>{item.citizen_id}</small></td>
      <td><span className="status-pill role-pill">{item.participant_role}</span></td>
      <td>{item.email}<small>{item.phone}</small></td>
      <td>{item.position}</td>
      <td>{item.division}</td>
      <td>{item.bureau}</td>
      <td><span className={`status-pill ${item.status}`}>{statuses.find(([value]) => value === item.status)?.[1] ?? item.status}</span>{item.checked_in_by_email && <small>สแกนโดย {item.checked_in_by_email}</small>}</td>
      <td><Link className="secondary small-action" href={`/admin/participants/${encodeURIComponent(item.registration_code)}`}><Eye/>ดูข้อมูล</Link></td>
    </tr>) : <tr><td colSpan={9}>ยังไม่มีข้อมูลผู้เข้าร่วมงาน</td></tr>}</tbody></table></div>
  </form>;
}

function ReviewQueueTable({ submissions }: { submissions: Awaited<ReturnType<typeof listSubmissions>> }) {
  return <div className="admin-table-wrap review-focus-table"><table className="admin-table compact-admin-table"><thead><tr><th>รหัส</th><th>ผลงาน</th><th>ผู้สมัคร</th><th>ผู้ตรวจ</th><th>สถานะตรวจ</th><th></th></tr></thead><tbody>{submissions.length ? submissions.map(item => {
    const hasScore = item.review_submitted_at !== null && item.review_submitted_at !== undefined;
    return <tr key={item.submission_code}>
      <td><b>{item.submission_code}</b><small>ส่งเมื่อ {formatAdminDate(item.submitted_at)}</small></td>
      <td>{item.title_th}<small>{item.submission_type === "team" ? `ทีม ${item.team_name ?? "-"}` : "ส่งเดี่ยว"}</small></td>
      <td>{item.first_name} {item.last_name}<small>{item.email}</small></td>
      <td>{item.review_assigned_admin_email || "-"}</td>
      <td><span className={`status-pill ${hasScore ? "attended" : item.review_assigned_admin_email ? "registered" : "cancelled"}`}>{hasScore ? `ส่งคะแนนแล้ว ${item.review_total_score ?? "-"}/100` : item.review_assigned_admin_email ? "รอตรวจ" : "ยังไม่ assign"}</span>{item.review_submitted_at && <small>ส่งคะแนน {formatAdminDate(item.review_submitted_at)}</small>}</td>
      <td><Link className={hasScore ? "secondary small-action" : "primary small-action"} href={`/admin/submissions/${encodeURIComponent(item.submission_code)}`}><Eye/>{hasScore ? "ดูคะแนน" : "เปิดตรวจ"}</Link></td>
    </tr>;
  }) : <tr><td colSpan={6}>ยังไม่มีงานตรวจหรือไม่พบผลการค้นหา</td></tr>}</tbody></table></div>;
}

function NewsTable({ news, total }: { news: Awaited<ReturnType<typeof listNews>>; total: number }) {
  return <div className="admin-news-list">{news.length ? news.map((item) => {
    const isLive = item.published && (new Date(item.publishAt).getTime() <= Date.now());
    return <article className="admin-news-card" key={item.id}>
      <div className="admin-news-thumb">{item.imageName ? <img src={`/api/news-images/${encodeURIComponent(item.imageName)}`} alt={item.title}/> : <ImageIcon/>}</div>
      <div>
        <span className={`status-pill ${isLive ? "attended" : item.published ? "registered" : "cancelled"}`}>{isLive ? "เผยแพร่แล้ว" : item.published ? "รอโพสต์" : "ฉบับร่าง"}</span>
        <h3>{item.title}</h3>
        <p>{item.excerpt}</p>
        <small>วันที่โพสต์ {formatAdminDate(item.publishAt)}</small>
      </div>
      <form action={deleteNewsAction}>
        <input type="hidden" name="id" value={item.id}/>
        <ConfirmSubmitButton className="danger-btn" type="submit" message="ยืนยันลบข่าวประชาสัมพันธ์รายการนี้?">ลบ</ConfirmSubmitButton>
      </form>
    </article>;
  }) : <div className="participant-empty">ยังไม่มีข่าวประชาสัมพันธ์</div>}<CardMore total={total} shown={news.length} href="/admin/news"/></div>;
}

function CardMore({ total, shown, href }: { total: number; shown: number; href: string }) {
  if (total <= shown) return null;
  return <div className="card-more"><span>แสดง {shown.toLocaleString("th-TH")} จาก {total.toLocaleString("th-TH")} รายการ</span><Link className="secondary" href={href}><Eye/>ดูทั้งหมด</Link></div>;
}

async function requestOtpAction() {
  "use server";
  const result = await requestSuperAdminOtp();
  if (!result.ok) redirect("/admin?login=otp_wait");
  redirect(result.mailStatus === "failed" ? "/admin?login=otp_mail_failed" : "/admin?login=otp_sent");
}

async function verifyOtpAction(formData: FormData) {
  "use server";
  const requestHeaders = await headers();
  const clientKey = adminClientKey(requestHeaders);
  const status = await getAdminLoginStatus(clientKey);
  if (status.locked) {
    await slowFailedAdminLogin();
    redirect("/admin?login=locked");
  }

  const ok = await verifySuperAdminOtp(String(formData.get("otp") ?? ""), { purpose: "login" });
  if (!ok) {
    const failure = await recordAdminLoginFailure(clientKey);
    await slowFailedAdminLogin();
    redirect(failure.locked ? "/admin?login=locked" : "/admin?login=otp_failed");
  }

  await clearAdminLoginFailures(clientKey);
  await setAdminSession({ email: "innovation@police.go.th", role: "super_admin" });
  await recordAuditEvent({
    actor: { type: "super_admin", email: "innovation@police.go.th" },
    action: "auth.super_admin_login",
    entityType: "auth",
    summary: "Super Admin เข้าสู่ระบบด้วย OTP",
  }, requestHeaders);
  redirect("/admin");
}

async function loginAction(formData: FormData) {
  "use server";
  const requestHeaders = await headers();
  const clientKey = adminClientKey(requestHeaders);
  const status = await getAdminLoginStatus(clientKey);
  if (status.locked) {
    await slowFailedAdminLogin();
    redirect("/admin?login=locked");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const admin = await verifyAdminAccountPassword(email, password);
  if (!admin) {
    const failure = await recordAdminLoginFailure(clientKey);
    await slowFailedAdminLogin();
    redirect(failure.locked ? "/admin?login=locked" : "/admin?login=failed");
  }

  await clearAdminLoginFailures(clientKey);
  await setAdminSession({ email: admin.email, role: "admin" });
  await recordAuditEvent({
    actor: { type: "admin", email: admin.email },
    action: "auth.admin_login",
    entityType: "auth",
    summary: `Admin เข้าสู่ระบบ ${admin.email}`,
  }, requestHeaders);
  redirect("/admin");
}

async function setAdminSession(session: Pick<AdminSession, "email" | "role">) {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, createAdminSessionToken(session), {
    httpOnly: true,
    sameSite: "strict",
    secure: adminCookieSecure(),
    path: "/",
    maxAge: adminSessionMaxAgeSeconds(),
  });
}

async function logoutAction() {
  "use server";
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
  redirect("/admin");
}

async function saveSettingsAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  await saveAdminSettings({
    prelanderEnabled: formData.get("prelanderEnabled") === "on",
    eventRegistrationEnabled: formData.get("eventRegistrationEnabled") === "on",
    contestSubmissionEnabled: formData.get("contestSubmissionEnabled") === "on",
    satisfactionEvaluationEnabled: formData.get("satisfactionEvaluationEnabled") === "on",
    showSiteStats: formData.get("showSiteStats") === "on",
    openAt: String(formData.get("openAt") ?? ""),
    closeAt: String(formData.get("closeAt") ?? ""),
    prelanderTitle: String(formData.get("prelanderTitle") ?? ""),
    prelanderMessage: String(formData.get("prelanderMessage") ?? ""),
  });
  revalidatePath("/");
  revalidatePath("/register");
  revalidatePath("/register/form");
  revalidatePath("/submit");
  revalidatePath("/evaluation");
  revalidatePath("/admin");
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "admin.settings.updated",
    entityType: "settings",
    summary: "แก้ไขการตั้งค่า Pre-lander และสถานะเปิดรับสมัคร",
  }, requestHeaders);
  redirect(adminNoticePath("/admin", "settings_saved"));
}

async function addWinnerAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const rank = String(formData.get("rank") ?? "honorable").trim();
  const projectTitle = String(formData.get("projectTitle") ?? "").trim();
  await addWinner({
    rank,
    award: formatAward(rank),
    projectTitle,
    ownerName: String(formData.get("ownerName") ?? "").trim(),
    division: String(formData.get("division") ?? "").trim(),
    published: formData.get("published") === "on",
  });
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "winner.created",
    entityType: "winner",
    summary: `เพิ่มประกาศผลการแข่งขัน ${projectTitle || "-"}`,
    payload: { rank },
  }, requestHeaders);
  revalidatePath("/");
  revalidatePath("/admin");
  redirect(adminNoticePath("/admin", "winner_added"));
}

async function deleteWinnerAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const id = String(formData.get("id") ?? "");
  await deleteWinner(id);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "winner.deleted",
    entityType: "winner",
    entityId: id,
    summary: "ลบประกาศผลการแข่งขัน",
  }, requestHeaders);
  revalidatePath("/");
  revalidatePath("/admin");
  redirect(adminNoticePath("/admin", "winner_deleted"));
}

async function addNewsAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const title = String(formData.get("title") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const publishAt = String(formData.get("publishAt") ?? "").trim();
  if (!title || !excerpt || !body || !publishAt) throw new Error("กรุณากรอกข้อมูลข่าวให้ครบถ้วน");
  await addNews({
    title,
    excerpt,
    body,
    publishAt,
    published: formData.get("published") === "on",
    image: formData.get("image") as File | null,
  });
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "news.created",
    entityType: "news",
    summary: `เพิ่มข่าวประชาสัมพันธ์ ${title}`,
    payload: { publishAt },
  }, requestHeaders);
  revalidatePath("/");
  revalidatePath("/admin");
  redirect(adminNoticePath("/admin", "news_added"));
}

async function deleteNewsAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const id = String(formData.get("id") ?? "");
  await deleteNews(id);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "news.deleted",
    entityType: "news",
    entityId: id,
    summary: "ลบข่าวประชาสัมพันธ์",
  }, requestHeaders);
  revalidatePath("/");
  revalidatePath("/admin");
  redirect(adminNoticePath("/admin", "news_deleted"));
}

async function assignSubmissionAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const submissionCode = String(formData.get("submissionCode") ?? "").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim().toLowerCase() || null;
  await assignSubmissionReviewer(submissionCode, adminEmail);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "submission.review.assigned",
    entityType: "submission",
    entityId: submissionCode,
    summary: adminEmail ? `assign ใบสมัคร ${submissionCode} ให้ ${adminEmail}` : `ยกเลิก assign ใบสมัคร ${submissionCode}`,
    payload: { adminEmail },
  }, requestHeaders);
  revalidatePath("/admin");
  revalidatePath(`/admin/submissions/${encodeURIComponent(submissionCode)}`);
  redirect(adminNoticePath("/admin", "assignment_saved"));
}

async function addAdminAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const account = await createAdminAccount({
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
  });
  await createAdminPasswordLink(account.id);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "admin_user.created",
    entityType: "admin_user",
    entityId: account.id,
    summary: `เพิ่มแอดมิน ${account.email}`,
  }, requestHeaders);
  revalidatePath("/admin");
  redirect(adminNoticePath(`/admin/admins/${encodeURIComponent(account.id)}`, "admin_added"));
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");
  return session;
}

async function requireSuperAdmin() {
  const session = await requireAdmin();
  if (session.role !== "super_admin") redirect("/admin");
  return session;
}

function filterRecords<T>(records: T[], query: string, pickFields: (record: T) => Array<string | null | undefined>) {
  const needle = normalizeSearch(query);
  if (!needle) return records;
  return records.filter((record) => pickFields(record).some((value) => normalizeSearch(value ?? "").includes(needle)));
}

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function sortParticipants<T extends { registered_at: string }>(records: T[], sort: ParticipantSort) {
  return [...records].sort((a, b) => {
    const diff = new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime();
    return sort === "oldest" ? -diff : diff;
  });
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

function profileLabel(key: string) {
  if (key === "gender") return "เพศ";
  if (key === "ageRange") return "อายุ";
  if (key === "organizationType") return "ประเภทหน่วยงาน";
  if (key === "attendeeStatus") return "สถานภาพ";
  return key;
}

function actorLabel(actor: AuditEventRecord["actor"]) {
  if (actor.type === "public") return actor.email ? `ผู้ใช้ • ${actor.email}` : "ผู้ใช้ทั่วไป";
  if (actor.type === "super_admin") return `Super Admin${actor.email ? ` • ${actor.email}` : ""}`;
  if (actor.type === "admin") return `Admin${actor.email ? ` • ${actor.email}` : ""}`;
  return "ระบบ";
}

function auditActionLabel(action: string) {
  if (action === "auth.super_admin_login") return "Super Admin เข้าสู่ระบบ";
  if (action === "auth.admin_login") return "Admin เข้าสู่ระบบ";
  if (action === "registration.created") return "ลงทะเบียนเข้าร่วมงาน";
  if (action === "registration.updated") return "แก้ไขข้อมูลผู้เข้าร่วม";
  if (action === "registration.deleted") return "ลบข้อมูลผู้เข้าร่วม";
  if (action === "registration.bulk_deleted") return "ลบผู้เข้าร่วมหลายรายการ";
  if (action === "registration.checked_in") return "เช็คอินหน้างาน";
  if (action === "registration.export_pdf") return "Export รายชื่อ PDF";
  if (action === "registration.export_xlsx") return "Export รายชื่อ Excel";
  if (action === "submission.created") return "สมัครประกวดนวัตกรรม";
  if (action === "submission.updated") return "แก้ไขใบสมัครประกวด";
  if (action === "submission.deleted") return "ลบใบสมัครประกวด";
  if (action === "submission.delete_otp_requested") return "ขอ OTP ลบใบสมัคร";
  if (action === "submission.file_opened") return "เปิดไฟล์แนบ";
  if (action === "submission.print_packet") return "พิมพ์ชุดใบสมัคร";
  if (action === "submission.review.assigned") return "แจกงานตรวจรอบแรก";
  if (action === "submission.score.submitted") return "ส่งคะแนนรอบแรก";
  if (action === "submission.scoreboard_pdf") return "พิมพ์ Score Board";
  if (action === "admin.settings.updated") return "แก้ไขตั้งค่าระบบ";
  if (action === "admin_user.created") return "เพิ่มแอดมิน";
  if (action === "admin_user.updated") return "แก้ไขแอดมิน";
  if (action === "admin_user.password_link_sent") return "ส่งลิงก์รหัสผ่านแอดมิน";
  if (action === "admin_user.password_set") return "ตั้งรหัสผ่านแอดมิน";
  if (action === "admin_user.deleted") return "ลบแอดมิน";
  if (action === "news.created") return "เพิ่มข่าวประชาสัมพันธ์";
  if (action === "news.deleted") return "ลบข่าวประชาสัมพันธ์";
  if (action === "winner.created") return "เพิ่มประกาศผล";
  if (action === "winner.deleted") return "ลบประกาศผล";
  if (action === "evaluation.lucky_draw") return "สุ่ม Lucky Draw";
  return action;
}

function auditEntityLabel(entityType: string) {
  if (entityType === "registration") return "ลงทะเบียน";
  if (entityType === "submission") return "ใบสมัคร";
  if (entityType === "settings") return "ตั้งค่าระบบ";
  if (entityType === "admin_user") return "แอดมิน";
  if (entityType === "news") return "ข่าว";
  if (entityType === "winner") return "ประกาศผล";
  if (entityType === "evaluation") return "แบบประเมิน";
  if (entityType === "auth") return "เข้าสู่ระบบ";
  return entityType;
}

function formatAdminDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}
