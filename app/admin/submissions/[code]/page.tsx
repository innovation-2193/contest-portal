import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, ExternalLink, FileText, Pencil, Printer, Users } from "lucide-react";
import { AdminPrintButton } from "../../../../components/AdminPrintButton";
import { cookieName, verifyAdminToken } from "../../../../lib/admin-auth";
import { getSubmissionDetail, updateSubmission, type AdminSubmissionDetail } from "../../../../lib/admin-store";
import { isThaiCitizenId } from "../../../../lib/validation";

export const dynamic = "force-dynamic";

const documentLabels: Record<string, string> = {
  ownership: "3.1 หลักฐานความเป็นเจ้าของผลงาน",
  concept: "3.2 แบบสรุปผลงานโดยย่อ",
  prototype: "3.3 หลักฐานต้นแบบหรือการทดลอง",
  implementation: "3.4 แผนต่อยอดใช้งานจริง",
};

const submissionStatuses = [
  ["draft", "ฉบับร่าง"],
  ["submitted", "ส่งใบสมัครแล้ว"],
  ["screening", "อยู่ระหว่างตรวจสอบ"],
  ["qualified", "ผ่านการพิจารณา"],
  ["rejected", "ไม่ผ่านการพิจารณา"],
] as const;

const emptyMember = {
  title: "",
  first_name: "",
  last_name: "",
  citizen_id: "",
  phone: "",
  email: "",
  position: "",
  division: "",
  bureau: "",
};

export default async function AdminSubmissionDetail({ params }: { params: Promise<{ code: string }> }) {
  const cookieStore = await cookies();
  if (!verifyAdminToken(cookieStore.get(cookieName)?.value)) redirect("/admin");

  const { code } = await params;
  const item = await getSubmissionDetail(code);
  const issuedAt = formatAdminDate(new Date().toISOString());

  return <div className="admin-page admin-detail-page">
    <div className="wide">
      <div className="admin-topline print-hidden">
        <div>
          <span className="eyebrow">Submission Detail</span>
          <h1>ข้อมูลสมัครประกวด</h1>
          <p>รายละเอียดใบสมัคร ผลงาน สมาชิกทีม และเอกสารแนบสำหรับตรวจสอบ/พิมพ์</p>
        </div>
        <div className="admin-actions"><Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>{item && <a className="primary" href={`/api/admin/submissions/${encodeURIComponent(item.submission_code)}/print`} target="_blank" rel="noreferrer"><Printer/>พิมพ์ข้อมูลผู้สมัคร</a>}{item && <AdminPrintButton label="พิมพ์ข้อมูลใบสมัคร" />}</div>
      </div>
      {item ? <article className="admin-panel printable-sheet">
        <header className="print-heading"><img className="print-brand-mark" src="/favicon.png" alt="Police Innovation Contest"/><div className="print-heading-copy"><span className="eyebrow">Innovation Submission</span><h2>{item.submission_code}</h2><p>ส่งข้อมูลเมื่อ {formatAdminDate(item.submitted_at)} • สถานะ {item.status}</p></div><div className="print-heading-meta"><b>รายละเอียดใบสมัครประกวด</b><span>ออกเอกสาร {issuedAt}</span></div></header>
        <section className="admin-detail-block">
          <h3>ข้อมูลผลงาน</h3>
          <dl className="admin-detail-list">
            <Detail label="ชื่อผลงานภาษาไทย" value={item.title_th}/>
            <Detail label="Innovation Title" value={item.title_en || "-"}/>
            <Detail label="ประเภทการส่ง" value={item.submission_type === "team" ? `ส่งแบบกลุ่ม${item.team_name ? ` (${item.team_name})` : ""}` : "ส่งเดี่ยว"}/>
            <Detail label="บัญชีอีเมล" value={item.email}/>
            <Detail label="Link Video" value={item.video_url || "-"}/>
            <Detail label="คำอธิบายย่อ" value={item.summary} wide/>
          </dl>
        </section>
        <section className="admin-detail-block">
          <h3><Users/> ข้อมูลผู้สมัครและสมาชิกทีม</h3>
          <div className="admin-member-grid">
            {item.members.map((member) => <article key={`${member.member_order}-${member.citizen_id}`}>
              <b>{member.member_order === 1 ? "ผู้สมัครหลัก" : `สมาชิกคนที่ ${member.member_order}`}</b>
              <h4>{member.title}{member.first_name} {member.last_name}</h4>
              <dl>
                <Detail label="อีเมล" value={member.email}/>
                <Detail label="เลขบัตรประชาชน" value={member.citizen_id}/>
                <Detail label="เบอร์ติดต่อ" value={member.phone}/>
                <Detail label="ตำแหน่ง" value={member.position}/>
                <Detail label="กองบังคับการ" value={member.division}/>
                <Detail label="กองบัญชาการ" value={member.bureau}/>
              </dl>
            </article>)}
          </div>
        </section>
        <section className="admin-detail-block print-hidden">
          <details className="admin-edit-disclosure">
            <summary><Pencil/>แก้ไขข้อมูลใบสมัคร</summary>
            <SubmissionEditForm item={item}/>
          </details>
        </section>
        <section className="admin-detail-block print-hidden">
          <h3>ไฟล์แนบในระบบ</h3>
          {item.files.length ? <div className="admin-file-list">{item.files.map((file) => <a key={file.document_type} href={`/api/admin/submissions/${encodeURIComponent(item.submission_code)}/files/${encodeURIComponent(file.document_type)}`} target="_blank" rel="noreferrer">
            <FileText/>
            <span><b>{documentLabels[file.document_type] ?? file.document_type}</b><small>เปิด/พิมพ์ PDF • {file.original_name} • {formatBytes(file.byte_size)}</small></span>
            <ExternalLink/>
          </a>)}</div> : <p>ยังไม่มีไฟล์แนบในระบบ</p>}
          <p className="admin-print-note">เปิดไฟล์ PDF ในแท็บใหม่ แล้วใช้คำสั่งพิมพ์ของเบราว์เซอร์หรือ PDF viewer เพื่อพิมพ์เอกสารแนบ</p>
        </section>
        <div className="print-document-footer"><span>เอกสารจากระบบ Police Innovation Contest 2026</span><b>{item.submission_code}</b></div>
      </article> : <article className="admin-panel"><h2>ไม่พบใบสมัครประกวด</h2><p>กรุณาตรวจสอบรหัสผลงาน</p></article>}
    </div>
  </div>;
}

