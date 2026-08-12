import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ArrowLeft, Download, Image as ImageIcon, LayoutGrid, Save, Users } from "lucide-react";
import { AdminNotice } from "../../../components/AdminNotice";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { actorFromAdminSession, recordAuditEvent } from "../../../lib/audit-log";
import { adminNoticePath } from "../../../lib/admin-flash";
import { listEventBoothSources, setEventBoothCount, updateEventBooth, type EventBoothSourceType } from "../../../lib/event-booths";

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

    <div className="booth-source-list">{sources.length ? sources.map((source) => <section className="admin-panel booth-source-card" key={`${source.sourceType}:${source.sourceKey}`}>
      <header className="booth-source-head"><div><span className={`status-pill ${source.sourceType === "finalist" ? "attended" : "registered"}`}>{source.sourceLabel}</span><h2>{source.organizationName}</h2><p>{source.sourceType === "finalist" ? source.defaultWorkTitle : `${source.contacts.length.toLocaleString("th-TH")} ผู้ติดต่อจากข้อมูลลงทะเบียน`}</p></div><form action={setBoothCountAction} className="booth-count-form"><input type="hidden" name="sourceType" value={source.sourceType}/><input type="hidden" name="sourceKey" value={source.sourceKey}/><label>จำนวนบูธ<input type="number" name="count" min="1" max="20" defaultValue={source.booths.length} required/></label><button className="secondary" type="submit"><LayoutGrid/>ปรับจำนวนบูธ</button></form></header>
      <div className="booth-edit-grid">{source.booths.map((booth) => <article className="booth-edit-card" key={booth.id}>
        <div className="booth-edit-title"><span>บูธที่ {booth.boothNumber.toLocaleString("th-TH")}</span>{booth.imageName && <img src={`/api/event-booth-images/${encodeURIComponent(booth.imageName)}`} alt="ภาพประกอบบูธ"/>}</div>
        <form action={updateBoothAction} encType="multipart/form-data" className="admin-form booth-edit-form"><input type="hidden" name="id" value={booth.id}/><label>ชื่อหน่วยงาน<input value={source.organizationName} readOnly/></label><label>ชื่อผลงานที่จัดบูธ<input name="workTitle" defaultValue={booth.workTitle} placeholder="ชื่อผลงานหรือชื่อบูธ" maxLength={500}/></label><label>ประเภทผลงาน<input name="workType" defaultValue={booth.workType} placeholder="เช่น เทคโนโลยีดิจิทัล / ความปลอดภัย" maxLength={255}/></label><label>ผู้ติดต่อหลัก<select name="contactKey" defaultValue={booth.contactKey}>{source.contacts.length ? source.contacts.map((contact) => <option key={contact.key} value={contact.key}>{contact.name}{contact.phone ? ` • ${contact.phone}` : ""}</option>) : <option value="">ไม่พบข้อมูลผู้ติดต่อ</option>}</select></label><label>รูปภาพประกอบ<input type="file" name="image" accept="image/jpeg,image/png"/><small>{booth.imageOriginalName ? `ไฟล์ปัจจุบัน: ${booth.imageOriginalName}` : "รองรับ JPG หรือ PNG ไม่เกิน 8 MB"}</small></label>{booth.imageName && <label className="inline-check"><input type="checkbox" name="removeImage"/> ลบรูปภาพปัจจุบัน</label>}<button className="primary" type="submit"><Save/>บันทึกรายละเอียดบูธ</button></form>
      </article>)}</div>
    </section>) : <section className="admin-panel participant-empty">ยังไม่มีผู้ลงทะเบียน Role Exhibitor หรือผลงานที่ประกาศผ่านการคัดเลือกรอบที่ 1</section>}</div>
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

async function updateBoothAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const booth = await updateEventBooth({ id: text(formData, "id"), workTitle: text(formData, "workTitle"), workType: text(formData, "workType"), contactKey: text(formData, "contactKey"), image: file(formData, "image"), removeImage: formData.get("removeImage") === "on", actorEmail: session.email });
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "event_booth.updated", entityType: "event_booth", entityId: booth.id, summary: `บันทึกรายละเอียดบูธ ${booth.organizationName} บูธที่ ${booth.boothNumber}` }, await headers());
  revalidatePath("/admin/booths"); revalidatePath("/uci");
  redirect(adminNoticePath("/admin/booths", "booth_saved"));
}

async function requireSuperAdmin() { const session = getAdminSession((await cookies()).get(cookieName)?.value); if (!session || session.role !== "super_admin") redirect("/admin"); return session; }
function text(formData: FormData, name: string) { return String(formData.get(name) ?? "").replace(/\s+/g, " ").trim(); }
function file(formData: FormData, name: string) { const value = formData.get(name); return value instanceof File && value.size > 0 ? value : null; }
