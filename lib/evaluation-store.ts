import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { db, transaction } from "./db";
import { ensureDatabaseSchema } from "./db-schema";
import { evaluationQuestionCount, evaluationQuestionLabels } from "./evaluation-form";
import { findLocalRegistrationByCode, isDatabaseUnavailable } from "./local-registrations";

export type EvaluationRecord = {
  id: string;
  registration_code: string;
  gender: string;
  gender_other: string | null;
  age_range: string;
  organization_type: string;
  organization_other: string | null;
  attendee_status: string;
  attendee_status_other: string | null;
  scores: number[];
  impressive_text: string;
  suggestion_text: string;
  submitted_at: string;
  lucky_draw_prize: number | null;
  lucky_drawn_at: string | null;
  lucky_drawn_by_email: string | null;
  lucky_notified_at: string | null;
  participant_name?: string;
  email?: string;
};

export type EvaluationInput = {
  registrationCode: string;
  gender: string;
  genderOther: string;
  ageRange: string;
  organizationType: string;
  organizationOther: string;
  attendeeStatus: string;
  attendeeStatusOther: string;
  scores: number[];
  impressiveText: string;
  suggestionText: string;
};

export type LuckyDrawCandidate = {
  registrationCode: string;
  name: string;
  email: string;
};

export type LuckyDrawResetResult = {
  cycleNo: number;
  winners: EvaluationRecord[];
};

export type EvaluationSummary = {
  total: number;
  average: number;
  sections: Array<{ key: string; title: string; count: number; average: number }>;
  questions: Array<{ index: number; label: string; average: number; count: number }>;
  profiles: Record<"gender" | "ageRange" | "organizationType" | "attendeeStatus", Array<{ label: string; count: number }>>;
  comments: Array<{ registrationCode: string; name: string; impressiveText: string; suggestionText: string; submittedAt: string }>;
  winners: EvaluationRecord[];
};

type EvaluationStore = {
  evaluations: EvaluationRecord[];
};

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const storePath = path.join(storageDir, "dev-evaluations.json");
const questionColumns = Array.from({ length: evaluationQuestionCount }, (_, index) => `q${index + 1}`);
const sectionRanges = [
  { key: "event", title: "การจัดงานประกวดและแสดงนวัตกรรม", start: 0, end: 8 },
  { key: "service", title: "การบริการ สถานที่ และการอำนวยความสะดวก", start: 8, end: 13 },
  { key: "benefit", title: "ประโยชน์ที่ได้รับจากการร่วมงาน", start: 13, end: 18 },
];

let writeQueue: Promise<unknown> = Promise.resolve();

export async function findEvaluationByRegistrationCode(registrationCode: string) {
  const code = registrationCode.trim();
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      `SELECT e.*,CONCAT(r.title,r.first_name,' ',r.last_name) AS participant_name,u.email
       FROM satisfaction_evaluations e
       JOIN registrations r ON r.registration_code=e.registration_code
       JOIN users u ON u.id=r.user_id
       WHERE e.registration_code=? LIMIT 1`,
      [code],
    );
    const row = (rows as EvaluationRow[])[0];
    return row ? rowToRecord(row) : null;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return findLocalEvaluationByRegistrationCode(code);
  }
}

export async function submitEvaluation(input: EvaluationInput) {
  validateEvaluationInput(input);
  const code = input.registrationCode.trim();
  const now = new Date().toISOString();
  try {
    await ensureDatabaseSchema();
    const [registrationRows] = await db.execute(
      "SELECT status,checked_in_at FROM registrations WHERE registration_code=? LIMIT 1",
      [code],
    );
    const registration = (registrationRows as Array<{ status: string; checked_in_at: string | null }>)[0];
    if (!registration) throw Object.assign(new Error("registration not found"), { code: "NOT_FOUND" });
    if (registration.status !== "attended" || !registration.checked_in_at) {
      throw Object.assign(new Error("registration has not checked in"), { code: "NOT_ATTENDED" });
    }

    await db.execute(
      `INSERT INTO satisfaction_evaluations(
        id,registration_code,gender,gender_other,age_range,organization_type,organization_other,attendee_status,attendee_status_other,
        ${questionColumns.join(",")},impressive_text,suggestion_text,submitted_at
      ) VALUES(${Array.from({ length: 9 + questionColumns.length + 3 }, () => "?").join(",")})`,
      [
        randomUUID(),
        code,
        input.gender,
        input.genderOther || null,
        input.ageRange,
        input.organizationType,
        input.organizationOther || null,
        input.attendeeStatus,
        input.attendeeStatusOther || null,
        ...input.scores,
        input.impressiveText.slice(0, 1000),
        input.suggestionText.slice(0, 1000),
        now,
      ],
    );
    return findEvaluationByRegistrationCode(code);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return submitLocalEvaluation(input);
  }
}

