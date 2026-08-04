import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import type { SubmissionListItem } from "./admin-store";

export type CommitteeJudge = {
  key: string;
  order: number;
  rank: string;
  name: string;
  unit: string;
  role: string;
  fileLabel: string;
};

export type CommitteeScoreCriterion = {
  id: string;
  groupId: "rules" | "problem" | "innovation" | "evidence" | "impact";
  groupLabel: string;
  label: string;
  max: number;
};

export type CommitteeScoreRecord = {
  id: string;
  submissionCode: string;
  submissionTitle: string;
  submissionOrder: number;
  judgeKey: string;
  judgeName: string;
  sourceFileName: string | null;
  sourcePage: number;
  itemScores: Record<string, number | null>;
  rulesScore: number;
  problemScore: number;
  innovationScore: number;
  evidenceScore: number;
  impactScore: number;
  calculatedTotal: number;
  declaredTotal: number | null;
  totalMismatch: number | null;
  note: string | null;
  submittedByEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type CommitteeScoreInput = {
  submissionCode: string;
  submissionTitle?: string;
  submissionOrder?: number;
  judgeKey: string;
  sourceFileName?: string | null;
  sourcePage?: number;
  itemScores: Record<string, number | null | undefined>;
  declaredTotal?: number | null;
  note?: string | null;
  submittedByEmail: string;
};

export type CommitteeScoreUpdateInput = {
  recordId: string;
  itemScores: Record<string, number | null | undefined>;
  declaredTotal?: number | null;
  note?: string | null;
  submittedByEmail: string;
};

export type CommitteeScoreSummaryRow = {
  rank: number;
  submissionCode: string;
  submissionTitle: string;
  submissionOrder: number;
  ownerName: string;
  division: string;
  judgeScores: Record<string, number | null>;
  judgeCount: number;
  averageScore: number | null;
  latestUpdatedAt: string | null;
};

export const committeeJudges: CommitteeJudge[] = [
  { key: "1", order: 1, rank: "พล.ต.ท.", name: "ไพบูลย์ น้อยหุ่น", unit: "ผบช.สทส.", role: "ประธานกรรมการ", fileLabel: "01-Paiboon-Noihun" },
  { key: "2", order: 2, rank: "พล.ต.ต.", name: "ฐากูร นิ่มสมบุญ", unit: "รอง ผบช.สทส.", role: "รองประธานกรรมการ", fileLabel: "02-Thakoon-Nimsomboon" },
  { key: "3", order: 3, rank: "พล.ต.ต.", name: "กิตติศัพท์ ทองศรีวงศ์", unit: "ผบก.สส.", role: "กรรมการ", fileLabel: "03-Kittisap-Thongsriwong" },
  { key: "4", order: 4, rank: "พล.ต.ต.", name: "ไพโรจน์ หมื่นกล้าหาญ", unit: "ผบก.ศทก.", role: "กรรมการ", fileLabel: "04-Pairoj-Muenklaharn" },
  { key: "5", order: 5, rank: "พล.ต.ต.", name: "กัมพล ลีลาประภาภรณ์", unit: "ผบก.สสท.", role: "กรรมการและเลขานุการ", fileLabel: "05-Kampol-Leelaprapaporn" },
];

export const committeeScoreCriteria: CommitteeScoreCriterion[] = [
  { id: "1.1", groupId: "rules", groupLabel: "1. ความเป็นผลงานของตำรวจ", label: "ที่มาและแรงบันดาลใจของผลงาน", max: 6 },
  { id: "1.2", groupId: "rules", groupLabel: "1. ความเป็นผลงานของตำรวจ", label: "สายงานที่รองรับ / หน่วยงานรับผิดชอบ", max: 2 },
  { id: "1.3", groupId: "rules", groupLabel: "1. ความเป็นผลงานของตำรวจ", label: "สอดคล้องกับหน้าที่และความรับผิดชอบของหน่วยงานในสังกัด สตช.", max: 6 },
  { id: "1.4", groupId: "rules", groupLabel: "1. ความเป็นผลงานของตำรวจ", label: "หลักฐานความเป็นเจ้าของผลงาน เช่น ผู้เกี่ยวข้อง ใบรับรอง สิทธิบัตร", max: 6 },
  { id: "2.1", groupId: "problem", groupLabel: "2. ปัญหาและความจำเป็น", label: "ปัญหาและอุปสรรคที่พบ", max: 5 },
  { id: "2.2", groupId: "problem", groupLabel: "2. ปัญหาและความจำเป็น", label: "กลุ่มเป้าหมายหรือผู้ได้รับผลกระทบ และผลกระทบที่เกิดขึ้น", max: 5 },
  { id: "2.3", groupId: "problem", groupLabel: "2. ปัญหาและความจำเป็น", label: "ผลลัพธ์ที่คาดหวังและความจำเป็นต่อภารกิจตำรวจ", max: 5 },
  { id: "3.1", groupId: "innovation", groupLabel: "3. แนวคิดหรือรูปแบบนวัตกรรม", label: "แนวคิด หลักการ หรือทฤษฎีที่เกี่ยวข้อง", max: 5 },
  { id: "3.2", groupId: "innovation", groupLabel: "3. แนวคิดหรือรูปแบบนวัตกรรม", label: "หลักการทำงานของผลงานนวัตกรรม", max: 5 },
  { id: "3.3", groupId: "innovation", groupLabel: "3. แนวคิดหรือรูปแบบนวัตกรรม", label: "ขั้นตอนการดำเนินงาน", max: 5 },
  { id: "3.4", groupId: "innovation", groupLabel: "3. แนวคิดหรือรูปแบบนวัตกรรม", label: "ความแตกต่างจากแนวทางหรือวิธีปฏิบัติเดิม", max: 5 },
  { id: "3.5", groupId: "innovation", groupLabel: "3. แนวคิดหรือรูปแบบนวัตกรรม", label: "ความเป็นไปได้ในการนำไปใช้งานจริง", max: 5 },
  { id: "4.1", groupId: "evidence", groupLabel: "4. หลักฐานผลลัพธ์เบื้องต้น", label: "ภาพถ่ายหรือภาพประกอบอธิบายภาพรวมนวัตกรรม", max: 5 },
  { id: "4.2", groupId: "evidence", groupLabel: "4. หลักฐานผลลัพธ์เบื้องต้น", label: "คลิปวิดีโอ 3-5 นาทีตามลิงก์ที่แนบในระบบ", max: 5 },
  { id: "4.3", groupId: "evidence", groupLabel: "4. หลักฐานผลลัพธ์เบื้องต้น", label: "ผลการทดลองหรือข้อมูลทางสถิติที่เกี่ยวข้อง", max: 5 },
  { id: "4.4", groupId: "evidence", groupLabel: "4. หลักฐานผลลัพธ์เบื้องต้น", label: "สรุปผลการทดสอบจากการนำไปใช้งานจริง", max: 5 },
  { id: "5.1", groupId: "impact", groupLabel: "5. ความคุ้มค่าและการขยายผล", label: "ข้อจำกัดและความเสี่ยงที่อาจเกิดจากการใช้งาน", max: 5 },
  { id: "5.2", groupId: "impact", groupLabel: "5. ความคุ้มค่าและการขยายผล", label: "แนวทางขยายผลและนำไปใช้งานในอนาคต", max: 5 },
  { id: "5.3", groupId: "impact", groupLabel: "5. ความคุ้มค่าและการขยายผล", label: "ระยะเวลาพัฒนาสู่การนำไปใช้งานจริง", max: 5 },
  { id: "5.4", groupId: "impact", groupLabel: "5. ความคุ้มค่าและการขยายผล", label: "งบประมาณที่คาดว่าต้องใช้เพื่อการใช้งานจริง", max: 5 },
];

type CommitteeScoreStore = {
  records: CommitteeScoreRecord[];
};

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const storePath = path.join(storageDir, "committee-paper-screening-scores.json");
let writeQueue: Promise<unknown> = Promise.resolve();

export function committeeJudgeLabel(judge: CommitteeJudge) {
  return `${judge.rank}${judge.name} • ${judge.unit} / ${judge.role}`;
}

export function findCommitteeJudge(key: string) {
  const normalized = key.trim();
  return committeeJudges.find((judge) => judge.key === normalized || judge.fileLabel === normalized || committeeJudgeLabel(judge) === normalized) ?? null;
}

export async function listCommitteeScoreRecords() {
  const store = await readStore();
  return latestCommitteeScoreRecords(store.records)
    .sort((a, b) => a.submissionOrder - b.submissionOrder || a.judgeKey.localeCompare(b.judgeKey));
}

export async function saveCommitteeScoreRecords(inputs: CommitteeScoreInput[]) {
  const normalized = inputs.map(normalizeCommitteeScoreInput);
  return writeQueued(async () => {
    const store = await readStore();
    const now = new Date().toISOString();
    const existing = new Map(latestCommitteeScoreRecords(store.records).map((record) => [`${record.submissionCode}:${record.judgeKey}`, record]));
    const saved: CommitteeScoreRecord[] = [];

    for (const item of normalized) {
      const key = `${item.submissionCode}:${item.judgeKey}`;
      const previous = existing.get(key);
      const record: CommitteeScoreRecord = {
        ...item,
        id: previous?.id ?? randomUUID(),
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      existing.set(key, record);
      saved.push(record);
    }

    const records = [...existing.values()].sort((a, b) => a.submissionOrder - b.submissionOrder || a.judgeKey.localeCompare(b.judgeKey));
    await writeStore({ records });
    return saved;
  });
}

export async function updateCommitteeScoreRecord(input: CommitteeScoreUpdateInput) {
  const recordId = input.recordId.trim();
  if (!recordId) throw Object.assign(new Error("recordId is required"), { code: "INVALID_INPUT" });
  return writeQueued(async () => {
    const store = await readStore();
    const target = store.records.find((record) => record.id === recordId);
    if (!target) throw Object.assign(new Error("committee score record not found"), { code: "NOT_FOUND" });
    const normalized = normalizeCommitteeScoreInput({
      submissionCode: target.submissionCode,
      submissionTitle: target.submissionTitle,
      submissionOrder: target.submissionOrder,
      judgeKey: target.judgeKey,
      sourceFileName: target.sourceFileName,
      sourcePage: target.sourcePage,
      itemScores: input.itemScores,
      declaredTotal: input.declaredTotal,
      note: input.note,
      submittedByEmail: input.submittedByEmail,
    });
    const updated: CommitteeScoreRecord = {
      ...target,
      itemScores: normalized.itemScores,
      rulesScore: normalized.rulesScore,
      problemScore: normalized.problemScore,
      innovationScore: normalized.innovationScore,
      evidenceScore: normalized.evidenceScore,
      impactScore: normalized.impactScore,
      calculatedTotal: normalized.calculatedTotal,
      declaredTotal: normalized.declaredTotal,
      totalMismatch: normalized.totalMismatch,
      note: normalized.note,
      submittedByEmail: normalized.submittedByEmail,
      updatedAt: new Date().toISOString(),
    };
    const records = store.records
      .map((record) => record.id === recordId ? updated : record)
      .sort((a, b) => a.submissionOrder - b.submissionOrder || a.judgeKey.localeCompare(b.judgeKey));
    await writeStore({ records });
    return updated;
  });
}

export async function deleteCommitteeScoreRecord(recordId: string) {
  const id = recordId.trim();
  if (!id) return null;
  return writeQueued(async () => {
    const store = await readStore();
    const target = store.records.find((record) => record.id === id) ?? null;
    if (!target) return null;
    await writeStore({ records: store.records.filter((record) => record.id !== id) });
    return target;
  });
}

export function buildCommitteeScoreboard(submissions: SubmissionListItem[], records: CommitteeScoreRecord[]): CommitteeScoreSummaryRow[] {
  const bySubmission = new Map<string, CommitteeScoreRecord[]>();
  for (const record of latestCommitteeScoreRecords(records)) {
    const list = bySubmission.get(record.submissionCode) ?? [];
    list.push(record);
    bySubmission.set(record.submissionCode, list);
  }

  return submissions.map((submission, index) => {
    const scoreRecords = bySubmission.get(submission.submission_code) ?? [];
    const judgeScores = Object.fromEntries(committeeJudges.map((judge) => [judge.key, null])) as Record<string, number | null>;
    for (const record of scoreRecords) judgeScores[record.judgeKey] = record.calculatedTotal;
    const totals = Object.values(judgeScores).filter((score): score is number => typeof score === "number" && Number.isFinite(score));
    const latestUpdatedAt = scoreRecords.reduce((latest, record) => {
      if (!latest || safeTime(record.updatedAt) > safeTime(latest)) return record.updatedAt;
      return latest;
    }, null as string | null);
    const averageScore = totals.length ? roundScore(totals.reduce((sum, value) => sum + value, 0) / totals.length) : null;
    return {
      rank: 0,
      submissionCode: submission.submission_code,
      submissionTitle: submission.title_th,
      submissionOrder: index + 1,
      ownerName: `${submission.first_name} ${submission.last_name}`.trim() || "-",
      division: submission.division || submission.bureau || "-",
      judgeScores,
      judgeCount: totals.length,
      averageScore,
      latestUpdatedAt,
    };
  }).sort((a, b) => {
    const aScore = a.averageScore ?? -1;
    const bScore = b.averageScore ?? -1;
    return bScore - aScore || b.judgeCount - a.judgeCount || a.submissionOrder - b.submissionOrder;
  }).map((row, index) => ({ ...row, rank: index + 1 }));
}

export function latestCommitteeScoreRecords(records: CommitteeScoreRecord[]) {
  const latest = new Map<string, CommitteeScoreRecord>();
  for (const record of records) {
    const key = `${record.submissionCode}:${record.judgeKey}`;
    const previous = latest.get(key);
    if (!previous || safeTime(record.updatedAt) >= safeTime(previous.updatedAt)) {
      latest.set(key, record);
    }
  }
  return [...latest.values()];
}

function normalizeCommitteeScoreInput(input: CommitteeScoreInput): CommitteeScoreRecord {
  const judge = findCommitteeJudge(input.judgeKey);
  if (!judge) throw Object.assign(new Error("invalid judge"), { code: "INVALID_JUDGE" });
  const itemScores = Object.fromEntries(committeeScoreCriteria.map((criterion) => {
    const score = normalizeScore(input.itemScores[criterion.id], criterion.max);
    return [criterion.id, score];
  })) as Record<string, number | null>;
  const groupScore = (groupId: CommitteeScoreCriterion["groupId"]) => committeeScoreCriteria
    .filter((criterion) => criterion.groupId === groupId)
    .reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);
  const declaredTotal = normalizeScore(input.declaredTotal, 100);
  const calculatedTotal = committeeScoreCriteria.reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);

  return {
    id: "",
    submissionCode: cleanRequired(input.submissionCode, "submissionCode"),
    submissionTitle: cleanText(input.submissionTitle) || cleanRequired(input.submissionCode, "submissionCode"),
    submissionOrder: Math.max(1, Math.trunc(Number(input.submissionOrder) || 1)),
    judgeKey: judge.key,
    judgeName: `${judge.rank}${judge.name}`,
    sourceFileName: cleanText(input.sourceFileName) || null,
    sourcePage: Math.max(1, Math.trunc(Number(input.sourcePage) || 1)),
    itemScores,
    rulesScore: groupScore("rules"),
    problemScore: groupScore("problem"),
    innovationScore: groupScore("innovation"),
    evidenceScore: groupScore("evidence"),
    impactScore: groupScore("impact"),
    calculatedTotal: roundScore(calculatedTotal),
    declaredTotal,
    totalMismatch: declaredTotal === null ? null : roundScore(calculatedTotal - declaredTotal),
    note: cleanText(input.note) || null,
    submittedByEmail: cleanRequired(input.submittedByEmail, "submittedByEmail"),
    createdAt: "",
    updatedAt: "",
  };
}

