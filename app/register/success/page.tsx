import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ClipboardCheck, Download, Gift, MailCheck } from "lucide-react";
import { PageHero, SideNotes } from "../../../components/SiteChrome";
import { getAdminSettings, isSatisfactionEvaluationOpen } from "../../../lib/admin-store";
import { findEvaluationByRegistrationCode } from "../../../lib/evaluation-store";
import { participantSessionCookie, participantSubmissionCookie } from "../../../lib/participant-session";
import { findRegistrationByCode } from "../../../lib/registration-lookup";

export const dynamic = "force-dynamic";

export default async function RegisterSuccess({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const cookieStore = await cookies();
  const sessionCode = cookieStore.get(participantSessionCookie)?.value;
  const requestedCode = code?.trim() || "";
  const requestedItem = requestedCode ? await findRegistrationByCode(requestedCode) : null;
  const sessionItem = !requestedItem && sessionCode ? await findRegistrationByCode(sessionCode) : null;
  const item = requestedItem || sessionItem;

  if (!requestedCode && item) {
    redirect(`/register/success?code=${encodeURIComponent(item.registration_code)}`);
  }

  const settings = await getAdminSettings();
  const evaluationOpen = isSatisfactionEvaluationOpen(settings);
  const evaluation = item ? await findEvaluationByRegistrationCode(item.registration_code) : null;
  const hasAttended = item?.status === "attended" && Boolean(item.checked_in_at);
  const canEvaluate = Boolean(item && hasAttended && evaluationOpen && !evaluation);

  return <>
    <PageHero
      eyebrow="EVENT REGISTRATION"
      title="ลงทะเบียนเข้าร่วมงาน"
      description="กรอกข้อมูลผู้เข้าร่วมเพื่อรับเลขลงทะเบียนและ QR Code สำหรับเช็คอินหน้างาน Police Innovation Contest 2026"
    />
    <section className="wide page-body registration-result">
      <div className="form-layout">
        {item ? <article className="success-card registration-card">
          <header className="result-heading">
            <div className="result-heading-copy">
              <span>ลงทะเบียนสำเร็จ</span>
              <h2>ข้อมูลการลงทะเบียน</h2>
              <div className="registration-email"><small>อีเมลผู้สมัคร</small><b>{item.email}</b></div>
              <p className="registration-summary">ระบบจะพากลับมาหน้านี้เมื่อเข้าลิงก์ลงทะเบียนจากเครื่องเดิม และส่ง QR Code/PDF ยืนยันไปยังอีเมลเรียบร้อยแล้ว</p>
            </div>
            <form action={useOtherEmailAction}><button className="ghost-action" type="submit">ใช้อีเมลอื่น</button></form>
          </header>
          <div className="success-grid">
            <div className="qr">
              <img src={`/api/qr?text=${encodeURIComponent(item.registration_code)}`} alt={`QR Code ${item.registration_code}`}/>
              <b>{item.registration_code}</b>
            </div>
            <div className="result-detail">
              <h3>{item.title}{item.first_name} {item.last_name}</h3>
              {evaluation?.lucky_draw_prize && <div className="lucky-page-notice">
                <Gift/>
                <div>
                  <b>ยินดีด้วย คุณได้รับรางวัล Lucky Draw</b>
                  <p>รางวัลที่ {evaluation.lucky_draw_prize} กรุณารอประกาศรายละเอียดจากทีมงาน</p>
                </div>
              </div>}
              <dl>
                <div><dt>ตำแหน่ง</dt><dd>{item.position ?? "-"}</dd></div>
                <div><dt>สังกัด</dt><dd>{item.division}</dd></div>
                <div><dt>หน่วยงาน</dt><dd>{item.bureau}</dd></div>
                <div><dt>เบอร์ติดต่อ</dt><dd>{item.phone}</dd></div>
                <div><dt>อีเมล</dt><dd>{item.email}</dd></div>
                <div><dt>ระดับผู้เข้าร่วมงาน</dt><dd>{roleLabel(item.participant_role)}</dd></div>
                <div><dt>สถานะ</dt><dd>{registrationStatusLabel(item.status)}</dd></div>
                {item.checked_in_at && <div><dt>เวลาเช็คอิน</dt><dd>{formatThaiDate(item.checked_in_at)}</dd></div>}
              </dl>
              <div className="ticket-actions">
                <a className="primary" href={`/api/qr?text=${encodeURIComponent(item.registration_code)}`} download={`${item.registration_code}.png`}><Download/> Download QR</a>
                <a className="secondary" href={`/api/register/${encodeURIComponent(item.registration_code)}/ticket`} download={`${item.registration_code}.pdf`}><Download/> PDF</a>
              </div>
              {canEvaluate && <Link className="evaluation-cta" href={`/evaluation?code=${encodeURIComponent(item.registration_code)}`}>
                <ClipboardCheck/>
                ทำแบบประเมินความพึงพอใจ
              </Link>}
              {evaluation && <div className="evaluation-status-note attended"><ClipboardCheck/><div><b>ส่งแบบประเมินแล้ว</b><p>ขอบคุณสำหรับความคิดเห็น ทีมงานบันทึกผลเรียบร้อยแล้ว</p></div></div>}
              {hasAttended && !evaluationOpen && !evaluation && <div className="evaluation-status-note"><ClipboardCheck/><div><b>แบบประเมินยังไม่เปิด</b><p>เมื่อแอดมินเปิดแบบประเมิน ปุ่มทำแบบประเมินจะแสดงบนหน้านี้</p></div></div>}
              <div className="email-note"><MailCheck/><div><b>ส่งอีเมลยืนยันแล้ว</b><p>กรุณาตรวจสอบกล่องจดหมาย และนำ QR Code หรือ PDF มาแสดงหน้างานเพื่อเช็คอิน</p></div></div>
            </div>
          </div>
        </article> : <article className="success-card">
          <h2>ไม่พบข้อมูลลงทะเบียน</h2>
          <p>กรุณาตรวจสอบรหัสหรือลงทะเบียนใหม่</p>
          <form action={useOtherEmailAction}><button className="primary" type="submit">ลงทะเบียนใหม่</button></form>
        </article>}
        <SideNotes/>
      </div>
    </section>
  </>;
}

async function useOtherEmailAction() {
  "use server";
  const cookieStore = await cookies();
  cookieStore.delete(participantSessionCookie);
  cookieStore.delete(participantSubmissionCookie);
  redirect("/register/form?provider=local");
}

function roleLabel(role?: string | null) {
  const normalized = role?.trim().toLowerCase();
  if (normalized === "vip") return "VIP";
  if (normalized === "exhibitor") return "Exhibitor";
  if (normalized === "competitor") return "Competitor";
  return "Guest";
}

function registrationStatusLabel(status?: string | null) {
  if (status === "attended") return "เข้าร่วมงานแล้ว";
  if (status === "cancelled") return "ยกเลิก";
  return "ลงทะเบียนแล้ว";
}

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}
