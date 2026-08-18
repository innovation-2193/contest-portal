import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { CalendarClock, Car, ClipboardList, Database, Download, Eye, FileSpreadsheet, Gift, Image as ImageIcon, LayoutGrid, LogIn, LogOut, Mail, Megaphone, Newspaper, Paperclip, Pencil, Phone, Printer, QrCode, Search, Settings, ShieldCheck, Star, Trash2, Trophy, UserCheck, UserPlus, Users, Video } from "lucide-react";
import { AdminNotice } from "../../components/AdminNotice";
import { ConfirmSubmitButton } from "../../components/ConfirmSubmitButton";
import { ParkingParticipantPicker } from "../../components/ParkingParticipantPicker";
import { SecretInput } from "../../components/SecretInput";
import { buildParticipantRoleCounts, normalizeParticipantRoleFilter, ParticipantRoleTabs } from "../../components/ParticipantRoleTabs";
import {
  adminOtpAutoFillCookie,
  adminClientKey,
  adminCookieSecure,
  createAdminOtpAutoFillValue,
  createAdminSessionToken,
  adminSessionMaxAgeSeconds,
  clearAdminLoginFailures,
  cookieName,
  genericAdminLoginError,
  getAdminOtpAutoFillCode,
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
import { adminNoticePath, adminNoticeReturnPath, safeAdminReturnPath } from "../../lib/admin-flash";
import { participantRoleClass } from "../../lib/participant-role-style";
import {
	  addWinner,
	  addNews,
	  assignSubmissionReviewer,
	  deleteHomePopup,
	  deleteWinner,
	  deleteNews,
	  getSubmissionDetail,
		  getAdminSettings,
		  getHomePopup,
		  createParkingReservation,
		  deleteParkingReservation,
		  listNews,
		  listParkingReservations,
		  listParticipants,
		  listSubmissions,
		  listWinners,
		  registerSubmissionAsParticipant,
		  saveAdminSettings,
		  saveHomePopup,
		  updateParkingReservation,
		} from "../../lib/admin-store";
import { getEvaluationSummary, type EvaluationSummary } from "../../lib/evaluation-store";
import { sendWinnerAnnouncementEmails } from "../../lib/winner-mail";
import { sendSubmissionAssignmentEmail } from "../../lib/submission-assignment-mail";
import { sortScoreboardSubmissions } from "../../lib/scoreboard-ranking";
import { formatThaiDateTimeInput, parseThaiDate, thaiLocalDateTimeToIso } from "../../lib/thai-time";

export const dynamic = "force-dynamic";

type ParticipantSort = "newest" | "oldest";
type SubmissionSort = "newest" | "oldest";
type ReviewFilter = "all" | "unassigned" | "assigned" | "pending" | "scored";
const dashboardLimit = 10;
type AdminPageSearchParams = { login?: string; notice?: string; participantRole?: string; participantSearch?: string; participantSort?: string; submissionSearch?: string; submissionReview?: string; submissionSort?: string; adminSearch?: string; parkingAll?: string; parkingEdit?: string };

export default async function AdminPage({ searchParams }: { searchParams: Promise<AdminPageSearchParams> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  const params = await searchParams;

  if (session?.role === "uci") redirect("/uci");

  if (session && params.login) {
    return <AdminShell><LoginPanel message="" activeSession={session}/></AdminShell>;
  }

  if (!session) {
    const autoFillOtp = getAdminOtpAutoFillCode(cookieStore.get(adminOtpAutoFillCookie)?.value, { purpose: "login" });
    return <AdminShell><LoginPanel message={genericAdminLoginError(params.login)} autoFillOtp={autoFillOtp}/></AdminShell>;
  }
  const { settings, participants, submissions, winners, news, homePopup, adminAccounts, auditEvents, evaluationSummary, parkingReservations } = await loadAdminPageData(session);
  const isSuperAdmin = session.role === "super_admin";
  const participantRole = normalizeParticipantRoleFilter(params.participantRole);
  const participantSearch = (params.participantSearch ?? "").trim();
  const participantSort: ParticipantSort = params.participantSort === "oldest" ? "oldest" : "newest";
  const submissionSearch = (params.submissionSearch ?? "").trim();
  const submissionReview = normalizeReviewFilter(params.submissionReview);
  const submissionSort: SubmissionSort = params.submissionSort === "newest" ? "newest" : "oldest";
  const adminSearch = (params.adminSearch ?? "").trim();
  const searchedParticipants = filterRecords(participants, participantSearch, (item) => [
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
  ]);
  const filteredParticipantsAll = sortParticipants(
    participantRole === "all"
      ? searchedParticipants
      : searchedParticipants.filter((item) => item.participant_role === participantRole),
    participantSort,
  );
  const participantRoleCounts = buildParticipantRoleCounts(participants);
  const filteredSubmissionsAll = sortSubmissions(
    filterByReviewStatus(
      filterRecords(submissions, submissionSearch, (item) => [
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
      ]),
      submissionReview,
    ),
    submissionSort,
  );
  const filteredAdminAccounts = sortAdminAccounts(filterRecords(adminAccounts, adminSearch, (item) => [
    item.email,
    item.name,
    item.phone,
    item.disabled ? "ปิดใช้งาน disabled" : "ใช้งาน active",
    item.passwordHash ? "ตั้งรหัสผ่านแล้ว password set" : "รอตั้งรหัสผ่าน pending",
  ]));
  const filteredParticipants = filteredParticipantsAll.slice(0, dashboardLimit);
  const filteredSubmissions = filteredSubmissionsAll.slice(0, dashboardLimit);
  const attendedParticipants = participants.filter((item) => item.status === "attended");
  const activeRegistrations = participants.filter((item) => item.status !== "cancelled");
  const parkingEligibleParticipants = activeRegistrations.filter((item) => item.participant_role === "VIP" || item.participant_role === "Exhibitor" || item.participant_role === "Staff");
  const waitingCheckInCount = activeRegistrations.length - attendedParticipants.length;
  const visibleNews = news.slice(0, dashboardLimit);
  const visibleAdmins = filteredAdminAccounts.slice(0, dashboardLimit);
  const showAllParkingReservations = params.parkingAll === "1";
  const currentAdminPath = adminDashboardHref(params);
  const showCheckInShortcut = isSuperAdmin
    ? settings.checkInShortcutVisibleForSuperAdmin
    : settings.checkInShortcutVisibleForAdmin;
  const scoreBoard = sortScoreboardSubmissions(submissions);
  const awardedSubmissionKeys = new Set(winners.map((winner) => winner.submissionCode || winnerFallbackKey(winner.projectTitle, winner.ownerName, winner.division)));
  const availableWinnerSubmissions = submissions.filter((submission) => {
    const key = winnerFallbackKey(submission.title_th, submissionOwnerName(submission), submissionDivision(submission));
    return !awardedSubmissionKeys.has(submission.submission_code) && !awardedSubmissionKeys.has(key);
  });

  return <AdminShell>
    <div className="admin-topline"><div><span className="eyebrow">Admin Console</span><h1>ระบบหลังบ้าน</h1>{isSuperAdmin && <p>Super Admin สามารถจัดการทุกส่วนของระบบ รวมถึง Pre-lander ประกาศผล และบัญชีแอดมิน</p>}<small className="admin-role-badge"><ShieldCheck/>{isSuperAdmin ? "Super Admin" : "Admin"} • {session.email}</small></div><form action={logoutAction}><button className="secondary" type="submit"><LogOut/>ออกจากระบบ</button></form></div>
    <AdminNotice code={params.notice}/>
    {showCheckInShortcut && <section className="admin-panel admin-checkin-cta">
      <div className="admin-checkin-copy"><QrCode/><div><span className="eyebrow">Event Check-in</span><h2>หน้าเช็คอินหน้างาน</h2><p>เปิดหน้าสแกน QR Code หรือค้นหาชื่อผู้เข้าร่วมแบบ Live Search แล้วกดเช็คอินได้ทันที</p></div></div>
      <Link className="primary" href="/admin/scan"><UserCheck/>เปิดหน้าเช็คอิน</Link>
    </section>}
    {isSuperAdmin && <section className="admin-panel admin-checkin-cta admin-lucky-draw-cta">
      <div className="admin-checkin-copy"><Gift/><div><span className="eyebrow">Super Admin Only</span><h2>Lucky Draw หน้างาน</h2><p>เปิดวงล้อจับฉลากรางวัลที่ 1–3 พร้อมบันทึกผล เวลา และผู้ดำเนินการลงฐานข้อมูล</p></div></div>
      <Link className="primary" href="/admin/evaluations#lucky-draw"><Trophy/>เปิดหน้า Lucky Draw</Link>
    </section>}
    {isSuperAdmin && <SettingsControlPanel settings={settings}/>}
    {isSuperAdmin && <section className="admin-panel admin-checkin-cta">
      <div className="admin-checkin-copy"><Database/><div><span className="eyebrow">Super Admin Only</span><h2>สำรองข้อมูลเว็บไซต์ทั้งระบบ</h2><p>ดาวน์โหลด Full Backup เป็น ZIP รวม database.sql ครบทุกตาราง/ทุกแถว พร้อมไฟล์ storage เช่น เอกสาร รูปภาพ และข้อมูลระบบ • รวมข้อมูลส่วนบุคคลและคะแนน</p></div></div>
      <a className="primary" href="/api/admin/database/export"><Download/>Export Database ทั้งเว็บ</a>
    </section>}
    <ReviewQueuePanel submissions={filteredSubmissions} total={filteredSubmissionsAll.length} allSubmissions={submissions} search={submissionSearch} review={submissionReview} sort={submissionSort} isSuperAdmin={isSuperAdmin}/>
    {isSuperAdmin && <ParkingReservationPanel participants={parkingEligibleParticipants} reservations={parkingReservations} editId={params.parkingEdit} showAll={showAllParkingReservations}/>}
    {isSuperAdmin && <SystemOverview registrations={activeRegistrations.length} attended={attendedParticipants.length} waiting={waitingCheckInCount} submissions={submissions.length}/>}
    {isSuperAdmin && <EvaluationAdminPanel summary={evaluationSummary} evaluationEnabled={settings.satisfactionEvaluationEnabled} totalParticipants={activeRegistrations.length}/>}
    {isSuperAdmin && <AdminManagementPanel admins={visibleAdmins} search={adminSearch} total={filteredAdminAccounts.length}/>}
    {isSuperAdmin && <section className="admin-panel admin-checkin-cta"><div className="admin-checkin-copy"><Users/><div><span className="eyebrow">UCI Access</span><h2>จัดการผู้ใช้ UCI</h2><p>เพิ่ม แก้ไข ลบ และส่งลิงก์ตั้งรหัสผ่านให้สมาชิกทีม UCI</p></div></div><Link className="primary" href="/admin/uci"><Users/>เปิดจัดการผู้ใช้ UCI</Link></section>}
    {isSuperAdmin && <section className="admin-panel admin-checkin-cta"><div className="admin-checkin-copy"><Video/><div><span className="eyebrow">UCI How-to</span><h2>วิดีโอสอนการใช้งาน UCI</h2><p>เพิ่มชื่อคลิปและลิงก์ YouTube หรือ Google Drive เพื่อแสดงเป็น carousel ในหน้า /uci</p></div></div><Link className="primary" href="/admin/uci-videos"><Video/>จัดการวิดีโอสอนการใช้งาน</Link></section>}
    {isSuperAdmin && <section className="admin-panel admin-checkin-cta admin-booth-management-cta"><div className="admin-checkin-copy"><LayoutGrid/><div><span className="eyebrow">Exhibition Booths</span><h2>จัดการบูธแสดงผลงาน</h2><p>จัดการจำนวนบูธ รายละเอียดผลงาน รูปภาพ และผู้ติดต่อ จาก Exhibitor และผลงานที่ผ่านรอบแรก</p></div></div><Link className="primary" href="/admin/booths"><LayoutGrid/>เปิดหน้าจัดการบูธ</Link></section>}
    {isSuperAdmin && <AuditLogPanel events={auditEvents.events} total={auditEvents.total}/>}
    {isSuperAdmin && <HomePopupPanel popup={homePopup}/>}
    {isSuperAdmin && <section className="admin-panel">
      <header><Newspaper/><div><h2>ข่าวประชาสัมพันธ์</h2><p>เพิ่มภาพ ข้อความสรุป เนื้อหา และกำหนดวันที่ต้องการให้ข่าวปรากฏบนหน้าบ้าน โดยหน้านี้แสดงล่าสุด {dashboardLimit.toLocaleString("th-TH")} รายการ</p></div></header>
      <form action={addNewsAction} className="admin-form news-form">
        <label className="field-wide">ภาพข่าว<input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" required/></label>
        <label className="field-wide news-attachment-field"><span><Paperclip/>ไฟล์แนบข่าว / รายชื่อผู้ผ่านการประกวด</span><input type="file" name="attachment" accept=".pdf,.xlsx,.xls,.docx,.doc,.csv"/><small>แนบ PDF, Excel, Word หรือ CSV ขนาดไม่เกิน 20 MB</small></label>
        <label>วันที่ต้องการโพสต์ (GMT+7)<input type="datetime-local" name="publishAt" defaultValue={formatThaiDateTimeInput(new Date())}/></label>
        <label className="field-wide">หัวข้อข่าว<input name="title" placeholder="เช่น เปิดรับสมัครผลงานนวัตกรรมตำรวจ ประจำปี 2569" required maxLength={255}/></label>
        <label className="field-wide">ข้อความสรุป<input name="excerpt" placeholder="ข้อความสั้นสำหรับแสดงบนการ์ดข่าว (เว้นว่างได้)" maxLength={500}/></label>
        <label className="field-wide">เนื้อหา<textarea name="body" placeholder="รายละเอียดข่าวประชาสัมพันธ์ (เว้นว่างได้)" rows={5}/></label>
        <label className="inline-check"><input type="checkbox" name="published" defaultChecked/> เผยแพร่เมื่อถึงวันที่กำหนด</label>
        <button className="primary" type="submit"><Megaphone/>เพิ่มข่าวประชาสัมพันธ์</button>
      </form>
      <NewsTable news={visibleNews} total={news.length}/>
    </section>}
    {isSuperAdmin && <ReviewAssignmentPanel submissions={submissions.slice(0, dashboardLimit)} admins={adminAccounts.filter((admin) => !admin.disabled)} total={submissions.length} returnPath={currentAdminPath}/>}
    {isSuperAdmin && <ScoreBoardPanel submissions={scoreBoard.slice(0, dashboardLimit)} total={scoreBoard.length}/>}
    {isSuperAdmin && <section className="admin-panel">
      <header className="admin-section-head"><Trophy/><div><h2>ประกาศผลการแข่งขัน</h2><p>เลือกรายการที่ผ่านเข้าสู่ 10 ทีมสุดท้าย ระบบจะแสดงเป็นรายชื่อเดียว และรอบถัดไปเริ่มนับคะแนนใหม่</p></div><div className="admin-actions"><a className="secondary" href="/api/admin/winners/export"><Download/>Export PDF</a></div></header>
      <form action={addWinnerAction} className="admin-form winner-form">
        <label className="winner-select-field">เลือกผลงาน<select name="submissionCode" required>
          <option value="">{availableWinnerSubmissions.length ? "เลือกจากใบสมัครประกวดที่ยังไม่เคยประกาศผล" : "ไม่มีผลงานที่เหลือให้ประกาศผล"}</option>
          {availableWinnerSubmissions.map((submission)=><option key={submission.submission_code} value={submission.submission_code}>{submission.submission_code} • {submission.title_th} • {submission.first_name} {submission.last_name}{submission.review_total_score !== null && submission.review_total_score !== undefined ? ` • ${submission.review_total_score}/100` : ""}</option>)}
        </select></label>
        <label className="inline-check winner-publish-check"><input type="checkbox" name="published" defaultChecked/> เผยแพร่และส่งอีเมล</label>
        <button className="primary winner-submit" type="submit" disabled={!availableWinnerSubmissions.length}><UserPlus/>เพิ่มรายชื่อ</button>
      </form>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>ลำดับ</th><th>ผลงาน</th><th>เจ้าของ</th><th>หน่วยงาน</th><th>สถานะ</th><th></th></tr></thead><tbody>{winners.map((winner, index)=><tr key={winner.id}><td data-label="ลำดับ"><b>{(index + 1).toLocaleString("th-TH")}</b></td><td data-label="ผลงาน">{winner.projectTitle}</td><td data-label="เจ้าของ">{winner.ownerName}</td><td data-label="หน่วยงาน">{winner.division}</td><td data-label="สถานะ">{winner.published?"เผยแพร่":"ฉบับร่าง"}</td><td data-label="การจัดการ"><form action={deleteWinnerAction}><input type="hidden" name="id" value={winner.id}/><ConfirmSubmitButton className="danger-btn" type="submit" message="ยืนยันลบประกาศผลการแข่งขันรายการนี้?">ลบ</ConfirmSubmitButton></form></td></tr>)}</tbody></table></div>
    </section>}
    {isSuperAdmin && <section className="admin-panel">
      <header className="admin-section-head"><Users/><div><h2>ผู้เข้าร่วมงาน</h2><p>แก้ไขข้อมูล ลบรายการ ค้นหา ดาวน์โหลดรายชื่อ และตรวจสถานะเช็คอินหน้างาน โดยหน้านี้แสดงล่าสุด {dashboardLimit.toLocaleString("th-TH")} รายการ</p></div><div className="admin-actions"><Link className="secondary" href="/admin/scan"><QrCode/>เปิดหน้าเช็คอิน</Link><a className="secondary" href="/api/admin/participants/export"><Download/>Export PDF</a><a className="primary" href="/api/admin/participants/export/xlsx"><FileSpreadsheet/>Export Excel</a></div></header>
      <ParticipantRoleTabs activeRole={participantRole} basePath="/admin" counts={participantRoleCounts} query={{ participantSearch, participantSort }}/>
      <ParticipantFilterBar role={participantRole} search={participantSearch} sort={participantSort}/>
      <ParticipantsTable participants={filteredParticipants}/>
      <CardMore total={filteredParticipantsAll.length} shown={filteredParticipants.length} href={participantListHref(participantRole)}/>
    </section>}
  </AdminShell>;
}

const fallbackAdminSettings: Awaited<ReturnType<typeof getAdminSettings>> = {
  prelanderEnabled: false,
  eventRegistrationEnabled: true,
  contestSubmissionEnabled: true,
  satisfactionEvaluationEnabled: false,
  showSiteStats: true,
  checkInShortcutVisibleForAdmin: true,
  checkInShortcutVisibleForSuperAdmin: true,
  homeCountdownEnabled: true,
  homeCountdownTarget: "2026-08-24T09:00:00+07:00",
  homeCountdownTitle: "นับถอยหลังสู่วันงาน",
  homeCountdownNote: "",
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
  const [settings, participants, submissions, winners, news, homePopup, adminAccounts, auditEvents, parkingReservations] = await Promise.all([
    withAdminFallback("settings", getAdminSettings(), fallbackAdminSettings),
    withAdminFallback("participants", listParticipants(), []),
    withAdminFallback("submissions", listSubmissions({ assignedAdminEmail: isSuperAdmin ? null : session.email }), []),
    withAdminFallback("winners", listWinners(), []),
    withAdminFallback("news", listNews(), []),
    isSuperAdmin ? withAdminFallback("home popup", getHomePopup(), null) : Promise.resolve(null),
    isSuperAdmin ? withAdminFallback("admin accounts", listAdminAccounts(), []) : Promise.resolve([]),
    isSuperAdmin ? withAdminFallback("audit events", listAuditEvents({ limit: 10 }), emptyAuditEvents) : Promise.resolve(emptyAuditEvents),
    isSuperAdmin ? withAdminFallback("parking reservations", listParkingReservations(), []) : Promise.resolve([]),
  ]);
  const evaluationSummary = await withAdminFallback("evaluation summary", getEvaluationSummary(), emptyEvaluationSummary);
  return { settings, participants, submissions, winners, news, homePopup, adminAccounts, auditEvents, evaluationSummary, parkingReservations };
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
    <header className="admin-section-head"><CalendarClock/><div><span className="eyebrow">System Control</span><h2>จัดการเปิด / ปิดระบบ</h2><p>ควบคุม Pre-lander การลงทะเบียน สมัครประกวด แบบประเมิน สถิติหน้าเว็บ ปุ่มลัดเช็คอิน และตัวนับถอยหลังหน้าโฮม</p></div></header>
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
        <label className="settings-toggle">
          <input type="checkbox" name="checkInShortcutVisibleForSuperAdmin" defaultChecked={settings.checkInShortcutVisibleForSuperAdmin}/>
          <span><b>แสดงกล่องเช็คอินสำหรับ Super Admin</b><small>ควบคุมการแสดงปุ่มลัด “หน้าเช็คอินหน้างาน” บน dashboard ของ Super Admin</small></span>
        </label>
        <label className="settings-toggle">
          <input type="checkbox" name="checkInShortcutVisibleForAdmin" defaultChecked={settings.checkInShortcutVisibleForAdmin}/>
          <span><b>แสดงกล่องเช็คอินสำหรับ Admin</b><small>ควบคุมการแสดงปุ่มลัด “หน้าเช็คอินหน้างาน” บน dashboard ของ Admin ทั่วไป</small></span>
        </label>
        <label className="settings-toggle">
          <input type="checkbox" name="homeCountdownEnabled" defaultChecked={settings.homeCountdownEnabled}/>
          <span><b>แสดงตัวนับถอยหลังหน้าโฮม</b><small>แสดง timer บน banner หน้าเว็บไซต์ โดยใช้เวลาปลายทางที่กำหนดด้านล่าง</small></span>
        </label>
      </div>
      <div className="form-grid compact-grid"><label>เปิดระบบเมื่อ (GMT+7)<input type="datetime-local" name="openAt" defaultValue={formatThaiDateTimeInput(settings.openAt)}/></label><label>ปิดระบบเมื่อ (GMT+7)<input type="datetime-local" name="closeAt" defaultValue={formatThaiDateTimeInput(settings.closeAt)}/></label><label>เวลานับถอยหลังหน้าโฮม (GMT+7)<input type="datetime-local" name="homeCountdownTarget" defaultValue={formatThaiDateTimeInput(settings.homeCountdownTarget)}/></label><label>ข้อความเหนือ timer<input name="homeCountdownTitle" defaultValue={settings.homeCountdownTitle} maxLength={120} placeholder="เช่น นับถอยหลังสู่วันงาน"/></label><label>ข้อความใต้ timer<input name="homeCountdownNote" defaultValue={settings.homeCountdownNote} maxLength={160} placeholder="เว้นว่างได้"/></label></div>
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
  review,
  sort,
  isSuperAdmin,
}: {
  submissions: Awaited<ReturnType<typeof listSubmissions>>;
  total: number;
  allSubmissions: Awaited<ReturnType<typeof listSubmissions>>;
  search: string;
  review: ReviewFilter;
  sort: SubmissionSort;
  isSuperAdmin: boolean;
}) {
  const pendingReview = allSubmissions.filter((item) => !item.review_submitted_at).length;
  const completedReview = allSubmissions.filter((item) => item.review_submitted_at).length;
  const assignedCount = allSubmissions.filter((item) => item.review_assigned_admin_email).length;
  const assignmentLabel = isSuperAdmin ? "assign ผู้ตรวจเอกสารแล้ว" : "assign ให้คุณแล้ว";
  const description = isSuperAdmin
    ? `ตรวจสถานะใบสมัคร Assign ผู้ตรวจเอกสาร และเปิดรายละเอียดผลงานจากจุดนี้ได้ทันที หน้านี้แสดงล่าสุด ${dashboardLimit.toLocaleString("th-TH")} รายการ`
    : `รายการที่ได้รับมอบหมายให้ตรวจรอบแรกอยู่ตรงนี้ เปิดตรวจได้ทันที หน้านี้แสดงล่าสุด ${dashboardLimit.toLocaleString("th-TH")} รายการ`;

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
    <SubmissionQueueFilterBar search={search} review={review} sort={sort}/>
    <ReviewQueueTable submissions={submissions}/>
    <CardMore total={total} shown={submissions.length} href={submissionListHref(search, review, sort)}/>
  </section>;
}

function LoginPanel({ message, autoFillOtp = "", activeSession }: { message: string; autoFillOtp?: string; activeSession?: AdminSession }) {
  if (activeSession) {
    return <section className="admin-login admin-login-resume"><span className="eyebrow">Admin Console</span><h1>เข้าสู่ระบบหลังบ้าน</h1><p>Session ของคุณยังใช้งานได้ เปิดระบบหลังบ้านได้ทันทีโดยไม่ต้องขอ OTP ใหม่</p>
      <article className="admin-login-card admin-session-card">
        <h2><ShieldCheck/>{activeSession.role === "super_admin" ? "Super Admin" : "Admin"} ยังเข้าสู่ระบบอยู่</h2>
        <p>{activeSession.email}</p>
        <div className="admin-session-actions">
          <Link className="primary" href="/admin"><LogIn/>เข้าสู่ระบบ</Link>
          <form action={logoutAction}><button className="secondary" type="submit"><LogOut/>ออกจากระบบ</button></form>
        </div>
      </article>
    </section>;
  }
  return <section className="admin-login"><span className="eyebrow">Admin Console</span><h1>เข้าสู่ระบบหลังบ้าน</h1><p>Super Admin ใช้รหัส OTP ทางอีเมล ส่วน Admin ใช้อีเมลและรหัสผ่านที่ได้รับจากลิงก์เชิญ</p>{message && <div className="admin-login-alert">{message}</div>}
    <div className="admin-login-grid">
      <form action={requestOtpAction} className="admin-login-card">
        <h2><ShieldCheck/>Super Admin OTP</h2>
        <p>ระบบจะส่งรหัส OTP จำนวน 6 หลักไปยังอีเมล Super Admin ทั้ง 2 บัญชี รหัสมีอายุ 5 นาที เมื่อยืนยันสำเร็จ ระบบจะคงสถานะการเข้าสู่ระบบบนอุปกรณ์นี้เป็นเวลา 1 วัน</p>
        <button className="primary" type="submit"><Mail/>ส่งรหัส OTP</button>
      </form>
      <form action={verifyOtpAction} className="admin-login-card">
        <h2>ยืนยัน OTP</h2>
        <SecretInput name="otp" inputMode="numeric" pattern="[0-9๐-๙ -]{6,20}" maxLength={20} placeholder="กรอกรหัส 6 หลัก" required autoComplete="one-time-code" defaultValue={autoFillOtp}/>
        <button className="primary" type="submit">ยืนยันและเข้าสู่ระบบ</button>
      </form>
      <form action={loginAction} className="admin-login-card">
        <h2><Users/>Admin</h2>
        <input type="email" name="email" placeholder="admin@example.com" required autoComplete="username"/>
        <SecretInput name="password" placeholder="รหัสผ่าน" required autoComplete="current-password"/>
        <label className="admin-login-remember"><input type="checkbox" name="remember"/> <span>จำการเข้าสู่ระบบไว้ 30 วัน</span></label>
        <button className="secondary" type="submit">เข้าสู่ระบบ Admin</button>
      </form>
    </div>
  </section>;
}

function ParkingReservationPanel({
  participants,
  reservations,
  editId,
  showAll,
}: {
  participants: Awaited<ReturnType<typeof listParticipants>>;
  reservations: Awaited<ReturnType<typeof listParkingReservations>>;
  editId?: string;
  showAll: boolean;
}) {
  const vipCount = reservations.filter((item) => item.participantRole === "VIP").length;
  const exhibitorCount = reservations.filter((item) => item.participantRole === "Exhibitor").length;
  const staffCount = reservations.filter((item) => item.participantRole === "Staff").length;
  const hasEligibleParticipants = participants.length > 0;
  const visibleReservations = showAll ? reservations : reservations.slice(0, dashboardLimit);
  const editingReservation = editId ? reservations.find((reservation) => reservation.id === editId) : null;
  const editBase = showAll ? "/admin?parkingAll=1" : "/admin";
  const editSeparator = showAll ? "&" : "?";
  const listHref = showAll ? "/admin?parkingAll=1#parking-reservations" : "/admin#parking-reservations";
  return <section className="admin-panel parking-panel" id="parking-reservations">
    <header className="admin-section-head">
      <Car/>
      <div><span className="eyebrow">Super Admin Only</span><h2>สำรองที่จอดรถ VIP / Exhibitor / Staff</h2><p>ค้นหารายชื่อจาก Role VIP, Exhibitor หรือ Staff แล้วเพิ่มทะเบียนรถสำหรับพิมพ์ป้ายจอดรถหน้างาน โดยตารางนี้แสดงล่าสุด {dashboardLimit.toLocaleString("th-TH")} รายการ</p></div>
      <div className="admin-actions"><a className="primary" href="/api/admin/parking/export" target="_blank" rel="noreferrer"><Printer/>Export PDF ป้ายจอดรถ</a></div>
    </header>
    <div className="parking-summary">
      <div><Car/><b>{reservations.length.toLocaleString("th-TH")}</b><span>คันที่สำรองแล้ว</span></div>
      <div><ShieldCheck/><b>{vipCount.toLocaleString("th-TH")}</b><span>VIP</span></div>
      <div><Users/><b>{exhibitorCount.toLocaleString("th-TH")}</b><span>Exhibitor</span></div>
      <div><UserCheck/><b>{staffCount.toLocaleString("th-TH")}</b><span>Staff</span></div>
    </div>
    <form action={createParkingReservationAction} className="admin-form parking-form">
      <label className="field-wide">ค้นหารายชื่อ VIP / Exhibitor / Staff<ParkingParticipantPicker participants={participants}/></label>
      <label>ทะเบียนรถ<input name="carPlate" required maxLength={32} placeholder="เช่น 1กก 1234 กรุงเทพฯ"/></label>
      <label>หมายเหตุ<input name="note" maxLength={255} placeholder="เช่น รถตู้ / ผู้ติดตาม / ประตูทางเข้า"/></label>
      <button className="primary" type="submit" disabled={!hasEligibleParticipants}><Car/>เพิ่มที่จอดรถ</button>
    </form>
    {editingReservation && <form action={updateParkingReservationAction} className="admin-form parking-form parking-edit-panel" id="parking-edit">
      <input type="hidden" name="id" value={editingReservation.id}/>
      <div className="parking-edit-head">
        <Pencil/>
        <div><b>แก้ไขรายการสำรองที่จอดรถ</b><span>{editingReservation.carPlate} • {editingReservation.participantName}</span></div>
      </div>
      <label className="field-wide">ค้นหารายชื่อ VIP / Exhibitor / Staff<ParkingParticipantPicker participants={participants} defaultValue={editingReservation.registrationCode}/></label>
      <label>ทะเบียนรถ<input name="carPlate" defaultValue={editingReservation.carPlate} required maxLength={32} placeholder="เช่น 1กก 1234 กรุงเทพฯ"/></label>
      <label>หมายเหตุ<input name="note" defaultValue={editingReservation.note} maxLength={255} placeholder="เช่น รถตู้ / ผู้ติดตาม / ประตูทางเข้า"/></label>
      <div className="parking-edit-actions"><button className="primary" type="submit"><Car/>บันทึกการแก้ไข</button><Link className="secondary" href={listHref}>ยกเลิก</Link></div>
    </form>}
    <div className="admin-table-wrap parking-table-wrap">
      <table className="admin-table compact-admin-table parking-table">
        <thead><tr><th>ทะเบียนรถ</th><th>ผู้ใช้สิทธิ์</th><th>Role</th><th>เบอร์โทร</th><th>หมายเหตุ</th><th>จัดการ</th></tr></thead>
        <tbody>{visibleReservations.length ? visibleReservations.map((reservation) => <tr key={reservation.id}>
          <td data-label="ทะเบียนรถ"><b>{reservation.carPlate}</b><small>{reservation.registrationCode}</small></td>
          <td data-label="ผู้ใช้สิทธิ์">{reservation.participantName}<small>{reservation.division} / {reservation.bureau}</small></td>
          <td data-label="Role"><span className={`status-pill role-pill ${participantRoleClass(reservation.participantRole)}`}>{reservation.participantRole}</span></td>
          <td data-label="เบอร์โทร"><span className="parking-phone"><Phone/>{reservation.phone}</span></td>
          <td data-label="หมายเหตุ">{reservation.note || "-"}</td>
          <td data-label="จัดการ">
            <div className="parking-row-actions">
              <Link className="secondary small-action" href={`${editBase}${editSeparator}parkingEdit=${encodeURIComponent(reservation.id)}#parking-edit`}><Pencil/>แก้ไข</Link>
              <form action={deleteParkingReservationAction}>
                <input type="hidden" name="id" value={reservation.id}/>
                <ConfirmSubmitButton className="danger-btn small-action" type="submit" message="ยืนยันลบรายการสำรองที่จอดรถนี้?"><Trash2/>ลบ</ConfirmSubmitButton>
              </form>
            </div>
          </td>
        </tr>) : <tr><td colSpan={6}>ยังไม่มีรายการสำรองที่จอดรถ</td></tr>}</tbody>
      </table>
    </div>
    {showAll
      ? <div className="card-more"><span>แสดง {visibleReservations.length.toLocaleString("th-TH")} รายการทั้งหมด</span><Link className="secondary" href="/admin#parking-reservations">กลับไปดู 10 ล่าสุด</Link></div>
      : <CardMore total={reservations.length} shown={visibleReservations.length} href="/admin?parkingAll=1#parking-reservations"/>}
  </section>;
}

function AdminManagementPanel({ admins, search, total }: { admins: Awaited<ReturnType<typeof listAdminAccounts>>; search: string; total: number }) {
  return <section className="admin-panel">
    <header><UserPlus/><div><h2>จัดการแอดมิน</h2><p>ค้นหาแอดมิน ดูรายละเอียด แล้วเข้าไปแก้ไขข้อมูล ส่งลิงก์รีเซ็ต หรือลบรายการในหน้ารายละเอียด โดยหน้านี้แสดงล่าสุด {dashboardLimit.toLocaleString("th-TH")} รายการ</p></div></header>
    <form action={addAdminAction} className="admin-form admin-user-form">
      <label>ชื่อแอดมิน<input name="name" placeholder="เช่น ฝ่ายประสานงาน" maxLength={120}/></label>
      <label>อีเมล<input type="email" name="email" placeholder="admin@example.com" required/></label>
      <label>เบอร์ติดต่อ<input type="tel" name="phone" placeholder="เช่น 08x-xxx-xxxx" maxLength={40}/></label>
      <button className="primary" type="submit"><Mail/>เพิ่มและส่งลิงก์ตั้งรหัสผ่าน</button>
    </form>
    <SearchBox name="adminSearch" value={search} label="ค้นหาแอดมิน" placeholder="ชื่อ อีเมล สถานะ หรือรหัสผ่าน"/>
    <AdminAccountsTable admins={admins}/>
    <CardMore total={total} shown={admins.length} href="/admin/admins"/>
  </section>;
}

function EvaluationAdminPanel({ summary, evaluationEnabled, totalParticipants }: { summary: EvaluationSummary; evaluationEnabled: boolean; totalParticipants: number }) {
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
      <div className="stat-panel"><Star/><b>{summary.total.toLocaleString("th-TH")} / {totalParticipants.toLocaleString("th-TH")}</b><span>ผู้ทำแบบประเมิน / ผู้ลงทะเบียน</span></div>
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

function ReviewAssignmentPanel({ submissions, admins, total, returnPath }: { submissions: Awaited<ReturnType<typeof listSubmissions>>; admins: Awaited<ReturnType<typeof listAdminAccounts>>; total: number; returnPath: string }) {
  return <section className="admin-panel">
    <header className="admin-section-head"><UserCheck/><div><h2>แจกงานตรวจรอบแรก</h2><p>Super Admin เลือก Admin ผู้รับผิดชอบตรวจ Paper Screening ในแต่ละใบสมัคร โดยหน้านี้แสดงล่าสุด {dashboardLimit.toLocaleString("th-TH")} รายการ</p></div><div className="admin-actions"><Link className="secondary" href="/admin/submissions"><Eye/>ดูทั้งหมด</Link></div></header>
    <div className="assignment-list">
      {submissions.length ? submissions.map((submission) => <form id={`assignment-${submission.submission_code}`} className="assignment-row" action={assignSubmissionAction} key={submission.submission_code}>
        <input type="hidden" name="submissionCode" value={submission.submission_code}/>
        <input type="hidden" name="returnTo" value={`${returnPath}#assignment-${submission.submission_code}`}/>
        <div className="assignment-copy">
          <b>{submission.submission_code}</b>
          <span>{submission.title_th}</span>
          <small>{submission.first_name} {submission.last_name} • {submission.review_total_score ?? "-"} คะแนน</small>
          <em className={`status-pill ${submission.review_assigned_admin_email ? "registered" : "cancelled"}`}>{submission.review_assigned_admin_email || "ยังไม่ assign"}</em>
        </div>
        <div className="assignment-controls">
          <label>ผู้ตรวจเอกสาร<select name="adminEmail" defaultValue={submission.review_assigned_admin_email ?? ""}>
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
    <header className="admin-section-head"><Trophy/><div><h2>Score Board รอบแรก (เจ้าหน้าที่ตรวจเอกสาร)</h2><p>จัดอันดับจากคะแนน Paper Screening ของเจ้าหน้าที่ตรวจเอกสาร รวม 100 คะแนน แยกจากคะแนนคณะกรรมการ</p></div><div className="admin-actions"><a className="secondary" href="/api/admin/scoreboard/top10" target="_blank" rel="noreferrer"><Download/>Export Top 10 PDF</a><a className="primary" href="/api/admin/scoreboard" target="_blank" rel="noreferrer"><Printer/>พิมพ์ PDF</a><Link className="secondary" href="/admin/submissions"><Eye/>ดูทั้งหมด</Link></div></header>
    <div className="scoreboard-list">
      {submissions.length ? submissions.map((submission, index) => <article className="scoreboard-row" key={submission.submission_code}>
        <b>#{index + 1}</b>
        <div><strong>{submission.title_th}</strong><small>{submission.submission_code} • {submission.first_name} {submission.last_name}</small></div>
        <span>{submission.review_total_score}/100</span>
        <div className="scoreboard-actions">
          <form action={registerSubmissionParticipantAction}>
            <input type="hidden" name="submissionCode" value={submission.submission_code}/>
            <button className="primary small-action" type="submit"><Mail/>ลงทะเบียนร่วมงาน+ส่ง QR</button>
          </form>
          <Link className="secondary small-action" href={`/admin/submissions/${encodeURIComponent(submission.submission_code)}`}><Eye/>ดูคะแนน</Link>
          <a className="secondary small-action" href={`/api/admin/submissions/${encodeURIComponent(submission.submission_code)}/print`} target="_blank" rel="noreferrer"><Printer/>พิมพ์ใบสมัคร</a>
        </div>
      </article>) : <div className="participant-empty">ยังไม่มีคะแนนที่ส่งเข้ามา</div>}
    </div>
    <CardMore total={total} shown={submissions.length} href="/admin/submissions"/>
  </section>;
}

function AdminAccountsTable({ admins }: { admins: Awaited<ReturnType<typeof listAdminAccounts>> }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>อีเมล</th><th>ชื่อ</th><th>เบอร์ติดต่อ</th><th>สถานะ</th><th>รหัสผ่าน</th><th>อัปเดตล่าสุด</th><th></th></tr></thead><tbody>{admins.length ? admins.map((admin) => <tr key={admin.id}>
    <td data-label="อีเมล"><b>{admin.email}</b><small>สร้างเมื่อ {formatAdminDate(admin.createdAt)}</small></td>
    <td data-label="ชื่อ">{admin.name || "-"}</td>
    <td data-label="เบอร์ติดต่อ">{admin.phone || "-"}</td>
    <td data-label="สถานะ"><span className={`status-pill ${admin.disabled ? "cancelled" : "attended"}`}>{admin.disabled ? "ปิดใช้งาน" : "ใช้งานได้"}</span></td>
    <td data-label="รหัสผ่าน"><span className={`status-pill ${admin.passwordHash ? "attended" : "registered"}`}>{admin.passwordHash ? "ตั้งรหัสผ่านแล้ว" : "รอตั้งรหัสผ่าน"}</span></td>
    <td data-label="อัปเดตล่าสุด">{formatAdminDate(admin.updatedAt)}</td>
    <td data-label="การจัดการ"><Link className="secondary small-action" href={`/admin/admins/${encodeURIComponent(admin.id)}`}><Eye/>ดูข้อมูล</Link></td>
  </tr>) : <tr><td colSpan={7}>ยังไม่มีแอดมินหรือไม่พบผลการค้นหา</td></tr>}</tbody></table></div>;
}

function AdminTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{headers.map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length?rows.map((row,index)=><tr key={index}>{row.map((cell,cellIndex)=><td data-label={headers[cellIndex]} key={cellIndex}>{cell || "-"}</td>)}</tr>):<tr><td colSpan={headers.length}>ยังไม่มีข้อมูล</td></tr>}</tbody></table></div>;
}

function SearchBox({ name, value, label, placeholder }: { name: string; value: string; label: string; placeholder: string }) {
  return <form className="admin-search" action="/admin">
    <label>{label}<div><Search/><input name={name} defaultValue={value} placeholder={placeholder}/><button className="secondary" type="submit">ค้นหา</button>{value && <Link className="ghost-action" href="/admin">ล้าง</Link>}</div></label>
  </form>;
}

function SubmissionQueueFilterBar({ search, review, sort }: { search: string; review: ReviewFilter; sort: SubmissionSort }) {
  return <form className="admin-search participant-filter-bar" action="/admin">
    <label>ค้นหาใบสมัครประกวด<div><Search/><input name="submissionSearch" defaultValue={search} placeholder="ชื่อผลงาน ชื่อผู้สมัคร ทีม อีเมล หรือรหัส SUB"/><button className="secondary" type="submit">ค้นหา</button>{(search || review !== "all" || sort !== "oldest") && <Link className="ghost-action" href="/admin">ล้าง</Link>}</div></label>
    <label>สถานะตรวจ<select name="submissionReview" defaultValue={review}>
      <option value="all">ทั้งหมด</option>
      <option value="unassigned">ยังไม่ assign</option>
      <option value="assigned">assign แล้ว</option>
      <option value="pending">รอตรวจ</option>
      <option value="scored">ส่งคะแนนแล้ว</option>
    </select></label>
    <label>เรียงลำดับ<select name="submissionSort" defaultValue={sort}>
      <option value="oldest">เก่าไปใหม่</option>
      <option value="newest">ใหม่ไปเก่า</option>
    </select></label>
  </form>;
}

function ParticipantFilterBar({ role, search, sort }: { role: string; search: string; sort: ParticipantSort }) {
  return <form className="admin-search participant-filter-bar" action="/admin">
    {role !== "all" && <input type="hidden" name="participantRole" value={role}/>}
    <label>ค้นหาผู้เข้าร่วมงาน<div><Search/><input name="participantSearch" defaultValue={search} placeholder="ชื่อ อีเมล เบอร์โทร เลขบัตร หรือรหัส REG"/><button className="secondary" type="submit">ค้นหา</button>{search && <Link className="ghost-action" href={adminParticipantHref(role)}>ล้าง</Link>}</div></label>
    <label>เรียงลำดับ<select name="participantSort" defaultValue={sort}>
      <option value="newest">ใหม่ไปเก่า</option>
      <option value="oldest">เก่าไปใหม่</option>
    </select></label>
  </form>;
}

function adminDashboardHref(params: AdminPageSearchParams) {
  const query = new URLSearchParams();
  const keys: Array<keyof AdminPageSearchParams> = [
    "participantRole",
    "participantSearch",
    "participantSort",
    "submissionSearch",
    "submissionReview",
    "submissionSort",
    "adminSearch",
    "parkingAll",
    "parkingEdit",
  ];
  for (const key of keys) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  const nextQuery = query.toString();
  return nextQuery ? `/admin?${nextQuery}` : "/admin";
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
      <td data-label="รหัส"><label className="row-check code-check"><input type="checkbox" name="registrationCode" value={item.registration_code}/><span><b>{item.registration_code}</b><small>ลงทะเบียน {formatAdminDate(item.registered_at)}</small>{item.checked_in_at && <small>เช็คอิน {formatAdminDate(item.checked_in_at)}</small>}</span></label></td>
      <td data-label="ผู้เข้าร่วมงาน">{item.title}{item.first_name} {item.last_name}<small>{item.citizen_id || "-"}</small></td>
      <td data-label="Role"><span className={`status-pill role-pill ${participantRoleClass(item.participant_role)}`}>{item.participant_role}</span></td>
      <td data-label="ติดต่อ">{item.email || "-"}<small>{item.phone}</small></td>
      <td data-label="ตำแหน่ง">{item.position}</td>
      <td data-label="กองบังคับการ">{item.division}</td>
      <td data-label="กองบัญชาการ / หน่วยจัดบูธ">{item.participant_role === "Exhibitor" && item.bureau ? `หน่วยจัดบูธ: ${item.bureau}` : item.bureau}</td>
      <td data-label="สถานะ"><span className={`status-pill ${item.status}`}>{statuses.find(([value]) => value === item.status)?.[1] ?? item.status}</span>{item.checked_in_by_email && <small>สแกนโดย {item.checked_in_by_email}</small>}</td>
      <td data-label="การจัดการ"><Link className="secondary small-action" href={`/admin/participants/${encodeURIComponent(item.registration_code)}`}><Eye/>ดูข้อมูล</Link></td>
    </tr>) : <tr><td colSpan={9}>ยังไม่มีข้อมูลผู้เข้าร่วมงาน</td></tr>}</tbody></table></div>
  </form>;
}

function ReviewQueueTable({ submissions }: { submissions: Awaited<ReturnType<typeof listSubmissions>> }) {
  return <div className="admin-table-wrap review-focus-table"><table className="admin-table compact-admin-table"><thead><tr><th>ลำดับ</th><th>รหัส</th><th>ผลงาน</th><th>ผู้สมัคร</th><th>ผู้ตรวจเอกสาร</th><th>สถานะตรวจ</th><th></th></tr></thead><tbody>{submissions.length ? submissions.map((item, index) => {
    const hasScore = item.review_submitted_at !== null && item.review_submitted_at !== undefined;
    return <tr key={item.submission_code}>
      <td data-label="ลำดับ"><b>{(index + 1).toLocaleString("th-TH")}</b></td>
      <td data-label="รหัส"><b>{item.submission_code}</b><small>ส่งเมื่อ {formatAdminDate(item.submitted_at)}</small></td>
      <td data-label="ผลงาน">{item.title_th}<small>{item.submission_type === "team" ? `ทีม ${item.team_name ?? "-"}` : "ส่งเดี่ยว"}</small></td>
      <td data-label="ผู้สมัคร">{item.first_name} {item.last_name}<small>{item.email}</small></td>
      <td data-label="ผู้ตรวจเอกสาร">{item.review_assigned_admin_email || "-"}</td>
      <td data-label="สถานะ"><span className={`status-pill ${hasScore ? "attended" : item.review_assigned_admin_email ? "registered" : "cancelled"}`}>{hasScore ? `ส่งคะแนนแล้ว ${item.review_total_score ?? "-"}/100` : item.review_assigned_admin_email ? "รอตรวจ" : "ยังไม่ assign"}</span>{item.review_submitted_at && <small>ส่งคะแนน {formatAdminDate(item.review_submitted_at)}</small>}</td>
      <td data-label="การจัดการ"><Link className={hasScore ? "secondary small-action" : "primary small-action"} href={`/admin/submissions/${encodeURIComponent(item.submission_code)}`}><Eye/>{hasScore ? "ดูคะแนน" : "เปิดตรวจ"}</Link></td>
    </tr>;
  }) : <tr><td colSpan={7}>ยังไม่มีงานตรวจหรือไม่พบผลการค้นหา</td></tr>}</tbody></table></div>;
}

function NewsTable({ news, total }: { news: Awaited<ReturnType<typeof listNews>>; total: number }) {
  return <div className="admin-news-list">{news.length ? news.map((item) => {
    const isLive = item.published && (parseThaiDate(item.publishAt)?.getTime() ?? Number.POSITIVE_INFINITY) <= Date.now();
    return <article className="admin-news-card" key={item.id}>
      <div className="admin-news-thumb">{item.imageName ? <img src={`/api/news-images/${encodeURIComponent(item.imageName)}`} alt={item.title}/> : <ImageIcon/>}</div>
      <div>
        <span className={`status-pill ${isLive ? "attended" : item.published ? "registered" : "cancelled"}`}>{isLive ? "เผยแพร่แล้ว" : item.published ? "รอโพสต์" : "ฉบับร่าง"}</span>
        <h3>{item.title}</h3>
        <p>{item.excerpt}</p>
      <small>วันที่โพสต์ {formatAdminDate(item.publishAt)}</small>{item.attachmentOriginalName && <small><Paperclip/>ไฟล์แนบ: {item.attachmentOriginalName}</small>}
      </div>
      <div className="admin-news-actions"><Link className="secondary small-action" href={`/admin/news/${encodeURIComponent(item.id)}`}><Pencil/>แก้ไข</Link><form action={deleteNewsAction}><input type="hidden" name="id" value={item.id}/><ConfirmSubmitButton className="danger-btn" type="submit" message="ยืนยันลบข่าวประชาสัมพันธ์รายการนี้?">ลบ</ConfirmSubmitButton></form></div>
    </article>;
  }) : <div className="participant-empty">ยังไม่มีข่าวประชาสัมพันธ์</div>}<CardMore total={total} shown={news.length} href="/admin/news"/></div>;
}

function HomePopupPanel({ popup }: { popup: Awaited<ReturnType<typeof getHomePopup>> }) {
  return <section className="admin-panel home-popup-admin-panel">
    <header className="admin-section-head">
      <ImageIcon/>
      <div><h2>Popup หน้า Home</h2><p>อัปโหลดรูปภาพ 1 รูปสำหรับแสดงเป็น popup เฉพาะหน้าแรกของเว็บไซต์ รองรับ JPG, PNG, WebP หรือ GIF</p></div>
    </header>
    <div className="home-popup-admin-grid">
      <div className="home-popup-preview">
        {popup?.imageName
          ? <img src={`/api/home-popup/${encodeURIComponent(popup.imageName)}`} alt={popup.imageOriginalName || "Popup หน้า Home"}/>
          : <div><ImageIcon/><span>ยังไม่ได้ตั้งรูป popup</span></div>}
      </div>
      <div className="home-popup-admin-form">
        {popup && <span className={`status-pill ${popup.enabled ? "attended" : "cancelled"}`}>{popup.enabled ? "กำลังแสดงบนหน้า Home" : "ปิดการแสดงผล"}</span>}
        {popup && <small>ไฟล์ล่าสุด: {popup.imageOriginalName || popup.imageName} • อัปเดต {formatAdminDate(popup.updatedAt)}</small>}
        <form action={saveHomePopupAction} className="admin-form">
          <label>รูปภาพ Popup<input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" required={!popup}/><small className="field-help">{popup ? "อัปโหลดไฟล์ใหม่เมื่อต้องการเปลี่ยนรูปเดิม" : "กรุณาเลือกรูปภาพสำหรับ popup"}</small></label>
          <label className="inline-check"><input type="checkbox" name="enabled" defaultChecked={popup?.enabled ?? true}/> เปิดแสดง popup บนหน้า Home</label>
          <button className="primary" type="submit"><ImageIcon/>{popup ? "บันทึก / แก้ไข Popup" : "เพิ่ม Popup"}</button>
        </form>
        {popup && <form action={deleteHomePopupAction}>
          <ConfirmSubmitButton className="danger-btn" type="submit" message="ยืนยันลบ popup หน้า Home?">ลบ Popup</ConfirmSubmitButton>
        </form>}
      </div>
    </div>
  </section>;
}

function CardMore({ total, shown, href }: { total: number; shown: number; href: string }) {
  if (total <= 0) return null;
  const label = total > shown
    ? `แสดง ${shown.toLocaleString("th-TH")} จาก ${total.toLocaleString("th-TH")} รายการ`
    : `แสดง ${shown.toLocaleString("th-TH")} รายการทั้งหมด`;
  return <div className="card-more"><span>{label}</span><Link className="secondary" href={href}><Eye/>ดูทั้งหมด</Link></div>;
}

function participantListHref(role: string) {
  if (role === "all") return "/admin/participants";
  return `/admin/participants?participantRole=${encodeURIComponent(role)}`;
}

function adminParticipantHref(role: string) {
  if (role === "all") return "/admin";
  return `/admin?participantRole=${encodeURIComponent(role)}`;
}

async function requestOtpAction() {
  "use server";
  const cookieStore = await cookies();
  if (getAdminSession(cookieStore.get(cookieName)?.value)) redirect("/admin");
  const result = await requestSuperAdminOtp();
  if (!result.ok) redirect("/admin?login=otp_wait");
  if (result.autoFillCode) {
    cookieStore.set(adminOtpAutoFillCookie, createAdminOtpAutoFillValue({ purpose: "login", code: result.autoFillCode }), {
      httpOnly: true,
      sameSite: "strict",
      secure: adminCookieSecure(),
      path: "/",
      maxAge: 5 * 60,
    });
  } else {
    cookieStore.delete(adminOtpAutoFillCookie);
  }
  redirect(result.mailStatus === "failed" ? "/admin?login=otp_mail_failed" : "/admin?login=otp_sent");
}

async function verifyOtpAction(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  if (getAdminSession(cookieStore.get(cookieName)?.value)) redirect("/admin");
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
  cookieStore.delete(adminOtpAutoFillCookie);
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
  const cookieStore = await cookies();
  if (getAdminSession(cookieStore.get(cookieName)?.value)) redirect("/admin");
  const requestHeaders = await headers();
  const clientKey = adminClientKey(requestHeaders);
  const status = await getAdminLoginStatus(clientKey);
  if (status.locked) {
    await slowFailedAdminLogin();
    redirect("/admin?login=locked");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";
  const admin = await verifyAdminAccountPassword(email, password);
  if (!admin) {
    const failure = await recordAdminLoginFailure(clientKey);
    await slowFailedAdminLogin();
    redirect(failure.locked ? "/admin?login=locked" : "/admin?login=failed");
  }

  await clearAdminLoginFailures(clientKey);
  await setAdminSession({ email: admin.email, role: admin.role }, remember);
  await recordAuditEvent({
    actor: { type: "admin", email: admin.email },
    action: "auth.admin_login",
    entityType: "auth",
    summary: `Admin เข้าสู่ระบบ ${admin.email}`,
  }, requestHeaders);
  redirect(admin.role === "uci" ? "/uci" : "/admin");
}

async function setAdminSession(session: Pick<AdminSession, "email" | "role">, remember = false) {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, createAdminSessionToken({ ...session, remember }), {
    httpOnly: true,
    sameSite: "strict",
    secure: adminCookieSecure(),
    path: "/",
    maxAge: adminSessionMaxAgeSeconds(session.role, remember),
  });
}

async function logoutAction() {
  "use server";
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
  cookieStore.delete(adminOtpAutoFillCookie);
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
    checkInShortcutVisibleForSuperAdmin: formData.get("checkInShortcutVisibleForSuperAdmin") === "on",
    checkInShortcutVisibleForAdmin: formData.get("checkInShortcutVisibleForAdmin") === "on",
    homeCountdownEnabled: formData.get("homeCountdownEnabled") === "on",
    homeCountdownTarget: normalizeOptionalThaiDate(formData.get("homeCountdownTarget"), "เวลานับถอยหลังหน้าโฮม"),
    homeCountdownTitle: String(formData.get("homeCountdownTitle") ?? ""),
    homeCountdownNote: String(formData.get("homeCountdownNote") ?? ""),
    openAt: normalizeOptionalThaiDate(formData.get("openAt"), "เวลาเปิดระบบ"),
    closeAt: normalizeOptionalThaiDate(formData.get("closeAt"), "เวลาปิดระบบ"),
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

async function createParkingReservationAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const reservation = await createParkingReservation({
    registrationCode: String(formData.get("registrationCode") ?? ""),
    carPlate: String(formData.get("carPlate") ?? ""),
    note: String(formData.get("note") ?? ""),
    actorEmail: session.email,
  });
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "parking.created",
    entityType: "parking",
    entityId: reservation.id,
    summary: `เพิ่มที่จอดรถ ${reservation.carPlate} สำหรับ ${reservation.participantName}`,
    payload: { registrationCode: reservation.registrationCode, role: reservation.participantRole },
  }, requestHeaders);
  revalidatePath("/admin");
  redirect(adminNoticePath("/admin", "parking_saved"));
}

