import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../../lib/audit-log";
import { cookieName, getAdminSession } from "../../../../../../lib/admin-auth";
import { adminUnauthorizedResponse } from "../../../../../../lib/admin-api-response";
import { listSubmissionApplicantsForExport, type SubmissionApplicantExportRow } from "../../../../../../lib/admin-store";
import { createSimpleXlsx } from "../../../../../../lib/simple-xlsx";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) return adminUnauthorizedResponse(request);
  if (session.role !== "super_admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const applicants = await listSubmissionApplicantsForExport();
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "submission.applicants_export_xlsx",
    entityType: "submission",
    summary: "Export รายชื่อผู้สมัครประกวดนวัตกรรมทั้งหมดเป็น Excel",
    payload: { count: applicants.length },
  }, request.headers);

  const workbook = applicantsWorkbook(applicants);
  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="contest-applicants-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function applicantsWorkbook(applicants: SubmissionApplicantExportRow[]) {
  const headers = [
    "ลำดับ",
    "รหัสผลงาน",
    "ผลงาน",
    "คำนำหน้า",
    "ชื่อ",
    "นามสกุล",
    "เลขบัตร",
    "สังกัด / หน่วยงาน",
    "อีเมล",
    "โทร",
  ];
  const rows = applicants.map((item, index) => [
    String(index + 1),
    item.submission_code,
    item.title_th,
    item.title,
    item.first_name,
    item.last_name,
    item.citizen_id,
    `${clean(item.division)} / ${clean(item.bureau)}`,
    item.email,
    item.phone,
  ]);

  return createSimpleXlsx({
    sheetName: "Applicants",
    title: "Police Innovation Contest 2026 submission applicants",
    rows: [headers, ...rows],
    columnWidths: [10, 22, 42, 22, 22, 22, 20, 38, 34, 18],
  });
}

function clean(value: string | null | undefined) {
  return value?.trim() || "-";
}
