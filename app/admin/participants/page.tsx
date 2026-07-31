import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Download, Eye, FileSpreadsheet, Search, Trash2, UserPlus, Users } from "lucide-react";
import { AdminNotice } from "../../../components/AdminNotice";
import { ConfirmSubmitButton } from "../../../components/ConfirmSubmitButton";
import { buildParticipantRoleCounts, normalizeParticipantRoleFilter, ParticipantRoleTabs } from "../../../components/ParticipantRoleTabs";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { createParticipant, deleteParticipants, listParticipants } from "../../../lib/admin-store";
import { actorFromAdminSession, recordAuditEvent } from "../../../lib/audit-log";
import { adminNoticePath } from "../../../lib/admin-flash";
import { participantRoles, type ParticipantRole } from "../../../lib/local-registrations";
import { parseParticipantBulkFile } from "../../../lib/participant-bulk-import";
import { participantRoleClass } from "../../../lib/participant-role-style";
import { isThaiCitizenId } from "../../../lib/validation";

export const dynamic = "force-dynamic";

const pageSize = 20;

export default async function AdminParticipantsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; notice?: string; participantRole?: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const participantRole = normalizeParticipantRoleFilter(params.participantRole);
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const participants = await listParticipants();
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
        <div><span className="eyebrow">Participants</span><h1>ผู้เข้าร่วมงานทั้งหมด</h1><p>ค้นหาและเปิดดูข้อมูลผู้เข้าร่วมงานแบบแบ่งหน้า</p></div>
        <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
      </div>
      <AdminNotice code={params.notice}/>
      <section className="admin-panel">
        <header className="admin-section-head"><Users/><div><h2>รายการผู้เข้าร่วมงาน</h2><p>ทั้งหมด {all.length.toLocaleString("th-TH")} รายการ</p></div></header>
        <details className="admin-edit-disclosure participant-create-disclosure">
          <summary><UserPlus/>ลงทะเบียนผู้เข้าร่วมงานโดยแอดมิน</summary>
          <form action={createParticipantAction} className="admin-form admin-participant-detail-form participant-create-form">
            <div className="form-grid compact-grid">
              <label>คำนำหน้า<input name="title" required placeholder="เช่น นาย / พ.ต.อ."/></label>
              <label>ชื่อ<input name="firstName" required/></label>
              <label>นามสกุล<input name="lastName" required/></label>
              <label>อีเมล<input type="email" name="email" placeholder="เว้นว่างได้สำหรับลงทะเบียนหลังบ้าน"/></label>
              <label>Role ผู้เข้าร่วม<select name="participantRole" defaultValue="Guest">{participantRoles.map((role)=><option key={role} value={role}>{role}</option>)}</select></label>
              <label>เลขบัตรประชาชน<input name="citizenId" inputMode="numeric" pattern="\d{13}" maxLength={13} required/></label>
              <label>เบอร์ติดต่อ<input name="phone" inputMode="numeric" pattern="0[689]\d{8}" maxLength={10} required/></label>
              <label>ตำแหน่ง<input name="position" required/></label>
              <label>สังกัด / กองบังคับการ<input name="division" placeholder="เช่น กลุ่มงาน / ฝ่าย / กองบังคับการ หรือสังกัดผู้ประสานงาน" required/></label>
              <label>กองบัญชาการ / ชื่อหน่วยงาน / หน่วยจัดบูธ<input name="bureau" placeholder="ถ้าเป็น Exhibitor ให้ใส่หน่วยที่มากับบูธ เช่น สถาบันเทคโนโลยีป้องกันประเทศ" required/></label>
            </div>
            <button className="primary" type="submit"><UserPlus/>บันทึกผู้เข้าร่วมงาน</button>
          </form>
          <form action={bulkCreateParticipantsAction} className="admin-form participant-bulk-form">
            <div>
              <b><FileSpreadsheet/>Bulk Import Excel</b>
              <small>ใช้ไฟล์ .xlsx หรือ .csv คอลัมน์ คำนำหน้า, ชื่อ, นามสกุล, Role ผู้เข้าร่วม, ตำแหน่ง, สังกัด / กองบังคับการ, กองบัญชาการ / ชื่อหน่วยงาน / หน่วยจัดบูธ ทุกช่องไม่บังคับ</small>
            </div>
            <label>ไฟล์รายชื่อ<input type="file" name="file" accept=".xlsx,.csv"/></label>
            <div className="participant-bulk-actions">
              <Link className="secondary" href="/api/admin/participants/bulk-template"><Download/>ดาวน์โหลดไฟล์ต้นแบบ</Link>
              <button className="secondary" type="submit"><FileSpreadsheet/>นำเข้ารายชื่อหลายคน</button>
            </div>
          </form>
        </details>
        <ParticipantRoleTabs activeRole={participantRole} basePath="/admin/participants" counts={participantRoleCounts} query={{ q }} />
        <form className="audit-filter-form" method="get">
          {participantRole !== "all" && <input type="hidden" name="participantRole" value={participantRole}/>}
          <label className="audit-filter-search">ค้นหา<div><Search/><input name="q" defaultValue={q} placeholder="ชื่อ อีเมล เบอร์โทร เลขบัตร หรือรหัส REG"/></div></label>
          <div className="audit-filter-actions"><button className="secondary" type="submit">ค้นหา</button><Link className="ghost-action" href={participantsClearHref(participantRole)}>ล้าง</Link></div>
        </form>
        <form action={deleteParticipantsAction} className="bulk-delete-form">
          <div className="bulk-delete-bar">
            <span>ติ๊ก checkbox หน้าแถวที่ต้องการลบ แล้วกดลบรายการที่เลือก</span>
            <ConfirmSubmitButton className="danger-btn small-action" type="submit" message="ยืนยันลบผู้เข้าร่วมงานที่เลือก?"><Trash2/>ลบรายการที่เลือก</ConfirmSubmitButton>
          </div>
          <div className="admin-table-wrap"><table className="admin-table compact-admin-table participants-manage-table"><thead><tr><th>รหัส</th><th>ผู้เข้าร่วมงาน</th><th>Role</th><th>ติดต่อ</th><th>หน่วยงาน</th><th>สถานะ</th><th></th></tr></thead><tbody>{items.length ? items.map((item) => <tr key={item.registration_code}>
            <td data-label="รหัส"><label className="row-check code-check"><input type="checkbox" name="registrationCode" value={item.registration_code}/><span><b>{item.registration_code}</b><small>{formatAdminDate(item.registered_at)}</small></span></label></td>
            <td data-label="ผู้เข้าร่วมงาน">{item.title}{item.first_name} {item.last_name}<small>{item.citizen_id || "-"}</small></td>
            <td data-label="Role"><span className={`status-pill role-pill ${participantRoleClass(item.participant_role)}`}>{item.participant_role}</span></td>
            <td data-label="ติดต่อ">{item.email || "-"}<small>{item.phone}</small></td>
            <td data-label="หน่วยงาน / หน่วยจัดบูธ">{item.position}<small>{participantOrganizationText(item)}</small></td>
            <td data-label="สถานะ"><span className={`status-pill ${item.status}`}>{participantStatus(item.status)}</span>{item.checked_in_by_email && <small>สแกนโดย {item.checked_in_by_email}</small>}</td>
            <td data-label="การจัดการ"><Link className="secondary small-action" href={`/admin/participants/${encodeURIComponent(item.registration_code)}`}><Eye/>ดูข้อมูล</Link></td>
          </tr>) : <tr><td colSpan={7}>ไม่พบข้อมูล</td></tr>}</tbody></table></div>
        </form>
        <Pagination basePath="/admin/participants" q={q} role={participantRole} page={currentPage} totalPages={totalPages}/>
      </section>
    </div>
  </div>;
}

