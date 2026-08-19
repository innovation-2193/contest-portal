import Link from "next/link";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronDown, ClipboardList, FileDown, Gift, Star, Trophy, UserCheck } from "lucide-react";
import { AdminNotice } from "../../../components/AdminNotice";
import { BackButton } from "../../../components/BackButton";
import { LuckyDrawWheel } from "../../../components/LuckyDrawWheel";
import { ResetEvaluationsButton } from "../../../components/ResetEvaluationsButton";
import { adminOtpAutoFillCookie, canManageEvaluationAvailability, canOperateEventStaff, canOperateLuckyDraw, cookieName, getAdminOtpAutoFillCode, getAdminSession } from "../../../lib/admin-auth";
import { adminNoticePath } from "../../../lib/admin-flash";
import { getAdminSettings, getParticipantRegistrationRoleCounts, saveAdminSettings } from "../../../lib/admin-store";
import { actorFromAdminSession, recordAuditEvent } from "../../../lib/audit-log";
import { getEvaluationSummary, listEvaluationRespondents, listLuckyDrawCandidates, resetEvaluations, type EvaluationSummary } from "../../../lib/evaluation-store";

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

const emptyParticipantRoleCounts = { VIP: 0, Guest: 0, Exhibitor: 0, Competitor: 0, Staff: 0 };

export default async function AdminEvaluationsPage({ searchParams }: { searchParams: Promise<{ notice?: string; resetOtp?: string }> }) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) redirect("/admin");

  const params = await searchParams;
  const [summary, respondents, settings, luckyDrawCandidates, participantRoleCounts] = await Promise.all([
    withFallback(getEvaluationSummary(), emptyEvaluationSummary),
    withFallback(listEvaluationRespondents(), []),
    getAdminSettings(),
    withFallback(listLuckyDrawCandidates(), []),
    withFallback(getParticipantRegistrationRoleCounts(), emptyParticipantRoleCounts),
  ]);
  const totalParticipants = Object.values(participantRoleCounts).reduce((total, count) => total + count, 0);
  const isSuperAdmin = session.role === "super_admin";
  const canRunLuckyDraw = canOperateLuckyDraw(session);
  const resetOtpAutoFill = getAdminOtpAutoFillCode(cookieStore.get(adminOtpAutoFillCookie)?.value, { purpose: "reset_lucky_draw" });

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div>
          <span className="eyebrow">Evaluation Summary</span>
          <h1>สรุปแบบประเมินความพึงพอใจ</h1>
          <p>ดูคะแนนรวม คะแนนรายหมวด รายข้อ ข้อมูลทั่วไป ข้อเสนอแนะ และผู้โชคดี Lucky Draw</p>
        </div>
        <BackButton />
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
              {canManageEvaluationAvailability(session) && <form action={toggleEvaluationAction}><input type="hidden" name="enabled" value={settings.satisfactionEvaluationEnabled ? "0" : "1"}/><button className={settings.satisfactionEvaluationEnabled ? "secondary" : "primary"} type="submit">{settings.satisfactionEvaluationEnabled ? "ปิดแบบสอบถาม" : "เปิดแบบสอบถาม"}</button></form>}
              {isSuperAdmin && <form action={resetEvaluationsAction}><ResetEvaluationsButton disabled={!summary.total}/></form>}
          </div>
        </header>
        <div className="evaluation-dashboard-summary">
          <div className="stat-panel"><Star/><b>{summary.total.toLocaleString("th-TH")} / {totalParticipants.toLocaleString("th-TH")}</b><span>ผู้ทำแบบประเมิน / ผู้ลงทะเบียน</span></div>
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
        <header className="admin-section-head">
          <UserCheck/>
          <div><h2>ผู้ตอบแบบประเมินล่าสุด</h2><p>แสดง 10 รายการล่าสุด จากผู้ตอบทั้งหมด {respondents.length.toLocaleString("th-TH")} คน</p></div>
          <div className="admin-actions">
            <a className="primary" href="/api/admin/evaluations/export" target="_blank" rel="noreferrer"><FileDown/>Export PDF</a>
          </div>
        </header>
        <div className="admin-table-wrap">
          <table className="admin-table compact-admin-table evaluation-respondent-table">
            <thead><tr><th>ผู้ประเมิน</th><th>รหัสลงทะเบียน</th><th>วันที่ประเมิน</th><th>คะแนนภาพรวม</th></tr></thead>
            <tbody>
              {respondents.length ? respondents.slice(0, 10).map((respondent) => <tr key={respondent.registrationCode}>
                <td data-label="ผู้ประเมิน"><b>{respondent.name}</b><small>{respondent.email}</small></td>
                <td data-label="รหัสลงทะเบียน"><b>{respondent.registrationCode}</b></td>
                <td data-label="วันที่ประเมิน">{formatAdminDate(respondent.submittedAt)}</td>
                <td data-label="คะแนนภาพรวม"><span className="status-pill attended"><Star/>{respondent.overallAverage.toFixed(2)}/5</span></td>
              </tr>) : <tr><td colSpan={4}>ยังไม่มีผู้ตอบแบบประเมิน</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-panel evaluation-detail-panel">
        <details className="evaluation-question-toggle">
          <summary>
            <ClipboardList/>
            <div><h2>คะแนนรายข้อ</h2><p>กดเพื่อแสดงค่าเฉลี่ยของแต่ละคำถาม</p></div>
            <span><i className="show-label">แสดงคะแนน</i><i className="hide-label">ซ่อนคะแนน</i><ChevronDown/></span>
          </summary>
          <div className="evaluation-question-list detailed">
            {summary.questions.length ? summary.questions.map((question) => <div key={question.index}>
              <span>{question.index}. {question.label}<small>{question.count.toLocaleString("th-TH")} คำตอบ</small></span>
              <b>{question.average ? question.average.toFixed(2) : "-"}</b>
            </div>) : <div className="participant-empty">ยังไม่มีคะแนนรายข้อ</div>}
          </div>
        </details>
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
          canRunLuckyDraw={canRunLuckyDraw}
          canResetLuckyDraw={isSuperAdmin}
          resetOtpStatus={params.resetOtp}
          resetOtpAutoFill={resetOtpAutoFill}
        />
      </section>
    </div>
  </div>;
}