export async function getEvaluationSummary(): Promise<EvaluationSummary> {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      `SELECT e.*,CONCAT(r.title,r.first_name,' ',r.last_name) AS participant_name,u.email
       FROM satisfaction_evaluations e
       JOIN registrations r ON r.registration_code=e.registration_code
       JOIN users u ON u.id=r.user_id
       ORDER BY e.submitted_at DESC`,
    );
    return summarizeEvaluations((rows as EvaluationRow[]).map(rowToRecord));
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const store = await readStoreSafe();
    return summarizeEvaluations(await enrichLocalEvaluationRecords(store.evaluations));
  }
}

export async function listLuckyDrawCandidates(): Promise<LuckyDrawCandidate[]> {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      `SELECT e.registration_code,CONCAT(r.title,r.first_name,' ',r.last_name) AS participant_name,u.email
       FROM satisfaction_evaluations e
       JOIN registrations r ON r.registration_code=e.registration_code
       JOIN users u ON u.id=r.user_id
       WHERE r.status='attended' AND r.checked_in_at IS NOT NULL AND e.lucky_draw_prize IS NULL
       ORDER BY r.first_name,r.last_name,e.registration_code`,
    );
    return (rows as Array<{ registration_code: string; participant_name: string; email: string }>).map((row) => ({
      registrationCode: row.registration_code,
      name: row.participant_name,
      email: row.email,
    }));
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const store = await readStoreSafe();
    const records = await enrichLocalEvaluationRecords(store.evaluations.filter((item) => !item.lucky_draw_prize));
    return records.map((item) => ({
      registrationCode: item.registration_code,
      name: item.participant_name ?? item.registration_code,
      email: item.email ?? "",
    }));
  }
}

export async function drawLuckyWinner(prize: number, actorEmail: string) {
  if (![1, 2, 3].includes(prize)) throw luckyDrawError("INVALID_PRIZE", "invalid lucky draw prize");
  const email = actorEmail.trim().toLowerCase();
  const now = new Date().toISOString();
  try {
    await ensureDatabaseSchema();
    return transaction(async (connection) => {
      const [existingRows] = await connection.execute(
        `SELECT e.*,CONCAT(r.title,r.first_name,' ',r.last_name) AS participant_name,u.email
         FROM satisfaction_evaluations e
         JOIN registrations r ON r.registration_code=e.registration_code
         JOIN users u ON u.id=r.user_id
         WHERE e.lucky_draw_prize IS NOT NULL
         ORDER BY e.lucky_draw_prize ASC
         FOR UPDATE`,
      );
      const existing = (existingRows as EvaluationRow[]).map(rowToRecord);
      const usedPrizes = new Set(existing.map((item) => item.lucky_draw_prize).filter((item): item is number => Boolean(item)));
      const nextPrize = [1, 2, 3].find((item) => !usedPrizes.has(item));
      if (!nextPrize) throw luckyDrawError("DRAW_COMPLETE", "lucky draw is already complete");
      if (prize !== nextPrize) throw luckyDrawError("WRONG_PRIZE", `next lucky draw prize is ${nextPrize}`);

      const [candidateRows] = await connection.execute(
        `SELECT e.registration_code
         FROM satisfaction_evaluations e
         JOIN registrations r ON r.registration_code=e.registration_code
         WHERE r.status='attended' AND r.checked_in_at IS NOT NULL AND e.lucky_draw_prize IS NULL
         ORDER BY RAND()
         LIMIT 1
         FOR UPDATE`,
      );
      const candidates = candidateRows as Array<{ registration_code: string }>;
      const candidate = candidates[0];
      if (!candidate) throw luckyDrawError("NO_CANDIDATE", "no eligible lucky draw candidate");
      const [updateResult] = await connection.execute(
        "UPDATE satisfaction_evaluations SET lucky_draw_prize=?,lucky_drawn_at=?,lucky_drawn_by_email=? WHERE registration_code=? AND lucky_draw_prize IS NULL",
        [prize, now, email, candidate.registration_code],
      );
      if ((updateResult as ResultSetHeader).affectedRows !== 1) {
        throw luckyDrawError("DRAW_CONFLICT", "lucky draw candidate was already selected");
      }

      const [winnerRows] = await connection.execute(
        `SELECT e.*,CONCAT(r.title,r.first_name,' ',r.last_name) AS participant_name,u.email
         FROM satisfaction_evaluations e
         JOIN registrations r ON r.registration_code=e.registration_code
         JOIN users u ON u.id=r.user_id
         WHERE e.lucky_draw_prize IS NOT NULL
         ORDER BY e.lucky_draw_prize ASC`,
      );
      const winners = (winnerRows as EvaluationRow[]).map(rowToRecord);
      await syncLuckyDrawHistory(connection, winners);
      const winner = winners.find((item) => item.lucky_draw_prize === prize);
      if (!winner) throw luckyDrawError("DRAW_CONFLICT", "lucky draw winner was not persisted");
      return winner;
    });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return drawLocalLuckyWinner(prize, email, now);
  }
}

