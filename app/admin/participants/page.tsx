import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CheckCircle2, Download, Eye, FileSpreadsheet, FileText, Mail, Search, Trash2, UserPlus, Users } from "lucide-react";
import { AdminNotice } from "../../../components/AdminNotice";
import { BackButton } from "../../../components/BackButton";
import { ConfirmSubmitButton } from "../../../components/ConfirmSubmitButton";
import { ParticipantBulkSelection } from "../../../components/ParticipantBulkSelection";
import { buildParticipantRoleCounts, normalizeParticipantRoleFilter, ParticipantRoleTabs } from "../../../components/ParticipantRoleTabs";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { checkInParticipant, createParticipant, deleteParticipants, findExistingUserEmails, listParticipants, listSubmissionApplicantsForExport, listSubmissions, listWinners, registerSubmissionAsParticipant, type SubmissionApplicantExportRow, type SubmissionListItem, type WinnerRecord } from "../../../lib/admin-store";
import { actorFromAdminSession, recordAuditEvent } from "../../../lib/audit-log";
import { adminNoticePath } from "../../../lib/admin-flash";
import { buildAnnouncedFinalistSources } from "../../../lib/announced-finalists";
import { participantRoles, type ParticipantRole, type RegistrationRecord } from "../../../lib/local-registrations";
import { parseParticipantBulkFile } from "../../../lib/participant-bulk-import";
import { participantRoleClass } from "../../../lib/participant-role-style";
import { sendRegistrationReminder } from "../../../lib/registration-artifacts";
import { isThaiCitizenId } from "../../../lib/validation";

export const dynamic = "force-dynamic";

const pageSize = 20;
const walkInParticipantRoles = ["Exhibitor", "Guest"] as const;

