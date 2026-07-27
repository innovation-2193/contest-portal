import { NextRequest, NextResponse } from "next/server";
import { findRegistrationByCode } from "../../../../../lib/registration-lookup";
import { registrationTicketPdf } from "../../../../../lib/registration-artifacts";
import { getParticipantSession, participantSessionCookie } from "../../../../../lib/participant-session";
import { cookieName as adminSessionCookie, getAdminSession } from "../../../../../lib/admin-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const record = await findRegistrationByCode(decodeURIComponent(code));

  if (!record) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const participantSession = getParticipantSession(request.cookies.get(participantSessionCookie)?.value);
  const adminSession = getAdminSession(request.cookies.get(adminSessionCookie)?.value);
  const ownsRegistration = participantSession?.email === record.email.trim().toLowerCase();
  if (!adminSession && !ownsRegistration) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pdf = await registrationTicketPdf(record);
  const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${disposition}; filename="${record.registration_code}.pdf"`,
      "cache-control": "private, max-age=3600",
    },
  });
}
