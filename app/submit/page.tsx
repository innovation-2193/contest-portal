import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHero, SideNotes, StepRail } from "../../components/SiteChrome";
import { SubmissionForm } from "../../components/SubmissionForm";
import { participantSessionCookie, participantSubmissionCookie } from "../../lib/participant-session";
import { findRegistrationByCode } from "../../lib/registration-lookup";
import { findSubmissionByCode, findSubmissionForRegistration } from "../../lib/submission-lookup";

export default async function Submit({ searchParams }: { searchParams: Promise<{ registrationCode?: string }> }) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const submissionCode = cookieStore.get(participantSubmissionCookie)?.value;
  const existingSubmission = submissionCode ? await findSubmissionByCode(submissionCode) : null;
  if (existingSubmission) {
    redirect(`/submit/success?code=${encodeURIComponent(existingSubmission.submission_code)}`);
  }

  const registrationCode = params.registrationCode || cookieStore.get(participantSessionCookie)?.value || "";
  const prefill = registrationCode ? await findRegistrationByCode(registrationCode) : null;
  const activePrefill = prefill?.status === "cancelled" ? null : prefill;
  const submissionFromRegistration = activePrefill ? await findSubmissionForRegistration(activePrefill) : null;
  if (submissionFromRegistration) {
    redirect(`/submit/success?code=${encodeURIComponent(submissionFromRegistration.submission_code)}`);
  }

  return <><PageHero eyebrow="INNOVATION CONTEST SUBMISSION" title="ลงทะเบียนประกวดนวัตกรรมตำรวจ" description="กรอกข้อมูลผู้สมัคร ข้อมูลผลงานนวัตกรรม และแนบเอกสารประกอบตามแบบฟอร์มให้ครบถ้วนก่อนส่งใบสมัคร"/><section className="wide page-body"><StepRail submission/><div className="form-layout"><SubmissionForm prefill={activePrefill}/><SideNotes submission/></div></section></>;
}