export default async function AdminParticipantsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; notice?: string; error?: string; participantRole?: string; participantView?: string; from?: string; sent?: string; queued?: string; failed?: string; skipped?: string; checkedIn?: string; alreadyCheckedIn?: string; checkInSkipped?: string; registeredTeams?: string; createdParticipants?: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");

  const params = await searchParams;
  const isUciWorkspace = session.role === "uci" || params.from === "uci";
  const isNonFinalistView = session.role === "super_admin" && params.participantView === "non-finalists";
  const q = (params.q ?? "").trim();
  const participantRole = normalizeParticipantRoleFilter(params.participantRole);
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const participants = await listParticipants();
  const nonFinalistRows = session.role === "super_admin" ? await loadNonFinalistSubmissionRows(participants) : [];
  const filteredNonFinalistRows = filterRecords(nonFinalistRows, q, (item) => [
    item.submissionCode,
    item.title,
    item.teamName,
    ...item.members.flatMap((member) => [member.name, member.email, member.citizenId]),
  ]);
  const canDeleteParticipants = session.role !== "uci";
  const participantRoleCounts = buildParticipantRoleCounts(participants);
  const searched = filterRecords(participants, q, (item) => [
    item.registration_code,
    item.email,
    item.citizen_id,
    item.phone,
    item.first_name,
    item.last_name,
    item.participant_role,
    item.position,
    item.division,
    item.bureau,
    item.status,
  ]);
  const all = participantRole === "all" ? searched : searched.filter((item) => item.participant_role === participantRole);
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const items = all.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const reminderEligibleCount = participants.filter((participant) => participant.status !== "cancelled" && isValidEmail(participant.email)).length;
  const reminderSent = Number(params.sent ?? 0) || 0;
  const reminderQueued = Number(params.queued ?? 0) || 0;
  const reminderFailed = Number(params.failed ?? 0) || 0;
  const reminderSkipped = Number(params.skipped ?? 0) || 0;
  const checkInCount = Number(params.checkedIn ?? 0) || 0;
  const alreadyCheckedInCount = Number(params.alreadyCheckedIn ?? 0) || 0;
  const checkInSkippedCount = Number(params.checkInSkipped ?? 0) || 0;
  const canBulkCheckIn = session.role === "super_admin" || session.role === "admin" || session.role === "uci";

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div><span className="eyebrow">{isUciWorkspace ? "UCI Participants" : "Participants"}</span><h1>ผู้เข้าร่วมงานทั้งหมด</h1><p>{isUciWorkspace ? "ลงทะเบียน Walk-in และดูแลผู้เข้าร่วมงานจากจุดปฏิบัติการ UCI" : "ค้นหาและเปิดดูข้อมูลผู้เข้าร่วมงานแบบแบ่งหน้า"}</p></div>
        <BackButton />
      </div>
      <AdminNotice code={params.notice} error={params.error}/>
      {params.notice === "participant_qr_reminders_sent" && <div className={`admin-login-alert ${reminderFailed ? "warning" : "success"}`}>ส่งอีเมล QR Code แล้ว {reminderSent.toLocaleString("th-TH")} รายการ{reminderQueued ? ` • เข้าคิวทดสอบ ${reminderQueued.toLocaleString("th-TH")} รายการ` : ""}{reminderSkipped ? ` • ข้ามรายการไม่มีอีเมล/ยกเลิก ${reminderSkipped.toLocaleString("th-TH")} รายการ` : ""}{reminderFailed ? ` • ล้มเหลว ${reminderFailed.toLocaleString("th-TH")} รายการ` : ""}</div>}
      {params.notice === "participants_checked_in" && <div className="admin-login-alert success">เช็คอินสำเร็จ {checkInCount.toLocaleString("th-TH")} รายการ{alreadyCheckedInCount ? ` • เช็คอินไว้แล้ว ${alreadyCheckedInCount.toLocaleString("th-TH")} รายการ` : ""}{checkInSkippedCount ? ` • ข้ามรายการยกเลิก/ดำเนินการไม่ได้ ${checkInSkippedCount.toLocaleString("th-TH")} รายการ` : ""}</div>}
      {params.notice === "non_finalists_registered" && <div className="admin-login-alert success">ลงทะเบียนแล้ว {Number(params.registeredTeams ?? 0).toLocaleString("th-TH")} ทีม{params.createdParticipants ? ` • เพิ่มผู้เข้าร่วมงานใหม่ ${Number(params.createdParticipants).toLocaleString("th-TH")} รายการ` : ""}{params.skipped ? ` • ข้าม ${Number(params.skipped).toLocaleString("th-TH")} ทีมที่ดำเนินการไม่ได้` : ""}</div>}
      <section className={`admin-panel ${isUciWorkspace ? "uci-participants-panel" : ""}`}>
        <header className="admin-section-head"><Users/><div><span className="eyebrow">{isUciWorkspace ? "Participants" : "รายการ"}</span><h2>{isNonFinalistView ? "ผู้ประกวดที่ไม่ติด 10 ทีมสุดท้าย" : "ผู้เข้าร่วมงานทั้งหมด"}</h2><p>{isNonFinalistView ? `แสดง ${filteredNonFinalistRows.length.toLocaleString("th-TH")} ทีม • แอดมินเลือกลงทะเบียนเข้าร่วมงานเอง` : `ทั้งหมด ${all.length.toLocaleString("th-TH")} รายการ`}</p></div><div className="admin-actions"><a className="secondary" href="/api/admin/participants/export/xlsx"><FileSpreadsheet/>Export Excel ผู้ลงทะเบียน</a><a className="primary" href="/api/admin/participants/export/xlsx?survey=completed"><FileSpreadsheet/>Export Excel ผู้ลงทะเบียน + ทำแบบสอบถามแล้ว</a><form action={sendParticipantQrReminderAction}><ConfirmSubmitButton className="primary" type="submit" message={`ยืนยันส่งอีเมล QR Code ให้ผู้ลงทะเบียนที่ยังไม่ยกเลิกและมีอีเมล ${reminderEligibleCount.toLocaleString("th-TH")} รายการ?`}><Mail/>ส่ง QR Code ให้ผู้ลงทะเบียน</ConfirmSubmitButton></form></div></header>
        <details className={`admin-edit-disclosure participant-create-disclosure ${isUciWorkspace ? "uci-walkin-disclosure" : ""}`}>
          <summary><UserPlus/><span className="participant-create-summary-copy"><strong>{isUciWorkspace ? "ลงทะเบียนผู้เข้าร่วมงานหน้างาน (Walk-in)" : "ลงทะเบียนผู้เข้าร่วมงานโดยแอดมิน"}</strong>{isUciWorkspace && <small>กรอกข้อมูลหน้างาน แล้วเช็คอินอัตโนมัติทันที</small>}</span></summary>
          <form action={createParticipantAction} className="admin-form admin-participant-detail-form participant-create-form">
            {isUciWorkspace && <input type="hidden" name="workspace" value="uci"/>}
            <div className="form-grid compact-grid">
              <label>คำนำหน้า<input name="title" required placeholder="เช่น นาย / พ.ต.อ."/></label>
              <label>ชื่อ<input name="firstName" required/></label>
              <label>นามสกุล<input name="lastName" required/></label>
              <label>อีเมล<input type="email" name="email" placeholder="เว้นว่างได้สำหรับลงทะเบียนหลังบ้าน"/></label>
              <label>Role ผู้เข้าร่วม<select name="participantRole" defaultValue="Guest">{(isUciWorkspace ? walkInParticipantRoles : participantRoles).map((role)=><option key={role} value={role}>{role}</option>)}</select></label>
              <label>เลขบัตรประชาชน<input name="citizenId" inputMode="numeric" pattern="\d{13}" maxLength={13} placeholder="เว้นว่างได้"/></label>
              <label>เบอร์ติดต่อ<input name="phone" inputMode="numeric" pattern="0[689]\d{8}" maxLength={10} placeholder="เว้นว่างได้"/></label>
              <label>ตำแหน่ง<input name="position" required/></label>
              <label>สังกัด / กองบังคับการ<input name="division" placeholder="เช่น กลุ่มงาน / ฝ่าย / กองบังคับการ หรือสังกัดผู้ประสานงาน" required/></label>
              <label>กองบัญชาการ / ชื่อหน่วยงาน / หน่วยจัดบูธ<input name="bureau" placeholder="ถ้าเป็น Exhibitor ให้ใส่หน่วยที่มากับบูธ เช่น สถาบันเทคโนโลยีป้องกันประเทศ" required/></label>
            </div>
            <button className="primary" type="submit"><UserPlus/>{isUciWorkspace ? "ลงทะเบียนและเช็คอินทันที" : "บันทึกผู้เข้าร่วมงาน"}</button>
          </form>
          <form action={bulkCreateParticipantsAction} className="admin-form participant-bulk-form">
            {isUciWorkspace && <input type="hidden" name="workspace" value="uci"/>}
            <div>
              <b><FileSpreadsheet/>Bulk Import Excel</b>
              <small>ใช้ไฟล์ .xlsx หรือ .csv คอลัมน์ คำนำหน้า, ชื่อ, นามสกุล, Role ผู้เข้าร่วม, ตำแหน่ง, สังกัด / กองบังคับการ, กองบัญชาการ / ชื่อหน่วยงาน / หน่วยจัดบูธ, อีเมล, เบอร์โทร ทุกช่องไม่บังคับ แต่อีเมล และชื่อ+นามสกุลห้ามซ้ำกับข้อมูลในระบบ{isUciWorkspace ? " และรายชื่อที่นำเข้าจะเช็คอินอัตโนมัติ" : ""}</small>
            </div>
            <label>ไฟล์รายชื่อ<input type="file" name="file" accept=".xlsx,.csv"/></label>
            <div className="participant-bulk-actions">
              <Link className="secondary" href="/api/admin/participants/bulk-template"><Download/>ดาวน์โหลดไฟล์ต้นแบบ</Link>
              <button className="secondary" type="submit"><FileSpreadsheet/>นำเข้ารายชื่อหลายคน</button>
            </div>
          </form>
        </details>
        <div className="participant-role-toolbar"><ParticipantRoleTabs activeRole={participantRole} activeTab={isNonFinalistView ? "non-finalists" : participantRole} basePath="/admin/participants" counts={participantRoleCounts} query={{ q, ...(isUciWorkspace ? { from: "uci" } : {}) }} additionalTabs={session.role === "super_admin" ? [{ role: "non-finalists", href: `/admin/participants?${new URLSearchParams({ ...(q ? { q } : {}), participantView: "non-finalists" }).toString()}`, label: "ผู้ประกวดไม่ติด 10 ทีม", count: nonFinalistRows.length.toLocaleString("th-TH") }] : []} /><Link className="secondary participant-role-export" href={participantExportHref(participantRole)}><FileText/>Export PDF {participantRole === "all" ? "ทั้งหมด" : participantRole}</Link></div>
        <form className="audit-filter-form" method="get">
          {isUciWorkspace && <input type="hidden" name="from" value="uci"/>}
          {isNonFinalistView && <input type="hidden" name="participantView" value="non-finalists"/>}
          {participantRole !== "all" && <input type="hidden" name="participantRole" value={participantRole}/>}
          <label className="audit-filter-search">ค้นหา<div><Search/><input name="q" defaultValue={q} placeholder={isNonFinalistView ? "ชื่อผู้ประกวด ชื่อทีม อีเมล หรือรหัสใบสมัคร" : "ชื่อ อีเมล เบอร์โทร เลขบัตร หรือรหัส REG"}/></div></label>
          <div className="audit-filter-actions"><button className="secondary" type="submit">ค้นหา</button><Link className="ghost-action" href={participantsClearHref(participantRole, isUciWorkspace ? "uci" : "", isNonFinalistView ? "non-finalists" : "")}>ล้าง</Link></div>
        </form>
        {isNonFinalistView ? <NonFinalistSubmissionPanel rows={filteredNonFinalistRows}/> : <form id="participants-bulk-form" action={bulkParticipantsAction} className="bulk-delete-form">
          <input type="hidden" name="returnTo" value={isUciWorkspace ? "/admin/participants?from=uci" : "/admin/participants"}/>
          {(canDeleteParticipants || canBulkCheckIn) && <div className="bulk-delete-bar">
            <ParticipantBulkSelection formId="participants-bulk-form" />
            <div className="bulk-participant-actions">
              {canBulkCheckIn && <ConfirmSubmitButton className="primary small-action" type="submit" name="bulkAction" value="checkin" message="ยืนยันเช็คอินผู้เข้าร่วมงานที่เลือก?"><CheckCircle2/>เช็คอินรายการที่เลือก</ConfirmSubmitButton>}
              {canDeleteParticipants && <ConfirmSubmitButton className="danger-btn small-action" type="submit" name="bulkAction" value="delete" message="ยืนยันลบผู้เข้าร่วมงานที่เลือก?"><Trash2/>ลบรายการที่เลือก</ConfirmSubmitButton>}
            </div>
          </div>}
          <div className="admin-table-wrap"><table className="admin-table compact-admin-table participants-manage-table"><thead><tr><th>รหัส</th><th>ผู้เข้าร่วมงาน</th><th>Role</th><th>ติดต่อ</th><th>หน่วยงาน</th><th>สถานะ</th><th></th></tr></thead><tbody>{items.length ? items.map((item) => <tr key={item.registration_code}>
            <td data-label="รหัส">{(canDeleteParticipants || canBulkCheckIn) ? <label className="row-check code-check"><input className="participant-row-checkbox" data-participant-checkbox type="checkbox" name="registrationCode" value={item.registration_code} aria-label={`เลือกรายการ ${item.registration_code}`}/><span><b>{item.registration_code}</b><small>{formatAdminDate(item.registered_at)}</small></span></label> : <span><b>{item.registration_code}</b><small>{formatAdminDate(item.registered_at)}</small></span>}</td>
            <td data-label="ผู้เข้าร่วมงาน">{item.title}{item.first_name} {item.last_name}<small>{item.citizen_id || "-"}</small></td>
            <td data-label="Role"><span className={`status-pill role-pill ${participantRoleClass(item.participant_role)}`}>{item.participant_role}</span></td>
            <td data-label="ติดต่อ">{item.email || "-"}<small>{item.phone}</small></td>
            <td data-label="หน่วยงาน / หน่วยจัดบูธ">{item.position}<small>{participantOrganizationText(item)}</small></td>
            <td data-label="สถานะ"><span className={`status-pill ${item.status}`}>{participantStatus(item.status)}</span>{item.checked_in_by_email && <small>สแกนโดย {item.checked_in_by_email}</small>}</td>
            <td data-label="การจัดการ"><Link className="secondary small-action" href={`/admin/participants/${encodeURIComponent(item.registration_code)}${isUciWorkspace ? "?from=uci" : ""}`}><Eye/>ดูข้อมูล</Link></td>
          </tr>) : <tr><td colSpan={7}>ไม่พบข้อมูล</td></tr>}</tbody></table></div>
        </form>}
        {!isNonFinalistView && <Pagination basePath="/admin/participants" q={q} role={participantRole} page={currentPage} totalPages={totalPages} from={isUciWorkspace ? "uci" : ""}/>}
      </section>
    </div>
  </div>;
}

