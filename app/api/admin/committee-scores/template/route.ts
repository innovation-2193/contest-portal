import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { listSubmissionApplicantsForExport, listSubmissionTemplateRows, listSubmissions, type SubmissionListItem } from "../../../../../lib/admin-store";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listCommitteeJudgeProfiles, listCommitteeScoreRecords, type CommitteeScoreRecord } from "../../../../../lib/committee-score-store";
import {
  createCommitteeScoreTemplateCsv,
  createCommitteeScoreTemplateXlsx,
} from "../../../../../lib/committee-score-xlsx";
import { defaultWorkCategory } from "../../../../../lib/work-categories";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  let sortedSubmissions: Awaited<ReturnType<typeof listSubmissions>> = [];
  let records: CommitteeScoreRecord[] = [];
  let judgeProfiles = await listCommitteeJudgeProfiles().catch((error) => {
    console.warn("committee judge profiles unavailable; using defaults", error);
    return [];
  });
  try {
    const submissions = await loadTemplateSubmissions();
    sortedSubmissions = submissions.slice().sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  } catch (error) {
    console.error("committee score template data load failed", error);
    // The template is still useful as a blank scoring sheet if an optional
    // submission field is unavailable in an older production schema.
    sortedSubmissions = [];
  }

  try {
    records = await listCommitteeScoreRecords();
  } catch (error) {
    // Existing scores are optional when creating a fresh import template.
    console.warn("committee score template existing scores unavailable; creating a blank template", error);
  }

  try {
    const file = createCommitteeScoreTemplateXlsx(sortedSubmissions, records, judgeProfiles);
    const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const extension = "xlsx";

    if (!file.length) {
      throw new Error("empty template file");
    }

    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "committee_score.template_file",
      entityType: "committee_score",
      summary: "ดาวน์โหลดไฟล์ต้นแบบกรอกคะแนนรวมคณะกรรมการ",
      payload: { submissions: sortedSubmissions.length, existingScores: records.length, fileType: extension },
    }, request.headers).catch((error) => {
      console.error("committee score template audit failed", error);
    });

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="committee-score-template-${new Date().toISOString().slice(0, 10)}.${extension}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("committee score xlsx template failed, using csv fallback", error);
    const file = createCommitteeScoreTemplateCsv(sortedSubmissions, records, judgeProfiles);
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "committee_score.template_file",
      entityType: "committee_score",
      summary: "ดาวน์โหลดไฟล์ต้นแบบกรอกคะแนนรวมคณะกรรมการแบบ CSV สำรอง",
      payload: { submissions: sortedSubmissions.length, existingScores: records.length, fileType: "csv" },
    }, request.headers).catch((auditError) => {
      console.error("committee score template csv audit failed", auditError);
    });
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="committee-score-template-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
}

async function loadTemplateSubmissions(): Promise<SubmissionListItem[]> {
  const directRows = await listSubmissionTemplateRows();
  if (directRows.length) {
    return directRows.map((row) => ({
      submission_code: row.submission_code,
      submission_type: "individual",
      team_name: null,
      title_th: row.title_th,
      title_en: null,
      video_url: null,
      work_category: defaultWorkCategory,
      hashtags: [],
      status: "submitted",
      review_assigned_admin_email: null,
      review_assigned_at: null,
      review_scored_by_email: null,
      review_rules_score: null,
      review_problem_score: null,
      review_innovation_score: null,
      review_evidence_score: null,
      review_impact_score: null,
      review_total_score: null,
      review_note: null,
      review_submitted_at: null,
      submitted_at: row.submitted_at,
      email: "",
      title: "",
      first_name: "",
      last_name: "",
      position: "",
      division: "",
      bureau: "",
    }));
  }

  try {
    const submissions = await listSubmissions();
    if (submissions.length) return submissions;
    console.warn("committee score template primary submission list was empty; trying export-compatible list");
    return await loadTemplateSubmissionsFromApplicants();
  } catch (error) {
    console.error("committee score template primary submission list failed; trying export-compatible list", error);
    return loadTemplateSubmissionsFromApplicants();
  }
}

async function loadTemplateSubmissionsFromApplicants(): Promise<SubmissionListItem[]> {
  try {
    const applicants = await listSubmissionApplicantsForExport();
    const unique = new Map<string, SubmissionListItem>();
    for (const applicant of applicants) {
      if (unique.has(applicant.submission_code)) continue;
      unique.set(applicant.submission_code, {
        submission_code: applicant.submission_code,
        submission_type: applicant.submission_type,
        team_name: applicant.team_name,
        title_th: applicant.title_th,
        title_en: null,
        video_url: null,
        work_category: defaultWorkCategory,
        hashtags: [],
        status: "submitted",
        review_assigned_admin_email: null,
        review_assigned_at: null,
        review_scored_by_email: null,
        review_rules_score: null,
        review_problem_score: null,
        review_innovation_score: null,
        review_evidence_score: null,
        review_impact_score: null,
        review_total_score: null,
        review_note: null,
        review_submitted_at: null,
        submitted_at: applicant.submitted_at,
        email: applicant.email,
        title: applicant.title,
        first_name: applicant.first_name,
        last_name: applicant.last_name,
        position: applicant.position,
        division: applicant.division,
        bureau: applicant.bureau,
      });
    }
    return [...unique.values()];
  } catch (fallbackError) {
    console.error("committee score template fallback submission list failed; creating blank template", fallbackError);
    return [];
  }
}
