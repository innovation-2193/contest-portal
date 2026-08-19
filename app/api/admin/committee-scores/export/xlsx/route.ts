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
const groupFills = ["#EAF3FF", "#F3EEFF", "#EEF8F0", "#FFF8E1", "#FFF0E8", "#EAF7F6"];
const headerFill = "#17365D";

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
  const topSheet = scoreboardSheet(topExportRows, "10 อันดับแรก");
  const remainingSheet = scoreboardSheet(remainingExportRows, "อันดับที่เหลือ");
  const workbook = createSimpleXlsx({
    sheetName: "10 อันดับแรก",
    title: "รายชื่อ 10 อันดับแรกและอันดับที่เหลือ รอบที่ 1",
    rows: topSheet.rows,
    sheets: [
      topSheet,
      remainingSheet,
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
        title: "",
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

function toExportRow(row: CommitteeScoreSummaryRow, applicant: Pick<SubmissionApplicantExportRow, "member_order" | "title" | "first_name" | "last_name" | "division" | "bureau" | "phone">) {
  const name = `${applicant.first_name} ${applicant.last_name}`.trim() || "-";
  const title = String(applicant.title ?? "").trim();
  return [
    String(row.rank),
    row.submissionTitle || "-",
    String(applicant.member_order),
    `${title ? `${title} ` : ""}${name}`,
    applicant.division || applicant.bureau || row.division || "-",
    applicant.phone || row.phone || "-",
    row.averageScore === null ? "-" : row.averageScore.toFixed(2),
  ];
}

function scoreboardSheet(rows: string[][], sheetName: string) {
  return {
    sheetName,
    rows: [columns, ...rows],
    columnWidths: [12, 66, 14, 36, 40, 18, 14],
    headerFill,
    rowFills: [null, ...groupRowFills(rows)],
  };
}

function groupRowFills(rows: string[][]) {
  let previousKey = "";
  let groupIndex = -1;
  return rows.map((row) => {
    const key = `${row[0] ?? ""}::${row[1] ?? ""}`;
    if (key !== previousKey) {
      previousKey = key;
      groupIndex += 1;
    }
    return groupFills[groupIndex % groupFills.length];
  });
}