type NonFinalistMember = {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  citizenId: string;
};

type NonFinalistSubmissionRow = {
  submissionCode: string;
  title: string;
  teamName: string;
  members: NonFinalistMember[];
  registeredCount: number;
};

async function loadNonFinalistSubmissionRows(participants: RegistrationRecord[]) {
  try {
    const [submissions, applicants, winners] = await Promise.all([
      listSubmissions(),
      listSubmissionApplicantsForExport(),
      listWinners(),
    ]);
    return buildNonFinalistSubmissionRows(submissions, applicants, winners, participants);
  } catch (error) {
    console.error("loading non-finalist participant candidates failed", error);
    return [];
  }
}

function buildNonFinalistSubmissionRows(
  submissions: SubmissionListItem[],
  applicants: SubmissionApplicantExportRow[],
  winners: WinnerRecord[],
  participants: RegistrationRecord[],
): NonFinalistSubmissionRow[] {
  const finalistCodes = new Set(
    buildAnnouncedFinalistSources(winners, submissions, applicants).map((item) => normalizeSubmissionCode(item.submission_code)),
  );
  const submissionsByCode = new Map(submissions.map((submission) => [normalizeSubmissionCode(submission.submission_code), submission]));
  const applicantsByCode = new Map<string, SubmissionApplicantExportRow[]>();
  for (const applicant of applicants) {
    const code = normalizeSubmissionCode(applicant.submission_code);
    if (!code || finalistCodes.has(code)) continue;
    const rows = applicantsByCode.get(code) ?? [];
    rows.push(applicant);
    applicantsByCode.set(code, rows);
  }

  return [...applicantsByCode.entries()]
    .map(([submissionCode, rows]) => {
      const submission = submissionsByCode.get(submissionCode);
      const members = [...rows]
        .sort((left, right) => left.member_order - right.member_order)
        .map((member) => ({
          name: `${member.title}${member.first_name} ${member.last_name}`.replace(/\s+/g, " ").trim(),
          firstName: String(member.first_name ?? "").trim(),
          lastName: String(member.last_name ?? "").trim(),
          email: String(member.email ?? "").trim(),
          citizenId: String(member.citizen_id ?? "").trim(),
        }));
      return {
        submissionCode: rows[0].submission_code,
        title: submission?.title_th || rows[0].title_th || "ไม่ระบุชื่อผลงาน",
        teamName: submission?.team_name || rows[0].team_name || "ไม่ระบุชื่อทีม",
        members,
        registeredCount: members.filter((member) => participants.some((participant) => participantMatchesMember(participant, member))).length,
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title, "th"));
}

function participantMatchesMember(participant: RegistrationRecord, member: NonFinalistMember) {
  const participantEmail = participant.email.trim().toLowerCase();
  const memberEmail = member.email.trim().toLowerCase();
  if (participantEmail && memberEmail && participantEmail === memberEmail) return true;
  if (participant.citizen_id.trim() && member.citizenId && participant.citizen_id.trim() === member.citizenId) return true;
  return participantNameKeyForMatch(participant.first_name, participant.last_name) !== ""
    && participantNameKeyForMatch(member.firstName, member.lastName) === participantNameKeyForMatch(participant.first_name, participant.last_name);
}

function participantNameKeyForMatch(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.replace(/\s+/g, " ").trim().toLocaleLowerCase("th-TH");
}

function normalizeSubmissionCode(value: string) {
  return String(value ?? "").replace(/\s+/g, "").trim().toUpperCase();
}

function NonFinalistSubmissionPanel({ rows }: { rows: NonFinalistSubmissionRow[] }) {
  return <div className="non-finalist-selection-panel">
    <div className="admin-section-head"><Users/><div><span className="eyebrow">Contestants</span><h3>ผู้ประกวดที่ไม่ติด 10 ทีมสุดท้าย</h3><p>เลือกเป็นรายทีม แล้วกดลงทะเบียนเพื่อเพิ่มสมาชิกทีมเข้าร่วมงาน ระบบยังไม่ลงทะเบียนให้อัตโนมัติ</p></div></div>
    <form id="non-finalists-bulk-form" action={registerNonFinalistSubmissionsAction} className="bulk-delete-form">
      <input type="hidden" name="returnTo" value="/admin/participants?participantView=non-finalists"/>
      <div className="bulk-delete-bar">
        <ParticipantBulkSelection formId="non-finalists-bulk-form" />
        <ConfirmSubmitButton className="primary small-action" type="submit" message="ยืนยันลงทะเบียนทีมที่เลือกเข้าร่วมงาน?">
          <UserPlus/>ลงทะเบียนทีมที่เลือก
        </ConfirmSubmitButton>
      </div>
      <div className="admin-table-wrap"><table className="admin-table compact-admin-table non-finalist-selection-table"><thead><tr><th>เลือก</th><th>ทีม / ผลงาน</th><th>สมาชิกทีม</th><th>สถานะ</th></tr></thead><tbody>{rows.length ? rows.map((row) => {
        const fullyRegistered = row.registeredCount >= row.members.length;
        return <tr key={row.submissionCode}>
          <td data-label="เลือก"><label className="row-check"><input data-participant-checkbox type="checkbox" name="submissionCode" value={row.submissionCode} disabled={fullyRegistered} aria-label={`เลือกทีม ${row.teamName}`}/><span>{fullyRegistered ? "ลงทะเบียนแล้ว" : "เลือกทีมนี้"}</span></label></td>
          <td data-label="ทีม / ผลงาน"><b>{row.teamName}</b><small>{row.title}</small><small>{row.submissionCode}</small></td>
          <td data-label="สมาชิกทีม">{row.members.map((member) => <span className="non-finalist-member" key={`${row.submissionCode}-${member.name}-${member.email}`}><b>{member.name}</b><small>{member.email || "ไม่ระบุอีเมล"}</small></span>)}</td>
          <td data-label="สถานะ"><span className={`status-pill ${fullyRegistered ? "attended" : row.registeredCount ? "registered" : "pending"}`}>{fullyRegistered ? "ลงทะเบียนแล้ว" : row.registeredCount ? `ลงทะเบียนแล้ว ${row.registeredCount}/${row.members.length} คน` : "ยังไม่ลงทะเบียน"}</span></td>
        </tr>;
      }) : <tr><td colSpan={4}>ไม่พบผู้ประกวดที่ไม่ติด 10 ทีมสุดท้าย</td></tr>}</tbody></table></div>
    </form>
  </div>;
}

async function registerNonFinalistSubmissionsAction(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");
  const returnTo = "/admin/participants?participantView=non-finalists";
  if (session.role !== "super_admin") redirect(participantErrorPath(returnTo, "เฉพาะ Super Admin เท่านั้นที่ลงทะเบียนผู้ประกวดเข้าร่วมงานได้"));
  const submissionCodes = [...new Set(formData.getAll("submissionCode").map(String).map(normalizeSubmissionCode).filter(Boolean))];
  if (!submissionCodes.length) redirect(participantErrorPath(returnTo, "กรุณาเลือกทีมที่ต้องการลงทะเบียนเข้าร่วมงานก่อน"));

  const requestHeaders = await headers();
  let registeredTeams = 0;
  let createdParticipants = 0;
  const skipped: string[] = [];
  for (const submissionCode of submissionCodes) {
    try {
      const result = await registerSubmissionAsParticipant(submissionCode);
      registeredTeams += 1;
      createdParticipants += result.createdCount;
    } catch (error) {
      console.error(`registering non-finalist submission ${submissionCode} failed`, error);
      skipped.push(submissionCode);
    }
  }
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "registration.created",
    entityType: "registration",
    entityId: "non-finalists",
    summary: `ลงทะเบียนผู้ประกวดที่เลือกเข้าร่วมงาน ${registeredTeams} ทีม`,
    payload: { submissionCodes, registeredTeams, createdParticipants, skipped },
  }, requestHeaders);
  revalidatePath("/admin");
  revalidatePath("/admin/participants");
  const successPath = adminNoticePath(returnTo, "non_finalists_registered");
  const [base, query = ""] = successPath.split("?");
  const params = new URLSearchParams(query);
  params.set("registeredTeams", String(registeredTeams));
  params.set("createdParticipants", String(createdParticipants));
  if (skipped.length) params.set("skipped", String(skipped.length));
  redirect(`${base}?${params.toString()}`);
}

