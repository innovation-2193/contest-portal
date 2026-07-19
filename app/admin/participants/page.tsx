import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, Eye, Search, Users } from "lucide-react";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { listParticipants } from "../../../lib/admin-store";

export const dynamic = "force-dynamic";

const pageSize = 20;

export default async function AdminParticipantsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const all = filterRecords(await listParticipants(), q, (item) => [
    item.registration_code,
    item.email,
    item.citizen_id,
    item.phone,
    item.first_name,
    item.last_name,
    item.position,
    item.division,
    item.bureau,
    item.status,
  ]);
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const items = all.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div><span className="eyebrow">Participants</span><h1>ผู้เข้าร่วมงานทั้งหมด</h1><p>ค้นหาและเปิดดูข้อมูลผู้เข้าร่วมงานแบบแบ่งหน้า</p></div>
        <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
      </div>
      <section className="admin-panel">
        <header className="admin-section-head"><Users/><div><h2>รายการผู้เข้าร่วมงาน</h2><p>ทั้งหมด {all.length.toLocaleString("th-TH")} รายการ</p></div></header>
        <form className="audit-filter-form" method="get">
          <label className="audit-filter-search">ค้นหา<div><Search/><input name="q" defaultValue={q} placeholder="ชื่อ อีเมล เบอร์โทร เลขบัตร หรือรหัส REG"/></div></label>
          <div className="audit-filter-actions"><button className="secondary" type="submit">ค้นหา</button><Link className="ghost-action" href="/admin/participants">ล้าง</Link></div>
        </form>
        <div className="admin-table-wrap"><table className="admin-table compact-admin-table"><thead><tr><th>รหัส</th><th>ผู้เข้าร่วมงาน</th><th>ติดต่อ</th><th>หน่วยงาน</th><th>สถานะ</th><th></th></tr></thead><tbody>{items.length ? items.map((item) => <tr key={item.registration_code}>
          <td><b>{item.registration_code}</b><small>{formatAdminDate(item.registered_at)}</small></td>
          <td>{item.title}{item.first_name} {item.last_name}<small>{item.citizen_id}</small></td>
          <td>{item.email}<small>{item.phone}</small></td>
          <td>{item.position}<small>{item.division} / {item.bureau}</small></td>
          <td><span className={`status-pill ${item.status}`}>{participantStatus(item.status)}</span></td>
          <td><Link className="secondary small-action" href={`/admin/participants/${encodeURIComponent(item.registration_code)}`}><Eye/>ดูข้อมูล</Link></td>
        </tr>) : <tr><td colSpan={6}>ไม่พบข้อมูล</td></tr>}</tbody></table></div>
        <Pagination basePath="/admin/participants" q={q} page={currentPage} totalPages={totalPages}/>
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
