import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../../lib/admin-guard";
import { listSubmissions } from "../../../../../../lib/admin-store";
import { findCommitteeScoreReportVersion } from "../../../../../../lib/committee-score-report-versions";
import { buildCommitteeScoreboard, listCommitteeScoreRecords, type CommitteeScoreSummaryRow } from "../../../../../../lib/committee-score-store";
import { createSimpleXlsx } from "../../../../../../lib/simple-xlsx";

export const runtime = "nodejs";

const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const columns = ["ลำดับ", "ชื่อโครงการ", "ผู้สมัครหลัก", "สังกัด", "เบอร์โทรศัพท์", "คะแนนเฉลี่ย"];

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });

  const versionId = new URL(request.url).searchParams.get("versionId")?.trim() || "";
  const version = versionId ? await findCommitteeScoreReportVersion(versionId) : null;
  if (versionId && !version) return NextResponse.json({ ok: false, message: "ไม่พบ Version รายงานนี้" }, { status: 404 });

  const rows = version ? await enrichVersionRows(version.rows) : await buildCurrentRows();
  const topRows = rows.slice(0, 10);
  const remainingRows = rows.slice(10);
  const workbook = createSimpleXlsx({
    sheetName: "10 อันดับแรก",
    title: "รายชื่อ 10 อันดับแรกและอันดับที่เหลือ รอบที่ 1",
    rows: [columns, ...topRows.map(toExportRow)],
    sheets: [
      {
        sheetName: "10 อันดับแรก",
        rows: [columns, ...topRows.map(toExportRow)],
        columnWidths: [10, 62, 30, 36, 18, 14],
      },
      {
        sheetName: "อันดับที่เหลือ",
        rows: [columns, ...remainingRows.map(toExportRow)],
        columnWidths: [10, 62, 30, 36, 18, 14],
      },
    ],
  });

  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "committee_score.scoreboard_xlsx",
    entityType: "committee_score",
    summary: version ? `Export Excel รายชื่อ Top 10 และอันดับที่เหลือ Version ${version.version}` : "Export Excel รายชื่อ Top 10 และอันดับที่เหลือ",
    payload: { topTen: topRows.length, remaining: remainingRows.length, version: version?.version ?? null },
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

function toExportRow(row: CommitteeScoreSummaryRow) {
  return [
    String(row.rank),
    row.submissionTitle || "-",
    row.ownerName || "-",
    row.division || "-",
    row.phone || "-",
    row.averageScore === null ? "-" : row.averageScore.toFixed(2),
  ];
}
