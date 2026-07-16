import path from "path";
import { readdir, readFile } from "fs/promises";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieName, verifyAdminToken } from "../../../../../../../lib/admin-auth";
import { getSubmissionFile } from "../../../../../../../lib/admin-store";

export const runtime = "nodejs";

const documentTypes = new Set(["ownership", "concept", "prototype", "implementation"]);
const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string; type: string }> },
) {
  const cookieStore = await cookies();
  if (!verifyAdminToken(cookieStore.get(cookieName)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { code, type } = await params;
  if (!documentTypes.has(type)) {
    return NextResponse.json({ error: "invalid document type" }, { status: 400 });
  }

  const file = await getSubmissionFile(code, type);
  if (!file) return NextResponse.json({ error: "file not found" }, { status: 404 });

  const filename = file.original_name.replace(/[^\wก-๙ .()[\]-]+/gu, "_") || `${type}.pdf`;
  const pdf = await readFileWithFallback(file.filePath, file.stored_name, file.original_name);
  if (pdf) {
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": file.mime_type || "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (/^participants-\d{4}-\d{2}-\d{2}\.pdf$/i.test(path.basename(file.original_name))) {
    return NextResponse.redirect(new URL("/api/admin/participants/export", request.url));
  }

  return NextResponse.json({ error: "file not found" }, { status: 404 });
}

async function readFileWithFallback(filePath: string, storedName: string, originalName: string) {
  const candidates = [
    filePath,
    path.join(process.cwd(), "public", "documents", path.basename(originalName)),
    registrationTicketPath(originalName),
    await findStoredUpload(storedName),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const bytes = await readFile(candidate);
      if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return bytes;
    } catch {
      // Try the next known storage location.
    }
  }

  return null;
}

function registrationTicketPath(originalName: string) {
  const registrationCode = path.basename(originalName, ".pdf").match(/^REG-\d{4}-[A-Z0-9]+$/)?.[0];
  return registrationCode ? path.join(storageDir, "email-outbox", registrationCode, "ticket.pdf") : "";
}

async function findStoredUpload(storedName: string) {
  const uploadsDir = path.join(storageDir, "uploads");
  const target = path.basename(storedName);

  async function walk(dir: string): Promise<string> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return "";
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === target) return fullPath;
      if (entry.isDirectory()) {
        const found = await walk(fullPath);
        if (found) return found;
      }
    }
    return "";
  }

  return walk(uploadsDir);
}
