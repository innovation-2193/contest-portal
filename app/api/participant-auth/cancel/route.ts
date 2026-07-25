import { NextRequest, NextResponse } from "next/server";
import { participantOtpPendingCookie } from "../../../../lib/participant-session";
import { publicSiteUrl } from "../../../../lib/public-url";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(publicSiteUrl("/profile/login", request), 303);
  response.cookies.delete(participantOtpPendingCookie);
  return response;
}
