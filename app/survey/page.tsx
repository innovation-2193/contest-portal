import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, ClipboardCheck, KeyRound, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { getAdminSettings, isSatisfactionEvaluationOpen } from "../../lib/admin-store";
import { getParticipantSession, participantSessionCookie } from "../../lib/participant-session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ทำแบบสอบถามความพึงพอใจ | Police Innovation Contest 2026",
  description: "หน้าเข้าสู่แบบสอบถามความพึงพอใจสำหรับผู้เข้าร่วมงาน Police Innovation Contest 2026",
};

export default async function SurveyEntryPage() {
  const cookieStore = await cookies();
  const session = getParticipantSession(cookieStore.get(participantSessionCookie)?.value);
  if (session) redirect("/evaluation");

  const settings = await getAdminSettings();
  const isOpen = isSatisfactionEvaluationOpen(settings);

  return <>
    <section className="survey-entry-page">
      <div className="survey-entry-glow" aria-hidden="true"/>
      <div className="survey-entry-shell">
        <div className="survey-entry-brand"><span><ClipboardCheck/></span><b>POLICE INNOVATION CONTEST 2026</b></div>
        <article className="survey-entry-card">
          <div className="survey-entry-icon"><Sparkles/></div>
          <span className="survey-entry-eyebrow">SATISFACTION SURVEY</span>
          <h1>ทำแบบสอบถาม<br/><em>ความพึงพอใจ</em></h1>
          <p className="survey-entry-lead">ขอบคุณที่ร่วมงานกับเรา ความคิดเห็นของคุณช่วยให้การจัดงานครั้งต่อไปดียิ่งขึ้น</p>
          <div className={`survey-entry-status ${isOpen ? "is-open" : "is-closed"}`}>
            <i/>{isOpen ? "ขณะนี้เปิดรับแบบสอบถามแล้ว" : "แบบสอบถามยังไม่เปิดให้ทำ"}
          </div>
          <a className="survey-entry-primary" href="/profile/login?next=%2Fevaluation">
            <ShieldCheck/>เข้าสู่ระบบเพื่อทำแบบสอบถาม<ArrowRight/>
          </a>
          <p className="survey-entry-note">ใช้ อีเมลเดียวกับที่ลงทะเบียนเข้าร่วมงาน ระบบจะส่งรหัส OTP ให้ทางอีเมล</p>
          <div className="survey-entry-steps" aria-label="ขั้นตอนการทำแบบสอบถาม">
            <div><span><Mail/></span><b>1</b><p>กรอกอีเมล<br/><small>ที่ลงทะเบียนไว้</small></p></div>
            <div><span><KeyRound/></span><b>2</b><p>ยืนยัน OTP<br/><small>รหัส 6 หลัก</small></p></div>
            <div><span><ClipboardCheck/></span><b>3</b><p>ทำแบบสอบถาม<br/><small>เริ่มตอบได้ทันที</small></p></div>
          </div>
          <div className="survey-entry-footnote"><ShieldCheck/>สำหรับผู้เข้าร่วมงานที่เช็คอินหน้างานแล้ว</div>
        </article>
        <p className="survey-entry-footer">เว็บไซต์ทางการ innocontest.police.go.th</p>
      </div>
    </section>
  </>;
}
