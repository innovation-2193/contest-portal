import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { deleteCommitteeScoreReportVersion, listCommitteeScoreReportVersions } from "../../../../../lib/committee-score-report-versions";

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

export async function DELETE(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  let id = "";
  try {
    const payload = await request.json() as { id?: unknown };
    id = typeof payload.id === "string" ? payload.id.trim() : "";
  } catch {
    return NextResponse.json({ ok: false, message: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }
  if (!id) return NextResponse.json({ ok: false, message: "ไม่พบ Version ที่ต้องการลบ" }, { status: 400 });

  try {
    const deleted = await deleteCommitteeScoreReportVersion(id);
    if (!deleted) return NextResponse.json({ ok: false, message: "ไม่พบ Version รายงานนี้" }, { status: 404 });
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "committee_score.report_version_deleted",
      entityType: "committee_score_report_version",
      entityId: deleted.id,
      summary: `ลบ Report PDF Version ${deleted.version}`,
      payload: { version: deleted.version, sourceFileName: deleted.sourceFileName },
    }, request.headers);
    return NextResponse.json({ ok: true, version: { id: deleted.id, version: deleted.version } });
  } catch (error) {
    console.error("committee score report version delete failed", error);
    return NextResponse.json({ ok: false, message: "ลบ Version รายงานไม่สำเร็จ" }, { status: 500 });
  }
}
