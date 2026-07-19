import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, Eye, Search, UserPlus } from "lucide-react";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { listAdminAccounts } from "../../../lib/admin-users";

export const dynamic = "force-dynamic";

const pageSize = 20;

export default async function AdminAccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") redirect("/admin");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const all = filterRecords(await listAdminAccounts(), q, (item) => [
    item.email,
    item.name,
    item.disabled ? "ปิดใช้งาน disabled" : "ใช้งาน active",
    item.passwordHash ? "ตั้งรหัสผ่านแล้ว" : "รอตั้งรหัสผ่าน",
  ]);
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const items = all.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div><span className="eyebrow">Admin Users</span><h1>แอดมินทั้งหมด</h1><p>ดูและเปิดหน้ารายละเอียดบัญชีแอดมินแบบแบ่งหน้า</p></div>
        <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
      </div>
      <section className="admin-panel">
        <header className="admin-section-head"><UserPlus/><div><h2>รายการแอดมิน</h2><p>ทั้งหมด {all.length.toLocaleString("th-TH")} รายการ</p></div></header>
        <form className="audit-filter-form" method="get">
          <label className="audit-filter-search">ค้นหา<div><Search/><input name="q" defaultValue={q} placeholder="ชื่อ อีเมล หรือสถานะ"/></div></label>
          <div className="audit-filter-actions"><button className="secondary" type="submit">ค้นหา</button><Link className="ghost-action" href="/admin/admins">ล้าง</Link></div>
        </form>
        <div className="admin-table-wrap"><table className="admin-table compact-admin-table"><thead><tr><th>อีเมล</th><th>ชื่อ</th><th>สถานะ</th><th>รหัสผ่าน</th><th>อัปเดตล่าสุด</th><th></th></tr></thead><tbody>{items.length ? items.map((admin) => <tr key={admin.id}>
          <td><b>{admin.email}</b><small>สร้างเมื่อ {formatAdminDate(admin.createdAt)}</small></td>
          <td>{admin.name || "-"}</td>
          <td><span className={`status-pill ${admin.disabled ? "cancelled" : "attended"}`}>{admin.disabled ? "ปิดใช้งาน" : "ใช้งานได้"}</span></td>
          <td><span className={`status-pill ${admin.passwordHash ? "attended" : "registered"}`}>{admin.passwordHash ? "ตั้งรหัสผ่านแล้ว" : "รอตั้งรหัสผ่าน"}</span></td>
          <td>{formatAdminDate(admin.updatedAt)}</td>
          <td><Link className="secondary small-action" href={`/admin/admins/${encodeURIComponent(admin.id)}`}><Eye/>ดูข้อมูล</Link></td>
        </tr>) : <tr><td colSpan={6}>ไม่พบข้อมูล</td></tr>}</tbody></table></div>
        <Pagination basePath="/admin/admins" q={q} page={currentPage} totalPages={totalPages}/>
      </section>
    </div>
  </div>;
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
