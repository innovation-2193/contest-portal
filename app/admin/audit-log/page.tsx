import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardList, Filter, Search, ShieldCheck, X } from "lucide-react";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { listAuditEvents, type AuditActor } from "../../../lib/audit-log";

export const dynamic = "force-dynamic";

const pageSize = 20;
const actorFilterValues = ["", "public", "admin_any", "admin", "super_admin"] as const;

type ActorFilter = typeof actorFilterValues[number];

type AuditLogSearchParams = {
  page?: string;
  action?: string;
  actor?: string;
  q?: string;
  from?: string;
  to?: string;
};

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<AuditLogSearchParams> }) {
  const session = await requireSuperAdmin();
  const params = await searchParams;
  const currentPage = Math.max(Number(params.page ?? 1) || 1, 1);
  const filters = normalizeFilters(params);
  const result = await listAuditEvents({
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
    action: filters.action,
    actorType: filters.actor || undefined,
    query: filters.q,
    from: filters.from,
    to: filters.to,
  });
  const totalPages = Math.max(Math.ceil(result.total / pageSize), 1);
  const safePage = Math.min(currentPage, totalPages);
  const pageHref = (page: number) => auditLogHref({ ...filters, page });

  if (safePage !== currentPage) redirect(pageHref(safePage));

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div>
          <span className="eyebrow">Audit Log</span>
          <h1>ประวัติการลงทะเบียนและสมัครประกวด</h1>
          <p>แสดงเฉพาะรายการลงทะเบียนเข้าร่วมงานและสมัครประกวดนวัตกรรม ย้อนหลังได้ไม่เกิน 90 วัน</p>
          <small className="admin-role-badge"><ShieldCheck/>Super Admin • {session.email}</small>
        </div>
        <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
      </div>

      <section className="admin-panel">
        <header className="admin-section-head">
          <ClipboardList/>
          <div>
            <h2>รายการทั้งหมด</h2>
            <p>พบทั้งหมด {result.total.toLocaleString("th-TH")} รายการ • หน้า {safePage.toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}</p>
          </div>
        </header>

        <form className="audit-filter-form" method="get">
          <label>ประเภท
            <select name="action" defaultValue={filters.action}>
              <option value="">ทั้งหมด</option>
              <option value="registration.created">ลงทะเบียนใหม่</option>
              <option value="registration.checked_in">เช็คอินหน้างาน</option>
              <option value="registration.updated">แก้ไขข้อมูลผู้เข้าร่วม</option>
              <option value="registration.deleted">ลบข้อมูลผู้เข้าร่วม</option>
              <option value="submission.created">สมัครประกวดนวัตกรรม</option>
              <option value="submission.updated">แก้ไขใบสมัครประกวด</option>
            </select>
          </label>
          <label>ผู้ทำรายการ
            <select name="actor" defaultValue={filters.actor}>
              <option value="">ทั้งหมด</option>
              <option value="public">ผู้ใช้งานหน้าเว็บ</option>
              <option value="admin_any">Admin / Super Admin</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </label>
          <label>ตั้งแต่วันที่<input type="date" name="from" defaultValue={filters.from}/></label>
          <label>ถึงวันที่<input type="date" name="to" defaultValue={filters.to}/></label>
          <label className="audit-filter-search">ค้นหา
            <input name="q" defaultValue={filters.q} placeholder="ค้นชื่อ อีเมล รหัส REG/SUB หรือข้อความ"/>
          </label>
          <div className="audit-filter-actions">
            <button className="primary" type="submit"><Search/>ค้นหา</button>
            <Link className="secondary" href="/admin/audit-log"><X/>ล้างตัวกรอง</Link>
          </div>
          <p><Filter/>ดูย้อนหลังได้ไม่เกิน 90 วัน ระบบจะแสดงเฉพาะรายการลงทะเบียนและใบสมัครประกวด</p>
        </form>

        <div className="audit-log-list">
          {result.events.length ? result.events.map((event) => <article className="audit-log-row audit-log-row-full" key={event.id}>
            <time>{formatAuditDate(event.createdAt)}</time>
            <div>
              <b>{event.summary}</b>
              <small>{auditActionLabel(event.action)} • {event.entityId || "-"}</small>
            </div>
            <span>{actorLabel(event.actor)}</span>
            <small>{auditEntityLabel(event.entityType)}</small>
          </article>) : <div className="participant-empty">ยังไม่มี log การลงทะเบียนหรือสมัครประกวดใน 90 วันที่ผ่านมา</div>}
        </div>

        <nav className="audit-pagination" aria-label="Audit log pagination">
          <PaginationLink href={pageHref(safePage - 1)} disabled={safePage <= 1} label="ก่อนหน้า" icon="prev"/>
          <span>หน้า {safePage.toLocaleString("th-TH")} จาก {totalPages.toLocaleString("th-TH")}</span>
          <PaginationLink href={pageHref(safePage + 1)} disabled={safePage >= totalPages} label="ถัดไป" icon="next"/>
        </nav>
      </section>
    </div>
  </div>;
}

function PaginationLink({ href, disabled, label, icon }: { href: string; disabled: boolean; label: string; icon: "prev" | "next" }) {
  const content = <>{icon === "prev" && <ChevronLeft/>}{label}{icon === "next" && <ChevronRight/>}</>;
  if (disabled) return <span className="secondary disabled-action">{content}</span>;
  return <Link className="secondary" href={href}>{content}</Link>;
}

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") redirect("/admin");
  return session;
}

function actorLabel(actor: AuditActor) {
  if (actor.type === "admin" && actor.email) return `Admin • ${actor.email}`;
  if (actor.type === "super_admin" && actor.email) return `Super Admin • ${actor.email}`;
  if (actor.type === "public" && actor.email) return `ผู้ใช้ • ${actor.email}`;
  if (actor.email) return actor.email;
  if (actor.type === "public") return "ผู้ใช้งานหน้าเว็บ";
  if (actor.type === "system") return "ระบบ";
  return actor.type === "super_admin" ? "Super Admin" : "Admin";
}

function auditActionLabel(action: string) {
  if (action === "registration.created") return "ลงทะเบียนเข้าร่วมงาน";
  if (action === "registration.updated") return "แก้ไขข้อมูลผู้เข้าร่วม";
  if (action === "registration.deleted") return "ลบข้อมูลผู้เข้าร่วม";
  if (action === "registration.checked_in") return "เช็คอินหน้างาน";
  if (action === "submission.created") return "สมัครประกวดนวัตกรรม";
  if (action === "submission.updated") return "แก้ไขใบสมัครประกวด";
  return action;
}

function auditEntityLabel(entityType: string) {
  if (entityType === "registration") return "ลงทะเบียน";
  if (entityType === "submission") return "ใบสมัคร";
  return entityType;
}

function normalizeFilters(params: AuditLogSearchParams) {
  const action = sanitize(params.action);
  const actor = actorFilter(params.actor);
  return {
    action,
    actor,
    q: sanitize(params.q),
    from: dateInput(params.from),
    to: dateInput(params.to),
  };
}

function actorFilter(value?: string): ActorFilter {
  const clean = sanitize(value);
  return actorFilterValues.includes(clean as ActorFilter) ? clean as ActorFilter : "";
}

function auditLogHref(filters: ReturnType<typeof normalizeFilters> & { page: number }) {
  const params = new URLSearchParams();
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.action) params.set("action", filters.action);
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.q) params.set("q", filters.q);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const query = params.toString();
  return query ? `/admin/audit-log?${query}` : "/admin/audit-log";
}

function sanitize(value?: string) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function dateInput(value?: string) {
  const clean = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : "";
}

function formatAuditDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}
