import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Download, Paperclip, Pencil, Save } from "lucide-react";
import { AdminNotice } from "../../../../components/AdminNotice";
import { BackButton } from "../../../../components/BackButton";
import { cookieName, getAdminSession } from "../../../../lib/admin-auth";
import { adminNoticePath } from "../../../../lib/admin-flash";
import { actorFromAdminSession, recordAuditEvent } from "../../../../lib/audit-log";
import { listNews, updateNews } from "../../../../lib/admin-store";
import { formatThaiDateTimeInput, thaiLocalDateTimeToIso } from "../../../../lib/thai-time";

export const dynamic = "force-dynamic";

type EditNewsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
};

export default async function EditNewsPage({ params, searchParams }: EditNewsPageProps) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") redirect("/admin");

  const { id } = await params;
  const item = (await listNews()).find((news) => news.id === id);
  if (!item) notFound();
  const noticeParams = await searchParams;

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div><span className="eyebrow">News Editor</span><h1>แก้ไขข่าวประชาสัมพันธ์</h1><p>แก้ไขรายละเอียดข่าว รูปภาพ และไฟล์แนบสำหรับเผยแพร่บนเว็บไซต์</p></div>
        <BackButton fallbackHref="/admin/news" />
      </div>
      <AdminNotice code={noticeParams.notice}/>
      <section className="admin-panel">
        <header className="admin-section-head"><Pencil/><div><h2>{item.title}</h2><p>แก้ไขข่าวรายการนี้แล้วกดบันทึกเพื่ออัปเดตหน้าเว็บไซต์</p></div></header>
        <form action={updateNewsAction} className="admin-form news-form">
          <input type="hidden" name="id" value={item.id}/>
          <label className="field-wide">ภาพข่าว (เลือกไฟล์ใหม่เมื่อต้องการเปลี่ยน)<input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif"/><small>{item.imageOriginalName ? `ไฟล์ปัจจุบัน: ${item.imageOriginalName}` : "ยังไม่มีรูปภาพข่าว"}</small></label>
          <label className="field-wide news-attachment-field"><span><Paperclip/>ไฟล์แนบข่าว / รายชื่อผู้ผ่านการประกวด</span><input type="file" name="attachment" accept=".pdf,.xlsx,.xls,.docx,.doc,.csv"/><small>{item.attachmentOriginalName ? `ไฟล์ปัจจุบัน: ${item.attachmentOriginalName} • เลือกไฟล์ใหม่เพื่อแทนที่` : "ยังไม่มีไฟล์แนบ • แนบ PDF, Excel, Word หรือ CSV ขนาดไม่เกิน 20 MB"}</small>{item.attachmentName && <a href={`/api/news-attachments/${encodeURIComponent(item.attachmentName)}`} download><Download/>ดาวน์โหลดไฟล์แนบเดิม</a>}</label>
          {item.attachmentName && <label className="inline-check"><input type="checkbox" name="removeAttachment"/> ลบไฟล์แนบเดิม</label>}
          <label>วันที่ต้องการโพสต์ (GMT+7)<input type="datetime-local" name="publishAt" defaultValue={formatThaiDateTimeInput(item.publishAt)}/></label>
          <label className="field-wide">หัวข้อข่าว<input name="title" defaultValue={item.title} placeholder="หัวข้อข่าว" required maxLength={255}/></label>
          <label className="field-wide">ข้อความสรุป<input name="excerpt" defaultValue={item.excerpt} placeholder="ข้อความสั้นสำหรับแสดงบนการ์ดข่าว (เว้นว่างได้)" maxLength={500}/></label>
          <label className="field-wide">เนื้อหา<textarea name="body" defaultValue={item.body} placeholder="รายละเอียดข่าวประชาสัมพันธ์ (เว้นว่างได้)" rows={8}/></label>
          <label className="inline-check"><input type="checkbox" name="published" defaultChecked={item.published}/> เผยแพร่เมื่อถึงวันที่กำหนด</label>
          <button className="primary" type="submit"><Save/>บันทึกการแก้ไข</button>
        </form>
      </section>
    </div>
  </div>;
}

async function updateNewsAction(formData: FormData) {
  "use server";
  const session = await getAdminSessionFromCookies();
  const requestHeaders = await headers();
  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const publishAtInput = String(formData.get("publishAt") ?? "").trim();
  const publishAt = publishAtInput ? thaiLocalDateTimeToIso(publishAtInput) : undefined;
  if (!id || !title || (publishAtInput && !publishAt)) throw new Error("กรุณากรอกหัวข้อข่าว และระบุเวลาเป็น GMT+7");

  const updatedNews = await updateNews(id, {
    title,
    excerpt,
    body,
    publishAt,
    published: formData.get("published") === "on",
    image: formData.get("image") as File | null,
    attachment: formData.get("attachment") as File | null,
    removeAttachment: formData.get("removeAttachment") === "on",
  });
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "news.updated",
    entityType: "news",
    entityId: id,
    summary: `แก้ไขข่าวประชาสัมพันธ์ ${title}`,
    payload: { publishAt: updatedNews.publishAt, attachmentName: updatedNews.attachmentName },
  }, requestHeaders);
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/news");
  revalidatePath(`/admin/news/${id}`);
  revalidatePath(`/news/${id}`);
  redirect(adminNoticePath(`/admin/news/${id}`, "news_updated"));
}

async function getAdminSessionFromCookies() {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") redirect("/admin");
  return session;
}
