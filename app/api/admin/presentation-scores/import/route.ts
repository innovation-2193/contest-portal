import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listSubmissions, listWinners } from "../../../../../lib/admin-store";
import { buildPresentationScoreboard, listPresentationJudgeProfiles, listPresentationScoreRecords, deletePresentationScoreRecord, savePresentationScoreRecords } from "../../../../../lib/presentation-score-store";
import { listCommitteeScoreRecords } from "../../../../../lib/committee-score-store";
import { createPresentationScoreReportVersion } from "../../../../../lib/presentation-score-report-versions";
import { selectPresentationSubmissions } from "../../../../../lib/presentation-score-utils";
import { parsePresentationScoreImportFile } from "../../../../../lib/presentation-score-xlsx";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, message: "กรุณาแนบไฟล์คะแนนรอบที่ 2" }, { status: 400 });
  try {
    const [submissions, winners, profiles, existing, round1Records] = await Promise.all([listSubmissions(), listWinners(), listPresentationJudgeProfiles(), listPresentationScoreRecords(), listCommitteeScoreRecords()]);
    const finalists = selectPresentationSubmissions(submissions, winners);
    const parsed = await parsePresentationScoreImportFile(file, finalists, profiles, existing);
    if (parsed.errors.length) return NextResponse.json({ ok: false, message: `พบข้อผิดพลาด ${parsed.errors.length.toLocaleString("th-TH")} จุด`, errors: parsed.errors.slice(0, 50) }, { status: 400 });
    const saved = parsed.records.length ? await savePresentationScoreRecords(parsed.records.map((record) => ({ ...record, submittedByEmail: session.email }))) : [];
    for (const recordId of parsed.deleteRecordIds) await deletePresentationScoreRecord(recordId);
    const persistedRecords = await listPresentationScoreRecords().catch(() => [...existing.filter((record) => !parsed.deleteRecordIds.includes(record.id)), ...saved]);
    const deletedIds = new Set(parsed.deleteRecordIds);
    const finalistCodes = new Set(finalists.map((item) => item.submission_code));
    const snapshotByKey = new Map<string, typeof persistedRecords[number]>();
    for (const record of existing) {
      if (!deletedIds.has(record.id) && finalistCodes.has(record.submissionCode)) snapshotByKey.set(`${record.submissionCode}:${record.judgeKey}`, record);
    }
    for (const record of persistedRecords) {
      if (!deletedIds.has(record.id) && finalistCodes.has(record.submissionCode)) snapshotByKey.set(`${record.submissionCode}:${record.judgeKey}`, record);
    }
    for (const record of saved) snapshotByKey.set(`${record.submissionCode}:${record.judgeKey}`, record);
    const reportRows = await buildPresentationScoreboard(finalists, [...snapshotByKey.values()], profiles, round1Records);
    const reportVersion = await createPresentationScoreReportVersion({ sourceFileName: file.name, createdByEmail: session.email, rows: reportRows });
    await recordAuditEvent({ actor: actorFromAdminSession(session), action: "presentation_score.import_xlsx", entityType: "presentation_score", summary: `นำเข้าคะแนนรอบที่ 2 ${saved.length.toLocaleString("th-TH")} รายการ`, payload: { fileName: file.name, saved: saved.length, deleted: parsed.deleteRecordIds.length, finalists: finalists.length, reportVersion: reportVersion.version } }, request.headers);
    return NextResponse.json({ ok: true, saved: saved.length, deleted: parsed.deleteRecordIds.length, changedCells: parsed.changedCells, touchedSubmissions: parsed.touchedSubmissions, reportVersionId: reportVersion.id, reportVersion: reportVersion.version, reportUrl: `/api/admin/presentation-scores/report?versionId=${encodeURIComponent(reportVersion.id)}`, message: parsed.changedCells ? `นำเข้าคะแนนแล้ว ${parsed.changedCells.toLocaleString("th-TH")} ช่อง และบันทึกเป็น Version ${reportVersion.version}` : `ไฟล์นี้ไม่มีคะแนนที่เปลี่ยนแปลง และบันทึกเป็น Version ${reportVersion.version}` });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "นำเข้าคะแนนรอบที่ 2 ไม่สำเร็จ" }, { status: 400 });
  }
}
