import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CheckCircle2, Clock, Lock, Send, Sparkles } from "lucide-react";
import { PageHero, SideNotes } from "../../components/SiteChrome";
import { getAdminSettings, isSatisfactionEvaluationOpen } from "../../lib/admin-store";
import { evaluationProfileFields, evaluationScale, evaluationSections } from "../../lib/evaluation-form";
import { findEvaluationByRegistrationCode, submitEvaluation } from "../../lib/evaluation-store";
import { participantSessionCookie } from "../../lib/participant-session";
import { findRegistrationByCode } from "../../lib/registration-lookup";

export const dynamic = "force-dynamic";

type EvaluationParams = {
  code?: string;
  submitted?: string;
  error?: string;
};

export default async function EvaluationPage({ searchParams }: { searchParams: Promise<EvaluationParams> }) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const sessionCode = cookieStore.get(participantSessionCookie)?.value ?? "";
  const registrationCode = (params.code ?? sessionCode).trim();
  const item = registrationCode ? await findRegistrationByCode(registrationCode) : null;
  const settings = await getAdminSettings();
  const evaluationOpen = isSatisfactionEvaluationOpen(settings);
  const existing = item ? await findEvaluationByRegistrationCode(item.registration_code) : null;

  return <>
    <PageHero
      eyebrow="SATISFACTION SURVEY"
      title="แบบประเมินความพึงพอใจ"
      description="ประเมินภาพรวมงานประกวดรางวัลนวัตกรรมตำรวจ เพื่อให้ทีมงานนำผลไปปรับปรุงการจัดงานครั้งต่อไป"
    />
    <section className="wide page-body evaluation-page">
      <div className="form-layout">
        {!item && <EvaluationStateCard
          icon="lock"
          title="ไม่พบข้อมูลลงทะเบียน"
          description="กรุณาเปิดหน้านี้จากลิงก์ในอีเมลยืนยัน หรือกลับไปหน้าข้อมูลการลงทะเบียนของคุณ"
        />}
        {item && !evaluationOpen && <EvaluationStateCard
          icon="clock"
          title="ยังไม่เปิดแบบประเมิน"
          description="ปุ่มทำแบบประเมินจะเปิดใช้งานหลังจาก Super Admin เปิดระบบจากหลังบ้าน"
          href={`/register/success?code=${encodeURIComponent(item.registration_code)}`}
          hrefLabel="กลับไปหน้าข้อมูลการลงทะเบียน"
        />}
        {item && evaluationOpen && item.status !== "attended" && <EvaluationStateCard
          icon="lock"
          title="ต้องเช็คอินหน้างานก่อน"
          description="แบบประเมินเปิดให้เฉพาะผู้เข้าร่วมงานที่เช็คอินหน้างานแล้วเท่านั้น"
          href={`/register/success?code=${encodeURIComponent(item.registration_code)}`}
          hrefLabel="กลับไปหน้าข้อมูลการลงทะเบียน"
        />}
        {item && evaluationOpen && item.status === "attended" && (existing || params.submitted === "1") && <EvaluationStateCard
          icon="done"
          title="ส่งแบบประเมินเรียบร้อยแล้ว"
          description="ขอบคุณสำหรับความคิดเห็น ทีมงานบันทึกผลสรุปไว้ในระบบหลังบ้านแล้ว"
          href={`/register/success?code=${encodeURIComponent(item.registration_code)}`}
          hrefLabel="กลับไปหน้าข้อมูลการลงทะเบียน"
        />}
        {item && evaluationOpen && item.status === "attended" && !existing && params.submitted !== "1" && <article className="evaluation-form-card">
          <header className="evaluation-form-head">
            <div>
              <span><Sparkles/>สำหรับผู้เช็คอินหน้างานแล้ว</span>
              <h2>ประเมินความพึงพอใจ</h2>
              <p>{item.title}{item.first_name} {item.last_name} • {item.registration_code}</p>
            </div>
            <div className="evaluation-person-badge">
              <small>ระดับผู้เข้าร่วมงาน</small>
              <b>{roleLabel(item.participant_role)}</b>
            </div>
          </header>
          {params.error && <div className="evaluation-alert">กรุณากรอกข้อมูลให้ครบถ้วนก่อนส่งแบบประเมิน</div>}
          <form className="evaluation-form" action={submitEvaluationAction}>
            <input type="hidden" name="registrationCode" value={item.registration_code}/>
            <section className="evaluation-block">
              <h3>1. ข้อมูลทั่วไป</h3>
              <div className="evaluation-profile-grid">
                {evaluationProfileFields.map((field) => <ProfileField key={field.name} field={field}/>)}
              </div>
            </section>
            <section className="evaluation-block">
              <div className="evaluation-scale-head">
                <h3>2. ระดับความพึงพอใจ</h3>
                <div>{evaluationScale.map((scale) => <span key={scale.value}>{scale.value} = {scale.label}</span>)}</div>
              </div>
              <div className="evaluation-section-list">
                {evaluationSections.map((section, sectionIndex) => <div className="evaluation-section" key={section.key}>
                  <h4>{section.title}</h4>
                  {section.items.map((itemLabel, itemIndex) => {
                    const questionIndex = evaluationSections.slice(0, sectionIndex).reduce((sum, sectionItem) => sum + sectionItem.items.length, 0) + itemIndex + 1;
                    return <QuestionField key={questionIndex} index={questionIndex} label={itemLabel}/>;
                  })}
                </div>)}
              </div>
            </section>
            <section className="evaluation-block">
              <h3>3. ความคิดเห็นเพิ่มเติม</h3>
              <div className="evaluation-textareas">
                <label>สิ่งที่ประทับใจ
                  <textarea name="impressiveText" rows={4} maxLength={1000} placeholder="เล่าสิ่งที่ทำได้ดีหรือประทับใจ"/>
                </label>
                <label>ข้อเสนอแนะ
                  <textarea name="suggestionText" rows={4} maxLength={1000} placeholder="ข้อเสนอแนะสำหรับการปรับปรุงครั้งต่อไป"/>
                </label>
              </div>
            </section>
            <div className="evaluation-submit-bar">
              <Link className="secondary" href={`/register/success?code=${encodeURIComponent(item.registration_code)}`}>กลับ</Link>
              <button className="primary" type="submit"><Send/>ส่งแบบประเมิน</button>
            </div>
          </form>
        </article>}
        <SideNotes/>
      </div>
    </section>
  </>;
}

