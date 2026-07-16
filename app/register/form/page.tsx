import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHero, SideNotes, StepRail } from "../../../components/SiteChrome";
import { RegistrationForm } from "../../../components/RegistrationForm";
import { participantSessionCookie } from "../../../lib/participant-session";
import { findRegistrationByCode } from "../../../lib/registration-lookup";

export default async function RegisterForm(){const cookieStore=await cookies();const registrationCode=cookieStore.get(participantSessionCookie)?.value;const registration=registrationCode?await findRegistrationByCode(registrationCode):null;if(registration&&registration.status!=="cancelled")redirect(`/register/success?code=${encodeURIComponent(registration.registration_code)}`);return <><PageHero eyebrow="EVENT REGISTRATION" title="ลงทะเบียนเข้าร่วมงาน" description="กรอกข้อมูลให้ครบถ้วนเพื่อรับเลขลงทะเบียนและ QR Code"/><section className="wide page-body"><StepRail/><div className="form-layout"><Suspense fallback={<div className="form-card">กำลังเตรียมแบบฟอร์ม...</div>}><RegistrationForm/></Suspense><SideNotes/></div></section></>}
