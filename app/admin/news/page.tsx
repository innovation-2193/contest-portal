import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Image as ImageIcon, Newspaper, Search } from "lucide-react";
import { ConfirmSubmitButton } from "../../../components/ConfirmSubmitButton";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { deleteNews, listNews } from "../../../lib/admin-store";
import { actorFromAdminSession, recordAuditEvent } from "../../../lib/audit-log";

export const dynamic = "force-dynamic";

const pageSize = 20;

export default async function AdminNewsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") redirect("/admin");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const all = filterRecords(await listNews(), q, (item) => [item.title, item.excerpt, item.body, item.publishAt]);
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const items = all.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div><span className="eyebrow">News</span><h1>ข่าวประชาสัมพันธ์ทั้งหมด</h1><p>Super Admin จัดการข่าวประชาสัมพันธ์แบบแบ่งหน้า</p></div>
        <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
      </div>
      <section className="admin-panel">
        <header className="admin-section-head"><Newspaper/><div><h2>รายการข่าว</h2><p>ทั้งหมด {all.length.toLocaleString("th-TH")} รายการ</p></div></header>
        <form className="audit-filter-form" method="get">
          <label className="audit-filter-search">ค้นหา<div><Search/><input name="q" defaultValue={q} placeholder="หัวข้อ ข้อความสรุป หรือเนื้อหา"/></div></label>
          <div className="audit-filter-actions"><button className="secondary" type="submit">ค้นหา</button><Link className="ghost-action" href="/admin/news">ล้าง</Link></div>
        </form>
        <div className="admin-news-list">{items.length ? items.map((item) => {
          const isLive = item.published && new Date(item.publishAt).getTime() <= Date.now();
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
        }) : <div className="participant-empty">ไม่พบข่าวประชาสัมพันธ์</div>}</div>
        <Pagination basePath="/admin/news" q={q} page={currentPage} totalPages={totalPages}/>
      </section>
    </div>
  </div>;
}

async function deleteNewsAction(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") redirect("/admin");
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
  revalidatePath("/admin/news");
  redirect("/admin/news");
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

function formatAdminDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}
