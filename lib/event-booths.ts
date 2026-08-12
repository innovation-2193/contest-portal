import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";
import { db } from "./db";
import { ensureDatabaseSchema } from "./db-schema";
import { listParticipants, listSubmissions, listWinners } from "./admin-store";
import { participantBoothOrganization } from "./booth-units";
import { isDatabaseSchemaFallback, isDatabaseUnavailable, type RegistrationRecord } from "./local-registrations";
import { selectPresentationSubmissions } from "./presentation-score-utils";
import { formatApplicantName } from "./thai-rank-title";

export type EventBoothSourceType = "exhibitor" | "finalist";

export type EventBoothContact = {
  key: string;
  name: string;
  phone: string;
  email: string;
};

export type EventBoothRecord = {
  id: string;
  sourceType: EventBoothSourceType;
  sourceKey: string;
  boothNumber: number;
  organizationName: string;
  workTitle: string;
  workType: string;
  imageName: string | null;
  imageOriginalName: string | null;
  contactKey: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  createdByEmail: string;
  updatedByEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type EventBoothSource = {
  sourceType: EventBoothSourceType;
  sourceKey: string;
  organizationName: string;
  sourceLabel: string;
  defaultWorkTitle: string;
  defaultWorkType: string;
  contacts: EventBoothContact[];
  booths: EventBoothRecord[];
};

type BoothDbRow = {
  id: string;
  source_type: EventBoothSourceType;
  source_key: string;
  booth_number: number | string;
  organization_name: string;
  work_title: string;
  work_type: string;
  image_name: string | null;
  image_original_name: string | null;
  contact_key: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  created_by_email: string;
  updated_by_email: string;
  created_at: string;
  updated_at: string;
};

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const storePath = path.join(storageDir, "event-booths.json");
const imageDir = path.join(storageDir, "event-booth-images");
const imageExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
};
let writeQueue: Promise<unknown> = Promise.resolve();

export async function listEventBoothSources(actorEmail = "system") {
  const candidates = await buildSourceCandidates();
  const records = await listEventBoothRecords();
  const existingKeys = new Set(records.map((record) => sourceIdentity(record.sourceType, record.sourceKey)));
  const missing = candidates.filter((source) => !existingKeys.has(sourceIdentity(source.sourceType, source.sourceKey)));
  if (missing.length) {
    await createInitialBooths(missing, actorEmail);
  }
  const currentRecords = missing.length ? await listEventBoothRecords() : records;
  return candidates.map((source) => ({
    ...source,
    booths: currentRecords
      .filter((record) => record.sourceType === source.sourceType && record.sourceKey === source.sourceKey)
      .sort((left, right) => left.boothNumber - right.boothNumber),
  }));
}

export async function listEventBooths(actorEmail = "system") {
  return (await listEventBoothSources(actorEmail)).flatMap((source) => source.booths.map((booth) => ({ ...booth, sourceLabel: source.sourceLabel })));
}

export async function getEventBoothContext(id: string, actorEmail = "system") {
  const boothId = id.trim();
  for (const source of await listEventBoothSources(actorEmail)) {
    const booth = source.booths.find((item) => item.id === boothId);
    if (booth) return { source, booth };
  }
  return null;
}

export async function setEventBoothCount(input: { sourceType: EventBoothSourceType; sourceKey: string; count: number; actorEmail: string }) {
  const source = await findSource(input.sourceType, input.sourceKey, input.actorEmail);
  const count = Math.min(20, Math.max(1, Math.floor(input.count)));
  const records = source.booths.slice().sort((left, right) => left.boothNumber - right.boothNumber);
  if (records.length < count) {
    const additions = Array.from({ length: count - records.length }, (_, index) => newRecord(source, records.length + index + 1, input.actorEmail));
    await saveNewRecords(additions);
  } else if (records.length > count) {
    const removed = records.filter((record) => record.boothNumber > count);
    await deleteRecords(removed);
  }
  return count;
}