export async function resetLuckyDraw(actorEmail: string): Promise<LuckyDrawResetResult> {
  const email = actorEmail.trim().toLowerCase();
  const now = new Date().toISOString();
  try {
    await ensureDatabaseSchema();
    return transaction(async (connection) => {
      const [winnerRows] = await connection.execute(
        `SELECT e.*,CONCAT(r.title,r.first_name,' ',r.last_name) AS participant_name,u.email
         FROM satisfaction_evaluations e
         JOIN registrations r ON r.registration_code=e.registration_code
         JOIN users u ON u.id=r.user_id
         WHERE e.lucky_draw_prize IS NOT NULL
         ORDER BY e.lucky_draw_prize ASC
         FOR UPDATE`,
      );
      const winners = (winnerRows as EvaluationRow[]).map(rowToRecord);
      if (!winners.length) throw luckyDrawError("NOTHING_TO_RESET", "no lucky draw result to reset");
      const cycleNo = await syncLuckyDrawHistory(connection, winners);
      await connection.execute(
        "UPDATE lucky_draw_results SET reset_at=?,reset_by_email=? WHERE cycle_no=? AND reset_at IS NULL",
        [now, email, cycleNo],
      );
      await connection.execute(
        `UPDATE satisfaction_evaluations
         SET lucky_draw_prize=NULL,lucky_drawn_at=NULL,lucky_drawn_by_email=NULL,lucky_notified_at=NULL
         WHERE lucky_draw_prize IS NOT NULL`,
      );
      return { cycleNo, winners };
    });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return resetLocalLuckyDraw();
  }
}

export async function markLuckyDrawResetNotified(cycleNo: number, registrationCode: string) {
  const now = new Date().toISOString();
  try {
    await ensureDatabaseSchema();
    await db.execute(
      "UPDATE lucky_draw_results SET reset_notified_at=? WHERE cycle_no=? AND registration_code=? AND reset_at IS NOT NULL",
      [now, cycleNo, registrationCode.trim()],
    );
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
  }
}

export async function markLuckyWinnerNotified(registrationCode: string) {
  const code = registrationCode.trim();
  const now = new Date().toISOString();
  try {
    await ensureDatabaseSchema();
    await db.execute("UPDATE satisfaction_evaluations SET lucky_notified_at=? WHERE registration_code=?", [now, code]);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) console.error("lucky winner notify mark database failed, falling back to local store", error);
    await updateLocalEvaluation(code, (item) => ({ ...item, lucky_notified_at: now }));
  }
}

export async function markLuckyWinnerNotifiedInLocalStore(registrationCode: string) {
  await updateLocalEvaluation(registrationCode.trim(), (item) => ({ ...item, lucky_notified_at: new Date().toISOString() }));
}

