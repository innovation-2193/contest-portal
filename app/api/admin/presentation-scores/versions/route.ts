import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { deletePresentationScoreReportVersion, listPresentationScoreReportVersions } from "../../../../../lib/presentation-score-report-versions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized", versions: [], total: 0 }, { status: 401 });
  try {
    const versions = await listPresentationScoreReportVersions();
    const showAll = new URL(request.url).searchParams.get("all") === "1";
    const metadata = versions.map(({ rows: _rows, ...version }) => version);
    return NextResponse.json({ ok: true, versions: showAll ? metadata : metadata.slice(0, 3), total: versions.length });
  } catch (error) {
    console.error("presentation score report versions failed", error);
    return NextResponse.json({ ok: false, message: "โหลด Version รายงานคะแนนรอบที่ 2 ไม่สำเร็จ", versions: [], total: 0 }, { status: 200 });
  }
}

export async function DELETE(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  let id = "";
  try {
    const payload = await request.json() as { id?: unknown };
    id = typeof payload.id === "string" ? payload.id.trim() : "";
  } catch {
    return NextResponse.json({ ok: false, message: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }
  if (!id) return NextResponse.json({ ok: false, message: "ไม่พบ Version ที่ต้องการลบ" }, { status: 400 });
  try {
    const deleted = await deletePresentationScoreReportVersion(id);
    if (!deleted) return NextResponse.json({ ok: false, message: "ไม่พบ Version รายงานนี้" }, { status: 404 });
    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "presentation_score.report_version_deleted",
      entityType: "presentation_score_report_version",
      entityId: deleted.id,
      summary: `ลบ Report PDF คะแนนรอบที่ 2 Version ${deleted.version}`,
      payload: { version: deleted.version, sourceFileName: deleted.sourceFileName },
    }, request.headers);
    return NextResponse.json({ ok: true, version: { id: deleted.id, version: deleted.version } });
  } catch (error) {
    console.error("presentation score report version delete failed", error);
    return NextResponse.json({ ok: false, message: "ลบ Version รายงานคะแนนรอบที่ 2 ไม่สำเร็จ" }, { status: 500 });
  }
}