async function bulkCreateParticipantsAction(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");
  const isUciWorkspace = session.role === "uci" || text(formData, "workspace") === "uci";
  const requestHeaders = await headers();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("กรุณาแนบไฟล์รายชื่อ");
  let rows: Awaited<ReturnType<typeof parseParticipantBulkFile>>;
  try {
    rows = await parseParticipantBulkFile(file);
  } catch (error) {
    redirect(participantBulkErrorPath(errorMessage(error)));
  }
  const emails = rows.map((row) => row.email).filter(Boolean);
  const [existingEmails, existingParticipants] = await Promise.all([
    findExistingUserEmails(emails),
    listParticipants(),
  ]);
  if (existingEmails.size) {
    redirect(participantBulkErrorPath(`อีเมลไม่สามารถซ้ำกับในฐานข้อมูลที่เคยสมัครแล้วได้ กรุณาตรวจสอบ: ${[...existingEmails].join(", ")}`));
  }

  const duplicateNamesInFile = findDuplicateParticipantNames(rows);
  if (duplicateNamesInFile.length) {
    redirect(participantBulkErrorPath(formatDuplicateParticipantNamesInFile("ชื่อและนามสกุลซ้ำกันในไฟล์เดียวกัน กรุณาตรวจสอบ", duplicateNamesInFile)));
  }

  const existingNameKeys = new Map<string, RegistrationRecord[]>();
  existingParticipants.forEach((participant) => {
    const key = participantNameKey(participant.first_name, participant.last_name);
    if (!key) return;
    existingNameKeys.set(key, [...(existingNameKeys.get(key) ?? []), participant]);
  });
  const existingDuplicateNames = findExistingParticipantNameMatches(rows, existingNameKeys);
  if (existingDuplicateNames.length) {
    redirect(participantBulkErrorPath(formatExistingParticipantNameMatches("ชื่อและนามสกุลตรงกับข้อมูลที่มีในระบบแล้ว ไม่สามารถนำเข้า bulk file ได้ กรุณาตรวจสอบ", existingDuplicateNames)));
  }
  const createdCodes: string[] = [];

  for (const row of rows) {
    const result = await createParticipant({
      email: row.email,
      provider: "local",
      participantRole: row.participantRole,
      title: row.title,
      firstName: row.firstName,
      lastName: row.lastName,
      citizenId: "",
      phone: row.phone,
      position: row.position,
      division: row.division,
      bureau: row.bureau,
    });
    createdCodes.push(result.record.registration_code);
  }

  if (isUciWorkspace) {
    for (const registrationCode of createdCodes) {
      await recordUciAutoCheckIn(registrationCode, isUciWorkspace, session, requestHeaders);
    }
  }

  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "registration.bulk_import.by_admin",
    entityType: "registration",
    summary: `นำเข้าผู้เข้าร่วมงานจากไฟล์ ${createdCodes.length.toLocaleString("th-TH")} รายการ`,
    payload: { total: createdCodes.length, registrationCodes: createdCodes },
  }, requestHeaders);
  revalidatePath("/admin");
  revalidatePath("/admin/participants");
  const returnPath = isUciWorkspace ? "/admin/participants?from=uci" : "/admin/participants";
  redirect(adminNoticePath(returnPath, isUciWorkspace ? "participants_imported_checked_in" : "participants_imported"));
}