async function updateParkingReservationAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const reservation = await updateParkingReservation({
    id: String(formData.get("id") ?? ""),
    registrationCode: String(formData.get("registrationCode") ?? ""),
    carPlate: String(formData.get("carPlate") ?? ""),
    note: String(formData.get("note") ?? ""),
    actorEmail: session.email,
  });
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "parking.updated",
    entityType: "parking",
    entityId: String(formData.get("id") ?? ""),
    summary: reservation ? `แก้ไขที่จอดรถ ${reservation.carPlate} สำหรับ ${reservation.participantName}` : "แก้ไขที่จอดรถ",
    payload: { registrationCode: String(formData.get("registrationCode") ?? "") },
  }, requestHeaders);
  revalidatePath("/admin");
  redirect(adminNoticePath("/admin", "parking_saved"));
}

async function deleteParkingReservationAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const id = String(formData.get("id") ?? "").trim();
  await deleteParkingReservation(id);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "parking.deleted",
    entityType: "parking",
    entityId: id,
    summary: "ลบรายการสำรองที่จอดรถ",
  }, requestHeaders);
  revalidatePath("/admin");
  redirect(adminNoticePath("/admin", "parking_deleted"));
}

async function addWinnerAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const rank = "finalist";
  const submissionCode = String(formData.get("submissionCode") ?? "").trim();
  const submission = (await listSubmissions()).find((item) => item.submission_code === submissionCode);
  if (!submission) throw new Error("ไม่พบผลงานที่เลือก");
  const submissionDetail = await getSubmissionDetail(submissionCode);
  if (!submissionDetail) throw new Error("ไม่พบข้อมูลรายละเอียดผลงานที่เลือก");
  const award = "คัดเลือกเป็น 10 ทีมสุดท้าย";
  const ownerName = submissionOwnerName(submission);
  const division = submissionDivision(submission);
  const submissionKey = winnerFallbackKey(submission.title_th, ownerName, division);
  const existingWinners = await listWinners();
  const alreadyAwarded = existingWinners.some((winner) =>
    winner.submissionCode === submissionCode ||
    winnerFallbackKey(winner.projectTitle, winner.ownerName, winner.division) === submissionKey,
  );
  if (alreadyAwarded) throw new Error("ผลงานนี้ถูกประกาศผลแล้ว กรุณาเลือกผลงานอื่น");
  const published = formData.get("published") === "on";
  await addWinner({
    submissionCode,
    rank,
    award,
    projectTitle: submission.title_th,
    ownerName,
    division,
    published,
  });
  const winnerNotifications = published
    ? await sendWinnerAnnouncementEmails({ submission: submissionDetail, award, ownerName })
    : [];
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "winner.created",
    entityType: "winner",
    summary: `เพิ่มประกาศผลการแข่งขัน ${submission.title_th}`,
    payload: { rank, submissionCode, published, winnerNotifications },
  }, requestHeaders);
  revalidatePath("/");
  revalidatePath("/admin");
  redirect(adminNoticePath("/admin", "winner_added"));
}

