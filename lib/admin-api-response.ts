import { NextResponse } from "next/server";
import { publicSiteUrl } from "./public-url";

export function adminUnauthorizedResponse(request: Request) {
  const acceptsHtml = request.headers.get("accept")?.includes("text/html");
  if (acceptsHtml) {
    return NextResponse.redirect(publicSiteUrl("/admin?login=failed", request), 303);
  }
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