function normalizeScore(value: unknown, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.min(Math.max(roundScore(score), 0), max);
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function cleanRequired(value: unknown, field: string) {
  const text = cleanText(value);
  if (!text) throw Object.assign(new Error(`${field} is required`), { code: "INVALID_INPUT" });
  return text;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

async function readStore(): Promise<CommitteeScoreStore> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<CommitteeScoreStore>;
    const records = Array.isArray(parsed.records) ? parsed.records.map(hydrateRecord).filter(Boolean) as CommitteeScoreRecord[] : [];
    return { records: latestCommitteeScoreRecords(records) };
  } catch {
    return { records: [] };
  }
}

async function writeStore(store: CommitteeScoreStore) {
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

function hydrateRecord(record: unknown) {
  if (!record || typeof record !== "object") return null;
  const item = record as CommitteeScoreRecord;
  const judge = findCommitteeJudge(String(item.judgeKey ?? "")) ?? committeeJudges[0];
  const submissionCode = cleanText(item.submissionCode) || "-";
  const itemScores = Object.fromEntries(committeeScoreCriteria.map((criterion) => {
    const score = normalizeScore(item.itemScores?.[criterion.id], criterion.max);
    return [criterion.id, score];
  })) as Record<string, number | null>;
  const rulesScore = committeeScoreCriteria.filter((criterion) => criterion.groupId === "rules").reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);
  const problemScore = committeeScoreCriteria.filter((criterion) => criterion.groupId === "problem").reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);
  const innovationScore = committeeScoreCriteria.filter((criterion) => criterion.groupId === "innovation").reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);
  const evidenceScore = committeeScoreCriteria.filter((criterion) => criterion.groupId === "evidence").reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);
  const impactScore = committeeScoreCriteria.filter((criterion) => criterion.groupId === "impact").reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);
  const calculatedTotal = roundScore(rulesScore + problemScore + innovationScore + evidenceScore + impactScore);
  const declaredTotal = normalizeScore(item.declaredTotal, 100);
  const now = new Date().toISOString();
  return {
    ...item,
    id: cleanText(item.id) || randomUUID(),
    submissionCode,
    submissionTitle: cleanText(item.submissionTitle) || submissionCode,
    submissionOrder: Math.max(1, Math.trunc(Number(item.submissionOrder) || 1)),
    judgeKey: judge.key,
    judgeName: cleanText(item.judgeName) || `${judge.rank}${judge.name}`,
    sourceFileName: item.sourceFileName ?? null,
    sourcePage: Number(item.sourcePage) || 1,
    itemScores,
    rulesScore,
    problemScore,
    innovationScore,
    evidenceScore,
    impactScore,
    calculatedTotal,
    declaredTotal,
    totalMismatch: declaredTotal === null ? null : roundScore(calculatedTotal - declaredTotal),
    note: item.note ?? null,
    submittedByEmail: cleanText(item.submittedByEmail) || "-",
    createdAt: validIsoDate(item.createdAt) || validIsoDate(item.updatedAt) || now,
    updatedAt: validIsoDate(item.updatedAt) || validIsoDate(item.createdAt) || now,
  } satisfies CommitteeScoreRecord;
}

function validIsoDate(value: unknown) {
  if (typeof value !== "string") return "";
  return Number.isFinite(new Date(value).getTime()) ? value : "";
}

function safeTime(value: string | null | undefined) {
  const time = new Date(value ?? "").getTime();
  return Number.isFinite(time) ? time : 0;
}
