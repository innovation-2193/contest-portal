import { NextResponse } from "next/server";
import { recordSiteVisit } from "../../../lib/site-analytics";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { path?: string };
  await recordSiteVisit(String(body.path ?? "/"));
  return NextResponse.json({ ok: true });
}
