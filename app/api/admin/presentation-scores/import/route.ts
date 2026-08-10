import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listSubmissions, listWinners } from "../../../../../lib/admin-store";
import { listPresentationJudgeProfiles, listPresentationScoreRecords, deletePresentationScoreRecord, savePresentationScoreRecords } from "../../../../../lib/presentation-score-store";
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
    const [submissions, winners, profiles, existing] = await Promise.all([listSubmissions(), listWinners(), listPresentationJudgeProfiles(), listPresentationScoreRecords()]);
    const finalists = selectPresentationSubmissions(submissions, winners);
    const parsed = await parsePresentationScoreImportFile(file, finalists, profiles, existing);
    if (parsed.errors.length) return NextResponse.json({ ok: false, message: `พบข้อผิดพลาด ${parsed.errors.length.toLocaleString("th-TH")} จุด`, errors: parsed.errors.slice(0, 50) }, { status: 400 });
    const saved = parsed.records.length ? await savePresentationScoreRecords(parsed.records.map((record) => ({ ...record, submittedByEmail: session.email }))) : [];
    for (const recordId of parsed.deleteRecordIds) await deletePresentationScoreRecord(recordId);
    await recordAuditEvent({ actor: actorFromAdminSession(session), action: "presentation_score.import_xlsx", entityType: "presentation_score", summary: `นำเข้าคะแนนรอบที่ 2 ${saved.length.toLocaleString("th-TH")} รายการ`, payload: { fileName: file.name, saved: saved.length, deleted: parsed.deleteRecordIds.length, finalists: finalists.length } }, request.headers);
    return NextResponse.json({ ok: true, saved: saved.length, deleted: parsed.deleteRecordIds.length, changedCells: parsed.changedCells, touchedSubmissions: parsed.touchedSubmissions, message: parsed.changedCells ? `นำเข้าคะแนนแล้ว ${parsed.changedCells.toLocaleString("th-TH")} ช่อง` : "ไฟล์นี้ไม่มีคะแนนที่เปลี่ยนแปลง" });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "นำเข้าคะแนนรอบที่ 2 ไม่สำเร็จ" }, { status: 400 });
  }
}