async function registerSubmissionParticipantAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const submissionCode = String(formData.get("submissionCode") ?? "").trim();
  if (!submissionCode) throw new Error("กรุณาเลือกใบสมัครประกวด");
  const result = await registerSubmissionAsParticipant(submissionCode);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "registration.created",
    entityType: "registration",
    entityId: result.record.registration_code,
    summary: `${result.created ? "ลงทะเบียน" : "อัปเดตทะเบียน"}ผู้สมัครประกวด ${submissionCode} เป็น ${result.record.registration_code}`,
    payload: {
      submissionCode,
      registrationCode: result.record.registration_code,
      emailStatus: result.emailStatus,
      created: result.created,
    },
  }, requestHeaders);
  revalidatePath("/admin");
  revalidatePath("/daily-report");
  redirect(adminNoticePath("/admin", "competitor_registered"));
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
  const publishAtInput = String(formData.get("publishAt") ?? "").trim();
  const publishAt = publishAtInput ? thaiLocalDateTimeToIso(publishAtInput) : new Date().toISOString();
  if (!title || !publishAt) throw new Error("กรุณากรอกหัวข้อข่าว และระบุเวลาเป็น GMT+7");
  const createdNews = await addNews({
    title,
    excerpt,
    body,
    publishAt,
    published: formData.get("published") === "on",
    image: formData.get("image") as File | null,
    attachment: formData.get("attachment") as File | null,
  });
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "news.created",
    entityType: "news",
    summary: `เพิ่มข่าวประชาสัมพันธ์ ${title}`,
    payload: { publishAt, attachmentName: createdNews.attachmentName, attachmentOriginalName: createdNews.attachmentOriginalName },
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

