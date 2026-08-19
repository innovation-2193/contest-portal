import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../../lib/admin-guard";
import {
  listSubmissionApplicantsForExport,
  listSubmissions,
  type SubmissionApplicantExportRow,
} from "../../../../../../lib/admin-store";
import { findCommitteeScoreReportVersion } from "../../../../../../lib/committee-score-report-versions";
import { buildCommitteeScoreboard, listCommitteeScoreRecords, type CommitteeScoreSummaryRow } from "../../../../../../lib/committee-score-store";
import { createSimpleXlsx } from "../../../../../../lib/simple-xlsx";

export const runtime = "nodejs";

const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const columns = ["ลำดับผลงาน", "ชื่อโครงการ", "ลำดับผู้สมัคร", "ผู้สมัคร", "สังกัด", "เบอร์โทรศัพท์", "คะแนนเฉลี่ย"];

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });

  const versionId = new URL(request.url).searchParams.get("versionId")?.trim() || "";
  const version = versionId ? await findCommitteeScoreReportVersion(versionId) : null;
  if (versionId && !version) return NextResponse.json({ ok: false, message: "ไม่พบ Version รายงานนี้" }, { status: 404 });

  const rows = version ? await enrichVersionRows(version.rows) : await buildCurrentRows();
  const applicants = await listSubmissionApplicantsForExport();
  const applicantsBySubmission = groupApplicantsBySubmission(applicants);
  const topRows = rows.slice(0, 10);
  const remainingRows = rows.slice(10);
  const topExportRows = expandRowsWithApplicants(topRows, applicantsBySubmission);
  const remainingExportRows = expandRowsWithApplicants(remainingRows, applicantsBySubmission);
  const workbook = createSimpleXlsx({
    sheetName: "10 อันดับแรก",
    title: "รายชื่อ 10 อันดับแรกและอันดับที่เหลือ รอบที่ 1",
    rows: [columns, ...topExportRows],
    sheets: [
      {
        sheetName: "10 อันดับแรก",
        rows: [columns, ...topExportRows],
        columnWidths: [12, 62, 14, 30, 36, 18, 14],
      },
      {
        sheetName: "อันดับที่เหลือ",
        rows: [columns, ...remainingExportRows],
        columnWidths: [12, 62, 14, 30, 36, 18, 14],
      },
    ],
  });

  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "committee_score.scoreboard_xlsx",
    entityType: "committee_score",
    summary: version ? `Export Excel รายชื่อ Top 10 และอันดับที่เหลือ Version ${version.version}` : "Export Excel รายชื่อ Top 10 และอันดับที่เหลือ",
    payload: {
      topTen: topRows.length,
      remaining: remainingRows.length,
      topTenApplicants: topExportRows.length,
      remainingApplicants: remainingExportRows.length,
      version: version?.version ?? null,
    },
  }, request.headers);

  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="committee-scoreboard-top-10-and-remaining-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function buildCurrentRows() {
  const [submissions, records] = await Promise.all([listSubmissions(), listCommitteeScoreRecords()]);
  return buildCommitteeScoreboard(submissions.slice().sort(compareSubmittedAt), records);
}

async function enrichVersionRows(rows: CommitteeScoreSummaryRow[]) {
  const submissions = await listSubmissions().catch(() => []);
  const byCode = new Map(submissions.map((submission) => [submission.submission_code, submission]));
  return rows.map((row) => {
    const submission = byCode.get(row.submissionCode);
    return {
      ...row,
      ownerName: row.ownerName || (submission ? `${submission.first_name} ${submission.last_name}`.trim() : "-"),
      division: row.division || submission?.division || submission?.bureau || "-",
      phone: row.phone || submission?.phone || "-",
    };
  });
}

function compareSubmittedAt(left: { submitted_at: string }, right: { submitted_at: string }) {
  return new Date(left.submitted_at).getTime() - new Date(right.submitted_at).getTime();
}

function groupApplicantsBySubmission(applicants: SubmissionApplicantExportRow[]) {
  const grouped = new Map<string, SubmissionApplicantExportRow[]>();
  for (const applicant of applicants) {
    const list = grouped.get(applicant.submission_code) ?? [];
    list.push(applicant);
    grouped.set(applicant.submission_code, list);
  }
  for (const list of grouped.values()) {
    list.sort((left, right) => left.member_order - right.member_order);
  }
  return grouped;
}

function expandRowsWithApplicants(rows: CommitteeScoreSummaryRow[], applicantsBySubmission: Map<string, SubmissionApplicantExportRow[]>) {
  return rows.flatMap((row) => {
    const applicants = applicantsBySubmission.get(row.submissionCode);
    if (!applicants?.length) {
      return [toExportRow(row, {
        member_order: 1,
        first_name: row.ownerName,
        last_name: "",
        division: row.division,
        bureau: "",
        phone: row.phone,
      })];
    }
    return applicants.map((applicant) => toExportRow(row, applicant));
  });
}

function toExportRow(row: CommitteeScoreSummaryRow, applicant: Pick<SubmissionApplicantExportRow, "member_order" | "first_name" | "last_name" | "division" | "bureau" | "phone">) {
  return [
    String(row.rank),
    row.submissionTitle || "-",
    String(applicant.member_order),
    `${applicant.first_name} ${applicant.last_name}`.trim() || "-",
    applicant.division || applicant.bureau || row.division || "-",
    applicant.phone || row.phone || "-",
    row.averageScore === null ? "-" : row.averageScore.toFixed(2),
  ];
}