async function createParticipantAction(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");
  const isUciWorkspace = session.role === "uci" || text(formData, "workspace") === "uci";
  const requestHeaders = await headers();
  const listPath = isUciWorkspace ? "/admin/participants?from=uci" : "/admin/participants";
  let successPath = "";

  try {
    const citizenId = text(formData, "citizenId");
    const phone = text(formData, "phone");
    const participantRole = text(formData, "participantRole") as ParticipantRole;
    if (citizenId && (!/^\d{13}$/.test(citizenId) || !isThaiCitizenId(citizenId))) throw new Error("หมายเลขบัตรประชาชนไม่ถูกต้อง");
    if (phone && !/^0[689]\d{8}$/.test(phone)) throw new Error("เบอร์ติดต่อไม่ถูกต้อง");
    const walkInWorkspace = text(formData, "workspace") === "uci";
    if (walkInWorkspace
      ? !walkInParticipantRoles.includes(participantRole as typeof walkInParticipantRoles[number])
      : !participantRoles.includes(participantRole)) throw new Error(walkInWorkspace ? "Role ผู้เข้าร่วม Walk-in ต้องเป็น Exhibitor หรือ Guest เท่านั้น" : "Role ผู้เข้าร่วมไม่ถูกต้อง");
    const result = await createParticipant({
      email: text(formData, "email"),
      provider: "local",
      participantRole,
      title: text(formData, "title"),
      firstName: text(formData, "firstName"),
      lastName: text(formData, "lastName"),
      citizenId,
      phone,
      position: text(formData, "position"),
      division: text(formData, "division"),
      bureau: text(formData, "bureau"),
    });
    let autoCheckedIn = false;
    let autoCheckInError = "";
    if (isUciWorkspace) {
      try {
        autoCheckedIn = Boolean(await recordUciAutoCheckIn(result.record.registration_code, true, session, requestHeaders));
      } catch (error) {
        console.error("UCI automatic check-in failed after participant registration", error);
        autoCheckInError = "ลงทะเบียนเรียบร้อยแล้ว แต่เช็คอินอัตโนมัติไม่สำเร็จ กรุณาเช็คอินรายการนี้จากหน้าเช็คอินอีกครั้ง";
      }
    }
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "registration.created.by_admin",
      entityType: "registration",
      entityId: result.record.registration_code,
      summary: `แอดมินลงทะเบียนผู้เข้าร่วมงาน ${result.record.registration_code}`,
      payload: { registrationCode: result.record.registration_code, emailStatus: result.emailStatus, autoCheckedIn },
    }, requestHeaders);
    revalidatePath("/admin");
    revalidatePath("/admin/participants");
    const returnPath = isUciWorkspace
      ? `/admin/participants/${encodeURIComponent(result.record.registration_code)}?from=uci`
      : `/admin/participants/${encodeURIComponent(result.record.registration_code)}`;
    successPath = autoCheckInError
      ? participantErrorPath(returnPath, autoCheckInError)
      : adminNoticePath(returnPath, autoCheckedIn ? "participant_created_checked_in" : "participant_created");
  } catch (error) {
    redirect(participantErrorPath(listPath, participantActionErrorMessage(error)));
  }
  redirect(successPath);
}