async function saveHomePopupAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const image = formData.get("image") as File | null;
  const popup = await saveHomePopup({
    enabled: formData.get("enabled") === "on",
    image,
  });
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "home_popup.saved",
    entityType: "home_popup",
    entityId: popup.id,
    summary: "บันทึก Popup หน้า Home",
    payload: { enabled: popup.enabled, imageName: popup.imageName, imageOriginalName: popup.imageOriginalName },
  }, requestHeaders);
  revalidatePath("/");
  revalidatePath("/admin");
  redirect(adminNoticePath("/admin", "home_popup_saved"));
}

async function deleteHomePopupAction(_formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  await deleteHomePopup();
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "home_popup.deleted",
    entityType: "home_popup",
    summary: "ลบ Popup หน้า Home",
  }, requestHeaders);
  revalidatePath("/");
  revalidatePath("/admin");
  redirect(adminNoticePath("/admin", "home_popup_deleted"));
}

async function assignSubmissionAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const submissionCode = String(formData.get("submissionCode") ?? "").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim().toLowerCase() || null;
  const submission = await getSubmissionDetail(submissionCode);
  const previousAdminEmail = submission?.review_assigned_admin_email?.trim().toLowerCase() || null;
  await assignSubmissionReviewer(submissionCode, adminEmail);
  const assignmentMail = adminEmail && adminEmail !== previousAdminEmail
    ? await sendSubmissionAssignmentEmail(submission, adminEmail)
    : { status: "skipped" as const };
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "submission.review.assigned",
    entityType: "submission",
    entityId: submissionCode,
    summary: adminEmail ? `assign ใบสมัคร ${submissionCode} ให้ ${adminEmail}` : `ยกเลิก assign ใบสมัคร ${submissionCode}`,
    payload: { adminEmail, assignmentMailStatus: assignmentMail.status },
  }, requestHeaders);
  revalidatePath("/admin");
  revalidatePath(`/admin/submissions/${encodeURIComponent(submissionCode)}`);
  redirect(adminNoticeReturnPath(safeAdminReturnPath(formData.get("returnTo"), "/admin"), "assignment_saved"));
}

