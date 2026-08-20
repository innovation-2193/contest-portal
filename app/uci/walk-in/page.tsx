import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, CheckCircle2, ClipboardCheck, UserPlus } from "lucide-react";
import { checkInParticipant, createParticipant } from "../../../lib/admin-store";
import { recordAuditEvent } from "../../../lib/audit-log";
import { participantRoles, type ParticipantRole } from "../../../lib/local-registrations";
import { isThaiCitizenId } from "../../../lib/validation";

export const dynamic = "force-dynamic";

const walkInCheckInActor = "walk-in@system";

export default async function UciWalkInPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; code?: string }> }) {
  const params = await searchParams;
  const successCode = params.success === "1" ? String(params.code ?? "").trim() : "";

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div>
          <span className="eyebrow">Walk-in Registration</span>
          <h1>ลงทะเบียนผู้เข้าร่วมงานหน้างาน</h1>
          <p>กรอกข้อมูลผู้ที่มาร่วมงานแบบ Walk-in ระบบจะลงทะเบียนและเช็คอินเข้าร่วมงานให้ทันที</p>
        </div>
        <div className="admin-actions"><Link className="secondary" href="/"><ArrowLeft/>กลับหน้าหลัก</Link></div>
      </div>

      {params.error && <div className="admin-login-alert warning">{params.error}</div>}
      {successCode && <section className="admin-panel walkin-success-panel">
        <div className="walkin-success-icon"><CheckCircle2/></div>
        <div>
          <span className="eyebrow">Check-in Completed</span>
          <h2>ลงทะเบียนและเช็คอินสำเร็จ</h2>
          <p>รหัสลงทะเบียนของคุณคือ <strong>{successCode}</strong> และระบบบันทึกสถานะเป็น “เข้าร่วมงานแล้ว” เรียบร้อยแล้ว</p>
        </div>
        <div className="admin-actions"><Link className="secondary" href="/profile/login">ดู QR Code ของฉัน</Link><Link className="primary" href="/uci/walk-in"><UserPlus/>ลงทะเบียนคนถัดไป</Link></div>
      </section>}

      <section className="admin-panel uci-participants-panel walkin-registration-panel">
        <header className="admin-section-head"><UserPlus/><div><span className="eyebrow">On-site Check-in</span><h2>ข้อมูลผู้เข้าร่วม Walk-in</h2><p>ทุกช่องที่มีเครื่องหมาย * ต้องกรอกให้ครบ ระบบจะเช็คอินทันทีหลังบันทึกสำเร็จ</p></div></header>
        <form action={registerWalkInAction} className="admin-form admin-participant-detail-form participant-create-form">
          <div className="walkin-form-note"><ClipboardCheck/><span>ตรวจสอบชื่อและข้อมูลให้ถูกต้องก่อนกดปุ่ม เพราะเมื่อบันทึกแล้วระบบจะถือว่าเข้าร่วมงานและนับเป็นผู้เช็คอินทันที</span></div>
          <div className="form-grid compact-grid">
            <label>อีเมล *<input type="email" name="email" required placeholder="name@example.com" autoFocus/></label>
            <label>คำนำหน้า *<input name="title" required placeholder="เช่น นาย / นาง / พ.ต.อ."/></label>
            <label>ชื่อ *<input name="firstName" required/></label>
            <label>นามสกุล *<input name="lastName" required/></label>
            <label>Role ผู้เข้าร่วม<select name="participantRole" defaultValue="Guest">{participantRoles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
            <label>เลขบัตรประชาชน *<input name="citizenId" inputMode="numeric" pattern="\d{13}" maxLength={13} placeholder="13 หลัก" required/></label>
            <label>เบอร์ติดต่อ *<input name="phone" inputMode="tel" pattern="0[689]\d{8}" maxLength={10} placeholder="0812345678" required/></label>
            <label>ตำแหน่ง *<input name="position" required/></label>
            <label>สังกัด / กองบังคับการ *<input name="division" required placeholder="เช่น หน่วยงาน / ฝ่าย / กองบังคับการ"/></label>
            <label>กองบัญชาการ / หน่วยงาน *<input name="bureau" required placeholder="ชื่อหน่วยงานหรือสังกัดหลัก"/></label>
          </div>
          <label className="walkin-consent-check"><input type="checkbox" name="consentPdpa" value="true" required/> ข้าพเจ้ายินยอมให้โครงการเก็บ ใช้ และประมวลผลข้อมูลส่วนบุคคลตาม <Link href="/privacy" target="_blank">นโยบายความเป็นส่วนตัว</Link></label>
          <button className="primary walkin-submit-button" type="submit"><CheckCircle2/>ลงทะเบียนและเช็คอินทันที</button>
        </form>
      </section>
    </div>
  </div>;
}

async function registerWalkInAction(formData: FormData) {
  "use server";
  const returnPath = "/uci/walk-in";
  const title = text(formData, "title");
  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");
  const email = text(formData, "email");
  const citizenId = text(formData, "citizenId");
  const phone = text(formData, "phone");
  const participantRole = text(formData, "participantRole") as ParticipantRole;
  const input = {
    email,
    provider: "local" as const,
    participantRole,
    title,
    firstName,
    lastName,
    citizenId,
    phone,
    position: text(formData, "position"),
    division: text(formData, "division"),
    bureau: text(formData, "bureau"),
  };
  try {
    if (!title || !firstName || !lastName) throw new Error("กรุณากรอกคำนำหน้า ชื่อ และนามสกุล");
    if (!/^\d{13}$/.test(citizenId) || !isThaiCitizenId(citizenId)) throw new Error("หมายเลขบัตรประชาชนไม่ถูกต้อง");
    if (!/^0[689]\d{8}$/.test(phone)) throw new Error("เบอร์ติดต่อไม่ถูกต้อง");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("อีเมลไม่ถูกต้อง");
    if (formData.get("consentPdpa") !== "true") throw new Error("กรุณายอมรับนโยบายความเป็นส่วนตัวก่อนยืนยันการลงทะเบียน");
    if (!participantRoles.includes(participantRole)) throw new Error("Role ผู้เข้าร่วมไม่ถูกต้อง");
  } catch (error) {
    redirect(`${returnPath}?error=${encodeURIComponent(walkInErrorMessage(error))}`);
  }

  let result: Awaited<ReturnType<typeof createParticipant>>;
  try {
    result = await createParticipant(input);
  } catch (error) {
    redirect(`${returnPath}?error=${encodeURIComponent(walkInErrorMessage(error))}`);
  }

  let checkedIn: Awaited<ReturnType<typeof checkInParticipant>>;
  try {
    checkedIn = await checkInParticipant(result.record.registration_code, walkInCheckInActor);
  } catch (error) {
    console.error("walk-in automatic check-in failed", error);
    redirect(`${returnPath}?error=${encodeURIComponent("ลงทะเบียนแล้ว แต่เช็คอินอัตโนมัติไม่สำเร็จ กรุณาเปิดหน้าเช็คอินเพื่อตรวจสอบอีกครั้ง")}&code=${encodeURIComponent(result.record.registration_code)}`);
  }

  const requestHeaders = await headers();
  await recordAuditEvent({
    actor: { type: "public", email: result.record.email || null },
    action: "registration.created",
    entityType: "registration",
    entityId: result.record.registration_code,
    summary: `ลงทะเบียน Walk-in และเช็คอินทันที ${result.record.registration_code}`,
      payload: { registrationCode: result.record.registration_code, emailStatus: result.emailStatus, autoCheckedIn: true, checkedInAt: checkedIn.checked_in_at, workspace: "public-walk-in" },
  }, requestHeaders);
  await recordAuditEvent({
    actor: { type: "system", email: walkInCheckInActor },
    action: "registration.checked_in",
    entityType: "registration",
    entityId: result.record.registration_code,
    summary: `เช็คอินอัตโนมัติหลังลงทะเบียน Walk-in ${result.record.registration_code}`,
    payload: { registrationCode: result.record.registration_code, checkedInByEmail: checkedIn.checked_in_by_email ?? walkInCheckInActor, checkedInAt: checkedIn.checked_in_at, wasAlreadyCheckedIn: Boolean(checkedIn.wasAlreadyCheckedIn), workspace: "public-walk-in" },
  }, requestHeaders);
  revalidatePath("/admin");
  revalidatePath("/admin/participants");
  revalidatePath("/uci");
  revalidatePath("/admin/scan");
  redirect(`${returnPath}?success=1&code=${encodeURIComponent(result.record.registration_code)}`);
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function walkInErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: string }).code ?? "");
    if (code === "DUPLICATE_NAME") return "มีผู้เข้าร่วมชื่อและนามสกุลนี้ในระบบแล้ว กรุณาตรวจสอบก่อนลงทะเบียนซ้ำ";
    if (code === "DUPLICATE_CITIZEN_ID") return "เลขบัตรประชาชนนี้มีในระบบแล้ว กรุณาตรวจสอบก่อนลงทะเบียนซ้ำ";
    if (code === "CANCELLED") return "รายการนี้ถูกยกเลิก ไม่สามารถเช็คอินได้";
  }
  return error instanceof Error ? error.message : "ไม่สามารถลงทะเบียน Walk-in ได้ กรุณาลองใหม่อีกครั้ง";
}
