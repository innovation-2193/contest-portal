import { NextResponse } from "next/server";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listSubmissions, listWinners } from "../../../../../lib/admin-store";
import { selectPresentationSubmissions } from "../../../../../lib/presentation-score-utils";
import { listPresentationJudgeProfiles } from "../../../../../lib/presentation-score-store";
import { createSimpleXlsx } from "../../../../../lib/simple-xlsx";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  const [submissions, winners, profiles] = await Promise.all([listSubmissions(), listWinners(), listPresentationJudgeProfiles()]);
  const finalists = selectPresentationSubmissions(submissions, winners);
  const rows = [
    ["ลำดับ", "ชื่อโครงการ", "รหัสโครงการ", ...profiles.map((profile, index) => `กรรมการ ${index + 1} ${profile.prefix} ${profile.firstName} ${profile.lastName}`.replace(/\s+/g, " ").trim())],
    ...finalists.map((submission, index) => [String(index + 1), submission.title_th, submission.submission_code, ...profiles.map(() => "")]),
  ];
  const file = createSimpleXlsx({ sheetName: "Presentation Scores", title: "Presentation score template round 2", rows, columnWidths: [10, 58, 18, ...profiles.map(() => 24)] });
  return new NextResponse(new Uint8Array(file), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="presentation-score-template-round-2-${new Date().toISOString().slice(0, 10)}.xlsx"`, "Cache-Control": "private, no-store" } });
}