export async function updateEventBooth(input: {
  id: string;
  workTitle: string;
  workType: string;
  contactKey: string;
  image?: File | null;
  removeImage?: boolean;
  actorEmail: string;
}) {
  const records = await listEventBoothRecords();
  const current = records.find((record) => record.id === input.id.trim());
  if (!current) throw new Error("ไม่พบข้อมูลบูธ");
  const source = await findSource(current.sourceType, current.sourceKey, input.actorEmail);
  const contact = source.contacts.find((item) => item.key === input.contactKey) ?? source.contacts[0] ?? emptyContact();
  const image = input.image ? await saveBoothImage(input.image) : null;
  const next: EventBoothRecord = {
    ...current,
    organizationName: source.organizationName,
    workTitle: clean(input.workTitle).slice(0, 500),
    workType: clean(input.workType).slice(0, 255),
    contactKey: contact.key,
    contactName: contact.name,
    contactPhone: contact.phone,
    contactEmail: contact.email,
    imageName: image?.name ?? (input.removeImage ? null : current.imageName),
    imageOriginalName: image?.originalName ?? (input.removeImage ? null : current.imageOriginalName),
    updatedByEmail: normalizeEmail(input.actorEmail),
    updatedAt: new Date().toISOString(),
  };
  await persistUpdatedRecord(next);
  if ((image || input.removeImage) && current.imageName) await removeBoothImage(current.imageName);
  return next;
}

export function getEventBoothImagePath(name: string) {
  const safeName = name.trim();
  if (!safeName || path.basename(safeName) !== safeName || !/^[a-f0-9-]+\.(gif|jpg|png|webp)$/i.test(safeName)) return null;
  return path.join(imageDir, safeName);
}

async function buildSourceCandidates(): Promise<Array<Omit<EventBoothSource, "booths">>> {
  const [participants, submissions, winners] = await Promise.all([listParticipants(), listSubmissions(), listWinners()]);
  const exhibitorGroups = new Map<string, { organizationName: string; contacts: EventBoothContact[] }>();
  participants
    .filter((participant) => participant.participant_role === "Exhibitor" && participant.status !== "cancelled")
    .forEach((participant) => {
      const organizationName = participantBoothOrganization(participant) || "ไม่ระบุหน่วยงาน";
      const sourceKey = organizationSourceKey(organizationName);
      const current = exhibitorGroups.get(sourceKey) ?? { organizationName, contacts: [] };
      const contact = participantContact(participant);
      if (!current.contacts.some((item) => item.key === contact.key)) current.contacts.push(contact);
      exhibitorGroups.set(sourceKey, current);
    });

  const exhibitors = [...exhibitorGroups.entries()].map(([sourceKey, group]) => ({
    sourceType: "exhibitor" as const,
    sourceKey,
    organizationName: group.organizationName,
    sourceLabel: "ผู้ลงทะเบียนจัดบูธ (Exhibitor)",
    defaultWorkTitle: "",
    defaultWorkType: "",
    contacts: group.contacts,
  }));

  const publishedWinners = winners.filter((winner) => winner.published);
  const finalists = selectPresentationSubmissions(submissions, publishedWinners).map((submission) => ({
    sourceType: "finalist" as const,
    sourceKey: submission.submission_code,
    organizationName: submissionOrganization(submission),
    sourceLabel: `ผลงานผ่านการคัดเลือกรอบที่ 1 • ${submission.submission_code}`,
    defaultWorkTitle: submission.title_th,
    defaultWorkType: "ผลงานนวัตกรรมที่ผ่านการคัดเลือกรอบที่ 1",
    contacts: [submissionContact(submission, participants)],
  }));
  return [...exhibitors, ...finalists].sort((left, right) => left.sourceType.localeCompare(right.sourceType) || left.organizationName.localeCompare(right.organizationName, "th"));
}

async function findSource(sourceType: EventBoothSourceType, sourceKey: string, actorEmail: string) {
  const source = (await listEventBoothSources(actorEmail)).find((item) => item.sourceType === sourceType && item.sourceKey === sourceKey);
  if (!source) throw new Error("ไม่พบหน่วยงานหรือผลงานต้นทางของบูธ");
  return source;
}

