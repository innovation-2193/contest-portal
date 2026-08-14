import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Download, Eye, FileSpreadsheet, Search, Trash2, UserPlus, Users } from "lucide-react";
import { AdminNotice } from "../../../components/AdminNotice";
import { BackButton } from "../../../components/BackButton";
import { ConfirmSubmitButton } from "../../../components/ConfirmSubmitButton";
import { buildParticipantRoleCounts, normalizeParticipantRoleFilter, ParticipantRoleTabs } from "../../../components/ParticipantRoleTabs";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { checkInParticipant, createParticipant, deleteParticipants, findExistingUserEmails, listParticipants } from "../../../lib/admin-store";
import { actorFromAdminSession, recordAuditEvent } from "../../../lib/audit-log";
import { adminNoticePath } from "../../../lib/admin-flash";
import { participantRoles, type ParticipantRole, type RegistrationRecord } from "../../../lib/local-registrations";
import { parseParticipantBulkFile } from "../../../lib/participant-bulk-import";
import { participantRoleClass } from "../../../lib/participant-role-style";
import { isThaiCitizenId } from "../../../lib/validation";

export const dynamic = "force-dynamic";

const pageSize = 20;

export default async function AdminParticipantsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; notice?: string; error?: string; participantRole?: string; from?: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");

  const params = await searchParams;
  const isUciWorkspace = session.role === "uci" || params.from === "uci";
  const q = (params.q ?? "").trim();
  const participantRole = normalizeParticipantRoleFilter(params.participantRole);
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const participants = await listParticipants();
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

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div><span className="eyebrow">{isUciWorkspace ? "UCI Participants" : "Participants"}</span><h1>ผู้เข้าร่วมงานทั้งหมด</h1><p>{isUciWorkspace ? "ลงทะเบียน Walk-in และดูแลผู้เข้าร่วมงานจากจุดปฏิบัติการ UCI" : "ค้นหาและเปิดดูข้อมูลผู้เข้าร่วมงานแบบแบ่งหน้า"}</p></div>
        <BackButton />
      </div>
      <AdminNotice code={params.notice} error={params.error}/>
      <section className={`admin-panel ${isUciWorkspace ? "uci-participants-panel" : ""}`}>
        <header className="admin-section-head"><Users/><div><span className="eyebrow">{isUciWorkspace ? "Participants" : "รายการ"}</span><h2>ผู้เข้าร่วมงานทั้งหมด</h2><p>ทั้งหมด {all.length.toLocaleString("th-TH")} รายการ</p></div></header>
        <details className={`admin-edit-disclosure participant-create-disclosure ${isUciWorkspace ? "uci-walkin-disclosure" : ""}`}>
          <summary><UserPlus/><span className="participant-create-summary-copy"><strong>{isUciWorkspace ? "ลงทะเบียนผู้เข้าร่วมงานหน้างาน (Walk-in)" : "ลงทะเบียนผู้เข้าร่วมงานโดยแอดมิน"}</strong>{isUciWorkspace && <small>กรอกข้อมูลหน้างาน แล้วเช็คอินอัตโนมัติทันที</small>}</span></summary>
          <form action={createParticipantAction} className="admin-form admin-participant-detail-form participant-create-form">
            {isUciWorkspace && <input type="hidden" name="workspace" value="uci"/>}
            <div className="form-grid compact-grid">
              <label>คำนำหน้า<input name="title" required placeholder="เช่น นาย / พ.ต.อ."/></label>
              <label>ชื่อ<input name="firstName" required/></label>
              <label>นามสกุล<input name="lastName" required/></label>
              <label>อีเมล<input type="email" name="email" placeholder="เว้นว่างได้สำหรับลงทะเบียนหลังบ้าน"/></label>
              <label>Role ผู้เข้าร่วม<select name="participantRole" defaultValue="Guest">{participantRoles.map((role)=><option key={role} value={role}>{role}</option>)}</select></label>
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
        <ParticipantRoleTabs activeRole={participantRole} basePath="/admin/participants" counts={participantRoleCounts} query={{ q, ...(isUciWorkspace ? { from: "uci" } : {}) }} />
        <form className="audit-filter-form" method="get">
          {isUciWorkspace && <input type="hidden" name="from" value="uci"/>}
          {participantRole !== "all" && <input type="hidden" name="participantRole" value={participantRole}/>}
          <label className="audit-filter-search">ค้นหา<div><Search/><input name="q" defaultValue={q} placeholder="ชื่อ อีเมล เบอร์โทร เลขบัตร หรือรหัส REG"/></div></label>
          <div className="audit-filter-actions"><button className="secondary" type="submit">ค้นหา</button><Link className="ghost-action" href={participantsClearHref(participantRole, isUciWorkspace ? "uci" : "")}>ล้าง</Link></div>
        </form>
        <form action={deleteParticipantsAction} className="bulk-delete-form">
          {canDeleteParticipants && <div className="bulk-delete-bar">
            <span>ติ๊ก checkbox หน้าแถวที่ต้องการลบ แล้วกดลบรายการที่เลือก</span>
            <ConfirmSubmitButton className="danger-btn small-action" type="submit" message="ยืนยันลบผู้เข้าร่วมงานที่เลือก?"><Trash2/>ลบรายการที่เลือก</ConfirmSubmitButton>
          </div>}
          <div className="admin-table-wrap"><table className="admin-table compact-admin-table participants-manage-table"><thead><tr><th>รหัส</th><th>ผู้เข้าร่วมงาน</th><th>Role</th><th>ติดต่อ</th><th>หน่วยงาน</th><th>สถานะ</th><th></th></tr></thead><tbody>{items.length ? items.map((item) => <tr key={item.registration_code}>
            <td data-label="รหัส">{canDeleteParticipants ? <label className="row-check code-check"><input type="checkbox" name="registrationCode" value={item.registration_code}/><span><b>{item.registration_code}</b><small>{formatAdminDate(item.registered_at)}</small></span></label> : <span><b>{item.registration_code}</b><small>{formatAdminDate(item.registered_at)}</small></span>}</td>
            <td data-label="ผู้เข้าร่วมงาน">{item.title}{item.first_name} {item.last_name}<small>{item.citizen_id || "-"}</small></td>
            <td data-label="Role"><span className={`status-pill role-pill ${participantRoleClass(item.participant_role)}`}>{item.participant_role}</span></td>
            <td data-label="ติดต่อ">{item.email || "-"}<small>{item.phone}</small></td>
            <td data-label="หน่วยงาน / หน่วยจัดบูธ">{item.position}<small>{participantOrganizationText(item)}</small></td>
            <td data-label="สถานะ"><span className={`status-pill ${item.status}`}>{participantStatus(item.status)}</span>{item.checked_in_by_email && <small>สแกนโดย {item.checked_in_by_email}</small>}</td>
            <td data-label="การจัดการ"><Link className="secondary small-action" href={`/admin/participants/${encodeURIComponent(item.registration_code)}${isUciWorkspace ? "?from=uci" : ""}`}><Eye/>ดูข้อมูล</Link></td>
          </tr>) : <tr><td colSpan={7}>ไม่พบข้อมูล</td></tr>}</tbody></table></div>
        </form>
        <Pagination basePath="/admin/participants" q={q} role={participantRole} page={currentPage} totalPages={totalPages} from={isUciWorkspace ? "uci" : ""}/>
      </section>
    </div>
  </div>;
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
    if (!participantRoles.includes(participantRole)) throw new Error("Role ผู้เข้าร่วมไม่ถูกต้อง");
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

