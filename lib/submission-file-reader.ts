import path from "path";
import { readdir, readFile } from "fs/promises";
import type { AdminSubmissionFile } from "./admin-store";

export const submissionDocumentTypes = ["ownership", "concept", "prototype", "implementation"] as const;

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");

export async function readSubmissionPdfFile(file: AdminSubmissionFile) {
  return readFileWithFallback(file.filePath, file.stored_name, file.original_name);
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
