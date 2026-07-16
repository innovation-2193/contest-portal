import { Suspense } from "react";
import { PageHero, SideNotes, StepRail } from "../../../components/SiteChrome";
import { RegistrationForm } from "../../../components/RegistrationForm";
export default function RegisterForm(){return <><PageHero eyebrow="EVENT REGISTRATION" title="ลงทะเบียนเข้าร่วมงาน" description="กรอกข้อมูลให้ครบถ้วนเพื่อรับเลขลงทะเบียนและ QR Code"/><section className="wide page-body"><StepRail/><div className="form-layout"><Suspense fallback={<div className="form-card">กำลังเตรียมแบบฟอร์ม...</div>}><RegistrationForm/></Suspense><SideNotes/></div></section></>}
