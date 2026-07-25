import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, Gift, Star, Trophy } from "lucide-react";
import { AdminNotice } from "../../../components/AdminNotice";
import { LuckyDrawWheel } from "../../../components/LuckyDrawWheel";
import { cookieName, getAdminSession } from "../../../lib/admin-auth";
import { getAdminSettings } from "../../../lib/admin-store";
import { getEvaluationSummary, listLuckyDrawCandidates, type EvaluationSummary } from "../../../lib/evaluation-store";

export const dynamic = "force-dynamic";

const emptyEvaluationSummary: EvaluationSummary = {
  total: 0,
  average: 0,
  sections: [],
  questions: [],
  profiles: {
    gender: [],
    ageRange: [],
    organizationType: [],
    attendeeStatus: [],
  },
  comments: [],
  winners: [],
};

export default async function AdminEvaluationsPage({ searchParams }: { searchParams: Promise<{ notice?: string; resetOtp?: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");

  const params = await searchParams;
  const [summary, settings, luckyDrawCandidates] = await Promise.all([
    withFallback(getEvaluationSummary(), emptyEvaluationSummary),
    getAdminSettings(),
    withFallback(listLuckyDrawCandidates(), []),
  ]);
  const isSuperAdmin = session.role === "super_admin";

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div>
          <span className="eyebrow">Evaluation Summary</span>
          <h1>สรุปแบบประเมินความพึงพอใจ</h1>
          <p>ดูคะแนนรวม คะแนนรายหมวด รายข้อ ข้อมูลทั่วไป ข้อเสนอแนะ และผู้โชคดี Lucky Draw</p>
        </div>
        <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
      </div>
      <AdminNotice code={params.notice}/>
      <section className="admin-panel evaluation-detail-panel">
        <header className="admin-section-head">
          <Star/>
          <div>
            <h2>ภาพรวมคะแนนประเมิน</h2>
            <p>{settings.satisfactionEvaluationEnabled ? "เปิดให้ผู้เข้าร่วมงานทำแบบประเมินแล้ว" : "ยังไม่ได้เปิดให้ผู้เข้าร่วมงานทำแบบประเมิน"}</p>
          </div>
          <div className="admin-actions">
            <span className={`status-pill ${settings.satisfactionEvaluationEnabled ? "attended" : "registered"}`}>{settings.satisfactionEvaluationEnabled ? "เปิดให้ประเมิน" : "ยังไม่เปิด"}</span>
          </div>
        </header>
        <div className="evaluation-dashboard-summary">
          <div className="stat-panel"><Star/><b>{summary.total.toLocaleString("th-TH")}</b><span>ผู้ทำแบบประเมิน</span></div>
          <div className="stat-panel"><Trophy/><b>{summary.average ? summary.average.toFixed(2) : "-"}</b><span>คะแนนเฉลี่ยรวม / 5</span></div>
          <div className="stat-panel"><Gift/><b>{summary.winners.length.toLocaleString("th-TH")}/3</b><span>Lucky Draw</span></div>
        </div>
        <div className="evaluation-detail-section-grid">
          {summary.sections.length ? summary.sections.map((section) => <article key={section.key}>
            <div><b>{section.title}</b><small>{section.count.toLocaleString("th-TH")} คำตอบ</small></div>
            <strong>{section.average ? section.average.toFixed(2) : "-"}/5</strong>
          </article>) : <div className="participant-empty">ยังไม่มีผลประเมิน</div>}
        </div>
      </section>

      <section className="admin-panel evaluation-detail-panel">
        <header className="admin-section-head"><ClipboardList/><div><h2>คะแนนรายข้อ</h2><p>แสดงค่าเฉลี่ยของแต่ละคำถามเพื่อดูจุดที่ทำได้ดีและจุดที่ควรปรับปรุง</p></div></header>
        <div className="evaluation-question-list detailed">
          {summary.questions.length ? summary.questions.map((question) => <div key={question.index}>
            <span>{question.index}. {question.label}<small>{question.count.toLocaleString("th-TH")} คำตอบ</small></span>
            <b>{question.average ? question.average.toFixed(2) : "-"}</b>
          </div>) : <div className="participant-empty">ยังไม่มีคะแนนรายข้อ</div>}
        </div>
      </section>

      <section className="admin-panel evaluation-detail-panel">
        <header className="admin-section-head"><ClipboardList/><div><h2>ข้อมูลทั่วไปและข้อเสนอแนะ</h2><p>สรุปคำตอบจากข้อมูลทั่วไป พร้อมรายการความคิดเห็นล่าสุด</p></div></header>
        <div className="evaluation-profile-grid">
          {Object.entries(summary.profiles).map(([key, values]) => <article key={key}>
            <b>{profileLabel(key)}</b>
            {values.length ? values.map((item) => <span key={item.label}>{item.label}<small>{item.count.toLocaleString("th-TH")} คน</small></span>) : <em>ยังไม่มีข้อมูล</em>}
          </article>)}
        </div>
        <div className="evaluation-comment-list">
          {summary.comments.length ? summary.comments.map((comment) => <article key={comment.registrationCode}>
            <b>{comment.name}</b>
            {comment.impressiveText && <p><strong>สิ่งที่ประทับใจ:</strong> {comment.impressiveText}</p>}
            {comment.suggestionText && <p><strong>ข้อเสนอแนะ:</strong> {comment.suggestionText}</p>}
            <small>{comment.registrationCode} • {formatAdminDate(comment.submittedAt)}</small>
          </article>) : <div className="participant-empty">ยังไม่มีข้อเสนอแนะเพิ่มเติม</div>}
        </div>
      </section>

      <section className="admin-panel evaluation-detail-panel" id="lucky-draw">
        <header className="admin-section-head">
          <Gift/>
          <div><h2>Lucky Draw</h2><p>จับฉลากทีละรางวัลจากผู้ที่เช็คอินและส่งแบบประเมินแล้ว ทุกผลถูกล็อกและบันทึกผู้ดำเนินการ</p></div>
        </header>
        <LuckyDrawWheel
          candidates={luckyDrawCandidates}
          initialWinners={summary.winners.map((winner) => ({
            registrationCode: winner.registration_code,
            name: winner.participant_name ?? winner.registration_code,
            email: winner.email ?? "",
            prize: Number(winner.lucky_draw_prize),
            drawnAt: winner.lucky_drawn_at,
            drawnBy: winner.lucky_drawn_by_email,
            notifiedAt: winner.lucky_notified_at,
          }))}
          isSuperAdmin={isSuperAdmin}
          resetOtpStatus={params.resetOtp}
        />
      </section>
    </div>
  </div>;
}

async function withFallback<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch (error) {
    console.error("evaluation detail failed", error);
    return fallback;
  }
}

function profileLabel(key: string) {
  if (key === "gender") return "เพศ";
  if (key === "ageRange") return "อายุ";
  if (key === "organizationType") return "ประเภทหน่วยงาน";
  if (key === "attendeeStatus") return "สถานภาพ";
  return key;
}

function formatAdminDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}