async function sendParticipantQrReminderAction() {
  "use server";
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");
  const requestHeaders = await headers();
  const participants = await listParticipants();
  const recipients = participants.filter((participant) => participant.status !== "cancelled" && isValidEmail(participant.email));
  const results = await mapWithConcurrency(recipients, (participant) => sendRegistrationReminder(participant), 4);
  const sent = results.filter((result) => result.status === "sent").length;
  const queued = results.filter((result) => result.status === "outbox").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const skipped = participants.length - recipients.length;
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "registration.qr_reminder_sent",
    entityType: "registration",
    entityId: "bulk",
    summary: `ส่งอีเมล QR Code แจ้งกำหนดการให้ผู้ลงทะเบียน ${sent + queued} รายการ`,
    payload: { total: participants.length, recipients: recipients.length, sent, queued, failed, skipped, eventDate: "2026-08-24", venue: "สโมสรตำรวจ" },
  }, requestHeaders);
  revalidatePath("/admin/participants");
  revalidatePath("/uci");
  redirect(`/admin/participants?notice=participant_qr_reminders_sent&sent=${sent}&queued=${queued}&failed=${failed}&skipped=${skipped}`);
}

async function recordUciAutoCheckIn(registrationCode: string, isUciWorkspace: boolean, session: NonNullable<ReturnType<typeof getAdminSession>>, requestHeaders: Headers) {
  if (!isUciWorkspace) return null;
  const checkedIn = await checkInParticipant(registrationCode, session.email);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "registration.checked_in",
    entityType: "registration",
    entityId: registrationCode,
    summary: `เช็คอินอัตโนมัติหลังลงทะเบียนผู้เข้าร่วมงาน ${registrationCode}`,
    payload: {
      registrationCode,
      checkedInByEmail: checkedIn.checked_in_by_email ?? session.email,
      checkedInAt: checkedIn.checked_in_at,
      wasAlreadyCheckedIn: Boolean(checkedIn.wasAlreadyCheckedIn),
      teamSubmissionCode: checkedIn.teamSubmissionCode,
      teamCheckInCount: checkedIn.teamCheckIns?.length ?? 0,
    },
  }, requestHeaders);
  return checkedIn;
}

