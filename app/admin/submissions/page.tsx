import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Eye, FileText, Hash, Mail, Printer, Search, Settings, Trophy, UserCheck } from "lucide-react";
import { AdminNotice } from "../../../components/AdminNotice";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { listAdminAccounts } from "../../../lib/admin-users";
import { assignSubmissionReviewer, getSubmissionDetail, listSubmissions, registerSubmissionAsParticipant } from "../../../lib/admin-store";
import { actorFromAdminSession, recordAuditEvent } from "../../../lib/audit-log";
import { adminNoticePath, adminNoticeReturnPath, safeAdminReturnPath } from "../../../lib/admin-flash";
import { sendSubmissionAssignmentEmail } from "../../../lib/submission-assignment-mail";
import { workCategoryLabel } from "../../../lib/work-categories";

export const dynamic = "force-dynamic";

const pageSize = 20;
type SubmissionSort = "oldest" | "newest";
type ReviewFilter = "all" | "unassigned" | "assigned" | "pending" | "scored";

export default async function AdminSubmissionsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; notice?: string; sort?: string; review?: string; reviewer?: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");

  const isSuperAdmin = session.role === "super_admin";
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const sort: SubmissionSort = params.sort === "newest" ? "newest" : "oldest";
  const review = normalizeReviewFilter(params.review);
  const reviewer = isSuperAdmin ? (params.reviewer ?? "").trim().toLowerCase() : "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const [submissions, admins] = await Promise.all([
    listSubmissions({ assignedAdminEmail: isSuperAdmin ? null : session.email }),
    isSuperAdmin ? listAdminAccounts() : Promise.resolve([]),
  ]);
  const activeAdmins = admins.filter((admin) => !admin.disabled);
  const all = sortSubmissions(
    filterByReviewer(
      filterByReviewStatus(
        filterRecords(submissions, q, (item) => [
          item.submission_code,
          item.email,
          item.title_th,
          item.team_name,
          item.first_name,
          item.last_name,
          item.position,
          item.division,
          item.bureau,
          workCategoryLabel(item.work_category),
          item.hashtags.join(" "),
          item.status,
          item.review_assigned_admin_email,
        ]),
        review,
      ),
      reviewer,
    ),
    sort,
  );
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const items = all.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const currentListPath = submissionListHref({ q, sort, review, reviewer, page: currentPage });

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div><span className="eyebrow">Submissions</span><h1>ผู้สมัครประกวดนวัตกรรมทั้งหมด</h1><p>{isSuperAdmin ? "ดูคะแนน Assign ผู้ตรวจเอกสาร และเปิดรายละเอียดใบสมัครทั้งหมด" : "รายการที่ Super Admin assign ให้ตรวจรอบแรก"}</p></div>
        <div className="admin-actions">
          {isSuperAdmin && <a className="primary" href="/api/admin/submissions/export"><FileText/>Export PDF รายชื่อผู้สมัคร</a>}
          {isSuperAdmin && <a className="secondary" href="/api/admin/submissions/review-score-form" target="_blank" rel="noreferrer"><FileText/>แบบฟอร์มให้คะแนนกรรมการ</a>}
          {isSuperAdmin && <a className="secondary" href="/api/admin/submissions/review-packets"><FileText/>ZIP PDF ทุกโครงการ</a>}
          {isSuperAdmin && <Link className="secondary" href="/progress2"><Eye/>สถานะตรวจ</Link>}
          <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
        </div>
      </div>
      <AdminNotice code={params.notice}/>
      <section className="admin-panel">
        <header className="admin-section-head"><Settings/><div><h2>รายการใบสมัครประกวด</h2><p>ทั้งหมด {all.length.toLocaleString("th-TH")} รายการ</p></div></header>
        <form className="audit-filter-form" method="get">
          <label className="audit-filter-search">ค้นหา<div><Search/><input name="q" defaultValue={q} placeholder="ชื่อผลงาน ผู้สมัคร อีเมล รหัส SUB หรือผู้ตรวจเอกสาร"/></div></label>
          <label>สถานะตรวจ<select name="review" defaultValue={review}>
            <option value="all">ทั้งหมด</option>
            <option value="unassigned">ยังไม่ assign</option>
            <option value="assigned">assign แล้ว</option>
            <option value="pending">รอตรวจ</option>
            <option value="scored">ส่งคะแนนแล้ว</option>
          </select></label>
          {isSuperAdmin && <label>ผู้ตรวจเอกสาร<select name="reviewer" defaultValue={reviewer}>
            <option value="">ผู้ตรวจเอกสารทั้งหมด</option>
            <option value="__unassigned">ยังไม่ assign</option>
            {activeAdmins.map((admin) => <option key={admin.id} value={admin.email.toLowerCase()}>{admin.name ? `${admin.name} • ${admin.email}` : admin.email}</option>)}
          </select></label>}
          <label>เรียงลำดับ<select name="sort" defaultValue={sort}>
            <option value="oldest">เก่าไปใหม่</option>
            <option value="newest">ใหม่ไปเก่า</option>
          </select></label>
          <div className="audit-filter-actions"><button className="secondary" type="submit">ค้นหา</button><Link className="ghost-action" href="/admin/submissions">ล้าง</Link></div>
        </form>
        <div className="admin-table-wrap"><table className="admin-table compact-admin-table submissions-admin-table"><thead><tr><th>ลำดับ</th><th>รหัส</th><th>ผลงาน</th><th>ผู้สมัคร</th><th>สายงาน</th><th>ผู้ตรวจเอกสาร</th><th>คะแนน</th><th>สถานะ</th><th></th></tr></thead><tbody>{items.length ? items.map((item, index) => <tr id={`submission-${item.submission_code}`} key={item.submission_code}>
          <td data-label="ลำดับ"><b>{((currentPage - 1) * pageSize + index + 1).toLocaleString("th-TH")}</b></td>
          <td data-label="รหัส"><b>{item.submission_code}</b><small>{formatAdminDate(item.submitted_at)}</small></td>
          <td data-label="ผลงาน">{item.title_th}<small>{item.submission_type === "team" ? `ทีม ${item.team_name ?? "-"}` : "ส่งเดี่ยว"}</small><HashtagPills tags={item.hashtags}/></td>
          <td data-label="ผู้สมัคร">{item.first_name} {item.last_name}<small>{item.email}</small></td>
          <td data-label="สายงาน"><Link className="status-pill work-category-pill work-category-link" href={`/admin/submissions/${encodeURIComponent(item.submission_code)}?edit=1#edit-submission`}>{workCategoryLabel(item.work_category)}</Link></td>
          <td data-label="ผู้ตรวจเอกสาร">{isSuperAdmin ? <AssignInlineForm submissionCode={item.submission_code} current={item.review_assigned_admin_email} admins={activeAdmins} returnTo={`${currentListPath}#submission-${item.submission_code}`}/> : item.review_assigned_admin_email || "-"}</td>
          <td data-label="คะแนน"><span className={`status-pill ${item.review_total_score !== null && item.review_total_score !== undefined ? "attended" : "registered"}`}><Trophy/>{item.review_total_score ?? "-"}/100</span></td>
          <td data-label="สถานะ">{reviewStatus(item)}</td>
          <td data-label="การจัดการ"><div className="table-action-stack">
            {isSuperAdmin && <form action={registerSubmissionParticipantAction}>
              <input type="hidden" name="submissionCode" value={item.submission_code}/>
              <button className="primary small-action" type="submit"><Mail/>ลงทะเบียน+ส่งเมล</button>
            </form>}
            <Link className="secondary small-action" href={`/admin/submissions/${encodeURIComponent(item.submission_code)}?edit=1#edit-submission`}><Eye/>ดู/แก้ไข</Link>
            <a className="secondary small-action" href={`/api/admin/submissions/${encodeURIComponent(item.submission_code)}/print`} target="_blank" rel="noreferrer"><Printer/>พิมพ์</a>
          </div></td>
        </tr>) : <tr><td colSpan={9}>ไม่พบข้อมูล</td></tr>}</tbody></table></div>
        <Pagination basePath="/admin/submissions" q={q} sort={sort} review={review} reviewer={reviewer} page={currentPage} totalPages={totalPages}/>
      </section>
    </div>
  </div>;
}

