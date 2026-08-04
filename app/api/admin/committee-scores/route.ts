import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../lib/admin-guard";
import { saveCommitteeScoreRecords, type CommitteeScoreInput } from "../../../../lib/committee-score-store";

export const runtime = "nodejs";

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
