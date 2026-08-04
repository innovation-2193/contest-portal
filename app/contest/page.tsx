import { Download, FileArchive, FileText } from "lucide-react";
import { getSubmissionDetail, listSubmissions, type SubmissionListItem } from "../../lib/admin-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ContestRow = {
  submission: SubmissionListItem;
  documentCount: number;
};

export default async function ContestPage() {
  const submissions = (await listSubmissions()).sort(compareSubmittedAt);
  const rows = await Promise.all(submissions.map(async (submission) => {
    const detail = await getSubmissionDetail(submission.submission_code);
    return {
      submission,
      documentCount: detail?.files.length ?? 0,
    } satisfies ContestRow;
  }));

  return <div className="contest-public-page">
    <div className="wide contest-public-shell">
      <section className="contest-public-hero">
        <div className="contest-public-hero-icon"><FileArchive/></div>
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
                <th>ดาวน์โหลดเอกสาร</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row, index) => <tr key={row.submission.submission_code}>
                <td data-label="ลำดับ">{(index + 1).toLocaleString("th-TH")}</td>
                <td data-label="ชื่อนวัตกรรม"><b>{row.submission.title_th}</b></td>
                <td data-label="ดาวน์โหลดเอกสาร">
                  {row.documentCount > 0
                    ? <a className="contest-download-button" href={`/api/contest/submissions/${encodeURIComponent(row.submission.submission_code)}/documents`}>
                      <Download/>ดาวน์โหลดเอกสาร
                    </a>
                    : <span className="contest-download-empty">ไม่มีเอกสาร</span>}
                </td>
              </tr>) : <tr><td colSpan={3}>ยังไม่มีรายการสมัครประกวด</td></tr>}
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
