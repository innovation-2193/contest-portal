import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ArrowLeft, Image as ImageIcon, Save } from "lucide-react";
import { AdminNotice } from "../../../../components/AdminNotice";
import { cookieName, getAdminSession } from "../../../../lib/admin-auth";
import { actorFromAdminSession, recordAuditEvent } from "../../../../lib/audit-log";
import { adminNoticePath } from "../../../../lib/admin-flash";
import { getEventBoothContext, updateEventBooth } from "../../../../lib/event-booths";

export const dynamic = "force-dynamic";

export default async function AdminBoothDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const session = await requireSuperAdmin();
  const { id } = await params;
  const query = await searchParams;
  const context = await getEventBoothContext(id, session.email);
  if (!context) notFound();
  const { booth, source } = context;

  return <div className="admin-page"><div className="wide booth-detail-page">
    <div className="admin-topline"><div><span className="eyebrow">Exhibition Booth Detail</span><h1>รายละเอียดบูธที่ {booth.boothNumber.toLocaleString("th-TH")}</h1><p>{source.organizationName}</p></div><Link className="secondary" href="/admin/booths"><ArrowLeft/>ย้อนกลับรายการบูธ</Link></div>
    <AdminNotice code={query.notice}/>
    <section className="admin-panel booth-detail-summary"><div><span className={`status-pill ${source.sourceType === "finalist" ? "attended" : "registered"}`}>{source.sourceLabel}</span><h2>{source.organizationName}</h2><p>บูธที่ {booth.boothNumber.toLocaleString("th-TH")} จากทั้งหมด {source.booths.length.toLocaleString("th-TH")} บูธของรายการนี้</p></div><div className="booth-detail-navigation">{source.booths.map((item) => <Link className={item.id === booth.id ? "active" : ""} key={item.id} href={`/admin/booths/${item.id}`}>บูธ {item.boothNumber.toLocaleString("th-TH")}</Link>)}</div></section>
    <section className="admin-panel booth-detail-editor"><header className="admin-section-head"><ImageIcon/><div><h2>ข้อมูลสำหรับแสดงผลและออกรายงาน</h2><p>แก้ไขชื่อผลงาน ประเภท ผู้ติดต่อ และรูปภาพของบูธนี้</p></div></header><div className="booth-detail-layout"><div className="booth-detail-image">{booth.imageName ? <img src={`/api/event-booth-images/${encodeURIComponent(booth.imageName)}`} alt={`ภาพประกอบ ${booth.workTitle || source.organizationName}`}/> : <div><ImageIcon/><b>ยังไม่มีรูปภาพประกอบ</b><span>อัปโหลด JPG หรือ PNG ในแบบฟอร์มด้านข้าง</span></div>}</div><form action={updateBoothAction} encType="multipart/form-data" className="admin-form booth-detail-form"><input type="hidden" name="id" value={booth.id}/><label>ชื่อหน่วยงาน<input value={source.organizationName} readOnly/></label><label>ชื่อผลงานที่จัดบูธ<input name="workTitle" defaultValue={booth.workTitle} placeholder="ชื่อผลงานหรือชื่อบูธ" maxLength={500}/></label><label>ประเภทผลงาน<input name="workType" defaultValue={booth.workType} placeholder="เช่น เทคโนโลยีดิจิทัล / ความปลอดภัย" maxLength={255}/></label><label>ผู้ติดต่อหลัก<select name="contactKey" defaultValue={booth.contactKey}>{source.contacts.length ? source.contacts.map((contact) => <option key={contact.key} value={contact.key}>{contact.name}{contact.phone ? ` • ${contact.phone}` : ""}</option>) : <option value="">ไม่พบข้อมูลผู้ติดต่อ</option>}</select></label><label>รูปภาพประกอบ<input type="file" name="image" accept="image/jpeg,image/png"/><small>{booth.imageOriginalName ? `ไฟล์ปัจจุบัน: ${booth.imageOriginalName}` : "รองรับ JPG หรือ PNG ไม่เกิน 8 MB"}</small></label>{booth.imageName && <label className="inline-check"><input type="checkbox" name="removeImage"/> ลบรูปภาพปัจจุบัน</label>}<button className="primary" type="submit"><Save/>บันทึกรายละเอียดบูธ</button></form></div></section>
  </div></div>;
}

async function updateBoothAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const booth = await updateEventBooth({ id: text(formData, "id"), workTitle: text(formData, "workTitle"), workType: text(formData, "workType"), contactKey: text(formData, "contactKey"), image: file(formData, "image"), removeImage: formData.get("removeImage") === "on", actorEmail: session.email });
  await recordAuditEvent({ actor: actorFromAdminSession(session), action: "event_booth.updated", entityType: "event_booth", entityId: booth.id, summary: `บันทึกรายละเอียดบูธ ${booth.organizationName} บูธที่ ${booth.boothNumber}` }, await headers());
  revalidatePath("/admin/booths"); revalidatePath(`/admin/booths/${booth.id}`); revalidatePath("/uci");
  redirect(adminNoticePath(`/admin/booths/${booth.id}`, "booth_saved"));
}

async function requireSuperAdmin() { const session = getAdminSession((await cookies()).get(cookieName)?.value); if (!session || session.role !== "super_admin") redirect("/admin"); return session; }
function text(formData: FormData, name: string) { return String(formData.get(name) ?? "").replace(/\s+/g, " ").trim(); }
function file(formData: FormData, name: string) { const value = formData.get(name); return value instanceof File && value.size > 0 ? value : null; }
