import { Download, FileText } from "lucide-react";
import { ContestVideoButton } from "../../components/ContestVideoButton";
import { listSubmissions, type SubmissionListItem } from "../../lib/admin-store";
import { listAdminAccounts } from "../../lib/admin-users";
import { checkVideoLink } from "../../lib/video-link-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ContestRow = {
  hasUsableVideoLink: boolean;
  reviewerName: string;
  submission: SubmissionListItem;
};

export default async function ContestPage() {
  const [submissions, admins] = await Promise.all([
    listSubmissions(),
    listAdminAccounts(),
  ]);
  const reviewerContacts = new Map(admins.map((admin) => [
    admin.email.toLowerCase(),
    { name: admin.name || admin.email, phone: admin.phone },
  ]));
  const rows = await Promise.all(submissions.map(async (submission) => ({
    hasUsableVideoLink: await checkVideoLink(submission.video_url) === "ok",
    reviewerName: reviewerName(submission, reviewerContacts),
    submission,
  } satisfies ContestRow))).then((items) => items.sort((left, right) => compareSubmittedAt(left.submission, right.submission)));

  return <div className="contest-public-page">
    <div className="wide contest-public-shell">
      <section className="contest-public-hero">
        <div className="contest-public-hero-icon"><FileText/></div>
        <div>
          <span className="eyebrow">Public Contest Documents</span>
          <h1>รายการสมัครประกวดนวัตกรรม</h1>
          <p>สำหรับผู้บังคับบัญชาเข้าดูรายชื่อผลงานและดาวน์โหลดเอกสารประกอบการพิจารณา</p>
        </div>
      </section>

      <section className="contest-public-panel" aria-label="รายการสมัครประกวด">
        <header>
          <div><FileText/><h2>รายการผลงานที่ส่งเข้าระบบ</h2></div>
          <span>{rows.length.toLocaleString("th-TH")} รายการ</span>
        </header>

        <div className="contest-public-table-wrap">
          <table className="contest-public-table">
            <thead>
              <tr>
                <th>ลำดับ</th>
                <th>ชื่อนวัตกรรม</th>
                <th>Link Video</th>
                <th>ดาวน์โหลดเอกสาร</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row, index) => <tr key={row.submission.submission_code}>
                <td data-label="ลำดับ">{(index + 1).toLocaleString("th-TH")}</td>
                <td data-label="ชื่อนวัตกรรม">
                  <div className="contest-title-cell">
                    <b>{row.submission.title_th}</b>
                    {row.submission.title_en?.trim() && <small>{row.submission.title_en.trim()}</small>}
                    <em>ผู้ตรวจเอกสารเบื้องต้น: {row.reviewerName}</em>
                  </div>
                </td>
                <td data-label="Link Video">
                  <ContestVideoButton
                    hasVideoLink={row.hasUsableVideoLink}
                    submissionCode={row.submission.submission_code}
                  />
                </td>
                <td data-label="ดาวน์โหลดเอกสาร">
                  <a className="contest-download-button" href={`/api/contest/submissions/${encodeURIComponent(row.submission.submission_code)}/documents`}>
                    <Download/>ดาวน์โหลดเอกสาร
                  </a>
                </td>
              </tr>) : <tr><td colSpan={4}>ยังไม่มีรายการสมัครประกวด</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>;
}

function compareSubmittedAt(left: SubmissionListItem, right: SubmissionListItem) {
  return new Date(left.submitted_at).getTime() - new Date(right.submitted_at).getTime();
}

function reviewerName(submission: SubmissionListItem, reviewerContacts: Map<string, { name: string; phone: string }>) {
  const email = submission.review_assigned_admin_email?.trim().toLowerCase();
  if (!email) return "ยังไม่ระบุ";
  const contact = reviewerContacts.get(email);
  if (!contact) return submission.review_assigned_admin_email || "ยังไม่ระบุ";
  return contact.phone ? `${contact.name} (${contact.phone})` : contact.name;
}