async function deleteParticipantsAction(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");
  if (session.role === "uci") redirect(adminNoticePath("/admin/participants", "participant_delete_forbidden"));
  const codes = formData.getAll("registrationCode").map(String).filter(Boolean);
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
  redirect(adminNoticePath("/admin/participants", deleted > 1 ? "participants_deleted" : "participant_deleted"));
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function Pagination({ basePath, q, role, page, totalPages, from }: { basePath: string; q: string; role: string; page: number; totalPages: number; from?: string }) {
  const href = (target: number) => `${basePath}?${new URLSearchParams({ ...(q ? { q } : {}), ...(role !== "all" ? { participantRole: role } : {}), ...(from ? { from } : {}), page: String(target) })}`;
  return <nav className="audit-pagination" aria-label="pagination">
    {page <= 1 ? <span className="disabled-action" aria-disabled="true">ก่อนหน้า</span> : <Link className="secondary" href={href(page - 1)}>ก่อนหน้า</Link>}
    <span>หน้า {page.toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}</span>
    {page >= totalPages ? <span className="disabled-action" aria-disabled="true">ถัดไป</span> : <Link className="secondary" href={href(page + 1)}>ถัดไป</Link>}
  </nav>;
}

function participantsClearHref(role: string, from = "") {
  const params = new URLSearchParams();
  if (role !== "all") params.set("participantRole", role);
  if (from) params.set("from", from);
  return params.toString() ? `/admin/participants?${params.toString()}` : "/admin/participants";
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
