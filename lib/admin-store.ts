import { randomUUID } from "crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";
import { db, transaction } from "./db";
import { ensureDatabaseSchema } from "./db-schema";
import {
  checkInLocalRegistration,
  deleteLocalRegistration,
  isDatabaseUnavailable,
  listLocalRegistrations,
  updateLocalRegistration,
  type RegistrationRecord,
  type RegistrationStatus,
  type RegistrationUpdateInput,
} from "./local-registrations";
import {
  findLocalSubmissionByCode,
  listLocalSubmissions,
  updateLocalSubmission,
  type LocalSubmissionRecord,
} from "./local-submissions";

export type AdminSettings = {
  prelanderEnabled: boolean;
  eventRegistrationEnabled: boolean;
  contestSubmissionEnabled: boolean;
  showSiteStats: boolean;
  openAt: string;
  closeAt: string;
  prelanderTitle: string;
  prelanderMessage: string;
};

export type WinnerRecord = {
  id: string;
  rank: string;
  award: string;
  projectTitle: string;
  ownerName: string;
  division: string;
  published: boolean;
  createdAt: string;
};

export type NewsRecord = {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  imageName: string | null;
  imageOriginalName: string | null;
  publishAt: string;
  published: boolean;
  createdAt: string;
};

export type NewsInput = {
  title: string;
  excerpt: string;
  body: string;
  publishAt: string;
  published: boolean;
  image?: File | null;
};

export type SubmissionListItem = {
  submission_code: string;
  submission_type: string;
  team_name: string | null;
  title_th: string;
  status: string;
  submitted_at: string;
  email: string;
  first_name: string;
  last_name: string;
  position: string;
  division: string;
  bureau: string;
};

export type SubmissionMemberDetail = {
  member_order: number;
  title: string;
  first_name: string;
  last_name: string;
  citizen_id: string;
  phone: string;
  email: string;
  position: string;
  division: string;
  bureau: string;
};

export type SubmissionFileDetail = {
  document_type: string;
  original_name: string;
  stored_name: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
};

export type AdminSubmissionDetail = SubmissionListItem & {
  id?: string;
  title_en: string | null;
  summary: string;
  video_url: string | null;
  members: SubmissionMemberDetail[];
  files: SubmissionFileDetail[];
};

export type AdminSubmissionFile = SubmissionFileDetail & {
  filePath: string;
};

export type SubmissionUpdateInput = {
  submissionCode: string;
  email: string;
  submissionType: "individual" | "team";
  teamName: string | null;
  titleTh: string;
  titleEn: string;
  summary: string;
  videoUrl: string;
  status: "draft" | "submitted" | "screening" | "qualified" | "rejected";
  members: Array<Omit<SubmissionMemberDetail, "member_order">>;
};

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const adminStorePath = path.join(storageDir, "admin-settings.json");
const winnersStorePath = path.join(storageDir, "winners.json");
const newsStorePath = path.join(storageDir, "news.json");
const newsUploadsDir = path.join(storageDir, "news");

const defaultSettings: AdminSettings = {
  prelanderEnabled: false,
  eventRegistrationEnabled: true,
  contestSubmissionEnabled: true,
  showSiteStats: true,
  openAt: "",
  closeAt: "",
  prelanderTitle: "Police Innovation Contest 2026",
  prelanderMessage: "ระบบจะเปิดให้ใช้งานตามเวลาที่กำหนด โปรดกลับมาใหม่อีกครั้ง",
};

export async function getAdminSettings() {
  return { ...defaultSettings, ...await readJson<Partial<AdminSettings>>(adminStorePath, {}) };
}

export async function saveAdminSettings(input: Partial<AdminSettings>) {
  const settings: AdminSettings = {
    prelanderEnabled: Boolean(input.prelanderEnabled),
    eventRegistrationEnabled: input.eventRegistrationEnabled !== false,
    contestSubmissionEnabled: input.contestSubmissionEnabled !== false,
    showSiteStats: input.showSiteStats !== false,
    openAt: input.openAt ?? "",
    closeAt: input.closeAt ?? "",
    prelanderTitle: input.prelanderTitle?.trim() || defaultSettings.prelanderTitle,
    prelanderMessage: input.prelanderMessage?.trim() || defaultSettings.prelanderMessage,
  };
  await writeJson(adminStorePath, settings);
  return settings;
}