async function addAdminAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const requestHeaders = await headers();
  const account = await createAdminAccount({
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
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
  revalidatePath("/contest");
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

function normalizeReviewFilter(value?: string): ReviewFilter {
  if (value === "unassigned" || value === "assigned" || value === "pending" || value === "scored") return value;
  return "all";
}

function filterByReviewStatus<T extends Awaited<ReturnType<typeof listSubmissions>>[number]>(records: T[], review: ReviewFilter) {
  if (review === "unassigned") return records.filter((item) => !item.review_assigned_admin_email);
  if (review === "assigned") return records.filter((item) => Boolean(item.review_assigned_admin_email));
  if (review === "pending") return records.filter((item) => Boolean(item.review_assigned_admin_email) && !item.review_submitted_at);
  if (review === "scored") return records.filter((item) => Boolean(item.review_submitted_at));
  return records;
}

function sortSubmissions<T extends Awaited<ReturnType<typeof listSubmissions>>[number]>(records: T[], sort: SubmissionSort) {
  return [...records].sort((a, b) => {
    const diff = new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
    return sort === "newest" ? -diff : diff;
  });
}

function sortAdminAccounts<T extends { updatedAt: string; createdAt: string; email: string }>(records: T[]) {
  return [...records].sort((a, b) => {
    const diff = new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    return diff || a.email.localeCompare(b.email);
  });
}

function submissionListHref(search: string, review: ReviewFilter, sort: SubmissionSort) {
  const params = new URLSearchParams({
    ...(search ? { q: search } : {}),
    ...(review !== "all" ? { review } : {}),
    ...(sort !== "oldest" ? { sort } : {}),
  });
  const query = params.toString();
  return query ? `/admin/submissions?${query}` : "/admin/submissions";
}

function normalizeOptionalThaiDate(value: FormDataEntryValue | null, label: string) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return "";
  const normalized = thaiLocalDateTimeToIso(rawValue);
  if (!normalized) throw new Error(`กรุณาระบุ${label}เป็นเวลาไทย GMT+7`);
  return normalized;
}

function submissionOwnerName(submission: Pick<Awaited<ReturnType<typeof listSubmissions>>[number], "submission_type" | "team_name" | "first_name" | "last_name">) {
  return submission.submission_type === "team" && submission.team_name
    ? `ทีม ${submission.team_name}`
    : `${submission.first_name} ${submission.last_name}`.trim();
}

function submissionDivision(submission: Pick<Awaited<ReturnType<typeof listSubmissions>>[number], "division" | "bureau">) {
  return [submission.division, submission.bureau].map((item) => item?.trim()).filter(Boolean).join(" / ");
}

function winnerFallbackKey(projectTitle: string, ownerName: string, division: string) {
  return [projectTitle, ownerName, division].map((item) => normalizeSearch(item)).join("|");
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
  if (action === "auth.participant_otp_requested") return "ขอ OTP โปรไฟล์ผู้เข้าร่วม";
  if (action === "auth.participant_login") return "เข้าสู่โปรไฟล์ผู้เข้าร่วม";
  if (action === "auth.participant_logout") return "ออกจากโปรไฟล์ผู้เข้าร่วม";
  if (action === "auth.super_admin_login") return "Super Admin เข้าสู่ระบบ";
  if (action === "auth.admin_login") return "Admin เข้าสู่ระบบ";
  if (action === "registration.created") return "ลงทะเบียนเข้าร่วมงาน";
  if (action === "registration.updated") return "แก้ไขข้อมูลผู้เข้าร่วม";
  if (action === "registration.deleted") return "ลบข้อมูลผู้เข้าร่วม";
  if (action === "registration.bulk_deleted") return "ลบผู้เข้าร่วมหลายรายการ";
  if (action === "registration.checked_in") return "เช็คอินหน้างาน";
  if (action === "registration.export_pdf") return "Export รายชื่อ PDF";
  if (action === "registration.export_xlsx") return "Export รายชื่อ Excel";
  if (action === "parking.created") return "เพิ่มที่จอดรถ";
  if (action === "parking.updated") return "แก้ไขที่จอดรถ";
  if (action === "parking.deleted") return "ลบที่จอดรถ";
  if (action === "parking.export_pdf") return "Export ป้ายจอดรถ PDF";
  if (action === "submission.created") return "สมัครประกวดนวัตกรรม";
  if (action === "submission.updated") return "แก้ไขใบสมัครประกวด";
  if (action === "submission.deleted") return "ลบใบสมัครประกวด";
  if (action === "submission.delete_otp_requested") return "ขอ OTP ลบใบสมัคร";
  if (action === "submission.file_opened") return "เปิดไฟล์แนบ";
  if (action === "submission.print_packet") return "พิมพ์ชุดใบสมัคร";
  if (action === "submission.review.assigned") return "แจกงานตรวจรอบแรก";
  if (action === "submission.score.submitted") return "ส่งคะแนนรอบแรก";
  if (action === "submission.scoreboard_pdf") return "พิมพ์ Score Board";
  if (action === "submission.scoreboard_top10_pdf") return "Export Top 10 Score Board";
  if (action === "submission.committee_score_form_pdf") return "Export แบบฟอร์มให้คะแนนกรรมการ";
  if (action === "submission.committee_score_form_zip") return "Export ZIP แบบฟอร์มให้คะแนนกรรมการ";
  if (action === "submission.committee_score_form_custom_pdf") return "Export แบบฟอร์มให้คะแนนกรรมการ 2";
  if (action === "committee_score.total_submitted") return "บันทึกคะแนนรวมคณะกรรมการ";
  if (action === "committee_score.total_updated") return "แก้ไขคะแนนรวมคณะกรรมการ";
  if (action === "committee_score.total_deleted") return "ลบคะแนนรวมคณะกรรมการ";
  if (action === "committee_score.template_xlsx") return "ดาวน์โหลด Template คะแนนรวม";
  if (action === "committee_score.template_file") return "ดาวน์โหลด Template คะแนนรวม";
  if (action === "committee_score.import_xlsx") return "Import คะแนนรวม Excel";
  if (action === "committee_score.report_version_deleted") return "ลบ Report PDF Version";
  if (action === "committee_score.judge_profiles_updated") return "แก้ไขชื่อกรรมการ";
  if (action === "committee_score.ocr_submitted") return "บันทึกคะแนนรวมคณะกรรมการ";
  if (action === "committee_score.ocr_updated") return "แก้ไขคะแนนรวมคณะกรรมการ";
  if (action === "committee_score.ocr_deleted") return "ลบคะแนนรวมคณะกรรมการ";
  if (action === "committee_score.scoreboard_pdf") return "Export ผลคะแนนคณะกรรมการ";
  if (action === "committee_score.consensus_template_xlsx") return "ดาวน์โหลด Template คะแนนรอบที่ 1 ทางเลือกที่ 2";
  if (action === "committee_score.consensus_import_xlsx") return "Import คะแนนรอบที่ 1 ทางเลือกที่ 2";
  if (action === "committee_score.consensus_form_pdf") return "Export แบบฟอร์มคะแนนรอบที่ 1 ทางเลือกที่ 2";
  if (action === "committee_score.coarse_form_pdf") return "Export แบบฟอร์มคะแนนรอบที่ 1 ทางเลือกที่ 3";
  if (action === "committee_score.consensus_report_pdf") return "Export รายงานจัดอันดับรอบที่ 1 ทางเลือกที่ 3";
  if (action === "submission.review_packets_zip") return "Export ZIP PDF ใบสมัคร";
  if (action === "admin.settings.updated") return "แก้ไขตั้งค่าระบบ";
  if (action === "admin_user.created") return "เพิ่มแอดมิน";
  if (action === "admin_user.updated") return "แก้ไขแอดมิน";
  if (action === "admin_user.password_link_sent") return "ส่งลิงก์รหัสผ่านแอดมิน";
  if (action === "admin_user.password_set") return "ตั้งรหัสผ่านแอดมิน";
  if (action === "admin_user.deleted") return "ลบแอดมิน";
  if (action === "uci_video.created") return "เพิ่มคลิปสอน UCI";
  if (action === "uci_video.updated") return "แก้ไขคลิปสอน UCI";
  if (action === "uci_video.deleted") return "ลบคลิปสอน UCI";
  if (action === "news.created") return "เพิ่มข่าวประชาสัมพันธ์";
  if (action === "news.deleted") return "ลบข่าวประชาสัมพันธ์";
  if (action === "winner.created") return "เพิ่มประกาศผล";
  if (action === "winner.deleted") return "ลบประกาศผล";
  if (action === "winner.export_pdf") return "Export ประกาศผล PDF";
  if (action === "evaluation.lucky_draw") return "สุ่ม Lucky Draw";
  if (action === "evaluation.lucky_draw_reset_otp_requested") return "ขอ OTP Reset Lucky Draw";
  if (action === "evaluation.lucky_draw_reset") return "Reset ผล Lucky Draw";
  if (action === "evaluation.responses_reset") return "Reset แบบประเมินความพึงพอใจ";
  if (action === "evaluation.report_exported") return "Export รายงานแบบประเมิน PDF";
  if (action === "system.database_export") return "Export ฐานข้อมูลทั้งระบบ";
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
  const date = parseThaiDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}
