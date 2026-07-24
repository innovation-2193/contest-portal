import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieName, getAdminSession } from "../../../../../lib/admin-auth";
import { searchParticipants } from "../../../../../lib/admin-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = getAdminSession(cookieStore.get(cookieName)?.value);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const participants = await searchParticipants(query, 12);

  return NextResponse.json({
    participants: participants.map((item) => ({
      registrationCode: item.registration_code,
      name: `${item.title}${item.first_name} ${item.last_name}`,
      participantRole: item.participant_role,
      phone: item.phone,
      position: item.position,
      division: item.division,
      bureau: item.bureau,
      status: item.status,
      checkedInAt: item.checked_in_at ?? null,
    })),
  });
}