async function syncLuckyDrawHistory(connection: PoolConnection, winners: EvaluationRecord[]) {
  const [activeRows] = await connection.execute(
    "SELECT cycle_no FROM lucky_draw_results WHERE reset_at IS NULL ORDER BY cycle_no DESC LIMIT 1 FOR UPDATE",
  );
  let cycleNo = Number((activeRows as Array<{ cycle_no: number }>)[0]?.cycle_no ?? 0);
  if (!cycleNo) {
    const [cycleRows] = await connection.execute(
      "SELECT COALESCE(MAX(cycle_no),0)+1 AS next_cycle FROM lucky_draw_results FOR UPDATE",
    );
    cycleNo = Number((cycleRows as Array<{ next_cycle: number }>)[0]?.next_cycle ?? 1);
  }
  for (const winner of winners) {
    if (!winner.lucky_draw_prize || !winner.lucky_drawn_at || !winner.lucky_drawn_by_email) continue;
    await connection.execute(
      `INSERT IGNORE INTO lucky_draw_results(
        id,cycle_no,prize,registration_code,winner_name,winner_email,drawn_at,drawn_by_email
      ) VALUES(?,?,?,?,?,?,?,?)`,
      [
        randomUUID(),
        cycleNo,
        winner.lucky_draw_prize,
        winner.registration_code,
        winner.participant_name ?? winner.registration_code,
        winner.email ?? null,
        winner.lucky_drawn_at,
        winner.lucky_drawn_by_email,
      ],
    );
  }
  return cycleNo;
}

function summarizeEvaluations(evaluations: EvaluationRecord[]): EvaluationSummary {
  const total = evaluations.length;
  const flatScores = evaluations.flatMap((item) => item.scores);
  const questions = evaluationQuestionLabels.map((label, index) => {
    const scores = evaluations.map((item) => item.scores[index]).filter((value) => Number.isFinite(value));
    return { index: index + 1, label, average: average(scores), count: scores.length };
  });
  const sections = sectionRanges.map((section) => {
    const scores = evaluations.flatMap((item) => item.scores.slice(section.start, section.end));
    return { key: section.key, title: section.title, count: scores.length, average: average(scores) };
  });
  return {
    total,
    average: average(flatScores),
    sections,
    questions,
    profiles: {
      gender: countBy(evaluations.map((item) => withOther(item.gender, item.gender_other))),
      ageRange: countBy(evaluations.map((item) => item.age_range)),
      organizationType: countBy(evaluations.map((item) => withOther(item.organization_type, item.organization_other))),
      attendeeStatus: countBy(evaluations.map((item) => withOther(item.attendee_status, item.attendee_status_other))),
    },
    comments: evaluations
      .filter((item) => item.impressive_text || item.suggestion_text)
      .slice(0, 12)
      .map((item) => ({
        registrationCode: item.registration_code,
        name: item.participant_name ?? item.registration_code,
        impressiveText: item.impressive_text,
        suggestionText: item.suggestion_text,
        submittedAt: item.submitted_at,
      })),
    winners: evaluations
      .filter((item) => item.lucky_draw_prize)
      .sort((a, b) => Number(a.lucky_draw_prize ?? 0) - Number(b.lucky_draw_prize ?? 0)),
  };
}

function validateEvaluationInput(input: EvaluationInput) {
  if (!input.registrationCode.trim()) throw new Error("ไม่พบรหัสลงทะเบียน");
  if (!input.gender || !input.ageRange || !input.organizationType || !input.attendeeStatus) {
    throw new Error("กรุณากรอกข้อมูลทั่วไปให้ครบถ้วน");
  }
  if (input.scores.length !== evaluationQuestionCount || input.scores.some((score) => !Number.isInteger(score) || score < 1 || score > 5)) {
    throw new Error("กรุณาให้คะแนนความพึงพอใจให้ครบทุกข้อ");
  }
}

type EvaluationRow = Omit<EvaluationRecord, "scores"> & Record<`q${number}`, number>;

function rowToRecord(row: EvaluationRow): EvaluationRecord {
  return {
    ...row,
    scores: questionColumns.map((column) => Number(row[column as `q${number}`] ?? 0)),
    lucky_draw_prize: row.lucky_draw_prize === null ? null : Number(row.lucky_draw_prize),
  };
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100;
}

function countBy(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value || "-", (counts.get(value || "-") ?? 0) + 1));
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function withOther(value: string, other?: string | null) {
  return value === "อื่น ๆ" && other ? `อื่น ๆ: ${other}` : value;
}

async function findLocalEvaluationByRegistrationCode(registrationCode: string) {
  await writeQueue.catch(() => undefined);
  const store = await readStore();
  const record = store.evaluations.find((item) => item.registration_code === registrationCode.trim()) ?? null;
  return record ? enrichLocalEvaluationRecord(record) : null;
}

