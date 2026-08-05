import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";
import { listSubmissions } from "../../../../../lib/admin-store";
import { requireSuperAdminRequest } from "../../../../../lib/admin-guard";
import { listCommitteeScoreRecords, type CommitteeScoreRecord } from "../../../../../lib/committee-score-store";
import {
  createCommitteeScoreTemplateCsv,
  createCommitteeScoreTemplateXlsx,
} from "../../../../../lib/committee-score-xlsx";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = requireSuperAdminRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  let sortedSubmissions: Awaited<ReturnType<typeof listSubmissions>> = [];
  let records: CommitteeScoreRecord[] = [];
  try {
    const submissions = await listSubmissions();
    sortedSubmissions = submissions.slice().sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  } catch (error) {
    console.error("committee score template data load failed", error);
    return NextResponse.json({ ok: false, message: "โหลดรายการนวัตกรรมสำหรับ Template ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }

  try {
    records = await listCommitteeScoreRecords();
  } catch (error) {
    // Existing scores are optional when creating a fresh import template.
    console.warn("committee score template existing scores unavailable; creating a blank template", error);
  }

  try {
    const file = createCommitteeScoreTemplateXlsx(sortedSubmissions, records);
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
    const file = createCommitteeScoreTemplateCsv(sortedSubmissions, records);
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
