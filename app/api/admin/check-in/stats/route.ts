import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { getParticipantCheckInRoleCounts, getParticipantRegistrationRoleCounts } from "../../../../../lib/admin-store";

export const runtime = "nodejs";

export async function GET() {
  const session = getAdminSession((await cookies()).get(cookieName)?.value);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [checkedIn, registered] = await Promise.all([
    getParticipantCheckInRoleCounts(),
    getParticipantRegistrationRoleCounts(),
  ]);

  return NextResponse.json({ checkedIn, registered }, {
    headers: { "Cache-Control": "no-store" },
  });
}