function SubmissionEditForm({ item }: { item: AdminSubmissionDetail }) {
  const members = [0, 1, 2].map((index) => item.members[index] ?? emptyMember);
  return <form action={updateSubmissionAction} className="admin-form admin-submission-edit-form">
    <input type="hidden" name="submissionCode" value={item.submission_code}/>
    <div className="form-grid compact-grid">
      <label>ประเภทการส่ง<select name="submissionType" defaultValue={item.submission_type}>
        <option value="individual">ส่งเดี่ยว</option>
        <option value="team">ส่งแบบกลุ่ม</option>
      </select></label>
      <label>ชื่อทีม<input name="teamName" defaultValue={item.team_name ?? ""} placeholder="กรอกเมื่อเป็นการส่งแบบกลุ่ม"/></label>
      <label>สถานะ<select name="status" defaultValue={item.status}>{submissionStatuses.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="span-2">ชื่อผลงานภาษาไทย<input name="titleTh" defaultValue={item.title_th} required/></label>
      <label>Innovation Title<input name="titleEn" defaultValue={item.title_en ?? ""}/></label>
      <label className="span-2">คำอธิบายย่อ<textarea name="summary" minLength={20} maxLength={500} defaultValue={item.summary} required/></label>
      <label>Link Video<input type="url" name="videoUrl" defaultValue={item.video_url ?? ""} placeholder="https://..."/></label>
      <label>บัญชีอีเมล<input type="email" name="email" defaultValue={item.email} required/></label>
    </div>
    <div className="admin-edit-member-list">
      {members.map((member, index) => <fieldset key={index}>
        <legend>{index === 0 ? "ผู้สมัครหลัก" : `สมาชิกคนที่ ${index + 1}`}</legend>
        {index > 0 && <label className="inline-check member-enable"><input type="checkbox" name="includeMember" value={String(index + 1)} defaultChecked={Boolean(item.members[index])}/> ใช้งานสมาชิกคนนี้</label>}
        <div className="form-grid compact-grid">
          <label>คำนำหน้า<input name={`memberTitle_${index + 1}`} defaultValue={member.title} required={index === 0}/></label>
          <label>ชื่อ<input name={`memberFirstName_${index + 1}`} defaultValue={member.first_name} required={index === 0}/></label>
          <label>นามสกุล<input name={`memberLastName_${index + 1}`} defaultValue={member.last_name} required={index === 0}/></label>
          <label>เลขบัตรประชาชน<input name={`memberCitizenId_${index + 1}`} defaultValue={member.citizen_id} inputMode="numeric" pattern="\d{13}" maxLength={13} required={index === 0}/></label>
          <label>เบอร์ติดต่อ<input name={`memberPhone_${index + 1}`} defaultValue={member.phone} inputMode="numeric" pattern="0[689]\d{8}" maxLength={10} required={index === 0}/></label>
          <label>อีเมล<input type="email" name={`memberEmail_${index + 1}`} defaultValue={member.email} required={index === 0}/></label>
          <label>ตำแหน่ง<input name={`memberPosition_${index + 1}`} defaultValue={member.position} required={index === 0}/></label>
          <label>กองบังคับการ<input name={`memberDivision_${index + 1}`} defaultValue={member.division} required={index === 0}/></label>
          <label>กองบัญชาการ<input name={`memberBureau_${index + 1}`} defaultValue={member.bureau} required={index === 0}/></label>
        </div>
      </fieldset>)}
    </div>
    <button className="primary" type="submit">บันทึกข้อมูลใบสมัคร</button>
  </form>;
}

async function updateSubmissionAction(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  if (!verifyAdminToken(cookieStore.get(cookieName)?.value)) redirect("/admin");

  const submissionCode = text(formData, "submissionCode");
  const submissionType = text(formData, "submissionType");
  const status = text(formData, "status");
  const email = text(formData, "email").toLowerCase();
  const includedMembers = new Set(formData.getAll("includeMember").map(String));
  const members = [1, 2, 3]
    .filter((order) => order === 1 || submissionType === "team" && includedMembers.has(String(order)))
    .map((order) => ({
      title: text(formData, `memberTitle_${order}`),
      first_name: text(formData, `memberFirstName_${order}`),
      last_name: text(formData, `memberLastName_${order}`),
      citizen_id: text(formData, `memberCitizenId_${order}`),
      phone: text(formData, `memberPhone_${order}`),
      email: text(formData, `memberEmail_${order}`).toLowerCase(),
      position: text(formData, `memberPosition_${order}`),
      division: text(formData, `memberDivision_${order}`),
      bureau: text(formData, `memberBureau_${order}`),
    }));

  if (submissionType !== "individual" && submissionType !== "team") throw new Error("ประเภทการส่งไม่ถูกต้อง");
  if (!submissionStatuses.some(([value]) => value === status)) throw new Error("สถานะใบสมัครไม่ถูกต้อง");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("อีเมลบัญชีไม่ถูกต้อง");
  if (submissionType === "team" && !text(formData, "teamName")) throw new Error("กรุณาระบุชื่อทีม");
  if (text(formData, "summary").length < 20 || text(formData, "summary").length > 500) throw new Error("คำอธิบายย่อต้องมี 20-500 ตัวอักษร");
  const videoUrl = text(formData, "videoUrl");
  if (videoUrl) new URL(videoUrl);

  for (const [index, member] of members.entries()) {
    if (!member.title || !member.first_name || !member.last_name || !member.position || !member.division || !member.bureau) throw new Error(`กรุณากรอกข้อมูลสมาชิกคนที่ ${index + 1} ให้ครบ`);
    if (!isThaiCitizenId(member.citizen_id)) throw new Error(`เลขบัตรประชาชนสมาชิกคนที่ ${index + 1} ไม่ถูกต้อง`);
    if (!/^0[689]\d{8}$/.test(member.phone)) throw new Error(`เบอร์ติดต่อสมาชิกคนที่ ${index + 1} ไม่ถูกต้อง`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) throw new Error(`อีเมลสมาชิกคนที่ ${index + 1} ไม่ถูกต้อง`);
  }

  await updateSubmission({
    submissionCode,
    email,
    submissionType,
    teamName: text(formData, "teamName") || null,
    titleTh: text(formData, "titleTh"),
    titleEn: text(formData, "titleEn"),
    summary: text(formData, "summary"),
    videoUrl,
    status: status as "draft" | "submitted" | "screening" | "qualified" | "rejected",
    members,
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/submissions/${encodeURIComponent(submissionCode)}`);
  redirect(`/admin/submissions/${encodeURIComponent(submissionCode)}`);
}

function Detail({ label, value, wide = false }: { label: string; value?: string | null; wide?: boolean }) {
  return <div className={wide ? "wide-detail" : undefined}><dt>{label}</dt><dd>{value || "-"}</dd></div>;
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").replace(/\s+/g, " ").trim();
}

function formatAdminDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}
