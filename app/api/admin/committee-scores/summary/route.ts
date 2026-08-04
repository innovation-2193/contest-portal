import { NextResponse } from "next/server";
import { listSubmissions } from "../../../../../lib/admin-store";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { buildCommitteeScoreboard, listCommitteeScoreRecords } from "../../../../../lib/committee-score-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized", rows: [], total: 0 }, { status: 401 });
  }

  try {
    const [submissions, records] = await Promise.all([listSubmissions(), listCommitteeScoreRecords()]);
    const rows = buildCommitteeScoreboard(
      submissions.slice().sort((a, b) => a.submitted_at.localeCompare(b.submitted_at)),
      records,
    ).filter((row) => row.averageScore !== null);
    return NextResponse.json({
      ok: true,
      rows: rows.slice(0, 10),
      total: rows.length,
    });
  } catch (error) {
    console.error("committee score summary failed", error);
    return NextResponse.json({ ok: false, message: "โหลดคะแนนคณะกรรมการไม่สำเร็จ", rows: [], total: 0 }, { status: 200 });
  }
}
