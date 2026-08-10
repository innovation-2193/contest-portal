import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../lib/admin-guard";
import { listCommitteeScoreRecords } from "../../../../lib/committee-score-store";
import { listSubmissions, listWinners } from "../../../../lib/admin-store";
import { selectPresentationSubmissions } from "../../../../lib/presentation-score-utils";
import type { PresentationJudgeProfile } from "../../../../lib/presentation-score-config";
import {
  buildPresentationScoreboard,
  deletePresentationScoreRecord,
  listPresentationJudgeProfiles,
  listPresentationScoreRecords,
  savePresentationJudgeProfiles,
  savePresentationScoreRecords,
  type PresentationScoreInput,
} from "../../../../lib/presentation-score-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  try {
    const [submissions, winners, profiles, records, round1Records] = await Promise.all([
      listSubmissions(),
      listWinners(),
      listPresentationJudgeProfiles(),
      listPresentationScoreRecords(),
      listCommitteeScoreRecords(),
    ]);
    const finalists = selectPresentationSubmissions(submissions, winners);
    const finalistCodes = new Set(finalists.map((item) => item.submission_code));
    const finalistRecords = records.filter((record) => finalistCodes.has(record.submissionCode));
    const rows = await buildPresentationScoreboard(finalists, finalistRecords, profiles, round1Records);
    return NextResponse.json({ ok: true, profiles, records: finalistRecords, rows, finalists: finalists.map((item) => ({ submissionCode: item.submission_code, title: item.title_th })) });
  } catch (error) {
    console.error("presentation score records failed", error);
    return NextResponse.json({ ok: false, message: "โหลดข้อมูลคะแนนรอบที่ 2 ไม่สำเร็จ" }, { status: 200 });
  }
}

export async function POST(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  let payload: { profiles?: unknown; records?: PresentationScoreInput[] };
  try { payload = await request.json(); } catch { return NextResponse.json({ ok: false, message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  try {
    const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
    const savedProfiles = profiles.length ? await savePresentationJudgeProfiles(profiles as PresentationJudgeProfile[], session.email) : [];
    const profileMap = new Map(savedProfiles.map((profile) => [profile.judgeKey, profile]));
    const submissions = await listSubmissions();
    const finalists = selectPresentationSubmissions(submissions, await listWinners());
    const finalistMap = new Map(finalists.map((item, index) => [item.submission_code, { submission: item, order: index + 1 }]));
    const records = Array.isArray(payload.records) ? payload.records.flatMap((record) => {
      const match = finalistMap.get(String(record.submissionCode ?? "").trim());
      const profile = profileMap.get(String(record.judgeKey ?? "").trim());
      if (!match || !profile) return [];
      return [{ ...record, submissionTitle: match.submission.title_th, submissionOrder: match.order, judgeName: `${profile.prefix} ${profile.firstName} ${profile.lastName}`.replace(/\s+/g, " ").trim(), submittedByEmail: session.email }];
    }) : [];
    const saved = records.length ? await savePresentationScoreRecords(records) : [];
    if (saved.length) await recordAuditEvent({ actor: actorFromAdminSession(session), action: "presentation_score.saved", entityType: "presentation_score", summary: `บันทึกคะแนนรอบที่ 2 ${saved.length.toLocaleString("th-TH")} รายการ`, payload: { count: saved.length } }, request.headers);
    if (savedProfiles.length) await recordAuditEvent({ actor: actorFromAdminSession(session), action: "presentation_score.judges_updated", entityType: "presentation_judge", summary: "แก้ไขรายชื่อกรรมการรอบที่ 2", payload: { judges: savedProfiles.map((profile) => profile.judgeKey) } }, request.headers);
    revalidatePath("/admin/submissions");
    return NextResponse.json({ ok: true, saved, savedProfiles });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "บันทึกข้อมูลรอบที่ 2 ไม่สำเร็จ" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  let payload: { recordId?: string };
  try { payload = await request.json(); } catch { return NextResponse.json({ ok: false, message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const deleted = await deletePresentationScoreRecord(payload.recordId ?? "");
  if (deleted) await recordAuditEvent({ actor: actorFromAdminSession(session), action: "presentation_score.deleted", entityType: "presentation_score", entityId: deleted.id, summary: `ลบคะแนนรอบที่ 2 ${deleted.submissionCode}`, payload: { submissionCode: deleted.submissionCode, judgeKey: deleted.judgeKey } }, request.headers);
  revalidatePath("/admin/submissions");
  return NextResponse.json({ ok: true, deleted });
}
