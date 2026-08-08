import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { listSubmissions } from "../../../../../lib/admin-store";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import {
  buildCommitteeScoreboard,
  deleteCommitteeScoreRecord,
  listCommitteeScoreRecords,
  saveCommitteeScoreRecords,
} from "../../../../../lib/committee-score-store";
import { parseCommitteeScoreImportFile } from "../../../../../lib/committee-score-xlsx";
import { createCommitteeScoreReportVersion } from "../../../../../lib/committee-score-report-versions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const formData = await request.formData();
    const value = formData.get("file");
    file = value instanceof File ? value : null;
  } catch {
    return NextResponse.json({ ok: false, message: "รูปแบบไฟล์ไม่ถูกต้อง" }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ ok: false, message: "กรุณาแนบไฟล์คะแนน Excel" }, { status: 400 });
  }

  try {
    const submissions = await listSubmissions();
    let existingRecords: Awaited<ReturnType<typeof listCommitteeScoreRecords>> = [];
    try {
      existingRecords = await listCommitteeScoreRecords();
    } catch (error) {
      // A first import must work even when there are no previous score records.
      console.warn("committee score import existing scores unavailable; importing as new scores", error);
    }
    const sortedSubmissions = submissions.slice().sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
    const parsed = await parseCommitteeScoreImportFile(file, sortedSubmissions, existingRecords);

    if (parsed.errors.length) {
      return NextResponse.json({
        ok: false,
        message: `พบข้อผิดพลาด ${parsed.errors.length.toLocaleString("th-TH")} จุด กรุณาแก้ไขไฟล์แล้วอัปโหลดใหม่`,
        errors: parsed.errors.slice(0, 50),
      }, { status: 400 });
    }

    const saved = parsed.records.length
      ? await saveCommitteeScoreRecords(parsed.records.map((record) => ({
        ...record,
        submittedByEmail: session.email,
      })))
      : [];
    const deleted = [];
    for (const recordId of parsed.deleteRecordIds) {
      const record = await deleteCommitteeScoreRecord(recordId);
      if (record) deleted.push(record);
    }

    const snapshotRecords = await listCommitteeScoreRecords().catch(() => [
      ...existingRecords.filter((record) => !parsed.deleteRecordIds.includes(record.id)),
      ...saved,
    ]);
    const reportRows = buildCommitteeScoreboard(sortedSubmissions, snapshotRecords);
    const reportVersion = await createCommitteeScoreReportVersion({
      sourceFileName: file.name,
      createdByEmail: session.email,
      rows: reportRows,
    });

    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "committee_score.import_xlsx",
      entityType: "committee_score",
      summary: `นำเข้าคะแนนรวมคณะกรรมการจาก Excel ${saved.length.toLocaleString("th-TH")} รายการ`,
      payload: {
        fileName: file.name,
        saved: saved.length,
        deleted: deleted.length,
        touchedSubmissions: parsed.touchedSubmissions,
        reportVersion: reportVersion.version,
      },
    }, request.headers);

    revalidatePath("/admin");
    revalidatePath("/admin/committee-scores");
    revalidatePath("/admin/ocr-scores");
    return NextResponse.json({
      ok: true,
      saved: saved.length,
      deleted: deleted.length,
      changedCells: parsed.changedCells,
      touchedSubmissions: parsed.touchedSubmissions,
      reportVersionId: reportVersion.id,
      reportVersion: reportVersion.version,
      reportUrl: `/api/admin/committee-scores/export?versionId=${encodeURIComponent(reportVersion.id)}`,
      message: parsed.changedCells
        ? `นำเข้าคะแนนแล้ว ${parsed.changedCells.toLocaleString("th-TH")} ช่อง จาก ${parsed.touchedSubmissions.toLocaleString("th-TH")} ผลงาน`
        : "ไฟล์นี้ไม่มีคะแนนที่เปลี่ยนแปลงจากข้อมูลเดิม",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "นำเข้าคะแนนไม่สำเร็จ";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