async function createInitialBooths(sources: Array<Omit<EventBoothSource, "booths">>, actorEmail: string) {
  await saveNewRecords(sources.map((source) => newRecord({ ...source, booths: [] }, 1, actorEmail)));
}

function newRecord(source: EventBoothSource, boothNumber: number, actorEmail: string): EventBoothRecord {
  const now = new Date().toISOString();
  const contact = source.contacts[0] ?? emptyContact();
  return {
    id: randomUUID(),
    sourceType: source.sourceType,
    sourceKey: source.sourceKey,
    boothNumber,
    organizationName: source.organizationName,
    workTitle: boothNumber === 1 ? source.defaultWorkTitle : "",
    workType: boothNumber === 1 ? source.defaultWorkType : "",
    imageName: null,
    imageOriginalName: null,
    contactKey: contact.key,
    contactName: contact.name,
    contactPhone: contact.phone,
    contactEmail: contact.email,
    createdByEmail: normalizeEmail(actorEmail),
    updatedByEmail: normalizeEmail(actorEmail),
    createdAt: now,
    updatedAt: now,
  };
}

async function listEventBoothRecords() {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute("SELECT id,source_type,source_key,booth_number,organization_name,work_title,work_type,image_name,image_original_name,contact_key,contact_name,contact_phone,contact_email,created_by_email,updated_by_email,created_at,updated_at FROM event_booths ORDER BY source_type,organization_name,booth_number");
    return (rows as BoothDbRow[]).map(dbRowToRecord);
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    return readLocalStore();
  }
}

async function saveNewRecords(records: EventBoothRecord[]) {
  if (!records.length) return;
  try {
    await ensureDatabaseSchema();
    for (const record of records) {
      await db.execute(
        "INSERT IGNORE INTO event_booths(id,source_type,source_key,booth_number,organization_name,work_title,work_type,image_name,image_original_name,contact_key,contact_name,contact_phone,contact_email,created_by_email,updated_by_email,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        recordValues(record),
      );
    }
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    await writeLocalQueued(async (current) => {
      const identities = new Set(current.map((record) => boothIdentity(record)));
      return [...current, ...records.filter((record) => !identities.has(boothIdentity(record)))];
    });
  }
}

async function persistUpdatedRecord(record: EventBoothRecord) {
  try {
    await ensureDatabaseSchema();
    await db.execute(
      "UPDATE event_booths SET organization_name=?,work_title=?,work_type=?,image_name=?,image_original_name=?,contact_key=?,contact_name=?,contact_phone=?,contact_email=?,updated_by_email=?,updated_at=? WHERE id=?",
      [record.organizationName, record.workTitle, record.workType, record.imageName, record.imageOriginalName, record.contactKey, record.contactName, record.contactPhone, record.contactEmail, record.updatedByEmail, record.updatedAt, record.id],
    );
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    await writeLocalQueued(async (current) => current.map((item) => item.id === record.id ? record : item));
  }
}

async function deleteRecords(records: EventBoothRecord[]) {
  if (!records.length) return;
  const ids = new Set(records.map((record) => record.id));
  try {
    await ensureDatabaseSchema();
    for (const id of ids) await db.execute("DELETE FROM event_booths WHERE id=?", [id]);
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    await writeLocalQueued(async (current) => current.filter((record) => !ids.has(record.id)));
  }
  await Promise.all(records.map((record) => record.imageName ? removeBoothImage(record.imageName) : Promise.resolve()));
}

async function saveBoothImage(file: File) {
  if (file.size > 8 * 1024 * 1024) throw new Error("รูปภาพบูธต้องมีขนาดไม่เกิน 8 MB");
  const extension = imageExtensions[file.type] ?? path.extname(file.name).toLowerCase();
  if (!Object.values(imageExtensions).includes(extension)) throw new Error("รองรับรูปภาพ JPG หรือ PNG เท่านั้น เพื่อให้แสดงในรายงาน PDF ได้อย่างถูกต้อง");
  await mkdir(imageDir, { recursive: true });
  const name = `${randomUUID()}${extension}`;
  await writeFile(path.join(imageDir, name), Buffer.from(await file.arrayBuffer()));
  return { name, originalName: file.name.slice(0, 255) || name };
}

