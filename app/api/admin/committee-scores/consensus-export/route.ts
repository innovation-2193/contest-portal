import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listSubmissions } from "../../../../../lib/admin-store";
import { formatCommitteeJudgeProfile } from "../../../../../lib/committee-score-config";
import { listCommitteeJudgeProfiles } from "../../../../../lib/committee-score-store";
import {
  committeeScoreFormPdf,
  type CommitteeSignatory,
} from "../../submissions/review-score-form/route";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });

  const [submissions, profiles] = await Promise.all([
    listSubmissions(),
    listCommitteeJudgeProfiles(),
  ]);
  const sortedSubmissions = submissions.slice().sort(compareSubmittedAt);
  const signatories: CommitteeSignatory[] = profiles.slice(0, 5).map((profile, index) => ({
    order: index + 1,
    rank: profile.prefix,
    name: [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim(),
    unit: profile.position,
    role: "",
    fileLabel: `shared-${profile.judgeKey}`,
  }));

  const pdf = await committeeScoreFormPdf(sortedSubmissions, null, {
    totalSubmissionCount: sortedSubmissions.length,
    sharedSignatories: signatories,
  });
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "committee_score.consensus_form_pdf",
    entityType: "committee_score",
    summary: "Export แบบฟอร์มคะแนนคณะกรรมการรอบที่ 1 ทางเลือกที่ 2",
    payload: {
      submissions: sortedSubmissions.length,
      judges: profiles.slice(0, 5).map(formatCommitteeJudgeProfile),
    },
  }, request.headers);

  return new NextResponse(new Uint8Array(pdf), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="committee-round-1-shared-score-form-${new Date().toISOString().slice(0, 10)}.pdf"`,
    "Cache-Control": "private, no-store",
  } });
}

function compareSubmittedAt(left: { submitted_at: string }, right: { submitted_at: string }) {
  return new Date(left.submitted_at).getTime() - new Date(right.submitted_at).getTime();
}
