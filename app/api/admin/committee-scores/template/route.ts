import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { listSubmissions } from "../../../../../lib/admin-store";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listCommitteeScoreRecords } from "../../../../../lib/committee-score-store";
import { createCommitteeScoreTemplateXlsx } from "../../../../../lib/committee-score-xlsx";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  try {
    const [submissions, records] = await Promise.all([
      listSubmissions(),
      listCommitteeScoreRecords(),
    ]);
    const sortedSubmissions = submissions.slice().sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
    const workbook = createCommitteeScoreTemplateXlsx(sortedSubmissions, records);

    await recordAuditEvent({
      actor: actorFromAdminSession(session),
      action: "committee_score.template_xlsx",
      entityType: "committee_score",
      summary: "ดาวน์โหลดไฟล์ต้นแบบกรอกคะแนนรวมคณะกรรมการ",
      payload: { submissions: sortedSubmissions.length, existingScores: records.length },
    }, request.headers).catch((error) => {
      console.error("committee score template audit failed", error);
    });

    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="committee-score-template-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("committee score template download failed", error);
    return NextResponse.json({ ok: false, message: "สร้างไฟล์ Template Excel ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
