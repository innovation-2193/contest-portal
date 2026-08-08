import { NextResponse } from "next/server";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listCommitteeScoreReportVersions } from "../../../../../lib/committee-score-report-versions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized", versions: [], total: 0 }, { status: 401 });
  }

  try {
    const versions = await listCommitteeScoreReportVersions();
    const showAll = new URL(request.url).searchParams.get("all") === "1";
    const metadata = versions.map(({ rows: _rows, ...version }) => version);
    return NextResponse.json({
      ok: true,
      versions: showAll ? metadata : metadata.slice(0, 3),
      total: versions.length,
    });
  } catch (error) {
    console.error("committee score report versions failed", error);
    return NextResponse.json({ ok: false, message: "โหลด Version รายงานไม่สำเร็จ", versions: [], total: 0 }, { status: 200 });
  }
}
