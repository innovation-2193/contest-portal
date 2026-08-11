import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listSubmissions } from "../../../../../lib/admin-store";
import { listCommitteeScoreRecords } from "../../../../../lib/committee-score-store";
import { createCommitteeConsensusTemplateCsv, createCommitteeConsensusTemplateXlsx } from "../../../../../lib/committee-consensus-xlsx";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  const submissions = (await listSubmissions()).slice().sort(compareSubmittedAt);
  const records = await listCommitteeScoreRecords().catch(() => []);
  try {
    const file = createCommitteeConsensusTemplateXlsx(submissions, records);
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "committee_score.consensus_template_xlsx",
      entityType: "committee_score",
      summary: "ดาวน์โหลด Template Excel คะแนนคณะกรรมการรอบที่ 1 ทางเลือกที่ 2",
      payload: { submissions: submissions.length, existingScores: records.filter((record) => record.judgeKey === "consensus").length },
    }, request.headers);
    return new NextResponse(new Uint8Array(file), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="committee-round-1-consensus-template-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    console.error("committee consensus xlsx template failed, using csv fallback", error);
    const file = createCommitteeConsensusTemplateCsv(submissions, records);
    return new NextResponse(new Uint8Array(file), { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="committee-round-1-consensus-template-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    } });
  }
}

function compareSubmittedAt(left: { submitted_at: string }, right: { submitted_at: string }) {
  return new Date(left.submitted_at).getTime() - new Date(right.submitted_at).getTime();
}
