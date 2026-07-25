import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Mail, ShieldCheck } from "lucide-react";
import { PageHero } from "../../../components/SiteChrome";
import { ParticipantOtpForm } from "../../../components/ParticipantOtpForm";
import {
  getParticipantOtpPendingEmail,
  getParticipantSession,
  participantOtpPendingCookie,
  participantSessionCookie,
} from "../../../lib/participant-session";

export const dynamic = "force-dynamic";

export default async function ParticipantLoginPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const cookieStore = await cookies();
  if (getParticipantSession(cookieStore.get(participantSessionCookie)?.value)) redirect("/profile");
  const pendingEmail = getParticipantOtpPendingEmail(cookieStore.get(participantOtpPendingCookie)?.value);
  const { status } = await searchParams;

  return <>
    <PageHero
      eyebrow="PARTICIPANT PROFILE"
      title="เข้าสู่ระบบผู้สมัครและผู้เข้าร่วมงาน"
      description="ใช้อีเมลที่ลงทะเบียนไว้เพื่อรับ OTP และเปิดดูข้อมูลส่วนตัว QR Code สถานะเข้าร่วมงาน และผลงานที่เคยส่ง"
    />
    <section className="wide page-body participant-login-page">
      <article className="auth-card participant-login-card">
        <ShieldCheck/>
        <span>SECURE EMAIL OTP</span>
        <h2>{pendingEmail ? "กรอกรหัส OTP" : "เข้าสู่โปรไฟล์ของคุณ"}</h2>
        {loginMessage(status)}
        {pendingEmail ? <>
          <p>ระบบส่งรหัส OTP ไปยัง <strong>{maskEmail(pendingEmail)}</strong> รหัสมีอายุ 1 ชั่วโมงและใช้ได้ครั้งเดียว</p>
          <ParticipantOtpForm email={pendingEmail}/>
          <form action="/api/participant-auth/request-otp" method="post" className="participant-resend-form">
            <input type="hidden" name="email" value={pendingEmail}/>
            <button className="secondary" type="submit"><Mail/>ส่ง OTP ใหม่</button>
          </form>
          <form action="/api/participant-auth/cancel" method="post"><button className="ghost-action participant-change-email" type="submit">ใช้อีเมลอื่น</button></form>
        </> : <>
          <p>กรอกอีเมลเดียวกับที่ใช้ลงทะเบียนเข้าร่วมงานหรือส่งผลงาน ระบบจะส่ง OTP ให้โดยไม่ต้องใช้รหัสผ่าน</p>
          <form action="/api/participant-auth/request-otp" method="post" className="participant-login-form">
            <label><Mail/>อีเมลที่ลงทะเบียน<input type="email" name="email" autoComplete="email" placeholder="name@example.com" maxLength={255} required autoFocus/></label>
            <button className="primary" type="submit"><Mail/>ส่งรหัส OTP</button>
          </form>
        </>}
        <small><ShieldCheck/> ระบบจะคงสถานะการเข้าสู่ระบบบนอุปกรณ์นี้เป็นเวลา 1 วัน</small>
      </article>
    </section>
  </>;
}

function loginMessage(status?: string) {
  if (status === "otp_sent") return <div className="admin-login-alert success">หากอีเมลนี้มีข้อมูลลงทะเบียนหรือผลงาน ระบบได้ส่ง OTP ให้แล้ว</div>;
  if (status === "otp_wait") return <div className="admin-login-alert">กรุณารอ 1 นาทีก่อนส่ง OTP ใหม่</div>;
  if (status === "otp_failed") return <div className="admin-login-alert">OTP ไม่ถูกต้องหรือหมดอายุ กรุณาตรวจสอบอีกครั้ง</div>;
  if (status === "otp_expired") return <div className="admin-login-alert">คำขอ OTP หมดอายุแล้ว กรุณากรอกอีเมลใหม่</div>;
  if (status === "otp_mail_failed") return <div className="admin-login-alert">ระบบส่งอีเมลไม่สำเร็จ กรุณาลองใหม่ภายหลัง</div>;
  if (status === "invalid_email") return <div className="admin-login-alert">กรุณากรอกอีเมลให้ถูกต้อง</div>;
  if (status === "logged_out") return <div className="admin-login-alert success">ออกจากระบบเรียบร้อยแล้ว</div>;
  return null;
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(3, name.length - visible.length))}@${domain}`;
}
