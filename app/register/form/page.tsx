import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHero, SideNotes, StepRail } from "../../../components/SiteChrome";
import { RegistrationForm, type RegistrationPrefill } from "../../../components/RegistrationForm";
import { getAdminSettings, isEventRegistrationOpen } from "../../../lib/admin-store";
import { getParticipantSession, participantSessionCookie } from "../../../lib/participant-session";
import { findRegistrationByCode } from "../../../lib/registration-lookup";
import { findSubmissionsByEmail } from "../../../lib/submission-lookup";

export default async function RegisterFormPage() {
  const cookieStore = await cookies();
  const session = getParticipantSession(cookieStore.get(participantSessionCookie)?.value);
  const registrationCode = session?.registrationCode;
  const registration = registrationCode ? await findRegistrationByCode(registrationCode) : null;

  if (registration && registration.status !== "cancelled") {
    redirect(`/register/success?code=${encodeURIComponent(registration.registration_code)}`);
  }

  const submissions = session ? await findSubmissionsByEmail(session.email) : [];
  if (session && !registration && submissions.length === 0) redirect("/profile");

  const settings = await getAdminSettings();
  if (!isEventRegistrationOpen(settings)) {
    return <>
      <PageHero eyebrow="EVENT REGISTRATION" title="ปิดลงทะเบียนเข้าร่วมงาน" description="ขณะนี้ระบบปิดรับลงทะเบียนเข้าร่วมงานชั่วคราว" />
      <section className="wide page-body">
        <div className="auth-card">
          <h2>ปิดรับลงทะเบียน</h2>
          <p>กรุณาติดตามประกาศจากผู้ดูแลโครงการ หรือกลับมาใหม่เมื่อระบบเปิดรับลงทะเบียน</p>
        </div>
      </section>
    </>;
  }

  const prefill = submissions[0] ? submissionToRegistrationPrefill(submissions[0]) : null;

  return <>
    <PageHero
      eyebrow="EVENT REGISTRATION"
      title="ลงทะเบียนเข้าร่วมงาน"
      description="กรอกข้อมูลให้ครบถ้วนเพื่อรับเลขลงทะเบียนและ QR Code"
    />
    <section className="wide page-body">
      <StepRail />
      <div className="form-layout">
        <Suspense fallback={<div className="form-card">กำลังเตรียมแบบฟอร์ม...</div>}>
          <RegistrationForm prefill={prefill} />
        </Suspense>
        <SideNotes />
      </div>
    </section>
  </>;
}

function submissionToRegistrationPrefill(
  submission: Awaited<ReturnType<typeof findSubmissionsByEmail>>[number],
): RegistrationPrefill {
  return {
    email: submission.email,
    title: submission.title,
    first_name: submission.first_name,
    last_name: submission.last_name,
    citizen_id: submission.citizen_id,
    phone: submission.phone,
    position: submission.position,
    division: submission.division,
    bureau: submission.bureau,
    sourceSubmissionCode: submission.submission_code,
  };
}