async function resetEvaluationsAction() {
  "use server";
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session || session.role !== "super_admin") redirect("/admin");

  let result;
  try {
    result = await resetEvaluations();
  } catch (error) {
    const code = String((error as { code?: string }).code ?? "");
    if (code === "ACTIVE_LUCKY_DRAW") {
      redirect(adminNoticePath("/admin/evaluations", "evaluations_reset_blocked"));
    }
    if (code === "NOTHING_TO_RESET") {
      redirect(adminNoticePath("/admin/evaluations", "evaluations_reset_empty"));
    }
    throw error;
  }

  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "evaluation.responses_reset",
    entityType: "evaluation",
    summary: `รีเซ็ตคำตอบแบบประเมินความพึงพอใจ ${result.deleted} รายการ`,
    payload: { deleted: result.deleted },
  }, await headers());
  revalidatePath("/admin");
  revalidatePath("/admin/evaluations");
  revalidatePath("/evaluation");
  redirect(adminNoticePath("/admin/evaluations", "evaluations_reset"));
}

async function toggleEvaluationAction(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session || !canManageEvaluationAvailability(session)) redirect("/admin");
  const settings = await getAdminSettings();
  const enabled = String(formData.get("enabled") ?? "") === "1";
  await saveAdminSettings({ ...settings, satisfactionEvaluationEnabled: enabled });
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "evaluation.availability_updated",
    entityType: "evaluation",
    summary: `${enabled ? "เปิด" : "ปิด"}แบบสอบถามความพึงพอใจ`,
    payload: { enabled },
  }, await headers());
  revalidatePath("/evaluation");
  revalidatePath("/admin");
  revalidatePath("/admin/evaluations");
  revalidatePath("/uci");
  redirect(adminNoticePath("/admin/evaluations", enabled ? "evaluation_opened" : "evaluation_closed"));
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
