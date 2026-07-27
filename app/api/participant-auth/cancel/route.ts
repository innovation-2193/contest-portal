import { NextRequest, NextResponse } from "next/server";
import { participantOtpAutoFillCookie, participantOtpPendingCookie } from "../../../../lib/participant-session";
import { publicSiteUrl } from "../../../../lib/public-url";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(publicSiteUrl("/profile/login", request), 303);
  response.cookies.delete(participantOtpPendingCookie);
  response.cookies.delete(participantOtpAutoFillCookie);
  return response;
}
