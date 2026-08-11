import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { db, transaction } from "./db";
import { ensureDatabaseSchema } from "./db-schema";
import { isDatabaseSchemaFallback, isDatabaseUnavailable } from "./local-registrations";
import type { SubmissionListItem } from "./admin-store";
import {
  committeeConsensusCriteria,
  defaultCommitteeJudgeProfiles,
  type CommitteeJudgeProfile,
  formatCommitteeJudgeProfile,
} from "./committee-score-config";

export const committeeConsensusJudgeKey = "consensus";

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
  itemScores?: Record<string, number | null | undefined>;
  totalScore?: number | null;
  declaredTotal?: number | null;
  note?: string | null;
  submittedByEmail: string;
};

export type CommitteeScoreUpdateInput = {
  recordId: string;
  itemScores?: Record<string, number | null | undefined>;
  totalScore?: number | null;
  declaredTotal?: number | null;
  note?: string | null;
  submittedByEmail: string;
};

export type CommitteeScoreSummaryRow = {
  rank: number;
  submissionCode: string;
  submissionTitle: string;
  submissionTitleEnglish: string | null;
  submissionOrder: number;
  ownerName: string;
  division: string;
  judgeScores: Record<string, number | null>;
  judgeCount: number;
  averageScore: number | null;
  latestUpdatedAt: string | null;
};

export type CommitteeJudgeProfileInput = CommitteeJudgeProfile;

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

type CommitteeJudgeProfileDbRow = {
  judge_key: string;
  prefix: string;
  first_name: string;
  last_name: string;
  position: string;
};

type CommitteeScoreDbRow = {
  id: string;
  submission_code: string;
  submission_title: string;
  submission_order: number | string;
  judge_key: string;
  judge_name: string;
  source_file_name: string | null;
  source_page: number | string;
  item_scores: string | Record<string, number | null> | null;
  rules_score: number | string;
  problem_score: number | string;
  innovation_score: number | string;
  evidence_score: number | string;
  impact_score: number | string;
  calculated_total: number | string;
  declared_total: number | string | null;
  total_mismatch: number | string | null;
  note: string | null;
  submitted_by_email: string;
  created_at: string;
  updated_at: string;
};

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const storePath = path.join(storageDir, "committee-paper-screening-scores.json");
const profileStorePath = path.join(storageDir, "committee-judge-profiles.json");
let writeQueue: Promise<unknown> = Promise.resolve();

export async function listCommitteeJudgeProfiles(): Promise<CommitteeJudgeProfile[]> {
  const defaults = defaultCommitteeJudgeProfiles();
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      "SELECT judge_key,prefix,first_name,last_name,position FROM committee_judge_profiles ORDER BY judge_key ASC",
    );
    return mergeCommitteeJudgeProfiles(defaults, rows as CommitteeJudgeProfileDbRow[]);
  } catch (error) {
    if (!shouldUseLocalCommitteeScoreStore(error)) throw error;
    try {
      const raw = await readFile(profileStorePath, "utf8");
      const parsed = JSON.parse(raw) as { profiles?: unknown };
      const profiles = Array.isArray(parsed.profiles) ? parsed.profiles as CommitteeJudgeProfile[] : [];
      return mergeCommitteeJudgeProfiles(defaults, profiles.map((profile) => ({
        judge_key: profile.judgeKey,
        prefix: profile.prefix,
        first_name: profile.firstName,
        last_name: profile.lastName,
        position: profile.position,
      })));
    } catch {
      return defaults;
    }
  }
}

