import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, Eye, Search, UserPlus } from "lucide-react";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { listAdminAccounts } from "../../../lib/admin-users";

export const dynamic = "force-dynamic";

const pageSize = 20;

type AdminPasswordFilter = "all" | "set" | "pending";

export default async function AdminAccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; passwordStatus?: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") redirect("/admin");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const passwordStatus = normalizePasswordFilter(params.passwordStatus);
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const searched = filterRecords(await listAdminAccounts(), q, (item) => [
    item.email,
    item.name,
    item.disabled ? "ปิดใช้งาน disabled" : "ใช้งาน active",
    item.passwordHash ? "ตั้งรหัสผ่านแล้ว" : "รอตั้งรหัสผ่าน",
  ]);
  const all = searched.filter((item) => {
    if (passwordStatus === "set") return Boolean(item.passwordHash);
    if (passwordStatus === "pending") return !item.passwordHash;
    return true;
  });
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
          <label>สถานะรหัสผ่าน<select name="passwordStatus" defaultValue={passwordStatus}>
            <option value="all">รหัสผ่านทั้งหมด</option>
            <option value="set">ตั้งรหัสผ่านแล้ว</option>
            <option value="pending">รอตั้งรหัสผ่าน</option>
          </select></label>
          <div className="audit-filter-actions"><button className="secondary" type="submit">ค้นหา</button><Link className="ghost-action" href="/admin/admins">ล้าง</Link></div>
        </form>
        <div className="admin-table-wrap"><table className="admin-table compact-admin-table"><thead><tr><th>อีเมล</th><th>ชื่อ</th><th>สถานะ</th><th>รหัสผ่าน</th><th>อัปเดตล่าสุด</th><th></th></tr></thead><tbody>{items.length ? items.map((admin) => <tr key={admin.id}>
          <td data-label="อีเมล"><b>{admin.email}</b><small>สร้างเมื่อ {formatAdminDate(admin.createdAt)}</small></td>
          <td data-label="ชื่อ">{admin.name || "-"}</td>
          <td data-label="สถานะ"><span className={`status-pill ${admin.disabled ? "cancelled" : "attended"}`}>{admin.disabled ? "ปิดใช้งาน" : "ใช้งานได้"}</span></td>
          <td data-label="รหัสผ่าน"><span className={`status-pill ${admin.passwordHash ? "attended" : "registered"}`}>{admin.passwordHash ? "ตั้งรหัสผ่านแล้ว" : "รอตั้งรหัสผ่าน"}</span></td>
          <td data-label="อัปเดตล่าสุด">{formatAdminDate(admin.updatedAt)}</td>
          <td data-label="การจัดการ"><Link className="secondary small-action" href={`/admin/admins/${encodeURIComponent(admin.id)}`}><Eye/>ดูข้อมูล</Link></td>
        </tr>) : <tr><td colSpan={6}>ไม่พบข้อมูล</td></tr>}</tbody></table></div>
        <Pagination basePath="/admin/admins" q={q} passwordStatus={passwordStatus} page={currentPage} totalPages={totalPages}/>
      </section>
    </div>
  </div>;
}

function Pagination({ basePath, q, passwordStatus, page, totalPages }: { basePath: string; q: string; passwordStatus: AdminPasswordFilter; page: number; totalPages: number }) {
  const href = (target: number) => `${basePath}?${new URLSearchParams({ ...(q ? { q } : {}), ...(passwordStatus !== "all" ? { passwordStatus } : {}), page: String(target) })}`;
  return <nav className="audit-pagination" aria-label="pagination">
    {page <= 1 ? <span className="disabled-action" aria-disabled="true">ก่อนหน้า</span> : <Link className="secondary" href={href(page - 1)}>ก่อนหน้า</Link>}
    <span>หน้า {page.toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}</span>
    {page >= totalPages ? <span className="disabled-action" aria-disabled="true">ถัดไป</span> : <Link className="secondary" href={href(page + 1)}>ถัดไป</Link>}
  </nav>;
}

function normalizePasswordFilter(value?: string): AdminPasswordFilter {
  return value === "set" || value === "pending" ? value : "all";
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