export function isEventRegistrationOpen(settings: AdminSettings) {
  return settings.eventRegistrationEnabled !== false;
}

export function isContestSubmissionOpen(settings: AdminSettings) {
  return settings.contestSubmissionEnabled !== false;
}

export function isPrelanderActive(settings: AdminSettings, now = new Date()) {
  if (!settings.prelanderEnabled) return false;
  const openAt = parseDate(settings.openAt);
  if (openAt && now < openAt) return true;
  return false;
}

export async function listParticipants() {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      "SELECT r.registration_code,r.title,r.first_name,r.last_name,r.citizen_id,r.phone,r.position,r.division,r.bureau,r.status,r.checked_in_at,r.registered_at,u.email,u.provider FROM registrations r JOIN users u ON u.id=r.user_id ORDER BY r.registered_at DESC LIMIT 500",
    );
    return rows as RegistrationRecord[];
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return listLocalRegistrations();
  }
}

export async function updateParticipant(input: RegistrationUpdateInput) {
  try {
    await ensureDatabaseSchema();
    await db.execute(
      "UPDATE users u JOIN registrations r ON r.user_id=u.id SET u.email=?,u.provider=?,u.display_name=?,r.title=?,r.first_name=?,r.last_name=?,r.citizen_id=?,r.phone=?,r.position=?,r.division=?,r.bureau=?,r.status=?,r.checked_in_at=CASE WHEN ?='attended' THEN COALESCE(r.checked_in_at,CURRENT_TIMESTAMP(3)) ELSE NULL END WHERE r.registration_code=?",
      [
        input.email.trim().toLowerCase(),
        input.provider,
        `${input.firstName} ${input.lastName}`,
        input.title,
        input.firstName,
        input.lastName,
        input.citizenId,
        input.phone,
        input.position,
        input.division,
        input.bureau,
        input.status,
        input.status,
        input.registrationCode,
      ],
    );
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    await updateLocalRegistration(input);
  }
}

export async function deleteParticipant(registrationCode: string) {
  try {
    await db.execute("DELETE FROM registrations WHERE registration_code=?", [registrationCode.trim()]);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    await deleteLocalRegistration(registrationCode);
  }
}

export async function checkInParticipant(registrationCode: string) {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      "SELECT r.registration_code,r.title,r.first_name,r.last_name,r.citizen_id,r.phone,r.position,r.division,r.bureau,r.status,r.checked_in_at,r.registered_at,u.email,u.provider FROM registrations r JOIN users u ON u.id=r.user_id WHERE r.registration_code=? LIMIT 1",
      [registrationCode.trim()],
    );
    const record = (rows as RegistrationRecord[])[0];
    if (!record) throw Object.assign(new Error("registration not found"), { code: "NOT_FOUND" });
    if (record.status === "cancelled") throw Object.assign(new Error("registration cancelled"), { code: "CANCELLED" });
    await db.execute(
      "UPDATE registrations SET status='attended',checked_in_at=COALESCE(checked_in_at,CURRENT_TIMESTAMP(3)) WHERE registration_code=?",
      [registrationCode.trim()],
    );
    return { ...record, status: "attended" as RegistrationStatus, checked_in_at: record.checked_in_at ?? new Date().toISOString() };
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return checkInLocalRegistration(registrationCode);
  }
}

export async function listSubmissions() {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      "SELECT s.submission_code,s.submission_type,s.team_name,s.title_th,s.status,s.submitted_at,u.email,m.first_name,m.last_name,m.position,m.division,m.bureau FROM submissions s JOIN users u ON u.id=s.user_id JOIN submission_members m ON m.submission_id=s.id AND m.member_order=1 ORDER BY s.submitted_at DESC LIMIT 500",
    );
    return rows as SubmissionListItem[];
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return listLocalSubmissions();
  }
}

