import { readFile } from "fs/promises";
import path from "path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieName, getAdminSession } from "../../../../lib/admin-auth";
import { getEventBoothImagePath } from "../../../../lib/event-booths";

export const runtime = "nodejs";

const imageTypes: Record<string, string> = { ".gif": "image/gif", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const session = getAdminSession((await cookies()).get(cookieName)?.value);
  if (!session || !["super_admin", "uci"].includes(session.role)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const filePath = getEventBoothImagePath(decodeURIComponent((await params).name));
  if (!filePath) return NextResponse.json({ error: "invalid image" }, { status: 400 });
  try {
    return new NextResponse(new Uint8Array(await readFile(filePath)), { headers: { "Content-Type": imageTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "image not found" }, { status: 404 });
  }
}
