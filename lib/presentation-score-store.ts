import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { db, transaction } from "./db";
import { ensureDatabaseSchema } from "./db-schema";
import { isDatabaseSchemaFallback, isDatabaseUnavailable } from "./local-registrations";
import type { SubmissionListItem } from "./admin-store";
import type { CommitteeScoreRecord } from "./committee-score-store";
import {
  defaultPresentationJudgeProfiles,
  presentationScoreCriteria,
  presentationScoreWeights,
  type PresentationJudgeProfile,
} from "./presentation-score-config";

export type PresentationScoreRecord = {
  id: string;
  submissionCode: string;
  submissionTitle: string;
  submissionOrder: number;
  judgeKey: string;
  judgeName: string;
  itemScores: Record<string, number | null>;
  calculatedTotal: number;
  note: string | null;
  submittedByEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type PresentationScoreInput = {
  submissionCode: string;
  submissionTitle?: string;
  submissionOrder?: number;
  judgeKey: string;
  judgeName?: string;
  itemScores?: Record<string, number | null | undefined>;
  totalScore?: number | null;
  note?: string | null;
  submittedByEmail: string;
};

export type PresentationScoreSummaryRow = {
  rank: number;
  submissionCode: string;
  submissionTitle: string;
  submissionOrder: number;
  round1Average: number | null;
  weightedRound1: number | null;
  presentationAverage: number | null;
  weightedPresentation: number | null;
  finalScore: number | null;
  judgeCount: number;
};

type PresentationScoreDbRow = {
  id: string;
  submission_code: string;
  submission_title: string;
  submission_order: number | string;
  judge_key: string;
  judge_name: string;
  item_scores: string | Record<string, number | null> | null;
  calculated_total: number | string;
  note: string | null;
  submitted_by_email: string;
  created_at: string;
  updated_at: string;
};

type PresentationStore = { records: PresentationScoreRecord[]; profiles?: PresentationJudgeProfile[] };

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const scoreStorePath = path.join(storageDir, "presentation-scores.json");
const profileStorePath = path.join(storageDir, "presentation-judge-profiles.json");
let writeQueue: Promise<unknown> = Promise.resolve();

export async function listPresentationJudgeProfiles() {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute("SELECT judge_key,prefix,first_name,last_name,position,role FROM presentation_judge_profiles ORDER BY sort_order ASC,judge_key ASC");
    const profiles = rows as Array<Record<string, string>>;
    return profiles.length ? normalizeProfiles(profiles) : defaultPresentationJudgeProfiles();
  } catch (error) {
    if (!shouldUseLocal(error)) throw error;
    try {
      const parsed = JSON.parse(await readFile(profileStorePath, "utf8")) as { profiles?: unknown };
      return Array.isArray(parsed.profiles) && parsed.profiles.length ? normalizeProfiles(parsed.profiles as Array<Record<string, string>>) : defaultPresentationJudgeProfiles();
    } catch {
      return defaultPresentationJudgeProfiles();
    }
  }
}

