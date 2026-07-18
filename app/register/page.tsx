import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { PageHero, StepRail } from "../../components/SiteChrome";
import { getAdminSettings, isEventRegistrationOpen } from "../../lib/admin-store";
import { participantSessionCookie } from "../../lib/participant-session";
import { findRegistrationByCode } from "../../lib/registration-lookup";

export default async function Register(){const cookieStore=await cookies();const registrationCode=cookieStore.get(participantSessionCookie)?.value;const registration=registrationCode?await findRegistrationByCode(registrationCode):null;if(registration&&registration.status!=="cancelled")redirect(`/register/success?code=${encodeURIComponent(registration.registration_code)}`);const settings=await getAdminSettings();const registrationOpen=isEventRegistrationOpen(settings);return <><PageHero eyebrow="EVENT REGISTRATION" title="ลงทะเบียนเข้าร่วมงาน" description="กรอกข้อมูลผู้เข้าร่วมเพื่อรับเลขลงทะเบียนและ QR Code สำหรับเช็คอินหน้างาน Police Innovation Contest 2026"/><section className="wide page-body"><StepRail/><div className="auth-card"><ShieldCheck/><span>EVENT ATTENDEE</span>{registrationOpen?<><h2>เริ่มลงทะเบียนเข้าร่วมงาน</h2><p>ใช้อีเมลที่ติดต่อได้จริง ระบบจะตรวจสอบรายการซ้ำและออก QR Code หลังบันทึกข้อมูลสำเร็จ</p><Link href="/register/form?provider=local" className="oauth">กรอกข้อมูลลงทะเบียน</Link></>:<><h2>ปิดลงทะเบียนเข้าร่วมงาน</h2><p>ขณะนี้ระบบปิดรับลงทะเบียนเข้าร่วมงานชั่วคราว กรุณาติดตามประกาศจากผู้ดูแลโครงการ</p><span className="oauth disabled-action" aria-disabled="true">ปิดรับลงทะเบียน</span></>}</div></section></>}