async function bulkParticipantsAction(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");
  const action = String(formData.get("bulkAction") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "").trim() === "/admin/participants?from=uci"
    ? "/admin/participants?from=uci"
    : "/admin/participants";
  const codes = formData.getAll("registrationCode").map(String).filter(Boolean);
  if (action === "checkin") {
    if (!codes.length) redirect(adminNoticePath("/admin/participants", "participant_checkin_none_selected"));
    const requestHeaders = await headers();
    let checkedInCount = 0;
    let alreadyCheckedInCount = 0;
    let skippedCount = 0;
    for (const registrationCode of codes) {
      try {
        const result = await checkInParticipant(registrationCode, session.email);
        if (result.wasAlreadyCheckedIn) alreadyCheckedInCount += 1;
        else checkedInCount += 1;
      } catch {
        skippedCount += 1;
      }
    }
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "registration.bulk_checked_in",
      entityType: "registration",
      summary: `เช็คอินผู้เข้าร่วมงานหลายรายการ ${checkedInCount} รายการ`,
      payload: { registrationCodes: codes, checkedInCount, alreadyCheckedInCount, skippedCount },
    }, requestHeaders);
    revalidatePath("/admin");
    revalidatePath("/admin/participants");
    revalidatePath("/admin/scan");
    redirect(`${returnTo.split("?")[0]}?${new URLSearchParams({ ...(returnTo.includes("from=uci") ? { from: "uci" } : {}), notice: "participants_checked_in", checkedIn: String(checkedInCount), alreadyCheckedIn: String(alreadyCheckedInCount), checkInSkipped: String(skippedCount) }).toString()}`);
  }
  if (session.role === "uci") redirect(adminNoticePath("/admin/participants", "participant_delete_forbidden"));
  if (!codes.length) redirect(adminNoticePath("/admin/participants", "participant_none_selected"));
  const deleted = await deleteParticipants(codes);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "registration.bulk_deleted",
    entityType: "registration",
    summary: `ลบข้อมูลผู้เข้าร่วมงาน ${deleted} รายการ`,
    payload: { registrationCodes: codes },
  }, await headers());
  revalidatePath("/admin");
  revalidatePath("/admin/participants");
  redirect(adminNoticePath(returnTo, deleted > 1 ? "participants_deleted" : "participant_deleted"));
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function mapWithConcurrency<T, R>(items: T[], worker: (item: T) => Promise<R>, concurrency: number) {
  const results = Array<R | undefined>(items.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, () => run()));
  return results as R[];
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function Pagination({ basePath, q, role, page, totalPages, from }: { basePath: string; q: string; role: string; page: number; totalPages: number; from?: string }) {
  const href = (target: number) => `${basePath}?${new URLSearchParams({ ...(q ? { q } : {}), ...(role !== "all" ? { participantRole: role } : {}), ...(from ? { from } : {}), page: String(target) })}`;
  return <nav className="audit-pagination" aria-label="pagination">
    {page <= 1 ? <span className="disabled-action" aria-disabled="true">ก่อนหน้า</span> : <Link className="secondary" href={href(page - 1)}>ก่อนหน้า</Link>}
    <span>หน้า {page.toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}</span>
    {page >= totalPages ? <span className="disabled-action" aria-disabled="true">ถัดไป</span> : <Link className="secondary" href={href(page + 1)}>ถัดไป</Link>}
  </nav>;
}

function participantsClearHref(role: string, from = "", view = "") {
  const params = new URLSearchParams();
  if (role !== "all") params.set("participantRole", role);
  if (from) params.set("from", from);
  if (view) params.set("participantView", view);
  return params.toString() ? `/admin/participants?${params.toString()}` : "/admin/participants";
}

function participantExportHref(role: string) {
  return role === "all" ? "/api/admin/participants/export" : `/api/admin/participants/export?role=${encodeURIComponent(role)}`;
}

