import { cookies } from "next/headers";
import Link from "next/link";
import { FileCheck2, FolderOpen } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHero, SideNotes } from "../../../components/SiteChrome";
import { getParticipantSession, participantSessionCookie } from "../../../lib/participant-session";
import { findSubmissionsByEmail } from "../../../lib/submission-lookup";

export const dynamic = "force-dynamic";

export default async function SubmissionSuccess({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const cookieStore = await cookies();
  const session = getParticipantSession(cookieStore.get(participantSessionCookie)?.value);
  if (!session) redirect("/profile/login");

  const submissions = await findSubmissionsByEmail(session.email);
  const item = code
    ? submissions.find((submission) => submission.submission_code === code)
    : submissions[0];

  return <>
    <PageHero
      eyebrow="INNOVATION CONTEST SUBMISSION"
      title="ผลงานประกวดนวัตกรรมตำรวจ"
      description="รายละเอียดใบสมัครและรหัสผลงานที่เชื่อมกับบัญชีของคุณ"
    />
    <section className="wide page-body">
      <div className="form-layout">
        {item
          ? <article className="success-card submission-success">
              <span>ข้อมูลผลงานของคุณ</span>
              <h2>รายละเอียดใบสมัครประกวด</h2>
              <p>บัญชีที่เข้าสู่ระบบ: <b>{session.email}</b></p>
              <div className="submission-code">
                <div><small>รหัสผลงาน</small><strong>{item.submission_code}</strong><p>ระบบบันทึกข้อมูลและไฟล์เรียบร้อยแล้ว</p></div>
                <FileCheck2/>
              </div>
              <dl className="detail-list">
                <div><dt>ชื่อผลงาน</dt><dd>{item.title_th}</dd></div>
                <div><dt>Innovation Title</dt><dd>{item.title_en || "-"}</dd></div>
                <div><dt>ผู้สมัครหลัก</dt><dd>{item.title}{item.first_name} {item.last_name}</dd></div>
                <div><dt>ตำแหน่ง</dt><dd>{item.position || "-"}</dd></div>
                <div><dt>ประเภทการส่ง</dt><dd>{item.submission_type === "team" ? "ส่งแบบกลุ่ม" : "ส่งเดี่ยว"}</dd></div>
                <div><dt>กองบังคับการ / กองบัญชาการ</dt><dd>{item.division} / {item.bureau}</dd></div>
                <div><dt>สถานะ</dt><dd>{submissionStatusLabel(item.status)}</dd></div>
              </dl>
              <Link className="secondary participant-back-link" href="/profile"><FolderOpen/>ดูผลงานทั้งหมดในโปรไฟล์</Link>
            </article>
          : <article className="success-card">
              <h2>ไม่พบผลงานในบัญชีนี้</h2>
              <p>รหัสผลงานนี้ไม่ได้เชื่อมกับอีเมลที่กำลังเข้าสู่ระบบ</p>
              <Link className="secondary participant-back-link" href="/profile"><FolderOpen/>กลับหน้าโปรไฟล์</Link>
            </article>}
        <SideNotes submission/>
      </div>
    </section>
  </>;
}

function submissionStatusLabel(status?: string | null) {
  if (status === "approved") return "ผ่านการตรวจสอบ";
  if (status === "rejected") return "ไม่ผ่านการตรวจสอบ";
  if (status === "screening") return "อยู่ระหว่างตรวจสอบ";
  return "ส่งข้อมูลแล้ว / รอตรวจสอบ";
}
