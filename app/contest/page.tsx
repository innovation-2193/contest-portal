import { cookies } from "next/headers";
import { Download, FileText, Search } from "lucide-react";
import { ContestDocumentReplaceControl } from "../../components/ContestDocumentReplaceControl";
import { ContestVideoButton } from "../../components/ContestVideoButton";
import { cookieName, getAdminSession } from "../../lib/admin-auth";
import { listSubmissionApplicantsForExport, listSubmissions, type SubmissionApplicantExportRow, type SubmissionListItem } from "../../lib/admin-store";
import { listAdminAccounts } from "../../lib/admin-users";
import { formatApplicantName } from "../../lib/thai-rank-title";
import { checkVideoLink } from "../../lib/video-link-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ContestRow = {
  hasUsableVideoLink: boolean;
  reviewerName: string;
  submitterName: string;
  teamMemberNames: string[];
  submission: SubmissionListItem;
};

type ContestVideoStatus = "all" | "has" | "missing";

export default async function ContestPage({ searchParams }: { searchParams: Promise<{ q?: string; reviewer?: string; video?: string }> }) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const adminSession = getAdminSession(cookieStore.get(cookieName)?.value);
  const isSuperAdmin = adminSession?.role === "super_admin";
  const q = (params.q ?? "").replace(/\s+/g, " ").trim();
  const reviewer = (params.reviewer ?? "").trim().toLowerCase();
  const videoStatus = normalizeVideoStatus(params.video);
  const [submissions, admins, applicantRows] = await Promise.all([
    listSubmissions(),
    listAdminAccounts(),
    listSubmissionApplicantsForExport(),
  ]);
  const memberNamesBySubmission = buildMemberNamesBySubmission(applicantRows);
  const reviewerContacts = new Map(admins.map((admin) => [
    admin.email.toLowerCase(),
    { name: admin.name || admin.email, phone: admin.phone },
  ]));
  const reviewerOptions = buildReviewerOptions(submissions, reviewerContacts);
  const prefilteredSubmissions = filterByReviewer(filterByInnovationName(submissions, q), reviewer);
  const rows = await Promise.all(prefilteredSubmissions.map(async (submission) => {
    const memberNames = memberNamesBySubmission.get(submission.submission_code) ?? [formatApplicantName(submission)];
    return {
      hasUsableVideoLink: await checkVideoLink(submission.video_url) === "ok",
      reviewerName: reviewerName(submission, reviewerContacts),
      submitterName: memberNames[0] || "-",
      teamMemberNames: memberNames.slice(1),
      submission,
    } satisfies ContestRow;
  }))
    .then((items) => filterByVideoStatus(items, videoStatus))
    .then((items) => items.sort((left, right) => compareSubmittedAt(left.submission, right.submission)));

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

        <form className="contest-public-filter-form" method="get">
          <label className="contest-public-search">ค้นหาชื่อนวัตกรรม
            <div><Search/><input name="q" defaultValue={q} placeholder="กรอกชื่อนวัตกรรมภาษาไทยหรืออังกฤษ"/></div>
          </label>
          <label>ผู้ตรวจเอกสารเบื้องต้น
            <select name="reviewer" defaultValue={reviewer}>
              <option value="">ทั้งหมด</option>
              <option value="__unassigned">ยังไม่ระบุ</option>
              {reviewerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>สถานะ Link Video
            <select name="video" defaultValue={videoStatus}>
              <option value="all">ทั้งหมด</option>
              <option value="has">มี Link Video</option>
              <option value="missing">ไม่มี Link Video</option>
            </select>
          </label>
          <div className="contest-public-filter-actions">
            <button type="submit">ค้นหา</button>
            <a href="/contest">ล้าง</a>
          </div>
        </form>

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
                    {row.submission.submission_type === "team" && <small>ชื่อทีม: {row.submission.team_name?.trim() || "ไม่ระบุชื่อทีม"}</small>}
                    <small>ส่งผลงานโดย: {row.submitterName}</small>
                    <small>หน่วยงาน: {[row.submission.division, row.submission.bureau].filter((value) => value?.trim()).join(" / ") || "ไม่ระบุหน่วยงาน"}</small>
                    {row.submission.submission_type === "team" && row.teamMemberNames.length > 0 && <small>สมาชิกทีม: {row.teamMemberNames.join(" • ")}</small>}
                    <em>ผู้ตรวจเอกสารเบื้องต้น: {row.reviewerName}</em>
                  </div>
                </td>
                <td className="contest-action-cell" data-label="Link Video">
                  <ContestVideoButton
                    hasVideoLink={row.hasUsableVideoLink}
                    submissionCode={row.submission.submission_code}
                  />
                </td>
                <td className="contest-action-cell" data-label="ดาวน์โหลดเอกสาร">
                  <div className="contest-document-actions">
                    <a className="contest-download-button" href={`/api/contest/submissions/${encodeURIComponent(row.submission.submission_code)}/documents`}>
                      <Download/>ดาวน์โหลดเอกสาร
                    </a>
                    {isSuperAdmin ? <ContestDocumentReplaceControl submissionCode={row.submission.submission_code}/> : null}
                  </div>
                </td>
              </tr>) : <tr><td colSpan={4}>ไม่พบรายการสมัครประกวดตามเงื่อนไขที่เลือก</td></tr>}
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

