import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ArrowLeft, Download, Image as ImageIcon, LayoutGrid, Users } from "lucide-react";
import { AdminNotice } from "../../../components/AdminNotice";
import { BoothOrderEditor } from "../../../components/BoothOrderEditor";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { actorFromAdminSession, recordAuditEvent } from "../../../lib/audit-log";
import { adminNoticePath } from "../../../lib/admin-flash";
import { listEventBoothSources, reorderEventBoothSources, setEventBoothCount, type EventBoothSourceType } from "../../../lib/event-booths";

export const dynamic = "force-dynamic";

export default async function AdminBoothsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const session = await requireSuperAdmin();
  const params = await searchParams;
  const sources = await listEventBoothSources(session.email);
  const totalBooths = sources.reduce((sum, source) => sum + source.booths.length, 0);
  const exhibitorSources = sources.filter((source) => source.sourceType === "exhibitor").length;
  const finalistSources = sources.filter((source) => source.sourceType === "finalist").length;

  return <div className="admin-page"><div className="wide">
    <div className="admin-topline"><div><span className="eyebrow">Exhibition Booth Management</span><h1>จัดการข้อมูลบูธแสดงผลงาน</h1><p>จัดทำข้อมูลบูธจากผู้ลงทะเบียน Role Exhibitor และผลงานที่ประกาศผ่านการคัดเลือกรอบที่ 1</p></div><Link className="secondary" href="/admin"><ArrowLeft/>ย้อนกลับ</Link></div>
    <AdminNotice code={params.notice}/>
    <section className="admin-panel booth-management-summary"><header className="admin-section-head"><LayoutGrid/><div><h2>ภาพรวมบูธแสดงผลงาน</h2><p>ระบบเพิ่มแหล่งบูธใหม่ให้อัตโนมัติ และรองรับหลายบูธต่อหนึ่งหน่วยงาน</p></div><div className="admin-actions"><a className="primary" href="/api/admin/booths/report" target="_blank" rel="noreferrer"><Download/>Export PDF สำหรับผู้บังคับบัญชา</a></div></header><div className="evaluation-dashboard-summary"><div className="stat-panel"><Users/><b>{exhibitorSources.toLocaleString("th-TH")}</b><span>หน่วยงาน Exhibitor</span></div><div className="stat-panel"><LayoutGrid/><b>{finalistSources.toLocaleString("th-TH")}</b><span>ผลงานผ่านรอบแรก</span></div><div className="stat-panel"><ImageIcon/><b>{totalBooths.toLocaleString("th-TH")}</b><span>บูธทั้งหมด</span></div></div></section>

    <section className="admin-panel booth-list-panel"><header className="admin-section-head"><LayoutGrid/><div><h2>รายการหน่วยงานและบูธ</h2><p>ลากเพื่อปรับตำแหน่งบูธและกำหนดเลขลำดับเองได้ทันที</p></div></header>{sources.length ? <BoothOrderEditor sources={sources} saveAction={reorderBoothSourcesAction} setCountAction={setBoothCountAction}/> : <div className="participant-empty">ยังไม่มีผู้ลงทะเบียน Role Exhibitor หรือผลงานที่ประกาศผ่านการคัดเลือกรอบที่ 1</div>}</section>
  </div></div>;
}

async function setBoothCountAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const sourceType = text(formData, "sourceType") as EventBoothSourceType;
  const sourceKey = text(formData, "sourceKey");
  const count = Number(text(formData, "count"));
  if (!["exhibitor", "finalist"].includes(sourceType) || !sourceKey || !Number.isFinite(count)) throw new Error("ข้อมูลจำนวนบูธไม่ถูกต้อง");
  const savedCount = await setEventBoothCount({ sourceType, sourceKey, count, actorEmail: session.email });
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "event_booth.count_updated", entityType: "event_booth", entityId: sourceKey, summary: `ปรับจำนวนบูธเป็น ${savedCount} บูธ`, payload: { sourceType, sourceKey, count: savedCount } }, await headers());
  revalidatePath("/admin/booths"); revalidatePath("/uci");
  redirect(adminNoticePath("/admin/booths", "booth_count_saved"));
}

async function reorderBoothSourcesAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const order = text(formData, "order").split(",").filter(Boolean);
  if (!order.length) throw new Error("ไม่พบลำดับบูธที่ต้องการบันทึก");
  const savedOrder = await reorderEventBoothSources({ order, actorEmail: session.email });
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "event_booth.reordered", entityType: "event_booth", entityId: "sources", summary: `จัดเรียงตำแหน่งบูธ ${savedOrder.length} รายการ`, payload: { order: savedOrder } }, await headers());
  revalidatePath("/admin/booths"); revalidatePath("/uci");
  redirect(adminNoticePath("/admin/booths", "booth_order_saved"));
}

async function requireSuperAdmin() { const session = getAdminSession((await cookies()).get(cookieName)?.value); if (!session || session.role !== "super_admin") redirect("/admin"); return session; }
function text(formData: FormData, name: string) { return String(formData.get(name) ?? "").replace(/\s+/g, " ").trim(); }
