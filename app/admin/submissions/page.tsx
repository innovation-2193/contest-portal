import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Eye, Printer, Search, Settings, Trophy, UserCheck } from "lucide-react";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { listAdminAccounts } from "../../../lib/admin-users";
import { assignSubmissionReviewer, listSubmissions } from "../../../lib/admin-store";
import { actorFromAdminSession, recordAuditEvent } from "../../../lib/audit-log";

export const dynamic = "force-dynamic";

const pageSize = 20;

export default async function AdminSubmissionsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");

  const isSuperAdmin = session.role === "super_admin";
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const [submissions, admins] = await Promise.all([
    listSubmissions({ assignedAdminEmail: isSuperAdmin ? null : session.email }),
    isSuperAdmin ? listAdminAccounts() : Promise.resolve([]),
  ]);
  const activeAdmins = admins.filter((admin) => !admin.disabled);
  const all = filterRecords(submissions, q, (item) => [
    item.submission_code,
    item.email,
    item.title_th,
    item.team_name,
    item.first_name,
    item.last_name,
    item.position,
    item.division,
    item.bureau,
    item.status,
    item.review_assigned_admin_email,
  ]);
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const items = all.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div><span className="eyebrow">Submissions</span><h1>ผู้สมัครประกวดนวัตกรรมทั้งหมด</h1><p>{isSuperAdmin ? "ดูคะแนน Assign ผู้ตรวจ และเปิดรายละเอียดใบสมัครทั้งหมด" : "รายการที่ Super Admin assign ให้ตรวจรอบแรก"}</p></div>
        <div className="admin-actions"><a className="primary" href="/api/admin/scoreboard" target="_blank" rel="noreferrer"><Printer/>พิมพ์ Scoreboard PDF</a><Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link></div>
      </div>
      <section className="admin-panel">
        <header className="admin-section-head"><Settings/><div><h2>รายการใบสมัครประกวด</h2><p>ทั้งหมด {all.length.toLocaleString("th-TH")} รายการ</p></div></header>
        <form className="audit-filter-form" method="get">
          <label className="audit-filter-search">ค้นหา<div><Search/><input name="q" defaultValue={q} placeholder="ชื่อผลงาน ผู้สมัคร อีเมล รหัส SUB หรือผู้ตรวจ"/></div></label>
          <div className="audit-filter-actions"><button className="secondary" type="submit">ค้นหา</button><Link className="ghost-action" href="/admin/submissions">ล้าง</Link></div>
        </form>
        <div className="admin-table-wrap"><table className="admin-table compact-admin-table"><thead><tr><th>รหัส</th><th>ผลงาน</th><th>ผู้สมัคร</th><th>ผู้ตรวจ</th><th>คะแนน</th><th>สถานะ</th><th></th></tr></thead><tbody>{items.length ? items.map((item) => <tr key={item.submission_code}>
          <td><b>{item.submission_code}</b><small>{formatAdminDate(item.submitted_at)}</small></td>
          <td>{item.title_th}<small>{item.submission_type === "team" ? `ทีม ${item.team_name ?? "-"}` : "ส่งเดี่ยว"}</small></td>
          <td>{item.first_name} {item.last_name}<small>{item.email}</small></td>
          <td>{isSuperAdmin ? <AssignInlineForm submissionCode={item.submission_code} current={item.review_assigned_admin_email} admins={activeAdmins}/> : item.review_assigned_admin_email || "-"}</td>
          <td><span className={`status-pill ${item.review_total_score !== null && item.review_total_score !== undefined ? "attended" : "registered"}`}><Trophy/>{item.review_total_score ?? "-"}/100</span></td>
          <td>{reviewStatus(item)}</td>
          <td><div className="table-action-stack"><Link className="secondary small-action" href={`/admin/submissions/${encodeURIComponent(item.submission_code)}`}><Eye/>ดูข้อมูล</Link><a className="primary small-action" href={`/api/admin/submissions/${encodeURIComponent(item.submission_code)}/print`} target="_blank" rel="noreferrer"><Printer/>พิมพ์</a></div></td>
        </tr>) : <tr><td colSpan={7}>ไม่พบข้อมูล</td></tr>}</tbody></table></div>
        <Pagination basePath="/admin/submissions" q={q} page={currentPage} totalPages={totalPages}/>
      </section>
    </div>
  </div>;
}

function AssignInlineForm({ submissionCode, current, admins }: { submissionCode: string; current: string | null; admins: Awaited<ReturnType<typeof listAdminAccounts>> }) {
  return <form className="inline-assign-form" action={assignSubmissionAction}>
    <input type="hidden" name="submissionCode" value={submissionCode}/>
    <select name="adminEmail" defaultValue={current ?? ""}>
      <option value="">ยังไม่ assign</option>
      {admins.map((admin) => <option key={admin.id} value={admin.email}>{admin.name ? `${admin.name} • ${admin.email}` : admin.email}</option>)}
    </select>
    <button className="secondary small-action" type="submit"><UserCheck/>บันทึก</button>
  </form>;
}

async function assignSubmissionAction(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") redirect("/admin");
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
  revalidatePath("/admin/submissions");
  revalidatePath(`/admin/submissions/${encodeURIComponent(submissionCode)}`);
  redirect("/admin/submissions");
}

function Pagination({ basePath, q, page, totalPages }: { basePath: string; q: string; page: number; totalPages: number }) {
  const href = (target: number) => `${basePath}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(target) })}`;
  return <nav className="audit-pagination" aria-label="pagination">
    <Link className={page <= 1 ? "disabled-action" : "secondary"} href={href(Math.max(1, page - 1))}>ก่อนหน้า</Link>
    <span>หน้า {page.toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}</span>
    <Link className={page >= totalPages ? "disabled-action" : "secondary"} href={href(Math.min(totalPages, page + 1))}>ถัดไป</Link>
  </nav>;
}

function filterRecords<T>(records: T[], query: string, pickFields: (record: T) => Array<string | null | undefined>) {
  const needle = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (!needle) return records;
  return records.filter((record) => pickFields(record).some((value) => String(value ?? "").toLowerCase().includes(needle)));
}

function reviewStatus(item: Awaited<ReturnType<typeof listSubmissions>>[number]) {
  if (item.review_submitted_at) return <span className="status-pill attended">ส่งคะแนนแล้ว</span>;
  if (item.review_assigned_admin_email) return <span className="status-pill registered">รอตรวจ</span>;
  return <span className="status-pill cancelled">ยังไม่ assign</span>;
}

function formatAdminDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}
