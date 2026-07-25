import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LogIn, ShieldCheck } from "lucide-react";
import { PageHero, StepRail } from "../../components/SiteChrome";
import { getAdminSettings, isEventRegistrationOpen } from "../../lib/admin-store";
import { getParticipantSession, participantSessionCookie } from "../../lib/participant-session";
import { findRegistrationByCode } from "../../lib/registration-lookup";

export default async function Register() {
  const cookieStore = await cookies();
  const session = getParticipantSession(cookieStore.get(participantSessionCookie)?.value);
  const registration = session?.registrationCode
    ? await findRegistrationByCode(session.registrationCode)
    : null;
  if (registration && registration.status !== "cancelled") {
    redirect(`/register/success?code=${encodeURIComponent(registration.registration_code)}`);
  }
  if (session && !registration) redirect("/profile");
  const settings = await getAdminSettings();
  const registrationOpen = isEventRegistrationOpen(settings);
  return <>
    <PageHero
      eyebrow="EVENT REGISTRATION"
      title="ลงทะเบียนเข้าร่วมงาน"
      description="กรอกข้อมูลผู้เข้าร่วมเพื่อรับเลขลงทะเบียนและ QR Code สำหรับเช็คอินหน้างาน Police Innovation Contest 2026"
    />
    <section className="wide page-body">
      <StepRail/>
      <div className="auth-card">
        <ShieldCheck/>
        <span>EVENT ATTENDEE</span>
        {registrationOpen ? <>
          <h2>เริ่มลงทะเบียนเข้าร่วมงาน</h2>
          <p>ใช้อีเมลที่ติดต่อได้จริง ระบบจะตรวจสอบรายการซ้ำและออก QR Code หลังบันทึกข้อมูลสำเร็จ</p>
          <div className="registration-entry-actions">
            <Link href="/register/form?provider=local" className="oauth">กรอกข้อมูลลงทะเบียน</Link>
            <Link href="/profile/login" className="secondary participant-login-entry"><LogIn/>เข้าสู่ระบบผู้เข้าร่วมงาน</Link>
          </div>
        </> : <>
          <h2>ปิดลงทะเบียนเข้าร่วมงาน</h2>
          <p>ขณะนี้ระบบปิดรับลงทะเบียนเข้าร่วมงานชั่วคราว ผู้ที่ลงทะเบียนแล้วสามารถเข้าสู่โปรไฟล์ได้ตามปกติ</p>
          <div className="registration-entry-actions">
            <span className="oauth disabled-action" aria-disabled="true">ปิดรับลงทะเบียน</span>
            <Link href="/profile/login" className="secondary participant-login-entry"><LogIn/>เข้าสู่ระบบผู้เข้าร่วมงาน</Link>
          </div>
        </>}
      </div>
    </section>
  </>;
}
