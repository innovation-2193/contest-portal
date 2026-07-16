import { NextResponse } from "next/server";
import { findRegistrationByCode } from "../../../../../lib/registration-lookup";
import { registrationTicketPdf } from "../../../../../lib/registration-artifacts";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const record = await findRegistrationByCode(decodeURIComponent(code));

  if (!record) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
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
