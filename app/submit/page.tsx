import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { PageHero, SideNotes, StepRail } from "../../components/SiteChrome";
import { SubmissionForm } from "../../components/SubmissionForm";
import { getActiveSession } from "../../lib/active-session";
import { getAdminSettings, isContestSubmissionOpen } from "../../lib/admin-store";
import { getParticipantSession, participantSessionCookie, participantSubmissionCookie } from "../../lib/participant-session";
import { findRegistrationsByEmail } from "../../lib/registration-lookup";
import { findSubmissionForRegistration, findSubmissionsByEmail } from "../../lib/submission-lookup";

export default async function Submit({ searchParams }: { searchParams: Promise<{ registrationCode?: string }> }) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const activeSession = getActiveSession(cookieStore);
  const participantSession = getParticipantSession(cookieStore.get(participantSessionCookie)?.value);
  const ownedSubmissions = participantSession ? await findSubmissionsByEmail(participantSession.email) : [];
  const submissionCode = cookieStore.get(participantSubmissionCookie)?.value;
  const existingSubmission = submissionCode
    ? ownedSubmissions.find((item) => item.submission_code === submissionCode)
    : ownedSubmissions[0];
  if (existingSubmission) {
    redirect(`/submit/success?code=${encodeURIComponent(existingSubmission.submission_code)}`);
  }

  const participantRegistrations = participantSession ? await findRegistrationsByEmail(participantSession.email) : [];
  const registrationCode = params.registrationCode || participantSession?.registrationCode || "";
  const prefill = participantRegistrations.find((registration) => registration.registration_code === registrationCode) ?? null;
  const activePrefill = prefill?.status === "cancelled" ? null : prefill;
  const submissionFromRegistration = activePrefill ? await findSubmissionForRegistration(activePrefill) : null;
  if (submissionFromRegistration) {
    redirect(`/submit/success?code=${encodeURIComponent(submissionFromRegistration.submission_code)}`);
  }

  const settings = await getAdminSettings();
  if (!isContestSubmissionOpen(settings)) {
    return <><PageHero eyebrow="INNOVATION CONTEST SUBMISSION" title="ปิดรับสมัครประกวดนวัตกรรมตำรวจ" description="ขณะนี้ระบบปิดรับสมัครส่งผลงานประกวดนวัตกรรมชั่วคราว"/><section className="wide page-body"><div className="auth-card"><h2>ปิดรับสมัครประกวด</h2><p>กรุณาติดตามประกาศจากผู้ดูแลโครงการ หรือกลับมาใหม่เมื่อระบบเปิดรับสมัครส่งผลงาน</p></div></section></>;
  }

  return <><PageHero eyebrow="INNOVATION CONTEST SUBMISSION" title="ลงทะเบียนประกวดนวัตกรรมตำรวจ" description="กรอกข้อมูลผู้สมัคร ข้อมูลผลงานนวัตกรรม และแนบเอกสารประกอบตามแบบฟอร์มให้ครบถ้วนก่อนส่งใบสมัคร"/><section className="wide page-body"><StepRail submission/>{!participantSession && <SubmissionSessionEntry activeSession={activeSession}/>}<div className="form-layout"><SubmissionForm prefill={activePrefill}/><SideNotes submission/></div></section></>;
}

function SubmissionSessionEntry({ activeSession }: { activeSession: ReturnType<typeof getActiveSession> }) {
  if (activeSession) {
    return <div className="submission-login-entry"><div><b>คุณยังเข้าสู่ระบบอยู่</b><span>Session ของ {activeSession.email} ยังไม่หมดอายุ เปิดหน้าที่เกี่ยวข้องได้โดยไม่ต้องขอ OTP ใหม่</span></div><Link className="secondary" href={activeSession.href}><LogIn/>{activeSession.label}</Link></div>;
  }

  return <div className="submission-login-entry"><div><b>เคยส่งผลงานแล้ว?</b><span>เข้าสู่ระบบด้วยอีเมลและ OTP เพื่อดูผลงานของคุณจากอุปกรณ์เครื่องนี้</span></div><Link className="secondary" href="/profile/login"><LogIn/>เข้าสู่ระบบดูผลงาน</Link></div>;
}
