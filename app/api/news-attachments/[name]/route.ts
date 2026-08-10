import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { getNewsAttachmentPath, listNews } from "../../../../lib/admin-store";

export const runtime = "nodejs";

const attachmentTypes: Record<string, string> = {
  ".csv": "text/csv; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const attachmentName = decodeURIComponent(name);
  const filePath = getNewsAttachmentPath(attachmentName);
  if (!filePath) return NextResponse.json({ error: "invalid attachment" }, { status: 400 });

  const news = await listNews({ publicOnly: true });
  const item = news.find((entry) => entry.attachmentName === attachmentName);
  if (!item) return NextResponse.json({ error: "attachment not found" }, { status: 404 });

  try {
    const bytes = await readFile(filePath);
    const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
    const originalName = item.attachmentOriginalName || ("news-attachment" + extension);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": attachmentTypes[extension] ?? "application/octet-stream",
        "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(originalName),
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "attachment not found" }, { status: 404 });
  }
}
