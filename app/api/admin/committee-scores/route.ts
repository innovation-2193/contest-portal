import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../lib/admin-guard";
import {
  deleteCommitteeScoreRecord,
  listCommitteeScoreRecords,
  saveCommitteeScoreRecords,
  updateCommitteeScoreRecord,
  type CommitteeScoreInput,
} from "../../../../lib/committee-score-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized", records: [] }, { status: 401 });
  }

  try {
    const records = await listCommitteeScoreRecords();
    return NextResponse.json({ ok: true, records });
  } catch (error) {
    console.error("committee score records failed", error);
    return NextResponse.json({ ok: false, message: "โหลดรายการคะแนน OCR ไม่สำเร็จ", records: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  let payload: { records?: CommitteeScoreInput[] };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const records = Array.isArray(payload.records) ? payload.records : [];
  if (!records.length) {
    return NextResponse.json({ ok: false, message: "ยังไม่มีรายการคะแนนสำหรับบันทึก" }, { status: 400 });
  }

  try {
    const saved = await saveCommitteeScoreRecords(records.map((record) => ({
      ...record,
      submittedByEmail: session.email,
    })));
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "committee_score.ocr_submitted",
      entityType: "committee_score",
      summary: `บันทึกคะแนน OCR คณะกรรมการ ${saved.length.toLocaleString("th-TH")} รายการ`,
      payload: { count: saved.length, submissions: saved.map((record) => record.submissionCode), judges: [...new Set(saved.map((record) => record.judgeKey))] },
    }, request.headers);
    revalidatePath("/admin");
    revalidatePath("/admin/ocr-scores");
    return NextResponse.json({ ok: true, saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถบันทึกคะแนนได้";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  let payload: {
    recordId?: string;
    itemScores?: Record<string, number | null | undefined>;
    declaredTotal?: number | null;
    note?: string | null;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const record = await updateCommitteeScoreRecord({
      recordId: payload.recordId ?? "",
      itemScores: payload.itemScores ?? {},
      declaredTotal: payload.declaredTotal ?? null,
      note: payload.note ?? null,
      submittedByEmail: session.email,
    });
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "committee_score.ocr_updated",
      entityType: "committee_score",
      entityId: record.id,
      summary: `แก้ไขคะแนน OCR ${record.submissionCode} โดย ${record.judgeName}`,
      payload: { submissionCode: record.submissionCode, judgeKey: record.judgeKey, calculatedTotal: record.calculatedTotal, declaredTotal: record.declaredTotal },
    }, request.headers);
    revalidatePath("/admin");
    revalidatePath("/admin/ocr-scores");
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถแก้ไขคะแนนได้";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  let payload: { recordId?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const deleted = await deleteCommitteeScoreRecord(payload.recordId ?? "");
  if (deleted) {
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "committee_score.ocr_deleted",
      entityType: "committee_score",
      entityId: deleted.id,
      summary: `ลบคะแนน OCR ${deleted.submissionCode} โดย ${deleted.judgeName}`,
      payload: { submissionCode: deleted.submissionCode, judgeKey: deleted.judgeKey, calculatedTotal: deleted.calculatedTotal },
    }, request.headers);
  }
  revalidatePath("/admin");
  revalidatePath("/admin/ocr-scores");
  return NextResponse.json({ ok: true, deleted });
}
