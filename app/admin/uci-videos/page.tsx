import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Pencil, Play, Trash2, Video } from "lucide-react";
import { AdminNotice } from "../../../components/AdminNotice";
import { ConfirmSubmitButton } from "../../../components/ConfirmSubmitButton";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { adminNoticePath } from "../../../lib/admin-flash";
import { actorFromAdminSession, recordAuditEvent } from "../../../lib/audit-log";
import { createUciVideo, deleteUciVideo, listUciVideos, updateUciVideo, youtubeThumbnailUrl } from "../../../lib/uci-videos";

export const dynamic = "force-dynamic";

export default async function AdminUciVideosPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const session = await requireSuperAdmin();
  const params = await searchParams;
  const videos = await listUciVideos();

  return <div className="admin-page"><div className="wide">
    <div className="admin-topline"><div><span className="eyebrow">UCI How-to Videos</span><h1>วิดีโอสอนการใช้งาน UCI</h1><p>เพิ่มชื่อคลิปและลิงก์ YouTube หรือ Google Drive เพื่อแสดงเป็น carousel ใต้ส่วน Check-in และ Lucky Draw ในหน้า /uci</p></div><Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link></div>
    <AdminNotice code={params.notice}/>
    <section className="admin-panel">
      <header className="admin-section-head"><Video/><div><h2>เพิ่มคลิปสอนการใช้งาน</h2><p>ระบบดึงภาพปกจาก YouTube ให้อัตโนมัติ หากเป็น Google Drive หรือดึงภาพไม่ได้ ให้อัปโหลดภาพปกเอง</p></div></header>
      <form action={createUciVideoAction} encType="multipart/form-data" className="admin-form uci-video-create-form"><label>ชื่อคลิป<input name="title" required maxLength={255} placeholder="เช่น วิธีสแกน QR Code เช็คอินผู้เข้าร่วมงาน"/></label><label>ลิงก์คลิป YouTube หรือ Google Drive<input type="url" name="url" required placeholder="https://drive.google.com/file/d/.../view"/></label><label>ภาพปก (ถ้ามี)<input type="file" name="thumbnail" accept="image/jpeg,image/png,image/webp,image/gif"/><small>รองรับ JPG, PNG, WEBP, GIF ไม่เกิน 8 MB</small></label><button className="primary" type="submit"><Video/>เพิ่มคลิปสอนการใช้งาน</button></form>
    </section>

    <section className="admin-panel">
      <header className="admin-section-head"><Play/><div><h2>รายการคลิปที่แสดงใน /uci</h2><p>{videos.length.toLocaleString("th-TH")} คลิป • จัดเรียงตามลำดับที่เพิ่ม</p></div></header>
      <div className="uci-video-admin-list">{videos.length ? videos.map((video) => <article className="uci-video-admin-card" key={video.id}>
        <div className="uci-video-admin-thumb">{thumbnailUrl(video) ? <img src={thumbnailUrl(video) ?? ""} alt=""/> : <Video/>}<span><Play fill="currentColor"/></span></div>
        <div className="uci-video-admin-copy"><h3>{video.title}</h3><a href={video.url} target="_blank" rel="noreferrer">{video.url}</a></div>
        <details className="uci-video-edit"><summary className="secondary"><Pencil/>แก้ไข</summary><form action={updateUciVideoAction} encType="multipart/form-data" className="admin-form"><input type="hidden" name="id" value={video.id}/><label>ชื่อคลิป<input name="title" defaultValue={video.title} required maxLength={255}/></label><label>ลิงก์ YouTube หรือ Google Drive<input type="url" name="url" defaultValue={video.url} required/></label><label>เปลี่ยนภาพปก (ถ้ามี)<input type="file" name="thumbnail" accept="image/jpeg,image/png,image/webp,image/gif"/><small>{video.thumbnailOriginalName ? `ภาพปกปัจจุบัน: ${video.thumbnailOriginalName}` : "YouTube จะใช้ภาพปกอัตโนมัติ หากมี"}</small></label><button className="primary" type="submit">บันทึก</button></form></details>
        <form action={deleteUciVideoAction}><input type="hidden" name="id" value={video.id}/><ConfirmSubmitButton className="danger-btn" type="submit" message="ยืนยันลบคลิปสอนการใช้งานนี้?"><Trash2/>ลบ</ConfirmSubmitButton></form>
      </article>) : <div className="participant-empty">ยังไม่มีคลิปสอนการใช้งาน</div>}</div>
    </section>
  </div></div>;
}

async function createUciVideoAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const video = await createUciVideo({ title: text(formData, "title"), url: text(formData, "url"), thumbnail: file(formData, "thumbnail") });
  await auditVideo(session, "uci_video.created", video.id, `เพิ่มคลิป UCI ${video.title}`);
  revalidatePath("/uci");
  revalidatePath("/admin/uci-videos");
  redirect(adminNoticePath("/admin/uci-videos", "uci_video_added"));
}

async function updateUciVideoAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const id = text(formData, "id");
  const video = await updateUciVideo(id, { title: text(formData, "title"), url: text(formData, "url"), thumbnail: file(formData, "thumbnail") });
  await auditVideo(session, "uci_video.updated", video.id, `แก้ไขคลิป UCI ${video.title}`);
  revalidatePath("/uci");
  revalidatePath("/admin/uci-videos");
  redirect(adminNoticePath("/admin/uci-videos", "uci_video_saved"));
}

async function deleteUciVideoAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdmin();
  const id = text(formData, "id");
  await deleteUciVideo(id);
  await auditVideo(session, "uci_video.deleted", id, "ลบคลิปสอนการใช้งาน UCI");
  revalidatePath("/uci");
  revalidatePath("/admin/uci-videos");
  redirect(adminNoticePath("/admin/uci-videos", "uci_video_deleted"));
}

async function requireSuperAdmin() {
  const session = getAdminSession((await cookies()).get(cookieName)?.value);
  if (!session || session.role !== "super_admin") redirect("/admin");
  return session;
}

async function auditVideo(session: Awaited<ReturnType<typeof requireSuperAdmin>>, action: "uci_video.created" | "uci_video.updated" | "uci_video.deleted", entityId: string, summary: string) {
  await recordAuditEvent({ actor: actorFromAdminSession(session), action, entityType: "uci_video", entityId, summary }, await headers());
}

function text(formData: FormData, name: string) { return String(formData.get(name) ?? "").replace(/\s+/g, " ").trim(); }

function file(formData: FormData, name: string) {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

function thumbnailUrl(video: { thumbnailName: string | null; url: string }) {
  return video.thumbnailName ? `/api/uci-video-images/${encodeURIComponent(video.thumbnailName)}` : youtubeThumbnailUrl(video.url);
}
