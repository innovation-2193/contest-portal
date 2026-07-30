import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ClipboardCheck, Download, FileCheck2, FolderOpen, Gift, LogOut, Mail, QrCode, ShieldCheck, UserPlus, UserRound } from "lucide-react";
import { PageHero } from "../../components/SiteChrome";
import { findEvaluationByRegistrationCode } from "../../lib/evaluation-store";
import { findRegistrationsByEmail } from "../../lib/registration-lookup";
import { getParticipantSession, participantSessionCookie } from "../../lib/participant-session";
import { findSubmissionsByEmail } from "../../lib/submission-lookup";

export const dynamic = "force-dynamic";

export default async function ParticipantProfilePage() {
  const cookieStore = await cookies();
  const session = getParticipantSession(cookieStore.get(participantSessionCookie)?.value);
  if (!session) redirect("/profile/login");
  const [registrations, submissions] = await Promise.all([
    findRegistrationsByEmail(session.email),
    findSubmissionsByEmail(session.email),
  ]);
  if (!registrations.length && !submissions.length) redirect("/profile/login?status=otp_expired");
  const evaluations = await Promise.all(registrations.map((item) => findEvaluationByRegistrationCode(item.registration_code)));
  const registrationCards = preferredRegistrationCards(registrations.map((item, index) => ({
    item,
    evaluation: evaluations[index],
  })));
  const hasActiveRegistration = registrations.some((item) => item.status !== "cancelled");

  return <>
    <PageHero
      eyebrow="PARTICIPANT PROFILE"
      title="โปรไฟล์ของฉัน"
      description="ข้อมูลลงทะเบียน QR Code สถานะเช็คอิน รางวัล และผลงานประกวดที่เชื่อมกับบัญชีของคุณ"
    />
    <section className="wide page-body participant-profile-page">
      <header className="participant-profile-head">
        <div><UserRound/><span><small>เข้าสู่ระบบด้วย</small><b>{session.email}</b><em><ShieldCheck/> คงสถานะการเข้าสู่ระบบ 1 วัน</em></span></div>
        <form action="/api/participant-auth/logout" method="post"><button className="secondary" type="submit"><LogOut/>ออกจากระบบ</button></form>
      </header>
      <div className="participant-profile-list">
        {registrationCards.map(({ item, evaluation }) => {
          return <article className="success-card participant-profile-card" key={item.registration_code}>
            <header>
              <div><span className="eyebrow">Registration Profile</span><h2>{item.title}{item.first_name} {item.last_name}</h2><p>{item.registration_code}</p></div>
              <span className={`status-pill ${item.status}`}>{registrationStatusLabel(item.status)}</span>
            </header>
            <div className="participant-profile-content">
              <div className="qr participant-profile-qr">
                <img src={`/api/qr?text=${encodeURIComponent(item.registration_code)}`} alt={`QR Code ${item.registration_code}`}/>
                <b>{item.registration_code}</b>
                <small><QrCode/>แสดง QR นี้สำหรับเช็คอินหน้างาน</small>
              </div>
              <div className="result-detail">
                {evaluation?.lucky_draw_prize && <div className="lucky-page-notice"><Gift/><div><b>คุณได้รับรางวัล Lucky Draw</b><p>รางวัลที่ {evaluation.lucky_draw_prize}</p></div></div>}
                <dl>
                  <div><dt>อีเมล</dt><dd>{item.email}</dd></div>
                  <div><dt>เบอร์ติดต่อ</dt><dd>{item.phone}</dd></div>
                  <div><dt>ตำแหน่ง</dt><dd>{item.position || "-"}</dd></div>
                  <div><dt>สังกัด</dt><dd>{item.division || "-"}</dd></div>
                  <div><dt>หน่วยงาน</dt><dd>{item.bureau || "-"}</dd></div>
                  <div><dt>ประเภทผู้เข้าร่วม</dt><dd>{roleLabel(item.participant_role)}</dd></div>
                  <div><dt>ลงทะเบียนเมื่อ</dt><dd>{formatThaiDate(item.registered_at)}</dd></div>
                  {item.checked_in_at && <div><dt>เช็คอินเมื่อ</dt><dd>{formatThaiDate(item.checked_in_at)}</dd></div>}
                </dl>
                <div className="ticket-actions">
                  <a className="primary" href={`/api/qr?text=${encodeURIComponent(item.registration_code)}`} download={`${item.registration_code}.png`}><Download/>Download QR</a>
                  <a className="secondary" href={`/api/register/${encodeURIComponent(item.registration_code)}/ticket?download=1`} download={`${item.registration_code}.pdf`}><Download/>ดาวน์โหลด PDF</a>
                </div>
                {evaluation
                  ? <div className="evaluation-status-note attended"><ClipboardCheck/><div><b>ส่งแบบประเมินแล้ว</b><p>ระบบบันทึกแบบประเมินของคุณเรียบร้อยแล้ว</p></div></div>
                  : item.status === "attended" && <a className="evaluation-cta" href={`/evaluation?code=${encodeURIComponent(item.registration_code)}`}><ClipboardCheck/>ทำแบบประเมินความพึงพอใจ</a>}
              </div>
            </div>
          </article>;
        })}
      </div>
      {submissions.length > 0 && <section className="participant-submissions">
        <header>
          <FolderOpen/>
          <div><span className="eyebrow">MY SUBMISSIONS</span><h2>ผลงานประกวดของฉัน</h2><p>รายการผลงานที่เชื่อมกับอีเมลบัญชีนี้</p></div>
          {!hasActiveRegistration && <a className="primary" href="/register/form?from=submission"><UserPlus/>ลงทะเบียนเข้าร่วมงาน</a>}
        </header>
        <div className="participant-submission-list">
          {submissions.map((item) => <article key={item.submission_code}>
            <div className="participant-submission-icon"><FileCheck2/></div>
            <div className="participant-submission-copy">
              <span>{item.submission_type === "team" ? item.team_name || "ผลงานแบบทีม" : "ผลงานเดี่ยว"}</span>
              <h3>{item.title_th}</h3>
              {item.title_en && <p>{item.title_en}</p>}
              <div><b>{item.submission_code}</b><em className={`status-pill ${item.status}`}>{submissionStatusLabel(item.status)}</em></div>
            </div>
            <div className="participant-submission-actions">
              <a className="secondary" href={`/submit/success?code=${encodeURIComponent(item.submission_code)}`}><FolderOpen/>ดูรายละเอียด</a>
              {!hasActiveRegistration && <a className="secondary" href="/register/form?from=submission"><UserPlus/>ลงทะเบียนเข้าร่วมงาน</a>}
              <a className="primary" href={`/api/profile/submissions/${encodeURIComponent(item.submission_code)}/print`} download={`${item.submission_code}-application.pdf`}><Download/>ไฟล์ข้อมูลผู้สมัคร</a>
            </div>
          </article>)}
        </div>
      </section>}
      <div className="participant-profile-help"><Mail/><p>ข้อมูลไม่ถูกต้องหรือต้องการความช่วยเหลือ ติดต่อ <a href="mailto:innocontest@police.go.th">innocontest@police.go.th</a></p></div>
    </section>
  </>;
}

