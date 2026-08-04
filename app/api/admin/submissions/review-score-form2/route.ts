import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/api/admin/submissions/review-score-form";
  url.searchParams.set("custom", "1");
  return NextResponse.redirect(url, 307);
}