export async function savePresentationJudgeProfiles(profiles: PresentationJudgeProfile[], actorEmail: string) {
  const normalized = normalizeProfiles(profiles);
  if (!normalized.length) throw Object.assign(new Error("ต้องมีกรรมการรอบที่ 2 อย่างน้อย 1 คน"), { code: "INVALID_INPUT" });
  try {
    await ensureDatabaseSchema();
    await transaction(async (connection) => {
      await connection.execute("DELETE FROM presentation_judge_profiles");
      for (const [index, profile] of normalized.entries()) {
        await connection.execute(
          "INSERT INTO presentation_judge_profiles (judge_key,prefix,first_name,last_name,position,role,sort_order,updated_by_email,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
          [profile.judgeKey, profile.prefix, profile.firstName, profile.lastName, profile.position, profile.role, index + 1, actorEmail, new Date().toISOString()],
        );
      }
    });
    return normalized;
  } catch (error) {
    if (!shouldUseLocal(error)) throw error;
    await writeQueued(async () => {
      await mkdir(storageDir, { recursive: true });
      const tempPath = `${profileStorePath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tempPath, JSON.stringify({ profiles: normalized }, null, 2), "utf8");
      await rename(tempPath, profileStorePath);
    });
    return normalized;
  }
}

export async function listPresentationScoreRecords() {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(`SELECT id,submission_code,submission_title,submission_order,judge_key,judge_name,item_scores,calculated_total,note,submitted_by_email,created_at,updated_at FROM presentation_scores ORDER BY submission_order ASC,judge_key ASC`);
    return (rows as PresentationScoreDbRow[]).map(dbRowToRecord).filter(Boolean) as PresentationScoreRecord[];
  } catch (error) {
    if (!shouldUseLocal(error)) throw error;
    const parsed = await readLocalStore();
    return parsed.records;
  }
}

export async function savePresentationScoreRecords(inputs: PresentationScoreInput[]) {
  const normalized = inputs.map(normalizeInput);
  if (!normalized.length) return [];
  try {
    await ensureDatabaseSchema();
    await transaction(async (connection) => {
      for (const item of normalized) {
        await connection.execute(
          `INSERT INTO presentation_scores (id,submission_code,submission_title,submission_order,judge_key,judge_name,item_scores,calculated_total,note,submitted_by_email,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE submission_title=VALUES(submission_title),submission_order=VALUES(submission_order),judge_name=VALUES(judge_name),item_scores=VALUES(item_scores),calculated_total=VALUES(calculated_total),note=VALUES(note),submitted_by_email=VALUES(submitted_by_email),updated_at=VALUES(updated_at)`,
          dbParams({ ...item, id: randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
        );
      }
    });
    return listPresentationScoreRecords();
  } catch (error) {
    if (!shouldUseLocal(error)) throw error;
    return writeQueued(async () => {
      const store = await readLocalStore();
      const existing = new Map(store.records.map((record) => [`${record.submissionCode}:${record.judgeKey}`, record]));
      const now = new Date().toISOString();
      for (const item of normalized) {
        const previous = existing.get(`${item.submissionCode}:${item.judgeKey}`);
        existing.set(`${item.submissionCode}:${item.judgeKey}`, { ...item, id: previous?.id ?? randomUUID(), createdAt: previous?.createdAt ?? now, updatedAt: now });
      }
      await writeLocalStore({ records: [...existing.values()] });
      return [...existing.values()];
    });
  }
}

export async function deletePresentationScoreRecord(recordId: string) {
  const id = recordId.trim();
  if (!id) return null;
  try {
    await ensureDatabaseSchema();
    const existing = (await db.execute("SELECT id,submission_code,submission_title,submission_order,judge_key,judge_name,item_scores,calculated_total,note,submitted_by_email,created_at,updated_at FROM presentation_scores WHERE id=? LIMIT 1", [id]))[0] as PresentationScoreDbRow[];
    const record = dbRowToRecord(existing[0]);
    if (!record) return null;
    await db.execute("DELETE FROM presentation_scores WHERE id=?", [id]);
    return record;
  } catch (error) {
    if (!shouldUseLocal(error)) throw error;
    return writeQueued(async () => {
      const store = await readLocalStore();
      const record = store.records.find((item) => item.id === id) ?? null;
      if (record) await writeLocalStore({ records: store.records.filter((item) => item.id !== id) });
      return record;
    });
  }
}

export async function buildPresentationScoreboard(submissions: SubmissionListItem[], records: PresentationScoreRecord[], profiles: PresentationJudgeProfile[], round1Records?: CommitteeScoreRecord[]) {
  const latest = latestRecords(records);
  const activeJudgeKeys = new Set(profiles.map((profile) => profile.judgeKey));
  const bySubmission = new Map<string, PresentationScoreRecord[]>();
  for (const record of latest) {
    if (!activeJudgeKeys.has(record.judgeKey)) continue;
    bySubmission.set(record.submissionCode, [...(bySubmission.get(record.submissionCode) ?? []), record]);
  }
  const round1BySubmission = new Map<string, number[]>();
  for (const record of latestCommitteeScores(round1Records ?? [])) {
    round1BySubmission.set(record.submissionCode, [...(round1BySubmission.get(record.submissionCode) ?? []), record.calculatedTotal]);
  }
  return submissions.map((submission, index) => {
    const presentationScores = bySubmission.get(submission.submission_code) ?? [];
    const round1Scores = round1BySubmission.get(submission.submission_code) ?? [];
    const round1Average = average(round1Scores);
    const presentationAverage = presentationScores.length === profiles.length && profiles.length > 0 ? average(presentationScores.map((record) => record.calculatedTotal)) : null;
    const weightedRound1 = weighted(round1Average, presentationScoreWeights.paperScreening);
    const weightedPresentation = weighted(presentationAverage, presentationScoreWeights.presentation);
    return {
      rank: 0,
      submissionCode: submission.submission_code,
      submissionTitle: submission.title_th,
      submissionOrder: index + 1,
      round1Average,
      weightedRound1,
      presentationAverage,
      weightedPresentation,
      finalScore: weightedRound1 !== null && weightedPresentation !== null ? roundScore(weightedRound1 + weightedPresentation) : null,
      judgeCount: presentationScores.length,
    } satisfies PresentationScoreSummaryRow;
  }).sort((left, right) => (right.finalScore ?? -1) - (left.finalScore ?? -1) || left.submissionOrder - right.submissionOrder)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function round1WeightedScore(records: CommitteeScoreRecord[], submissionCode: string) {
  const values = latestCommitteeScores(records).filter((record) => record.submissionCode === submissionCode).map((record) => record.calculatedTotal);
  const averageScore = average(values);
  return { average: averageScore, weighted: weighted(averageScore, presentationScoreWeights.paperScreening) };
}

function normalizeInput(input: PresentationScoreInput): PresentationScoreRecord {
  const itemScores = Object.fromEntries(presentationScoreCriteria.map((criterion) => [criterion.id, normalizeScore(input.itemScores?.[criterion.id], criterion.max)]));
  const hasItems = Object.values(itemScores).some((score) => score !== null);
  const sum = presentationScoreCriteria.reduce((total, criterion) => total + (itemScores[criterion.id] ?? 0), 0);
  const manual = normalizeScore(input.totalScore, 100);
  return { id: "", submissionCode: clean(input.submissionCode), submissionTitle: clean(input.submissionTitle) || clean(input.submissionCode), submissionOrder: Math.max(1, Math.trunc(Number(input.submissionOrder) || 1)), judgeKey: clean(input.judgeKey), judgeName: clean(input.judgeName) || clean(input.judgeKey), itemScores, calculatedTotal: roundScore(manual ?? (hasItems ? sum : 0)), note: clean(input.note) || null, submittedByEmail: clean(input.submittedByEmail), createdAt: "", updatedAt: "" };
}

function normalizeProfiles(rows: Array<Record<string, string>>) {
  return rows.map((row, index) => ({ judgeKey: clean(row.judgeKey ?? row.judge_key) || `r2-${index + 1}`, prefix: clean(row.prefix), firstName: clean(row.firstName ?? row.first_name), lastName: clean(row.lastName ?? row.last_name), position: clean(row.position), role: clean(row.role) || "กรรมการ" })).filter((profile) => profile.firstName || profile.lastName);
}

function dbParams(record: PresentationScoreRecord) {
  return [record.id, record.submissionCode, record.submissionTitle, record.submissionOrder, record.judgeKey, record.judgeName, JSON.stringify(record.itemScores), record.calculatedTotal, record.note, record.submittedByEmail, record.createdAt, record.updatedAt];
}

function dbRowToRecord(row: PresentationScoreDbRow | undefined): PresentationScoreRecord | null {
  if (!row) return null;
  const itemScores = parseItemScores(row.item_scores);
  return { id: row.id, submissionCode: row.submission_code, submissionTitle: row.submission_title, submissionOrder: Number(row.submission_order), judgeKey: row.judge_key, judgeName: row.judge_name, itemScores, calculatedTotal: Number(row.calculated_total), note: row.note, submittedByEmail: row.submitted_by_email, createdAt: row.created_at, updatedAt: row.updated_at };
}

function parseItemScores(value: PresentationScoreDbRow["item_scores"]) {
  if (!value) return {} as Record<string, number | null>;
  if (typeof value === "object") return value;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed as Record<string, number | null> : {}; } catch { return {}; }
}

function latestRecords(records: PresentationScoreRecord[]) {
  const map = new Map<string, PresentationScoreRecord>();
  for (const record of records) {
    const key = `${record.submissionCode}:${record.judgeKey}`;
    if (!map.has(key) || new Date(record.updatedAt).getTime() >= new Date(map.get(key)!.updatedAt).getTime()) map.set(key, record);
  }
  return [...map.values()];
}

function latestCommitteeScores(records: CommitteeScoreRecord[]) {
  const map = new Map<string, CommitteeScoreRecord>();
  for (const record of records) {
    const key = `${record.submissionCode}:${record.judgeKey}`;
    if (!map.has(key) || new Date(record.updatedAt).getTime() >= new Date(map.get(key)!.updatedAt).getTime()) map.set(key, record);
  }
  return [...map.values()];
}

function average(values: number[]) {
  return values.length ? roundScore(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function weighted(value: number | null, weight: number) {
  return value === null ? null : roundScore(value * weight);
}

function roundScore(value: number) { return Math.round(value * 100) / 100; }
function normalizeScore(value: unknown, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) ? Math.min(Math.max(roundScore(score), 0), max) : null;
}
function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function shouldUseLocal(error: unknown) { return isDatabaseUnavailable(error) || isDatabaseSchemaFallback(error); }

function writeQueued<T>(task: () => Promise<T>) {
  const next = writeQueue.then(task, task);
  writeQueue = next.catch(() => undefined);
  return next;
}

async function readLocalStore(): Promise<PresentationStore> {
  try {
    const parsed = JSON.parse(await readFile(scoreStorePath, "utf8")) as Partial<PresentationStore>;
    return { records: Array.isArray(parsed.records) ? parsed.records : [] };
  } catch { return { records: [] }; }
}

async function writeLocalStore(store: PresentationStore) {
  await mkdir(storageDir, { recursive: true });
  const tempPath = `${scoreStorePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await rename(tempPath, scoreStorePath);
}
