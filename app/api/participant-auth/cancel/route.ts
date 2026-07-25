import { NextRequest, NextResponse } from "next/server";
import { participantOtpPendingCookie } from "../../../../lib/participant-session";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/profile/login", request.url), 303);
  response.cookies.delete(participantOtpPendingCookie);
  return response;
}