async function submitLocalEvaluation(input: EvaluationInput) {
  const work = async () => {
    const store = await readStore();
    const code = input.registrationCode.trim();
    if (store.evaluations.some((item) => item.registration_code === code)) {
      throw Object.assign(new Error("evaluation already submitted"), { code: "DUPLICATE_EVALUATION" });
    }
    const record: EvaluationRecord = {
      id: randomUUID(),
      registration_code: code,
      gender: input.gender,
      gender_other: input.genderOther || null,
      age_range: input.ageRange,
      organization_type: input.organizationType,
      organization_other: input.organizationOther || null,
      attendee_status: input.attendeeStatus,
      attendee_status_other: input.attendeeStatusOther || null,
      scores: input.scores,
      impressive_text: input.impressiveText.slice(0, 1000),
      suggestion_text: input.suggestionText.slice(0, 1000),
      submitted_at: new Date().toISOString(),
      lucky_draw_prize: null,
      lucky_drawn_at: null,
      lucky_drawn_by_email: null,
      lucky_notified_at: null,
    };
    store.evaluations.unshift(record);
    await writeStore(store);
    return enrichLocalEvaluationRecord(record);
  };
  const result = writeQueue.then(work, work);
  writeQueue = result.catch(() => undefined);
  return result;
}

async function drawLocalLuckyWinner(prize: number, actorEmail: string, now: string) {
  const work = async () => {
    const store = await readStore();
    const usedPrizes = new Set(store.evaluations.map((item) => item.lucky_draw_prize).filter((item): item is number => Boolean(item)));
    const nextPrize = [1, 2, 3].find((item) => !usedPrizes.has(item));
    if (!nextPrize) throw luckyDrawError("DRAW_COMPLETE", "lucky draw is already complete");
    if (prize !== nextPrize) throw luckyDrawError("WRONG_PRIZE", `next lucky draw prize is ${nextPrize}`);
    const candidate = shuffle(store.evaluations.filter((item) => !item.lucky_draw_prize))[0];
    if (!candidate) throw luckyDrawError("NO_CANDIDATE", "no eligible lucky draw candidate");
    candidate.lucky_draw_prize = prize;
    candidate.lucky_drawn_at = now;
    candidate.lucky_drawn_by_email = actorEmail;
    await writeStore(store);
    return enrichLocalEvaluationRecord(candidate);
  };
  const result = writeQueue.then(work, work);
  writeQueue = result.catch(() => undefined);
  return result;
}

async function resetLocalLuckyDraw(): Promise<LuckyDrawResetResult> {
  const work = async () => {
    const store = await readStore();
    const winners = await enrichLocalEvaluationRecords(store.evaluations.filter((item) => item.lucky_draw_prize));
    if (!winners.length) throw luckyDrawError("NOTHING_TO_RESET", "no lucky draw result to reset");
    store.evaluations = store.evaluations.map((item) => item.lucky_draw_prize ? {
      ...item,
      lucky_draw_prize: null,
      lucky_drawn_at: null,
      lucky_drawn_by_email: null,
      lucky_notified_at: null,
    } : item);
    await writeStore(store);
    return { cycleNo: 0, winners };
  };
  const result = writeQueue.then(work, work);
  writeQueue = result.catch(() => undefined);
  return result;
}

async function updateLocalEvaluation(registrationCode: string, updater: (record: EvaluationRecord) => EvaluationRecord) {
  const work = async () => {
    const store = await readStore();
    store.evaluations = store.evaluations.map((item) => item.registration_code === registrationCode ? updater(item) : item);
    await writeStore(store);
  };
  const result = writeQueue.then(work, work);
  writeQueue = result.catch(() => undefined);
  return result;
}

async function enrichLocalEvaluationRecords(records: EvaluationRecord[]) {
  return Promise.all(records.map((record) => enrichLocalEvaluationRecord(record)));
}

async function enrichLocalEvaluationRecord(record: EvaluationRecord) {
  const registration = await findLocalRegistrationByCode(record.registration_code).catch(() => null);
  if (!registration) return record;
  return {
    ...record,
    participant_name: `${registration.title}${registration.first_name} ${registration.last_name}`.trim(),
    email: registration.email,
  };
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

function luckyDrawError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

async function readStoreSafe() {
  try {
    return await readStore();
  } catch {
    return { evaluations: [] };
  }
}

async function readStore(): Promise<EvaluationStore> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as Partial<EvaluationStore>;
    return { evaluations: Array.isArray(parsed.evaluations) ? parsed.evaluations : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { evaluations: [] };
    throw error;
  }
}

async function writeStore(store: EvaluationStore) {
  await mkdir(path.dirname(storePath), { recursive: true });
  const tempPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tempPath, storePath);
}
