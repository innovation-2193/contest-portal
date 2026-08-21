import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { db, transaction } from "./db";
import { ensureDatabaseSchema } from "./db-schema";
import { isDatabaseSchemaFallback, isDatabaseUnavailable } from "./local-registrations";
import type { PresentationScoreSummaryRow } from "./presentation-score-store";

export type PresentationScoreReportVersion = {
  id: string;
  version: number;
  sourceFileName: string;
  createdByEmail: string;
  createdAt: string;
  rows: PresentationScoreSummaryRow[];
};

type ReportVersionDbRow = {
  id: string;
  version_no: number | string;
  source_file_name: string;
  created_by_email: string;
  created_at: string | Date;
  rows_json: string | null;
};

type ReportVersionStore = { versions: PresentationScoreReportVersion[] };

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const storePath = path.join(storageDir, "presentation-score-report-versions.json");
let writeQueue: Promise<unknown> = Promise.resolve();

export async function listPresentationScoreReportVersions() {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      "SELECT id,version_no,source_file_name,created_by_email,created_at,rows_json FROM presentation_score_report_versions ORDER BY version_no DESC",
    );
    return (rows as ReportVersionDbRow[]).map(dbRowToVersion).filter(Boolean) as PresentationScoreReportVersion[];
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    return listLocalVersions();
  }
}

export async function findPresentationScoreReportVersion(id: string) {
  const normalizedId = id.trim();
  if (!normalizedId) return null;
  const versions = await listPresentationScoreReportVersions();
  return versions.find((version) => version.id === normalizedId) ?? null;
}

export async function deletePresentationScoreReportVersion(id: string) {
  const normalizedId = id.trim();
  if (!normalizedId) return null;
  try {
    await ensureDatabaseSchema();
    const existing = await findPresentationScoreReportVersion(normalizedId);
    if (!existing) return null;
    await db.execute("DELETE FROM presentation_score_report_versions WHERE id=?", [normalizedId]);
    return existing;
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    return writeQueued(async () => {
      const store = await readLocalStore();
      const existing = store.versions.find((version) => version.id === normalizedId) ?? null;
      if (!existing) return null;
      await writeLocalStore({ versions: store.versions.filter((version) => version.id !== normalizedId) });
      return existing;
    });
  }
}

export async function createPresentationScoreReportVersion(input: {
  sourceFileName: string;
  createdByEmail: string;
  rows: PresentationScoreSummaryRow[];
}) {
  const normalized = normalizeInput(input);
  try {
    await ensureDatabaseSchema();
    return await transaction(async (connection) => {
      const [nextRows] = await connection.execute(
        "SELECT COALESCE(MAX(version_no),0)+1 AS next_version FROM presentation_score_report_versions FOR UPDATE",
      );
      const version = Math.max(1, Number((nextRows as Array<{ next_version: number | string }>)[0]?.next_version ?? 1));
      const record: PresentationScoreReportVersion = { id: randomUUID(), version, ...normalized };
      await connection.execute(
        "INSERT INTO presentation_score_report_versions (id,version_no,source_file_name,created_by_email,created_at,rows_json) VALUES (?,?,?,?,?,?)",
        [record.id, record.version, record.sourceFileName, record.createdByEmail, record.createdAt, JSON.stringify(record.rows)],
      );
      return record;
    });
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    return writeQueued(async () => {
      const store = await readLocalStore();
      const version = Math.max(0, ...store.versions.map((item) => item.version)) + 1;
      const record: PresentationScoreReportVersion = { id: randomUUID(), version, ...normalized };
      await writeLocalStore({ versions: [...store.versions, record] });
      return record;
    });
  }
}

function normalizeInput(input: { sourceFileName: string; createdByEmail: string; rows: PresentationScoreSummaryRow[] }) {
  return {
    sourceFileName: input.sourceFileName.trim() || "presentation-score-import.xlsx",
    createdByEmail: input.createdByEmail.trim().toLowerCase() || "-",
    createdAt: new Date().toISOString(),
    rows: input.rows.map((row) => ({ ...row })),
  };
}

function dbRowToVersion(row: ReportVersionDbRow): PresentationScoreReportVersion | null {
  try {
    const parsed = row.rows_json ? JSON.parse(row.rows_json) : [];
    return {
      id: row.id,
      version: Number(row.version_no),
      sourceFileName: row.source_file_name,
      createdByEmail: row.created_by_email,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      rows: Array.isArray(parsed) ? parsed as PresentationScoreSummaryRow[] : [],
    };
  } catch {
    return null;
  }
}

async function listLocalVersions() {
  const store = await readLocalStore();
  return store.versions.slice().sort((left, right) => right.version - left.version);
}

async function readLocalStore(): Promise<ReportVersionStore> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as Partial<ReportVersionStore>;
    return { versions: Array.isArray(parsed.versions) ? parsed.versions : [] };
  } catch {
    return { versions: [] };
  }
}

async function writeLocalStore(store: ReportVersionStore) {
  await mkdir(storageDir, { recursive: true });
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await rename(tempPath, storePath);
}

function writeQueued<T>(task: () => Promise<T>) {
  const next = writeQueue.then(task, task);
  writeQueue = next.catch(() => undefined);
  return next;
}

function shouldUseLocalStore(error: unknown) {
  return isDatabaseUnavailable(error) || isDatabaseSchemaFallback(error);
}