export async function getSubmissionDetail(submissionCode: string) {
  const code = submissionCode.trim();
  try {
    await ensureDatabaseSchema();
    const [submissionRows] = await db.execute(
      "SELECT s.id,s.submission_code,s.submission_type,s.team_name,s.title_th,s.title_en,s.summary,s.video_url,s.status,s.submitted_at,u.email FROM submissions s JOIN users u ON u.id=s.user_id WHERE s.submission_code=? LIMIT 1",
      [code],
    );
    const submission = (submissionRows as Array<{
      id: string;
      submission_code: string;
      submission_type: string;
      team_name: string | null;
      title_th: string;
      title_en: string | null;
      summary: string;
      video_url: string | null;
      status: string;
      submitted_at: string;
      email: string;
    }>)[0];
    if (!submission) {
      const local = await findLocalSubmissionByCode(code);
      return local ? localSubmissionToAdminDetail(local) : null;
    }

    const [memberRows] = await db.execute(
      "SELECT member_order,title,first_name,last_name,citizen_id,phone,email,position,division,bureau FROM submission_members WHERE submission_id=? ORDER BY member_order ASC",
      [submission.id],
    );
    const members = memberRows as SubmissionMemberDetail[];
    const primary = members[0];
    const [fileRows] = await db.execute(
      "SELECT document_type,original_name,stored_name,mime_type,byte_size,sha256 FROM submission_files WHERE submission_id=? ORDER BY FIELD(document_type,'ownership','concept','prototype','implementation')",
      [submission.id],
    );

    return {
      ...submission,
      first_name: primary?.first_name ?? "",
      last_name: primary?.last_name ?? "",
      position: primary?.position ?? "",
      division: primary?.division ?? "",
      bureau: primary?.bureau ?? "",
      members,
      files: fileRows as SubmissionFileDetail[],
    } satisfies AdminSubmissionDetail;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const local = await findLocalSubmissionByCode(code);
    return local ? localSubmissionToAdminDetail(local) : null;
  }
}

export async function getSubmissionFile(submissionCode: string, documentType: string) {
  const code = submissionCode.trim();
  const type = documentType.trim();
  try {
    const [rows] = await db.execute(
      "SELECT s.id,f.document_type,f.original_name,f.stored_name,f.mime_type,f.byte_size,f.sha256 FROM submissions s JOIN submission_files f ON f.submission_id=s.id WHERE s.submission_code=? AND f.document_type=? LIMIT 1",
      [code, type],
    );
    const file = (rows as Array<SubmissionFileDetail & { id: string }>)[0];
    if (!file) return getLocalSubmissionFile(code, type);
    return {
      document_type: file.document_type,
      original_name: file.original_name,
      stored_name: file.stored_name,
      mime_type: file.mime_type,
      byte_size: file.byte_size,
      sha256: file.sha256,
      filePath: path.join(storageDir, "uploads", file.id, file.stored_name),
    } satisfies AdminSubmissionFile;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return getLocalSubmissionFile(code, type);
  }
}

export async function updateSubmission(input: SubmissionUpdateInput) {
  try {
    await ensureDatabaseSchema();
    await transaction(async (connection) => {
      const [rows] = await connection.execute(
        "SELECT id,user_id FROM submissions WHERE submission_code=? LIMIT 1",
        [input.submissionCode.trim()],
      );
      const submission = (rows as Array<{ id: string; user_id: string }>)[0];
      if (!submission) throw Object.assign(new Error("submission not found"), { code: "NOT_FOUND" });

      const primary = input.members[0];
      if (!primary) throw new Error("primary member is required");
      await connection.execute(
        "UPDATE users SET email=?,display_name=?,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",
        [input.email.trim().toLowerCase(), `${primary.first_name} ${primary.last_name}`, submission.user_id],
      );
      await connection.execute(
        "UPDATE submissions SET submission_type=?,team_name=?,title_th=?,title_en=?,summary=?,video_url=?,status=? WHERE id=?",
        [
          input.submissionType,
          input.submissionType === "team" ? input.teamName : null,
          input.titleTh,
          input.titleEn || null,
          input.summary,
          input.videoUrl || null,
          input.status,
          submission.id,
        ],
      );
      await connection.execute("DELETE FROM submission_members WHERE submission_id=?", [submission.id]);
      for (const [index, member] of input.members.entries()) {
        await connection.execute(
          "INSERT INTO submission_members(id,submission_id,member_order,title,first_name,last_name,citizen_id,phone,email,position,division,bureau) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            randomUUID(),
            submission.id,
            index + 1,
            member.title,
            member.first_name,
            member.last_name,
            member.citizen_id,
            member.phone,
            member.email.trim().toLowerCase(),
            member.position,
            member.division,
            member.bureau,
          ],
        );
      }
      await connection.execute(
        "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,payload) VALUES(?,?,?,?,?)",
        [submission.user_id, "submission.updated", "submission", submission.id, JSON.stringify({ submissionCode: input.submissionCode })],
      );
    });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    await updateLocalSubmission({
      submissionCode: input.submissionCode,
      email: input.email,
      submissionType: input.submissionType,
      teamName: input.teamName,
      titleTh: input.titleTh,
      titleEn: input.titleEn,
      summary: input.summary,
      videoUrl: input.videoUrl,
      status: input.status,
      members: input.members,
    });
  }
}