function preferredRegistrationCards<T extends {
  item: Awaited<ReturnType<typeof findRegistrationsByEmail>>[number];
  evaluation: Awaited<ReturnType<typeof findEvaluationByRegistrationCode>>;
}>(cards: T[]) {
  const bestByOwner = new Map<string, T>();
  for (const card of cards) {
    const key = registrationOwnerKey(card.item);
    const existing = bestByOwner.get(key);
    if (!existing || registrationCardScore(card) > registrationCardScore(existing)) {
      bestByOwner.set(key, card);
    }
  }
  return [...bestByOwner.values()].sort((left, right) => {
    const leftTime = new Date(left.item.checked_in_at || left.item.registered_at).getTime();
    const rightTime = new Date(right.item.checked_in_at || right.item.registered_at).getTime();
    return rightTime - leftTime;
  });
}

function registrationOwnerKey(item: Awaited<ReturnType<typeof findRegistrationsByEmail>>[number]) {
  const citizenId = item.citizen_id.trim();
  if (citizenId) return `citizen:${citizenId}`;
  return [
    "profile",
    item.email.trim().toLowerCase(),
    item.phone.trim(),
    `${item.title}${item.first_name}${item.last_name}`.trim().toLowerCase(),
  ].join(":");
}

function registrationCardScore(card: {
  item: Awaited<ReturnType<typeof findRegistrationsByEmail>>[number];
  evaluation: Awaited<ReturnType<typeof findEvaluationByRegistrationCode>>;
}) {
  const statusScore = card.evaluation ? 300 : card.item.status === "attended" ? 200 : card.item.status === "registered" ? 100 : 0;
  const timeScore = new Date(card.item.checked_in_at || card.item.registered_at).getTime() / 100000000000;
  return statusScore + timeScore;
}

function roleLabel(role?: string | null) {
  const normalized = role?.trim().toLowerCase();
  if (normalized === "vip") return "VIP";
  if (normalized === "exhibitor") return "Exhibitor";
  if (normalized === "competitor") return "ผู้สมัครประกวด";
  if (normalized === "staff") return "Staff";
  return "ผู้เข้าร่วมงานทั่วไป";
}

function registrationStatusLabel(status?: string | null) {
  if (status === "attended") return "เช็คอินแล้ว";
  if (status === "cancelled") return "ยกเลิก";
  return "ลงทะเบียนแล้ว";
}

function submissionStatusLabel(status?: string | null) {
  if (status === "approved") return "ผ่านการตรวจสอบ";
  if (status === "rejected") return "ไม่ผ่านการตรวจสอบ";
  if (status === "screening") return "อยู่ระหว่างตรวจสอบ";
  return "ส่งข้อมูลแล้ว";
}

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}
