import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
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

export async function drawLuckyWinners(actorEmail: string) {
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
         ORDER BY e.lucky_draw_prize ASC`,
      );
      const existing = (existingRows as EvaluationRow[]).map(rowToRecord);
      const usedPrizes = new Set(existing.map((item) => item.lucky_draw_prize).filter((item): item is number => Boolean(item)));
      const missingPrizes = [1, 2, 3].filter((prize) => !usedPrizes.has(prize));
      if (!missingPrizes.length) return existing;

      const [candidateRows] = await connection.execute(
        `SELECT e.registration_code
         FROM satisfaction_evaluations e
         JOIN registrations r ON r.registration_code=e.registration_code
         WHERE r.status='attended' AND r.checked_in_at IS NOT NULL AND e.lucky_draw_prize IS NULL
         ORDER BY RAND()
         LIMIT ?`,
        [missingPrizes.length],
      );
      const candidates = candidateRows as Array<{ registration_code: string }>;
      for (const [index, candidate] of candidates.entries()) {
        await connection.execute(
          "UPDATE satisfaction_evaluations SET lucky_draw_prize=?,lucky_drawn_at=?,lucky_drawn_by_email=? WHERE registration_code=? AND lucky_draw_prize IS NULL",
          [missingPrizes[index], now, email, candidate.registration_code],
        );
      }

      const [winnerRows] = await connection.execute(
        `SELECT e.*,CONCAT(r.title,r.first_name,' ',r.last_name) AS participant_name,u.email
         FROM satisfaction_evaluations e
         JOIN registrations r ON r.registration_code=e.registration_code
         JOIN users u ON u.id=r.user_id
         WHERE e.lucky_draw_prize IS NOT NULL
         ORDER BY e.lucky_draw_prize ASC`,
      );
      return (winnerRows as EvaluationRow[]).map(rowToRecord);
    });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) console.error("lucky draw database failed, falling back to local store", error);
    return drawLocalLuckyWinners(email, now);
  }
}

export async function drawLuckyWinnersFromLocalStore(actorEmail: string) {
  return drawLocalLuckyWinners(actorEmail.trim().toLowerCase(), new Date().toISOString());
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

async function drawLocalLuckyWinners(actorEmail: string, now: string) {
  const work = async () => {
    const store = await readStore();
    const usedPrizes = new Set(store.evaluations.map((item) => item.lucky_draw_prize).filter((item): item is number => Boolean(item)));
    const missingPrizes = [1, 2, 3].filter((prize) => !usedPrizes.has(prize));
    const candidates = shuffle(store.evaluations.filter((item) => !item.lucky_draw_prize)).slice(0, missingPrizes.length);
    for (const [index, candidate] of candidates.entries()) {
      candidate.lucky_draw_prize = missingPrizes[index];
      candidate.lucky_drawn_at = now;
      candidate.lucky_drawn_by_email = actorEmail;
    }
    await writeStore(store);
    const winners = store.evaluations
      .filter((item) => item.lucky_draw_prize)
      .sort((a, b) => Number(a.lucky_draw_prize ?? 0) - Number(b.lucky_draw_prize ?? 0));
    return enrichLocalEvaluationRecords(winners);
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