function AssignInlineForm({ submissionCode, current, admins, returnTo }: { submissionCode: string; current: string | null; admins: Awaited<ReturnType<typeof listAdminAccounts>>; returnTo: string }) {
  return <form className="inline-assign-form" action={assignSubmissionAction}>
    <input type="hidden" name="submissionCode" value={submissionCode}/>
    <input type="hidden" name="returnTo" value={returnTo}/>
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
  revalidatePath("/admin/submissions");
  revalidatePath(`/admin/submissions/${encodeURIComponent(submissionCode)}`);
  redirect(adminNoticeReturnPath(safeAdminReturnPath(formData.get("returnTo"), "/admin/submissions"), "assignment_saved"));
}

async function registerSubmissionParticipantAction(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") redirect("/admin");
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
  revalidatePath("/admin/submissions");
  revalidatePath("/daily-report");
  redirect(adminNoticePath("/admin/submissions", "competitor_registered"));
}

function Pagination({ basePath, q, sort, review, reviewer, page, totalPages }: { basePath: string; q: string; sort: SubmissionSort; review: ReviewFilter; reviewer: string; page: number; totalPages: number }) {
  const href = (target: number) => submissionListHref({ basePath, q, sort, review, reviewer, page: target });
  return <nav className="audit-pagination" aria-label="pagination">
    {page <= 1 ? <span className="disabled-action" aria-disabled="true">ก่อนหน้า</span> : <Link className="secondary" href={href(page - 1)}>ก่อนหน้า</Link>}
    <span>หน้า {page.toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}</span>
    {page >= totalPages ? <span className="disabled-action" aria-disabled="true">ถัดไป</span> : <Link className="secondary" href={href(page + 1)}>ถัดไป</Link>}
  </nav>;
}

