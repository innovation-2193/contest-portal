import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { actorFromAdminSession, recordAuditEvent } from "../../../../lib/audit-log";
import { adminUnauthorizedResponse } from "../../../../lib/admin-api-response";
import { cookieName, getAdminSession } from "../../../../lib/admin-auth";
import { listAdminAccounts } from "../../../../lib/admin-users";
import { listSubmissions } from "../../../../lib/admin-store";
import { createSimpleXlsx } from "../../../../lib/simple-xlsx";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) return adminUnauthorizedResponse(request);
  if (session.role !== "super_admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [submissions, admins] = await Promise.all([
    listSubmissions(),
    listAdminAccounts(),
  ]);
  const adminNames = new Map(admins.map((admin) => [admin.email.toLowerCase(), admin.name]));
  const assigned = submissions
    .filter((item) => Boolean(item.review_assigned_admin_email || item.review_scored_by_email))
    .sort((left, right) => new Date(left.submitted_at).getTime() - new Date(right.submitted_at).getTime());
  const rows = [
    ["ชื่อนวัตกรรม", "ชื่อผู้ตรวจ"],
    ...assigned.map((item) => {
      const reviewerEmail = (item.review_assigned_admin_email || item.review_scored_by_email || "").trim().toLowerCase();
      return [
        item.title_th,
        adminNames.get(reviewerEmail) || reviewerEmail || "-",
      ];
    }),
  ];

  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "submission.progress1_export_xlsx",
    entityType: "submission",
    summary: "Export Excel รายการนวัตกรรมและผู้ตรวจจากหน้า progress1",
    payload: { count: assigned.length },
  }, request.headers);

  const workbook = createSimpleXlsx({
    sheetName: "Progress1",
    title: "Progress1 reviewer assignment",
    rows,
    columnWidths: [64, 34],
  });
  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="progress1-reviewers-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