async function bulkCreateParticipantsAction(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");
  const requestHeaders = await headers();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("กรุณาแนบไฟล์รายชื่อ");
  const rows = await parseParticipantBulkFile(file);
  const createdCodes: string[] = [];

  for (const row of rows) {
    const result = await createParticipant({
      email: "",
      provider: "local",
      participantRole: row.participantRole,
      title: row.title,
      firstName: row.firstName,
      lastName: row.lastName,
      citizenId: "",
      phone: "",
      position: row.position,
      division: row.division,
      bureau: row.bureau,
    });
    createdCodes.push(result.record.registration_code);
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
  redirect(adminNoticePath("/admin/participants", "participants_imported"));
}

async function createParticipantAction(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");
  const requestHeaders = await headers();
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
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "registration.created.by_admin",
    entityType: "registration",
    entityId: result.record.registration_code,
    summary: `แอดมินลงทะเบียนผู้เข้าร่วมงาน ${result.record.registration_code}`,
    payload: { registrationCode: result.record.registration_code, emailStatus: result.emailStatus },
  }, requestHeaders);
  revalidatePath("/admin");
  revalidatePath("/admin/participants");
  redirect(adminNoticePath(`/admin/participants/${encodeURIComponent(result.record.registration_code)}`, "participant_created"));
}

async function deleteParticipantsAction(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");
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

function Pagination({ basePath, q, role, page, totalPages }: { basePath: string; q: string; role: string; page: number; totalPages: number }) {
  const href = (target: number) => `${basePath}?${new URLSearchParams({ ...(q ? { q } : {}), ...(role !== "all" ? { participantRole: role } : {}), page: String(target) })}`;
  return <nav className="audit-pagination" aria-label="pagination">
    {page <= 1 ? <span className="disabled-action" aria-disabled="true">ก่อนหน้า</span> : <Link className="secondary" href={href(page - 1)}>ก่อนหน้า</Link>}
    <span>หน้า {page.toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}</span>
    {page >= totalPages ? <span className="disabled-action" aria-disabled="true">ถัดไป</span> : <Link className="secondary" href={href(page + 1)}>ถัดไป</Link>}
  </nav>;
}

function participantsClearHref(role: string) {
  if (role === "all") return "/admin/participants";
  return `/admin/participants?participantRole=${encodeURIComponent(role)}`;
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