function EvaluationStateCard({ icon, title, description, href, hrefLabel }: { icon: "lock" | "clock" | "done"; title: string; description: string; href?: string; hrefLabel?: string }) {
  const Icon = icon === "done" ? CheckCircle2 : icon === "clock" ? Clock : Lock;
  return <article className={`evaluation-state-card ${icon}`}>
    <Icon/>
    <span>แบบประเมินความพึงพอใจ</span>
    <h2>{title}</h2>
    <p>{description}</p>
    {href && <Link className="primary" href={href}>{hrefLabel ?? "กลับ"}</Link>}
  </article>;
}

function ProfileField({ field }: { field: typeof evaluationProfileFields[number] }) {
  const hasOtherInput = "otherOption" in field;
  return <fieldset className="evaluation-profile-field">
    <legend>{field.label}</legend>
    <div>
      {field.options.map((option) => <label key={option}>
        <input type="radio" name={field.name} value={option} required/>
        <span>{option}</span>
      </label>)}
    </div>
    {hasOtherInput && <input className="evaluation-other-input" name={`${field.name}Other`} placeholder="โปรดระบุ ถ้าเลือกอื่น ๆ" maxLength={160}/>}
  </fieldset>;
}

function QuestionField({ index, label }: { index: number; label: string }) {
  return <div className="evaluation-question" role="radiogroup" aria-labelledby={`evaluation-question-${index}`}>
    <div className="evaluation-question-title" id={`evaluation-question-${index}`}><span>{index}</span>{label}</div>
    <div className="evaluation-question-options">
      {evaluationScale.map((scale) => <label key={scale.value}>
        <input type="radio" name={`q${index}`} value={scale.value} required/>
        <span><b>{scale.value}</b><small>{scale.label}</small></span>
      </label>)}
    </div>
  </div>;
}

async function submitEvaluationAction(formData: FormData) {
  "use server";
  const registrationCode = String(formData.get("registrationCode") ?? "").trim();
  const settings = await getAdminSettings();
  if (!isSatisfactionEvaluationOpen(settings)) redirect(`/evaluation?code=${encodeURIComponent(registrationCode)}&error=closed`);

  const item = registrationCode ? await findRegistrationByCode(registrationCode) : null;
  if (!item || item.status !== "attended") redirect(`/evaluation?code=${encodeURIComponent(registrationCode)}&error=attended`);

  const scores = evaluationSections.flatMap((section, sectionIndex) => section.items.map((_, itemIndex) => {
    const questionIndex = evaluationSections.slice(0, sectionIndex).reduce((sum, sectionItem) => sum + sectionItem.items.length, 0) + itemIndex + 1;
    return Number(formData.get(`q${questionIndex}`));
  }));

  try {
    await submitEvaluation({
      registrationCode,
      gender: getString(formData, "gender"),
      genderOther: getString(formData, "genderOther"),
      ageRange: getString(formData, "ageRange"),
      organizationType: getString(formData, "organizationType"),
      organizationOther: getString(formData, "organizationTypeOther"),
      attendeeStatus: getString(formData, "attendeeStatus"),
      attendeeStatusOther: getString(formData, "attendeeStatusOther"),
      scores,
      impressiveText: getString(formData, "impressiveText"),
      suggestionText: getString(formData, "suggestionText"),
    });
  } catch (error) {
    const typedError = error as { code?: string; message?: string };
    if (typedError.code === "DUPLICATE_EVALUATION" || typedError.message?.toLowerCase().includes("duplicate")) {
      redirect(`/evaluation?code=${encodeURIComponent(registrationCode)}&submitted=1`);
    }
    redirect(`/evaluation?code=${encodeURIComponent(registrationCode)}&error=required`);
  }

  revalidatePath("/admin");
  revalidatePath("/evaluation");
  revalidatePath(`/register/success?code=${encodeURIComponent(registrationCode)}`);
  redirect(`/evaluation?code=${encodeURIComponent(registrationCode)}&submitted=1`);
}

function getString(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function roleLabel(role?: string | null) {
  const normalized = role?.trim().toLowerCase();
  if (normalized === "vip") return "VIP";
  if (normalized === "exhibitor") return "Exhibitor";
  return "Guest";
}
