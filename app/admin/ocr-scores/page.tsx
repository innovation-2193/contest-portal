import Link from "next/link";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Download, FileScan, Save, Trash2, Trophy } from "lucide-react";
import { CommitteeScoreOcrClient, type OcrSubmissionOption } from "../../../components/CommitteeScoreOcrClient";
import { ConfirmSubmitButton } from "../../../components/ConfirmSubmitButton";
import { actorFromAdminSession, recordAuditEvent } from "../../../lib/audit-log";
import { listSubmissions } from "../../../lib/admin-store";
import { requireSuperAdminPage } from "../../../lib/admin-guard";
import {
  buildCommitteeScoreboard,
  committeeJudges,
  committeeScoreCriteria,
  deleteCommitteeScoreRecord,
  listCommitteeScoreRecords,
  updateCommitteeScoreRecord,
  type CommitteeScoreRecord,
  type CommitteeScoreSummaryRow,
} from "../../../lib/committee-score-store";

export const dynamic = "force-dynamic";

export default async function AdminOcrScoresPage() {
  const session = await requireSuperAdminPage();
  const requestHeaders = await headers();
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
  const exportHref = localSafeAdminHref(requestHeaders, "/api/admin/committee-scores/export");

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
          <a className="primary" href={exportHref} target="_blank" rel="noreferrer"><Download/>Export ผลคะแนน</a>
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

      <CommitteeScoreRecordsPanel records={records}/>

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

function CommitteeScoreRecordsPanel({ records }: { records: CommitteeScoreRecord[] }) {
  const ordered = records.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.submissionOrder - b.submissionOrder);
  return <section className="admin-panel committee-records-panel">
    <header className="admin-section-head">
      <FileScan/>
      <div>
        <h2>รายการคะแนน OCR ที่บันทึกแล้ว</h2>
        <p>แก้ไขคะแนนรายข้อ สรุปคะแนน หมายเหตุ หรือลบคะแนนของกรรมการแต่ละท่านได้จากส่วนนี้</p>
      </div>
      <span className="status-pill">{ordered.length.toLocaleString("th-TH")} รายการ</span>
    </header>
    <div className="committee-record-list">
      {ordered.length ? ordered.map((record) => <details className="committee-record-card" key={record.id}>
        <summary>
          <span><b>{record.submissionTitle}</b><small>{record.submissionCode} • รายการที่ {record.submissionOrder.toLocaleString("th-TH")} • {record.judgeName}</small></span>
          <em className={`status-pill ${record.totalMismatch ? "cancelled" : "attended"}`}>{record.calculatedTotal.toFixed(2)}/100</em>
        </summary>
        <form action={updateCommitteeScoreAction} className="committee-record-form">
          <input type="hidden" name="recordId" value={record.id}/>
          <div className="committee-record-score-grid">
            {committeeScoreCriteria.map((criterion) => <label key={criterion.id}>
              <span>{criterion.id}<small>เต็ม {criterion.max}</small></span>
              <input type="number" name={`score-${criterion.id}`} min={0} max={criterion.max} step="0.5" defaultValue={record.itemScores[criterion.id] ?? ""}/>
            </label>)}
          </div>
          <div className="committee-record-meta-grid">
            <label>สรุปคะแนนที่กรอกในใบ<input type="number" name="declaredTotal" min={0} max={100} step="0.5" defaultValue={record.declaredTotal ?? ""}/></label>
            <label>ผลรวมระบบ<input readOnly value={record.calculatedTotal.toFixed(2)}/></label>
            <label>ผลต่าง<input readOnly value={record.totalMismatch === null ? "-" : record.totalMismatch.toFixed(2)}/></label>
          </div>
          <label>หมายเหตุผู้พิจารณา<textarea name="note" rows={3} defaultValue={record.note ?? ""}/></label>
          <div className="committee-record-actions">
            <button className="primary" type="submit"><Save/>บันทึกการแก้ไข</button>
          </div>
        </form>
        <form action={deleteCommitteeScoreAction} className="committee-record-delete-form">
          <input type="hidden" name="recordId" value={record.id}/>
          <ConfirmSubmitButton className="danger-btn" type="submit" message={`ยืนยันลบคะแนน OCR ของ ${record.judgeName} ในโครงการ ${record.submissionCode}?`}><Trash2/>ลบคะแนนรายการนี้</ConfirmSubmitButton>
        </form>
      </details>) : <div className="participant-empty">ยังไม่มีคะแนน OCR ที่บันทึกไว้</div>}
    </div>
  </section>;
}

async function updateCommitteeScoreAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdminPage();
  const recordId = String(formData.get("recordId") ?? "");
  const itemScores = Object.fromEntries(committeeScoreCriteria.map((criterion) => [criterion.id, nullableScore(formData.get(`score-${criterion.id}`))]));
  const declaredTotal = nullableScore(formData.get("declaredTotal"));
  const note = String(formData.get("note") ?? "");
  const record = await updateCommitteeScoreRecord({ recordId, itemScores, declaredTotal, note, submittedByEmail: session.email });
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "committee_score.ocr_updated",
    entityType: "committee_score",
    entityId: record.id,
    summary: `แก้ไขคะแนน OCR ${record.submissionCode} โดย ${record.judgeName}`,
    payload: { submissionCode: record.submissionCode, judgeKey: record.judgeKey, calculatedTotal: record.calculatedTotal, declaredTotal: record.declaredTotal },
  }, await headers());
  revalidatePath("/admin");
  revalidatePath("/admin/ocr-scores");
}

async function deleteCommitteeScoreAction(formData: FormData) {
  "use server";
  const session = await requireSuperAdminPage();
  const recordId = String(formData.get("recordId") ?? "");
  const deleted = await deleteCommitteeScoreRecord(recordId);
  if (deleted) {
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "committee_score.ocr_deleted",
      entityType: "committee_score",
      entityId: deleted.id,
      summary: `ลบคะแนน OCR ${deleted.submissionCode} โดย ${deleted.judgeName}`,
      payload: { submissionCode: deleted.submissionCode, judgeKey: deleted.judgeKey, calculatedTotal: deleted.calculatedTotal },
    }, await headers());
  }
  revalidatePath("/admin");
  revalidatePath("/admin/ocr-scores");
}

function nullableScore(value: FormDataEntryValue | null) {
  if (value === null || value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function localSafeAdminHref(requestHeaders: Headers, pathname: string) {
  const host = requestHeaders.get("host") ?? "";
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!host.startsWith("0.0.0.0")) return cleanPath;
  const port = host.includes(":") ? `:${host.split(":").at(-1)}` : "";
  return `http://localhost${port}${cleanPath}`;
}