function filterByInnovationName(submissions: SubmissionListItem[], query: string) {
  const needle = query.toLowerCase();
  if (!needle) return submissions;
  return submissions.filter((submission) =>
    [submission.title_th, submission.title_en]
      .some((value) => String(value ?? "").toLowerCase().includes(needle)),
  );
}

function filterByReviewer(submissions: SubmissionListItem[], reviewer: string) {
  if (!reviewer) return submissions;
  if (reviewer === "__unassigned") return submissions.filter((submission) => !submission.review_assigned_admin_email?.trim());
  return submissions.filter((submission) => submission.review_assigned_admin_email?.trim().toLowerCase() === reviewer);
}

function filterByVideoStatus(rows: ContestRow[], videoStatus: ContestVideoStatus) {
  if (videoStatus === "has") return rows.filter((row) => row.hasUsableVideoLink);
  if (videoStatus === "missing") return rows.filter((row) => !row.hasUsableVideoLink);
  return rows;
}

function normalizeVideoStatus(value?: string): ContestVideoStatus {
  if (value === "has" || value === "missing") return value;
  return "all";
}

function reviewerName(submission: SubmissionListItem, reviewerContacts: Map<string, { name: string; phone: string }>) {
  const email = submission.review_assigned_admin_email?.trim().toLowerCase();
  if (!email) return "ยังไม่ระบุ";
  const contact = reviewerContacts.get(email);
  if (!contact) return submission.review_assigned_admin_email || "ยังไม่ระบุ";
  return contact.phone ? `${contact.name} (${contact.phone})` : contact.name;
}

function buildReviewerOptions(submissions: SubmissionListItem[], reviewerContacts: Map<string, { name: string; phone: string }>) {
  const emails = new Set(
    submissions
      .map((submission) => submission.review_assigned_admin_email?.trim().toLowerCase() ?? "")
      .filter(Boolean),
  );
  return [...emails]
    .map((email) => ({ value: email, label: reviewerContacts.get(email)?.name || email }))
    .sort((left, right) => left.label.localeCompare(right.label, "th"));
}

function buildMemberNamesBySubmission(rows: SubmissionApplicantExportRow[]) {
  const names = new Map<string, string[]>();
  for (const row of rows) {
    const name = formatApplicantName(row);
    if (!name || name === "-") continue;
    const current = names.get(row.submission_code) ?? [];
    current[row.member_order - 1] = name;
    names.set(row.submission_code, current);
  }
  for (const [code, members] of names) names.set(code, members.filter(Boolean));
  return names;
}