function submissionListHref({ basePath = "/admin/submissions", q, sort, review, reviewer, page }: { basePath?: string; q: string; sort: SubmissionSort; review: ReviewFilter; reviewer: string; page: number }) {
  const params = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(review !== "all" ? { review } : {}),
    ...(reviewer ? { reviewer } : {}),
    ...(sort !== "oldest" ? { sort } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  });
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function filterRecords<T>(records: T[], query: string, pickFields: (record: T) => Array<string | null | undefined>) {
  const needle = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (!needle) return records;
  return records.filter((record) => pickFields(record).some((value) => String(value ?? "").toLowerCase().includes(needle)));
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

function filterByReviewer<T extends Awaited<ReturnType<typeof listSubmissions>>[number]>(records: T[], reviewer: string) {
  if (!reviewer) return records;
  if (reviewer === "__unassigned") return records.filter((item) => !item.review_assigned_admin_email);
  return records.filter((item) => item.review_assigned_admin_email?.toLowerCase() === reviewer);
}

function sortSubmissions<T extends Awaited<ReturnType<typeof listSubmissions>>[number]>(records: T[], sort: SubmissionSort) {
  return [...records].sort((a, b) => {
    const diff = new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
    return sort === "newest" ? -diff : diff;
  });
}

function reviewStatus(item: Awaited<ReturnType<typeof listSubmissions>>[number]) {
  if (item.review_submitted_at) return <span className="status-pill attended">ส่งคะแนนแล้ว</span>;
  if (item.review_assigned_admin_email) return <span className="status-pill registered">รอตรวจ</span>;
  return <span className="status-pill cancelled">ยังไม่ assign</span>;
}

function HashtagPills({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return <span className="admin-hashtag-list" aria-label="Hashtags"><Hash aria-hidden="true"/>{tags.map((tag) => <em key={tag}>#{tag}</em>)}</span>;
}

function formatAdminDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}