async function getLocalSubmissionFile(submissionCode: string, documentType: string) {
  const local = await findLocalSubmissionByCode(submissionCode);
  if (!local) return null;
  const file = local.files.find((item) => item.document_type === documentType);
  if (!file) return null;
  return {
    document_type: file.document_type,
    original_name: file.original_name,
    stored_name: file.stored_name,
    mime_type: "application/pdf",
    byte_size: file.byte_size,
    sha256: file.sha256,
    filePath: path.join(storageDir, "uploads", local.upload_id ?? "", file.stored_name),
  } satisfies AdminSubmissionFile;
}

export async function listWinners() {
  const winners = await readJson<WinnerRecord[]>(winnersStorePath, []);
  return winners.sort((a, b) => {
    const rankDiff = rankWeight(a.rank) - rankWeight(b.rank);
    if (rankDiff !== 0) return rankDiff;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function addWinner(input: Omit<WinnerRecord, "id" | "createdAt">) {
  const winners = await listWinners();
  const nextWinners = ["1", "2", "3"].includes(input.rank)
    ? winners.filter((winner) => winner.rank !== input.rank)
    : winners;
  nextWinners.push({ ...input, id: randomUUID(), createdAt: new Date().toISOString() });
  await writeJson(winnersStorePath, nextWinners);
}

export async function deleteWinner(id: string) {
  const winners = await listWinners();
  await writeJson(winnersStorePath, winners.filter((winner) => winner.id !== id));
}

export async function listNews(options?: { publicOnly?: boolean }) {
  try {
    await ensureNewsTable();
    const [rows] = await db.execute(
      "SELECT id,title,excerpt,body,image_name,image_original_name,publish_at,published,created_at FROM news_posts ORDER BY publish_at DESC, created_at DESC LIMIT 100",
    );
    return filterAndSortNews((rows as NewsDbRow[]).map(newsDbRowToRecord), options?.publicOnly);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return filterAndSortNews(await readJson<NewsRecord[]>(newsStorePath, []), options?.publicOnly);
  }
}

export async function addNews(input: NewsInput) {
  const now = new Date().toISOString();
  const id = randomUUID();
  const image = input.image && input.image.size > 0 ? await saveNewsImage(input.image) : null;
  const record: NewsRecord = {
    id,
    title: input.title.trim(),
    excerpt: input.excerpt.trim(),
    body: input.body.trim(),
    imageName: image?.storedName ?? null,
    imageOriginalName: image?.originalName ?? null,
    publishAt: input.publishAt || now,
    published: input.published,
    createdAt: now,
  };

  try {
    await ensureNewsTable();
    await db.execute(
      "INSERT INTO news_posts(id,title,excerpt,body,image_name,image_original_name,publish_at,published,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        record.id,
        record.title,
        record.excerpt,
        record.body,
        record.imageName,
        record.imageOriginalName,
        record.publishAt,
        record.published,
        record.createdAt,
      ],
    );
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const news = await readJson<NewsRecord[]>(newsStorePath, []);
    news.push(record);
    await writeJson(newsStorePath, news);
  }

  return record;
}

export async function deleteNews(id: string) {
  const targetId = id.trim();
  let imageName: string | null = null;
  try {
    await ensureNewsTable();
    const [rows] = await db.execute("SELECT image_name FROM news_posts WHERE id=? LIMIT 1", [targetId]);
    imageName = ((rows as Array<{ image_name: string | null }>)[0]?.image_name) ?? null;
    await db.execute("DELETE FROM news_posts WHERE id=?", [targetId]);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const news = await readJson<NewsRecord[]>(newsStorePath, []);
    imageName = news.find((item) => item.id === targetId)?.imageName ?? null;
    await writeJson(newsStorePath, news.filter((item) => item.id !== targetId));
  }
  if (imageName) await deleteNewsImage(imageName);
}

export function getNewsImagePath(imageName: string) {
  const safeName = path.basename(imageName);
  if (!safeName || safeName !== imageName) return null;
  return path.join(newsUploadsDir, safeName);
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rankWeight(rank: string) {
  if (rank === "finalist") return 0;
  if (rank === "1") return 1;
  if (rank === "2") return 2;
  if (rank === "3") return 3;
  if (rank === "honorable") return 20;
  return 99;
}

type NewsDbRow = {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  image_name: string | null;
  image_original_name: string | null;
  publish_at: string | Date;
  published: boolean | number;
  created_at: string | Date;
};

function newsDbRowToRecord(row: NewsDbRow): NewsRecord {
  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    imageName: row.image_name,
    imageOriginalName: row.image_original_name,
    publishAt: normalizeStoredDate(row.publish_at),
    published: Boolean(row.published),
    createdAt: normalizeStoredDate(row.created_at),
  };
}

function filterAndSortNews(records: NewsRecord[], publicOnly = false) {
  const now = Date.now();
  return [...records]
    .filter((record) => {
      if (!publicOnly) return true;
      const publishTime = parseDate(record.publishAt)?.getTime();
      return record.published && publishTime !== undefined && publishTime <= now;
    })
    .sort((a, b) => {
      const publishDiff = (parseDate(b.publishAt)?.getTime() ?? 0) - (parseDate(a.publishAt)?.getTime() ?? 0);
      if (publishDiff !== 0) return publishDiff;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

async function saveNewsImage(file: File) {
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!allowedTypes.has(file.type)) throw new Error("รองรับเฉพาะไฟล์ภาพ JPG, PNG, WebP หรือ GIF");
  if (file.size > 8 * 1024 * 1024) throw new Error("ไฟล์ภาพต้องมีขนาดไม่เกิน 8 MB");
  await mkdir(newsUploadsDir, { recursive: true });
  const extension = extensionFromFile(file);
  const storedName = `${randomUUID()}${extension}`;
  await writeFile(path.join(newsUploadsDir, storedName), Buffer.from(await file.arrayBuffer()));
  return { storedName, originalName: file.name || storedName };
}

async function deleteNewsImage(imageName: string) {
  const filePath = getNewsImagePath(imageName);
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function extensionFromFile(file: File) {
  const ext = path.extname(file.name).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) return ext;
  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  if (file.type === "image/gif") return ".gif";
  return ".jpg";
}

function normalizeStoredDate(value: string | Date) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

async function ensureNewsTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS news_posts (
      id CHAR(36) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      excerpt VARCHAR(500) NOT NULL,
      body LONGTEXT NOT NULL,
      image_name VARCHAR(255) NULL,
      image_original_name VARCHAR(255) NULL,
      publish_at VARCHAR(40) NOT NULL,
      published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_news_publish (published, publish_at)
    ) ENGINE=InnoDB
  `);
}

function localSubmissionToAdminDetail(local: LocalSubmissionRecord): AdminSubmissionDetail {
  const primary = local.members[0];
  return {
    submission_code: local.submission_code,
    submission_type: local.submission_type,
    team_name: local.team_name,
    title_th: local.title_th,
    title_en: local.title_en,
    summary: local.summary,
    video_url: local.video_url,
    status: local.status,
    submitted_at: local.submitted_at,
    email: local.email,
    first_name: primary?.first_name ?? local.first_name,
    last_name: primary?.last_name ?? local.last_name,
    position: primary?.position ?? local.position,
    division: primary?.division ?? local.division,
    bureau: primary?.bureau ?? local.bureau,
    members: local.members.map((member, index) => ({ ...member, member_order: index + 1 })),
    files: local.files.map((file) => ({
      document_type: file.document_type,
      original_name: file.original_name,
      stored_name: file.stored_name,
      mime_type: "application/pdf",
      byte_size: file.byte_size,
      sha256: file.sha256,
    })),
  };
}
