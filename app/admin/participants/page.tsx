import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Eye, Search, Trash2, Users } from "lucide-react";
import { AdminNotice } from "../../../components/AdminNotice";
import { ConfirmSubmitButton } from "../../../components/ConfirmSubmitButton";
import { buildParticipantRoleCounts, normalizeParticipantRoleFilter, ParticipantRoleTabs } from "../../../components/ParticipantRoleTabs";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { deleteParticipants, listParticipants } from "../../../lib/admin-store";
import { actorFromAdminSession, recordAuditEvent } from "../../../lib/audit-log";
import { adminNoticePath } from "../../../lib/admin-flash";
import { participantRoleClass } from "../../../lib/participant-role-style";

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
            <td><label className="row-check code-check"><input type="checkbox" name="registrationCode" value={item.registration_code}/><span><b>{item.registration_code}</b><small>{formatAdminDate(item.registered_at)}</small></span></label></td>
            <td>{item.title}{item.first_name} {item.last_name}<small>{item.citizen_id}</small></td>
            <td><span className={`status-pill role-pill ${participantRoleClass(item.participant_role)}`}>{item.participant_role}</span></td>
            <td>{item.email}<small>{item.phone}</small></td>
            <td>{item.position}<small>{item.division} / {item.bureau}</small></td>
            <td><span className={`status-pill ${item.status}`}>{participantStatus(item.status)}</span>{item.checked_in_by_email && <small>สแกนโดย {item.checked_in_by_email}</small>}</td>
            <td><Link className="secondary small-action" href={`/admin/participants/${encodeURIComponent(item.registration_code)}`}><Eye/>ดูข้อมูล</Link></td>
          </tr>) : <tr><td colSpan={7}>ไม่พบข้อมูล</td></tr>}</tbody></table></div>
        </form>
        <Pagination basePath="/admin/participants" q={q} role={participantRole} page={currentPage} totalPages={totalPages}/>
      </section>
    </div>
  </div>;
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

function Pagination({ basePath, q, role, page, totalPages }: { basePath: string; q: string; role: string; page: number; totalPages: number }) {
  const href = (target: number) => `${basePath}?${new URLSearchParams({ ...(q ? { q } : {}), ...(role !== "all" ? { participantRole: role } : {}), page: String(target) })}`;
  return <nav className="audit-pagination" aria-label="pagination">
    <Link className={page <= 1 ? "disabled-action" : "secondary"} href={href(Math.max(1, page - 1))}>ก่อนหน้า</Link>
    <span>หน้า {page.toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}</span>
    <Link className={page >= totalPages ? "disabled-action" : "secondary"} href={href(Math.min(totalPages, page + 1))}>ถัดไป</Link>
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

function formatAdminDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}