async function removeBoothImage(name: string) {
  const filePath = getEventBoothImagePath(name);
  if (filePath) await unlink(filePath).catch(() => undefined);
}

async function readLocalStore(): Promise<EventBoothRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isRecord).map(normalizeRecord) : [];
  } catch {
    return [];
  }
}

function writeLocalQueued(task: (records: EventBoothRecord[]) => Promise<EventBoothRecord[]> | EventBoothRecord[]) {
  const persist = async () => {
    const records = await task(await readLocalStore());
    await mkdir(storageDir, { recursive: true });
    const temp = `${storePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(records, null, 2), "utf8");
    await rename(temp, storePath);
    return records;
  };
  const next = writeQueue.then(persist, persist);
  writeQueue = next.catch(() => undefined);
  return next;
}

function participantContact(participant: RegistrationRecord): EventBoothContact {
  return { key: participant.registration_code, name: `${participant.title}${participant.first_name} ${participant.last_name}`.trim(), phone: participant.phone.trim(), email: participant.email.trim() };
}

function submissionContact(submission: Awaited<ReturnType<typeof listSubmissions>>[number], participants: RegistrationRecord[]): EventBoothContact {
  const registered = participants.find((participant) => participant.email.trim().toLowerCase() === submission.email.trim().toLowerCase())
    ?? participants.find((participant) => participant.first_name.trim() === submission.first_name.trim() && participant.last_name.trim() === submission.last_name.trim());
  return { key: submission.submission_code, name: formatApplicantName(submission), phone: registered?.phone.trim() ?? "", email: submission.email.trim() };
}

function submissionOrganization(submission: Awaited<ReturnType<typeof listSubmissions>>[number]) {
  return [submission.division, submission.bureau].map(clean).filter(Boolean).join(" / ") || "ไม่ระบุหน่วยงาน";
}

function organizationSourceKey(value: string) { return createHash("sha256").update(value.trim().toLowerCase().replace(/\s+/g, " ")).digest("hex").slice(0, 32); }
function sourceIdentity(type: EventBoothSourceType, key: string) { return `${type}:${key}`; }
function boothIdentity(record: Pick<EventBoothRecord, "sourceType" | "sourceKey" | "boothNumber">) { return `${record.sourceType}:${record.sourceKey}:${record.boothNumber}`; }
function emptyContact(): EventBoothContact { return { key: "", name: "", phone: "", email: "" }; }
function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function normalizeEmail(value: string) { return value.trim().toLowerCase() || "system"; }
function dbRowToRecord(row: BoothDbRow): EventBoothRecord { return normalizeRecord({ id: row.id, sourceType: row.source_type, sourceKey: row.source_key, boothNumber: Number(row.booth_number), organizationName: row.organization_name, workTitle: row.work_title, workType: row.work_type, imageName: row.image_name, imageOriginalName: row.image_original_name, contactKey: row.contact_key, contactName: row.contact_name, contactPhone: row.contact_phone, contactEmail: row.contact_email, createdByEmail: row.created_by_email, updatedByEmail: row.updated_by_email, createdAt: row.created_at, updatedAt: row.updated_at }); }
function recordValues(record: EventBoothRecord) { return [record.id, record.sourceType, record.sourceKey, record.boothNumber, record.organizationName, record.workTitle, record.workType, record.imageName, record.imageOriginalName, record.contactKey, record.contactName, record.contactPhone, record.contactEmail, record.createdByEmail, record.updatedByEmail, record.createdAt, record.updatedAt]; }
function normalizeRecord(record: EventBoothRecord): EventBoothRecord { return { ...record, boothNumber: Math.max(1, Number(record.boothNumber) || 1), imageName: record.imageName || null, imageOriginalName: record.imageOriginalName || null }; }
function isRecord(value: unknown): value is EventBoothRecord { const item = value as Partial<EventBoothRecord>; return Boolean(item && item.id && item.sourceType && item.sourceKey && item.organizationName); }