function participantBulkErrorPath(message: string) {
  return `/admin/participants?${new URLSearchParams({ error: message })}`;
}

function participantErrorPath(path: string, message: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("error", message);
  return `${base}?${params.toString()}`;
}

function participantActionErrorMessage(error: unknown) {
  const code = String((error as { code?: string })?.code ?? "");
  if (code === "DUPLICATE_NAME") return "ไม่สามารถลงทะเบียนได้: ชื่อและนามสกุลนี้มีอยู่ในระบบแล้ว";
  if (code === "DUPLICATE_CITIZEN_ID") return "ไม่สามารถลงทะเบียนได้: เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว";
  if (code === "ER_DUP_ENTRY") return "ไม่สามารถลงทะเบียนได้: ข้อมูลนี้มีอยู่ในระบบแล้ว กรุณาตรวจสอบชื่อ อีเมล หรือเลขบัตรประชาชน";
  if (error instanceof Error && ["หมายเลขบัตรประชาชนไม่ถูกต้อง", "เบอร์ติดต่อไม่ถูกต้อง", "Role ผู้เข้าร่วมไม่ถูกต้อง"].includes(error.message)) return error.message;
  return "ไม่สามารถลงทะเบียนผู้เข้าร่วมงานได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "ไม่สามารถนำเข้ารายชื่อได้ กรุณาตรวจสอบไฟล์อีกครั้ง";
}

type DuplicateNameInFile = {
  name: string;
  rows: number[];
};

type ExistingNameMatch = {
  importedName: string;
  rowNumber: number;
  existingName: string;
  registrationCode: string;
};

function findDuplicateParticipantNames(rows: Array<{ firstName: string; lastName: string }>) {
  const occurrences = new Map<string, DuplicateNameInFile>();
  rows.forEach((row, index) => {
    const key = participantNameKey(row.firstName, row.lastName);
    if (!key) return;
    const name = participantNameText(row.firstName, row.lastName);
    const current = occurrences.get(key);
    if (current) {
      current.rows.push(index + 2);
    } else {
      occurrences.set(key, { name, rows: [index + 2] });
    }
  });
  return [...occurrences.values()].filter((item) => item.rows.length > 1);
}

function findExistingParticipantNameMatches(
  rows: Array<{ firstName: string; lastName: string }>,
  existingNameKeys: Map<string, RegistrationRecord[]>,
) {
  const matches: ExistingNameMatch[] = [];
  rows.forEach((row, index) => {
    const key = participantNameKey(row.firstName, row.lastName);
    if (!key) return;
    const existing = existingNameKeys.get(key);
    if (!existing?.length) return;
    existing.forEach((participant) => {
      matches.push({
        importedName: participantNameText(row.firstName, row.lastName),
        rowNumber: index + 2,
        existingName: participantFullName(participant),
        registrationCode: participant.registration_code,
      });
    });
  });
  return matches;
}

function participantNameKey(firstName: string, lastName: string) {
  const first = normalizeParticipantNamePart(firstName);
  const last = normalizeParticipantNamePart(lastName);
  if (!first || !last) return "";
  return `${first}|${last}`;
}

function normalizeParticipantNamePart(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("th-TH");
}

function participantNameText(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
}

function participantFullName(participant: Pick<RegistrationRecord, "title" | "first_name" | "last_name">) {
  return `${participant.title}${participant.first_name} ${participant.last_name}`.replace(/\s+/g, " ").trim();
}

function formatDuplicateParticipantNamesInFile(prefix: string, duplicates: DuplicateNameInFile[]) {
  const visibleItems = duplicates.slice(0, 10).map((item) =>
    `${item.name} (แถว ${item.rows.map((row) => row.toLocaleString("th-TH")).join(", ")})`,
  );
  const remaining = duplicates.length - visibleItems.length;
  const suffix = remaining > 0 ? ` และอีก ${remaining.toLocaleString("th-TH")} รายชื่อ` : "";
  return `${prefix}: ${visibleItems.join(", ")}${suffix}`;
}

function formatExistingParticipantNameMatches(prefix: string, matches: ExistingNameMatch[]) {
  const visibleItems = matches.slice(0, 10).map((match) =>
    `แถวที่ ${match.rowNumber.toLocaleString("th-TH")} ${match.importedName} ตรงกับ ${match.registrationCode} ${match.existingName}`,
  );
  const remaining = matches.length - visibleItems.length;
  const suffix = remaining > 0 ? ` และอีก ${remaining.toLocaleString("th-TH")} รายการ` : "";
  return `${prefix}: ${visibleItems.join("; ")}${suffix}`;
}

function filterRecords<T>(records: T[], query: string, pickFields: (record: T) => Array<string | null | undefined>) {
  const needle = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (!needle) return records;
  return records.filter((record) => pickFields(record).some((value) => String(value ?? "").toLowerCase().includes(needle)));
}

function participantStatus(status: string) {
  if (status === "attended") return "เข้าร่วมงานแล้ว";
  if (status === "cancelled") return "ยกเลิก";
  return "ลงทะเบียนแล้ว";
}

function participantOrganizationText(item: { participant_role: string; division: string; bureau: string }) {
  const organization = [item.division, item.bureau].map((value) => value.trim()).filter(Boolean).join(" / ");
  if (item.participant_role !== "Exhibitor") return organization || "-";
  return item.bureau?.trim() ? `หน่วยจัดบูธ: ${item.bureau.trim()}` : organization || "-";
}

function formatAdminDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}
