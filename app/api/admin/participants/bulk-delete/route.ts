import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { adminNoticePath } from "../../../../../lib/admin-flash";
import { deleteParticipants } from "../../../../../lib/admin-store";
import { actorFromAdminSession, recordAuditEvent } from "../../../../../lib/audit-log";

export async function POST(request: NextRequest) {
  const session = getAdminSession(request.cookies.get(cookieName)?.value);
  if (!session) {
    return NextResponse.redirect(new URL("/admin", request.url), 303);
  }

  const formData = await request.formData();
  const codes = formData.getAll("registrationCode").map(String).filter(Boolean);
  const returnTo = String(formData.get("returnTo") ?? "/admin");
  if (!codes.length) {
    return NextResponse.redirect(new URL(adminNoticePath(returnTo, "participant_none_selected"), request.url), 303);
  }

  const deleted = await deleteParticipants(codes);
  await recordAuditEvent({
    actor: actorFromAdminSession(session),
    action: "registration.bulk_deleted",
    entityType: "registration",
    summary: `ลบข้อมูลผู้เข้าร่วมงาน ${deleted} รายการ`,
    payload: { registrationCodes: codes },
  }, await headers());
  revalidatePath("/admin");
  revalidatePath("/admin/participants");
  return NextResponse.redirect(new URL(adminNoticePath(returnTo, deleted > 1 ? "participants_deleted" : "participant_deleted"), request.url), 303);
}