export async function saveCommitteeJudgeProfiles(inputs: CommitteeJudgeProfileInput[], submittedByEmail: string) {
  const profiles = normalizeCommitteeJudgeProfiles(inputs);
  if (!profiles.length) return listCommitteeJudgeProfiles();
  try {
    await ensureDatabaseSchema();
    await transaction(async (connection) => {
      for (const profile of profiles) {
        await connection.execute(
          `INSERT INTO committee_judge_profiles (judge_key,prefix,first_name,last_name,position,updated_by_email,updated_at)
           VALUES (?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE prefix=VALUES(prefix),first_name=VALUES(first_name),last_name=VALUES(last_name),position=VALUES(position),updated_by_email=VALUES(updated_by_email),updated_at=VALUES(updated_at)`,
          [profile.judgeKey, profile.prefix, profile.firstName, profile.lastName, profile.position, submittedByEmail, new Date().toISOString()],
        );
      }
    });
    return listCommitteeJudgeProfiles();
  } catch (error) {
    if (!shouldUseLocalCommitteeScoreStore(error)) throw error;
    return writeQueued(async () => {
      await mkdir(storageDir, { recursive: true });
      const current = await listCommitteeJudgeProfiles();
      const merged = mergeCommitteeJudgeProfiles(current, profiles.map((profile) => ({
        judge_key: profile.judgeKey,
        prefix: profile.prefix,
        first_name: profile.firstName,
        last_name: profile.lastName,
        position: profile.position,
      })));
      const tempPath = `${profileStorePath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tempPath, JSON.stringify({ profiles: merged }, null, 2), "utf8");
      await rename(tempPath, profileStorePath);
      return merged;
    });
  }
}

export function committeeJudgeProfileLabel(profile: CommitteeJudgeProfile) {
  return `${formatCommitteeJudgeProfile(profile)}${profile.position ? ` (${profile.position})` : ""}`;
}

export function committeeJudgeLabel(judge: CommitteeJudge) {
  return `${judge.rank}${judge.name} • ${judge.unit} / ${judge.role}`;
}

export function findCommitteeJudge(key: string) {
  const normalized = key.trim();
  if (normalized === committeeConsensusJudgeKey) {
    return {
      key: committeeConsensusJudgeKey,
      order: 0,
      rank: "",
      name: "คณะกรรมการรอบที่ 1 (พิจารณาร่วมกัน)",
      unit: "คณะกรรมการพิจารณารางวัลนวัตกรรม",
      role: "พิจารณาร่วมกัน",
      fileLabel: "consensus",
    } satisfies CommitteeJudge;
  }
  return committeeJudges.find((judge) => judge.key === normalized || judge.fileLabel === normalized || committeeJudgeLabel(judge) === normalized) ?? null;
}

export async function listCommitteeScoreRecords(): Promise<CommitteeScoreRecord[]> {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      `SELECT id,submission_code,submission_title,submission_order,judge_key,judge_name,source_file_name,source_page,item_scores,
        rules_score,problem_score,innovation_score,evidence_score,impact_score,calculated_total,declared_total,total_mismatch,note,
        submitted_by_email,created_at,updated_at
       FROM committee_scores
       ORDER BY submission_order ASC,judge_key ASC`,
    );
    return latestCommitteeScoreRecords((rows as CommitteeScoreDbRow[]).map(dbRowToCommitteeScoreRecord).filter(Boolean) as CommitteeScoreRecord[])
      .sort((a, b) => a.submissionOrder - b.submissionOrder || a.judgeKey.localeCompare(b.judgeKey));
  } catch (error) {
    if (!shouldUseLocalCommitteeScoreStore(error)) throw error;
    return listCommitteeScoreRecordsLocal();
  }
}

export async function saveCommitteeScoreRecords(inputs: CommitteeScoreInput[]): Promise<CommitteeScoreRecord[]> {
  const normalized = inputs.map(normalizeCommitteeScoreInput);
  try {
    return await saveCommitteeScoreRecordsDb(normalized);
  } catch (error) {
    if (!shouldUseLocalCommitteeScoreStore(error)) throw error;
    return saveCommitteeScoreRecordsLocal(normalized);
  }
}

async function listCommitteeScoreRecordsLocal(): Promise<CommitteeScoreRecord[]> {
  const store = await readStore();
  return latestCommitteeScoreRecords(store.records)
    .sort((a, b) => a.submissionOrder - b.submissionOrder || a.judgeKey.localeCompare(b.judgeKey));
}

async function saveCommitteeScoreRecordsLocal(normalized: CommitteeScoreRecord[]): Promise<CommitteeScoreRecord[]> {
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

export async function updateCommitteeScoreRecord(input: CommitteeScoreUpdateInput): Promise<CommitteeScoreRecord> {
  const recordId = input.recordId.trim();
  if (!recordId) throw Object.assign(new Error("recordId is required"), { code: "INVALID_INPUT" });
  try {
    await ensureDatabaseSchema();
    const target = await findCommitteeScoreRecordByIdDb(recordId);
    if (!target) throw Object.assign(new Error("committee score record not found"), { code: "NOT_FOUND" });
    const normalized = normalizeCommitteeScoreInput({
      submissionCode: target.submissionCode,
      submissionTitle: target.submissionTitle,
      submissionOrder: target.submissionOrder,
      judgeKey: target.judgeKey,
      sourceFileName: target.sourceFileName,
      sourcePage: target.sourcePage,
      itemScores: input.itemScores,
      totalScore: input.totalScore,
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
    await updateCommitteeScoreRecordDb(updated);
    return updated;
  } catch (error) {
    if (!shouldUseLocalCommitteeScoreStore(error)) throw error;
    return updateCommitteeScoreRecordLocal(input, recordId);
  }
}

async function updateCommitteeScoreRecordLocal(input: CommitteeScoreUpdateInput, recordId: string): Promise<CommitteeScoreRecord> {
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
      totalScore: input.totalScore,
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

export async function deleteCommitteeScoreRecord(recordId: string): Promise<CommitteeScoreRecord | null> {
  const id = recordId.trim();
  if (!id) return null;
  try {
    await ensureDatabaseSchema();
    const target = await findCommitteeScoreRecordByIdDb(id);
    if (!target) return null;
    await db.execute("DELETE FROM committee_scores WHERE id=?", [id]);
    return target;
  } catch (error) {
    if (!shouldUseLocalCommitteeScoreStore(error)) throw error;
    return deleteCommitteeScoreRecordLocal(id);
  }
}

async function deleteCommitteeScoreRecordLocal(id: string): Promise<CommitteeScoreRecord | null> {
  return writeQueued(async () => {
    const store = await readStore();
    const target = store.records.find((record) => record.id === id) ?? null;
    if (!target) return null;
    await writeStore({ records: store.records.filter((record) => record.id !== id) });
    return target;
  });
}

async function saveCommitteeScoreRecordsDb(records: CommitteeScoreRecord[]): Promise<CommitteeScoreRecord[]> {
  if (!records.length) return [];
  const now = new Date().toISOString();
  const saved = records.map((record) => ({
    ...record,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  }));
  await ensureDatabaseSchema();
  await transaction(async (connection) => {
    for (const record of saved) {
      await connection.execute(
        `INSERT INTO committee_scores (
          id,submission_code,submission_title,submission_order,judge_key,judge_name,source_file_name,source_page,item_scores,
          rules_score,problem_score,innovation_score,evidence_score,impact_score,calculated_total,declared_total,total_mismatch,note,
          submitted_by_email,created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          submission_title=VALUES(submission_title),
          submission_order=VALUES(submission_order),
          judge_name=VALUES(judge_name),
          source_file_name=VALUES(source_file_name),
          source_page=VALUES(source_page),
          item_scores=VALUES(item_scores),
          rules_score=VALUES(rules_score),
          problem_score=VALUES(problem_score),
          innovation_score=VALUES(innovation_score),
          evidence_score=VALUES(evidence_score),
          impact_score=VALUES(impact_score),
          calculated_total=VALUES(calculated_total),
          declared_total=VALUES(declared_total),
          total_mismatch=VALUES(total_mismatch),
          note=VALUES(note),
          submitted_by_email=VALUES(submitted_by_email),
          updated_at=VALUES(updated_at)`,
        committeeScoreDbParams(record),
      );
    }
  });
  return saved;
}

async function findCommitteeScoreRecordByIdDb(recordId: string): Promise<CommitteeScoreRecord | null> {
  const [rows] = await db.execute(
    `SELECT id,submission_code,submission_title,submission_order,judge_key,judge_name,source_file_name,source_page,item_scores,
      rules_score,problem_score,innovation_score,evidence_score,impact_score,calculated_total,declared_total,total_mismatch,note,
      submitted_by_email,created_at,updated_at
     FROM committee_scores
     WHERE id=?
     LIMIT 1`,
    [recordId],
  );
  return dbRowToCommitteeScoreRecord((rows as CommitteeScoreDbRow[])[0]);
}

async function updateCommitteeScoreRecordDb(record: CommitteeScoreRecord) {
  await db.execute(
    `UPDATE committee_scores SET
      item_scores=?,
      rules_score=?,
      problem_score=?,
      innovation_score=?,
      evidence_score=?,
      impact_score=?,
      calculated_total=?,
      declared_total=?,
      total_mismatch=?,
      note=?,
      submitted_by_email=?,
      updated_at=?
     WHERE id=?`,
    [
      JSON.stringify(record.itemScores),
      record.rulesScore,
      record.problemScore,
      record.innovationScore,
      record.evidenceScore,
      record.impactScore,
      record.calculatedTotal,
      record.declaredTotal,
      record.totalMismatch,
      record.note,
      record.submittedByEmail,
      record.updatedAt,
      record.id,
    ],
  );
}

function committeeScoreDbParams(record: CommitteeScoreRecord) {
  return [
    record.id,
    record.submissionCode,
    record.submissionTitle,
    record.submissionOrder,
    record.judgeKey,
    record.judgeName,
    record.sourceFileName,
    record.sourcePage,
    JSON.stringify(record.itemScores),
    record.rulesScore,
    record.problemScore,
    record.innovationScore,
    record.evidenceScore,
    record.impactScore,
    record.calculatedTotal,
    record.declaredTotal,
    record.totalMismatch,
    record.note,
    record.submittedByEmail,
    record.createdAt,
    record.updatedAt,
  ];
}

function dbRowToCommitteeScoreRecord(row: CommitteeScoreDbRow | undefined): CommitteeScoreRecord | null {
  if (!row) return null;
  return hydrateRecord({
    id: row.id,
    submissionCode: row.submission_code,
    submissionTitle: row.submission_title,
    submissionOrder: row.submission_order,
    judgeKey: row.judge_key,
    judgeName: row.judge_name,
    sourceFileName: row.source_file_name,
    sourcePage: row.source_page,
    itemScores: parseDbItemScores(row.item_scores),
    rulesScore: row.rules_score,
    problemScore: row.problem_score,
    innovationScore: row.innovation_score,
    evidenceScore: row.evidence_score,
    impactScore: row.impact_score,
    calculatedTotal: row.calculated_total,
    declaredTotal: row.declared_total,
    totalMismatch: row.total_mismatch,
    note: row.note,
    submittedByEmail: row.submitted_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function parseDbItemScores(value: CommitteeScoreDbRow["item_scores"]) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, number | null> : {};
  } catch {
    return {};
  }
}

function shouldUseLocalCommitteeScoreStore(error: unknown) {
  return isDatabaseUnavailable(error) || isDatabaseSchemaFallback(error);
}

function normalizeCommitteeJudgeProfiles(inputs: CommitteeJudgeProfileInput[]) {
  const defaults = new Map(defaultCommitteeJudgeProfiles().map((profile) => [profile.judgeKey, profile]));
  const profiles: CommitteeJudgeProfile[] = [];
  for (const input of inputs) {
    const judgeKey = String(input?.judgeKey ?? "").trim();
    const fallback = defaults.get(judgeKey);
    if (!fallback) continue;
    profiles.push({
      judgeKey,
      prefix: cleanText(input.prefix),
      firstName: cleanText(input.firstName),
      lastName: cleanText(input.lastName),
      position: cleanText(input.position),
    });
  }
  return profiles;
}

function mergeCommitteeJudgeProfiles(defaults: CommitteeJudgeProfile[], overrides: Array<CommitteeJudgeProfile | CommitteeJudgeProfileDbRow>) {
  const byKey = new Map(defaults.map((profile) => [profile.judgeKey, profile]));
  for (const override of overrides) {
    const judgeKey = "judgeKey" in override ? String(override.judgeKey) : String(override.judge_key);
    if (!byKey.has(judgeKey)) continue;
    const base = byKey.get(judgeKey)!;
    const prefix = "judgeKey" in override ? override.prefix : override.prefix;
    const firstName = "judgeKey" in override ? override.firstName : override.first_name;
    const lastName = "judgeKey" in override ? override.lastName : override.last_name;
    const position = override.position;
    byKey.set(judgeKey, {
      judgeKey,
      prefix: cleanText(prefix) || base.prefix,
      firstName: cleanText(firstName) || base.firstName,
      lastName: cleanText(lastName) || base.lastName,
      position: cleanText(position),
    });
  }
  return committeeJudges.map((judge) => byKey.get(judge.key)!).filter(Boolean);
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
    for (const record of scoreRecords) {
      if (!committeeJudges.some((judge) => judge.key === record.judgeKey)) continue;
      judgeScores[record.judgeKey] = record.calculatedTotal;
    }
    const totals = Object.values(judgeScores).filter((score): score is number => typeof score === "number" && Number.isFinite(score));
    const latestUpdatedAt = scoreRecords.reduce((latest, record) => {
      if (!latest || safeTime(record.updatedAt) > safeTime(latest)) return record.updatedAt;
      return latest;
    }, null as string | null);
    const averageScore = totals.length === committeeJudges.length
      ? roundScore(totals.reduce((sum, value) => sum + value, 0) / committeeJudges.length)
      : null;
    return {
      rank: 0,
      submissionCode: submission.submission_code,
      submissionTitle: submission.title_th,
      submissionTitleEnglish: submission.title_en || null,
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
  if (judge.key === committeeConsensusJudgeKey) return normalizeCommitteeConsensusInput(input, judge);
  const rawItemScores = input.itemScores ?? {};
  const itemScores = Object.fromEntries(committeeScoreCriteria.map((criterion) => {
    const score = normalizeScore(rawItemScores[criterion.id], criterion.max);
    return [criterion.id, score];
  })) as Record<string, number | null>;
  const groupScore = (groupId: CommitteeScoreCriterion["groupId"]) => committeeScoreCriteria
    .filter((criterion) => criterion.groupId === groupId)
    .reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);
  const declaredTotal = normalizeScore(input.declaredTotal, 100);
  const summedTotal = committeeScoreCriteria.reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);
  const hasItemScore = Object.values(itemScores).some((score) => score !== null);
  const manualTotal = normalizeScore(input.totalScore, 100);
  const calculatedTotal = manualTotal ?? (hasItemScore ? summedTotal : declaredTotal ?? 0);

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

function normalizeCommitteeConsensusInput(input: CommitteeScoreInput, judge: CommitteeJudge): CommitteeScoreRecord {
  const rawItemScores = input.itemScores ?? {};
  const itemScores = Object.fromEntries(committeeConsensusCriteria.map((criterion) => [
    criterion.id,
    normalizeScore(rawItemScores[criterion.id], criterion.max),
  ])) as Record<string, number | null>;
  const hasItemScore = Object.values(itemScores).some((score) => score !== null);
  const calculatedTotal = committeeConsensusCriteria.reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);
  const declaredTotal = normalizeScore(input.declaredTotal, 100);
  return {
    id: "",
    submissionCode: cleanRequired(input.submissionCode, "submissionCode"),
    submissionTitle: cleanText(input.submissionTitle) || cleanRequired(input.submissionCode, "submissionCode"),
    submissionOrder: Math.max(1, Math.trunc(Number(input.submissionOrder) || 1)),
    judgeKey: judge.key,
    judgeName: judge.name,
    sourceFileName: cleanText(input.sourceFileName) || null,
    sourcePage: Math.max(1, Math.trunc(Number(input.sourcePage) || 1)),
    itemScores,
    rulesScore: itemScores.rules ?? 0,
    problemScore: itemScores.problem ?? 0,
    innovationScore: itemScores.innovation ?? 0,
    evidenceScore: itemScores.evidence ?? 0,
    impactScore: itemScores.impact ?? 0,
    calculatedTotal: roundScore(hasItemScore ? calculatedTotal : 0),
    declaredTotal,
    totalMismatch: declaredTotal === null ? null : roundScore(calculatedTotal - declaredTotal),
    note: cleanText(input.note) || "Excel consensus score import",
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
  if (judge.key === committeeConsensusJudgeKey) return hydrateConsensusRecord(item, judge);
  const itemScores = Object.fromEntries(committeeScoreCriteria.map((criterion) => {
    const score = normalizeScore(item.itemScores?.[criterion.id], criterion.max);
    return [criterion.id, score];
  })) as Record<string, number | null>;
  const rulesScore = committeeScoreCriteria.filter((criterion) => criterion.groupId === "rules").reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);
  const problemScore = committeeScoreCriteria.filter((criterion) => criterion.groupId === "problem").reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);
  const innovationScore = committeeScoreCriteria.filter((criterion) => criterion.groupId === "innovation").reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);
  const evidenceScore = committeeScoreCriteria.filter((criterion) => criterion.groupId === "evidence").reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);
  const impactScore = committeeScoreCriteria.filter((criterion) => criterion.groupId === "impact").reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);
  const declaredTotal = normalizeScore(item.declaredTotal, 100);
  const summedTotal = rulesScore + problemScore + innovationScore + evidenceScore + impactScore;
  const hasItemScore = Object.values(itemScores).some((score) => score !== null);
  const storedTotal = normalizeScore(item.calculatedTotal, 100);
  const calculatedTotal = roundScore(hasItemScore ? summedTotal : storedTotal ?? declaredTotal ?? 0);
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

function hydrateConsensusRecord(item: CommitteeScoreRecord, judge: CommitteeJudge): CommitteeScoreRecord {
  const itemScores = Object.fromEntries(committeeConsensusCriteria.map((criterion) => [
    criterion.id,
    normalizeScore(item.itemScores?.[criterion.id], criterion.max),
  ])) as Record<string, number | null>;
  const calculatedTotal = committeeConsensusCriteria.reduce((sum, criterion) => sum + (itemScores[criterion.id] ?? 0), 0);
  const declaredTotal = normalizeScore(item.declaredTotal, 100);
  const now = new Date().toISOString();
  return {
    ...item,
    id: cleanText(item.id) || randomUUID(),
    submissionCode: cleanText(item.submissionCode) || "-",
    submissionTitle: cleanText(item.submissionTitle) || cleanText(item.submissionCode) || "-",
    submissionOrder: Math.max(1, Math.trunc(Number(item.submissionOrder) || 1)),
    judgeKey: judge.key,
    judgeName: cleanText(item.judgeName) || judge.name,
    sourceFileName: item.sourceFileName ?? null,
    sourcePage: Number(item.sourcePage) || 1,
    itemScores,
    rulesScore: itemScores.rules ?? 0,
    problemScore: itemScores.problem ?? 0,
    innovationScore: itemScores.innovation ?? 0,
    evidenceScore: itemScores.evidence ?? 0,
    impactScore: itemScores.impact ?? 0,
    calculatedTotal: roundScore(calculatedTotal),
    declaredTotal,
    totalMismatch: declaredTotal === null ? null : roundScore(calculatedTotal - declaredTotal),
    note: item.note ?? "Excel consensus score import",
    submittedByEmail: cleanText(item.submittedByEmail) || "-",
    createdAt: validIsoDate(item.createdAt) || validIsoDate(item.updatedAt) || now,
    updatedAt: validIsoDate(item.updatedAt) || validIsoDate(item.createdAt) || now,
  };
}

function validIsoDate(value: unknown) {
  if (typeof value !== "string") return "";
  return Number.isFinite(new Date(value).getTime()) ? value : "";
}

function safeTime(value: string | null | undefined) {
  const time = new Date(value ?? "").getTime();
  return Number.isFinite(time) ? time : 0;
}
