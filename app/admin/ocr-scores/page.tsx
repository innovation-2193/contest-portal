import Link from "next/link";
import { ArrowLeft, Download, FileScan, Trophy } from "lucide-react";
import { CommitteeScoreOcrClient, type OcrSubmissionOption } from "../../../components/CommitteeScoreOcrClient";
import { listSubmissions } from "../../../lib/admin-store";
import { requireSuperAdminPage } from "../../../lib/admin-guard";
import {
  buildCommitteeScoreboard,
  committeeJudges,
  listCommitteeScoreRecords,
  type CommitteeScoreSummaryRow,
} from "../../../lib/committee-score-store";

export const dynamic = "force-dynamic";

export default async function AdminOcrScoresPage() {
  const session = await requireSuperAdminPage();
  const [submissions, records] = await Promise.all([listSubmissions(), listCommitteeScoreRecords()]);
  const orderedSubmissions = submissions
    .slice()
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  const submissionOptions: OcrSubmissionOption[] = orderedSubmissions.map((submission, index) => ({
    code: submission.submission_code,
    title: submission.title_th,
    order: index + 1,
  }));
  const scoreboard = buildCommitteeScoreboard(orderedSubmissions, records);
  const scoredCount = scoreboard.filter((row) => row.averageScore !== null).length;
  const completeCount = scoreboard.filter((row) => row.judgeCount === committeeJudges.length).length;

  return <div className="admin-page">
    <div className="wide">
      <div className="admin-topline">
        <div>
          <span className="eyebrow">Committee Score OCR</span>
          <h1>OCR คะแนน</h1>
          <p>อ่านคะแนนจากแบบฟอร์มกรรมการ ตรวจทานก่อนบันทึก และจัดอันดับคะแนนเฉลี่ยของคณะกรรมการรอบที่ 1</p>
          <small className="admin-role-badge">Super Admin • {session.email}</small>
        </div>
        <div className="admin-actions">
          <a className="primary" href="/api/admin/committee-scores/export" target="_blank" rel="noreferrer"><Download/>Export ผลคะแนน</a>
          <Link className="secondary" href="/admin"><ArrowLeft/>กลับหลังบ้าน</Link>
        </div>
      </div>

      <section className="admin-panel committee-scoreboard-panel">
        <header className="admin-section-head">
          <Trophy/>
          <div>
            <h2>การพิจารณาผลคะแนนของคณะกรรมการรอบที่ 1</h2>
            <p>คะแนนรวมของกรรมการ 5 ท่าน ระบบนำคะแนนที่บันทึกแล้วมาเฉลี่ยและจัดอันดับอัตโนมัติ</p>
          </div>
          <div className="committee-score-stats">
            <span>มีคะแนน {scoredCount.toLocaleString("th-TH")} รายการ</span>
            <span>ครบ 5 คน {completeCount.toLocaleString("th-TH")} รายการ</span>
          </div>
        </header>
        <CommitteeScoreboardTable rows={scoreboard}/>
      </section>

      <CommitteeScoreOcrClient submissions={submissionOptions}/>
    </div>
  </div>;
}

function CommitteeScoreboardTable({ rows }: { rows: CommitteeScoreSummaryRow[] }) {
  return <div className="admin-table-wrap committee-scoreboard-wrap">
    <table className="admin-table compact-admin-table committee-scoreboard-table">
      <thead>
        <tr>
          <th>อันดับ</th>
          <th>ลำดับนวัตกรรม</th>
          <th>รหัส</th>
          <th>ชื่อนวัตกรรม</th>
          {committeeJudges.map((judge) => <th key={judge.key}>ก.{judge.order}</th>)}
          <th>เฉลี่ย</th>
          <th>สถานะ</th>
        </tr>
      </thead>
      <tbody>
        {rows.length ? rows.map((row) => <tr key={row.submissionCode}>
          <td data-label="อันดับ"><b>{row.rank.toLocaleString("th-TH")}</b></td>
          <td data-label="ลำดับนวัตกรรม">{row.submissionOrder.toLocaleString("th-TH")}</td>
          <td data-label="รหัส"><b>{row.submissionCode}</b></td>
          <td data-label="ชื่อนวัตกรรม">{row.submissionTitle}<small>{row.ownerName} • {row.division}</small></td>
          {committeeJudges.map((judge) => <td key={judge.key} data-label={`ก.${judge.order}`}>{scoreText(row.judgeScores[judge.key])}</td>)}
          <td data-label="เฉลี่ย"><span className={`status-pill ${row.averageScore === null ? "registered" : "attended"}`}><Trophy/>{row.averageScore === null ? "-" : row.averageScore.toFixed(2)}</span></td>
          <td data-label="สถานะ"><span className={`status-pill ${row.judgeCount === committeeJudges.length ? "attended" : "registered"}`}>{row.judgeCount}/5 คน</span></td>
        </tr>) : <tr><td colSpan={10}>ยังไม่มีรายการนวัตกรรม</td></tr>}
      </tbody>
    </table>
    <div className="committee-score-legend">
      <FileScan/>
      {committeeJudges.map((judge) => <span key={judge.key}>ก.{judge.order} {judge.rank}{judge.name}</span>)}
    </div>
  </div>;
}

function scoreText(score: number | null | undefined) {
  return typeof score === "number" ? score.toFixed(0) : "-";
}
