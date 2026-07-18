import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { getNewsImagePath } from "../../../../lib/admin-store";

export const runtime = "nodejs";

const imageTypes: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const filePath = getNewsImagePath(decodeURIComponent(name));
  if (!filePath) return NextResponse.json({ error: "invalid image" }, { status: 400 });

  try {
    const bytes = await readFile(filePath);
    const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": imageTypes[extension] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "image not found" }, { status: 404 });
  }
}
