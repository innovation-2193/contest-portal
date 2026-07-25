import { NextRequest, NextResponse } from "next/server";
import { findRegistrationByCode } from "../../../../../lib/registration-lookup";
import { registrationTicketPdf } from "../../../../../lib/registration-artifacts";
import { getParticipantSession, participantSessionCookie } from "../../../../../lib/participant-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const record = await findRegistrationByCode(decodeURIComponent(code));

  if (!record) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const session = getParticipantSession(request.cookies.get(participantSessionCookie)?.value);
  if (!session || session.email !== record.email.trim().toLowerCase()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pdf = await registrationTicketPdf(record);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${record.registration_code}.pdf"`,
      "cache-control": "private, max-age=3600",
    },
  });
}
