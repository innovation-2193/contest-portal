import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";
import { code } from "./codes";
import { db, transaction } from "./db";
import { ensureDatabaseSchema } from "./db-schema";
import {
  checkInLocalRegistration,
  createLocalRegistration,
  deleteLocalRegistration,
  normalizeParticipantRole,
  isDatabaseSchemaFallback,
  isDatabaseUnavailable,
  listLocalRegistrations,
  participantRoles,
  updateLocalRegistration,
  type ParticipantRole,
  type RegistrationInput,
  type RegistrationRecord,
  type RegistrationStatus,
  type RegistrationUpdateInput,
} from "./local-registrations";
import { sendRegistrationConfirmation } from "./registration-artifacts";
import {
  deleteLocalSubmission,
  findLocalSubmissionByCode,
  listLocalSubmissions,
  replaceLocalSubmissionFile,
  updateLocalSubmission,
  updateLocalSubmissionReview,
  updateLocalSubmissionWorkCategory,
  type LocalSubmissionRecord,
} from "./local-submissions";
import {
  generateSubmissionHashtags,
  parseSubmissionHashtags,
  serializeSubmissionHashtags,
} from "./submission-hashtags";
import { buildSubmissionHashtagContext } from "./submission-file-text";
import {
  defaultWorkCategory,
  normalizeWorkCategory,
  type WorkCategory,
} from "./work-categories";
import { formatApplicantName } from "./thai-rank-title";
import { findRegistrationByName } from "./registration-lookup";
import { participantNameKey } from "./participant-name";
import { normalizeThaiDateValue, parseThaiDate } from "./thai-time";

export type AdminSettings = {
  prelanderEnabled: boolean;
  eventRegistrationEnabled: boolean;
  contestSubmissionEnabled: boolean;
  satisfactionEvaluationEnabled: boolean;
  showSiteStats: boolean;
  checkInShortcutVisibleForAdmin: boolean;
  checkInShortcutVisibleForSuperAdmin: boolean;
  homeCountdownEnabled: boolean;
  homeCountdownTarget: string;
  homeCountdownTitle: string;
  homeCountdownNote: string;
  openAt: string;
  closeAt: string;
  prelanderTitle: string;
  prelanderMessage: string;
};

export type WinnerRecord = {
  id: string;
  submissionCode?: string;
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
  attachmentName: string | null;
  attachmentOriginalName: string | null;
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
  attachment?: File | null;
};

export type NewsUpdateInput = {
  title: string;
  excerpt: string;
  body: string;
  publishAt?: string;
  published: boolean;
  image?: File | null;
  attachment?: File | null;
  removeAttachment?: boolean;
};

export type HomePopupRecord = {
  id: string;
  imageName: string;
  imageOriginalName: string;
  enabled: boolean;
  updatedAt: string;
};

export type ParkingReservationRecord = {
  id: string;
  registrationCode: string;
  participantRole: "VIP" | "Exhibitor" | "Staff";
  participantName: string;
  phone: string;
  email: string;
  position: string;
  division: string;
  bureau: string;
  carPlate: string;
  note: string;
  createdByEmail: string;
  updatedByEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type SubmissionListItem = {
  submission_code: string;
  submission_type: string;
  team_name: string | null;
  title_th: string;
  title_en: string | null;
  video_url: string | null;
  work_category: WorkCategory;
  hashtags: string[];
  status: string;
  review_assigned_admin_email: string | null;
  review_assigned_at: string | null;
  review_scored_by_email: string | null;
  review_rules_score: number | null;
  review_problem_score: number | null;
  review_innovation_score: number | null;
  review_evidence_score: number | null;
  review_impact_score: number | null;
  review_total_score: number | null;
  review_note: string | null;
  review_submitted_at: string | null;
  submitted_at: string;
  email: string;
  title: string;
  first_name: string;
  last_name: string;
  position: string;
  division: string;
  bureau: string;
};

export type SubmissionApplicantExportRow = {
  submission_code: string;
  title_th: string;
  submission_type: string;
  team_name: string | null;
  member_order: number;
  title: string;
  first_name: string;
  last_name: string;
  citizen_id: string;
  position: string;
  division: string;
  bureau: string;
  email: string;
  phone: string;
  submitted_at: string;
};

export type SubmissionTemplateRow = {
  submission_code: string;
  title_th: string;
  submitted_at: string;
};

export type SubmissionChecklistRow = {
  submission_code: string;
  title_th: string;
  submission_type: string;
  team_name: string | null;
  video_url: string | null;
  submitted_at: string;
  email: string;
  title: string;
  first_name: string;
  last_name: string;
  phone: string;
  position: string;
  division: string;
  bureau: string;
  files: Record<"ownership" | "concept" | "prototype" | "implementation", boolean>;
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

export type TeamMemberCheckInRecord = {
  registrationCode: string;
  name: string;
  participantRole: RegistrationRecord["participant_role"];
  status: RegistrationStatus;
  checkedInAt?: string | null;
  wasAlreadyCheckedIn: boolean;
};

export type AdminSubmissionFile = SubmissionFileDetail & {
  filePath: string;
};

export type SubmissionFileReplaceInput = {
  submissionCode: string;
  documentType: string;
  originalName: string;
  mimeType?: string;
  bytes: Uint8Array | Buffer;
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
  workCategory: WorkCategory;
  members: Array<Omit<SubmissionMemberDetail, "member_order">>;
};

export type SubmissionScoreInput = {
  submissionCode: string;
  actorEmail: string;
  actorRole: "admin" | "super_admin";
  rulesScore: number;
  problemScore: number;
  innovationScore: number;
  evidenceScore: number;
  impactScore: number;
  note: string;
};

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const adminStorePath = path.join(storageDir, "admin-settings.json");
const winnersStorePath = path.join(storageDir, "winners.json");
const newsStorePath = path.join(storageDir, "news.json");
const homePopupStorePath = path.join(storageDir, "home-popup.json");
const parkingReservationsStorePath = path.join(storageDir, "parking-reservations.json");
const newsUploadsDir = path.join(storageDir, "news");
const newsAttachmentsDir = path.join(storageDir, "news-attachments");
const homePopupUploadsDir = path.join(storageDir, "home-popup");

const defaultSettings: AdminSettings = {
  prelanderEnabled: false,
  eventRegistrationEnabled: true,
  contestSubmissionEnabled: true,
  satisfactionEvaluationEnabled: false,
  showSiteStats: true,
  checkInShortcutVisibleForAdmin: true,
  checkInShortcutVisibleForSuperAdmin: true,
  homeCountdownEnabled: true,
  homeCountdownTarget: "2026-08-24T09:00:00+07:00",
  homeCountdownTitle: "นับถอยหลังสู่วันงาน",
  homeCountdownNote: "",
  openAt: "",
  closeAt: "",
  prelanderTitle: "Police Innovation Contest 2026",
  prelanderMessage: "ระบบจะเปิดให้ใช้งานตามเวลาที่กำหนด โปรดกลับมาใหม่อีกครั้ง",
};

export async function getAdminSettings() {
  const settings = { ...defaultSettings, ...await readJson<Partial<AdminSettings>>(adminStorePath, {}) };
  return {
    ...settings,
    homeCountdownTarget: normalizeThaiDateValue(settings.homeCountdownTarget) || defaultSettings.homeCountdownTarget,
    openAt: settings.openAt ? normalizeThaiDateValue(settings.openAt) : "",
    closeAt: settings.closeAt ? normalizeThaiDateValue(settings.closeAt) : "",
  };
}

export async function saveAdminSettings(input: Partial<AdminSettings>) {
  const settings: AdminSettings = {
    prelanderEnabled: Boolean(input.prelanderEnabled),
    eventRegistrationEnabled: input.eventRegistrationEnabled !== false,
    contestSubmissionEnabled: input.contestSubmissionEnabled !== false,
    satisfactionEvaluationEnabled: input.satisfactionEvaluationEnabled === true,
    showSiteStats: input.showSiteStats !== false,
    checkInShortcutVisibleForAdmin: input.checkInShortcutVisibleForAdmin !== false,
    checkInShortcutVisibleForSuperAdmin: input.checkInShortcutVisibleForSuperAdmin !== false,
    homeCountdownEnabled: input.homeCountdownEnabled !== false,
    homeCountdownTarget: typeof input.homeCountdownTarget === "string" ? normalizeThaiDateValue(input.homeCountdownTarget) || defaultSettings.homeCountdownTarget : defaultSettings.homeCountdownTarget,
    homeCountdownTitle: typeof input.homeCountdownTitle === "string" ? input.homeCountdownTitle.trim() : defaultSettings.homeCountdownTitle,
    homeCountdownNote: typeof input.homeCountdownNote === "string" ? input.homeCountdownNote.trim() : defaultSettings.homeCountdownNote,
    openAt: input.openAt ? normalizeThaiDateValue(input.openAt) : "",
    closeAt: input.closeAt ? normalizeThaiDateValue(input.closeAt) : "",
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

export function isSatisfactionEvaluationOpen(settings: AdminSettings) {
  return settings.satisfactionEvaluationEnabled === true;
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
      "SELECT r.registration_code,r.participant_role,r.title,r.first_name,r.last_name,COALESCE(r.citizen_id,'') AS citizen_id,r.phone,r.position,r.division,r.bureau,r.status,r.checked_in_at,r.checked_in_by_email,r.registered_at,COALESCE(u.email,'') AS email,u.provider FROM registrations r JOIN users u ON u.id=r.user_id ORDER BY r.registered_at DESC LIMIT 500",
    );
    return (rows as RegistrationRecord[]).map((item) => ({ ...item, participant_role: normalizeParticipantRole(item.participant_role) }));
  } catch (error) {
    if (isDatabaseSchemaFallback(error)) return listParticipantsCompat();
    if (!isDatabaseUnavailable(error)) throw error;
    return listLocalRegistrations();
  }
}

export async function listParkingReservations() {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      `SELECT p.id,p.registration_code,p.car_plate,p.note,p.created_by_email,p.updated_by_email,p.created_at,p.updated_at,
	      r.participant_role,r.title,r.first_name,r.last_name,r.phone,r.position,r.division,r.bureau,COALESCE(u.email,'') AS email
	       FROM parking_reservations p
	       JOIN registrations r ON r.registration_code=p.registration_code
	       JOIN users u ON u.id=r.user_id
	       WHERE r.participant_role IN ('VIP','Exhibitor','Staff') AND r.status<>'cancelled'
	       ORDER BY p.created_at DESC`,
	    );
    return (rows as ParkingReservationDbRow[]).map(parkingReservationDbRowToRecord);
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    return hydrateLocalParkingReservations(await readJson<ParkingReservationRecord[]>(parkingReservationsStorePath, []));
  }
}

export async function createParkingReservation(input: { registrationCode: string; carPlate: string; note?: string; actorEmail: string }) {
  const reservation = normalizeParkingInput(input);
  try {
    await ensureDatabaseSchema();
    const participant = await findParkingEligibleParticipant(reservation.registrationCode);
    if (!participant) throw Object.assign(new Error("participant not eligible"), { code: "NOT_ELIGIBLE" });
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.execute(
      "INSERT INTO parking_reservations(id,registration_code,car_plate,note,created_by_email,updated_by_email,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
      [id, reservation.registrationCode, reservation.carPlate, reservation.note, reservation.actorEmail, reservation.actorEmail, now, now],
    );
    return (await listParkingReservations()).find((item) => item.id === id) ?? {
      ...parkingRecordFromParticipant(participant),
      id,
      carPlate: reservation.carPlate,
      note: reservation.note,
      createdByEmail: reservation.actorEmail,
      updatedByEmail: reservation.actorEmail,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    const participants = await listLocalRegistrations();
    const participant = participants.find((item) => item.registration_code === reservation.registrationCode && isParkingEligibleRole(item.participant_role));
    if (!participant) throw Object.assign(new Error("participant not eligible"), { code: "NOT_ELIGIBLE" });
    const records = await readJson<ParkingReservationRecord[]>(parkingReservationsStorePath, []);
    const now = new Date().toISOString();
    const record: ParkingReservationRecord = {
      ...parkingRecordFromParticipant(participant),
      id: randomUUID(),
      carPlate: reservation.carPlate,
      note: reservation.note,
      createdByEmail: reservation.actorEmail,
      updatedByEmail: reservation.actorEmail,
      createdAt: now,
      updatedAt: now,
    };
    records.unshift(record);
    await writeJson(parkingReservationsStorePath, records);
    return record;
  }
}

export async function updateParkingReservation(input: { id: string; registrationCode: string; carPlate: string; note?: string; actorEmail: string }) {
  const id = input.id.trim();
  const reservation = normalizeParkingInput(input);
  try {
    await ensureDatabaseSchema();
    const participant = await findParkingEligibleParticipant(reservation.registrationCode);
    if (!participant) throw Object.assign(new Error("participant not eligible"), { code: "NOT_ELIGIBLE" });
    const now = new Date().toISOString();
    await db.execute(
      "UPDATE parking_reservations SET registration_code=?,car_plate=?,note=?,updated_by_email=?,updated_at=? WHERE id=?",
      [reservation.registrationCode, reservation.carPlate, reservation.note, reservation.actorEmail, now, id],
    );
    return (await listParkingReservations()).find((item) => item.id === id) ?? null;
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    const participants = await listLocalRegistrations();
    const participant = participants.find((item) => item.registration_code === reservation.registrationCode && isParkingEligibleRole(item.participant_role));
    if (!participant) throw Object.assign(new Error("participant not eligible"), { code: "NOT_ELIGIBLE" });
    const records = await readJson<ParkingReservationRecord[]>(parkingReservationsStorePath, []);
    const now = new Date().toISOString();
    const next = records.map((record) => record.id === id ? {
      ...record,
      ...parkingRecordFromParticipant(participant),
      carPlate: reservation.carPlate,
      note: reservation.note,
      updatedByEmail: reservation.actorEmail,
      updatedAt: now,
    } : record);
    await writeJson(parkingReservationsStorePath, next);
    return next.find((record) => record.id === id) ?? null;
  }
}

export async function deleteParkingReservation(id: string) {
  const targetId = id.trim();
  try {
    await ensureDatabaseSchema();
    await db.execute("DELETE FROM parking_reservations WHERE id=?", [targetId]);
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    const records = await readJson<ParkingReservationRecord[]>(parkingReservationsStorePath, []);
    await writeJson(parkingReservationsStorePath, records.filter((record) => record.id !== targetId));
  }
}

export async function getParticipantCheckInRoleCounts() {
  const counts = Object.fromEntries(participantRoles.map((role) => [role, 0])) as Record<ParticipantRole, number>;
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      "SELECT participant_role,COUNT(*) AS total FROM registrations WHERE status='attended' GROUP BY participant_role",
    );
    for (const row of rows as Array<{ participant_role: unknown; total: number | string }>) {
      counts[normalizeParticipantRole(row.participant_role)] += Number(row.total) || 0;
    }
    return counts;
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    for (const item of await listLocalRegistrations()) {
      if (item.status === "attended") counts[item.participant_role] += 1;
    }
    return counts;
  }
}

export async function getParticipantRegistrationRoleCounts() {
  const counts = Object.fromEntries(participantRoles.map((role) => [role, 0])) as Record<ParticipantRole, number>;
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      "SELECT participant_role,COUNT(*) AS total FROM registrations WHERE status <> 'cancelled' GROUP BY participant_role",
    );
    for (const row of rows as Array<{ participant_role: unknown; total: number | string }>) {
      counts[normalizeParticipantRole(row.participant_role)] += Number(row.total) || 0;
    }
    return counts;
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    for (const item of await listLocalRegistrations()) {
      if (item.status !== "cancelled") counts[item.participant_role] += 1;
    }
    return counts;
  }
}

export async function searchParticipants(query: string, limit = 12) {
  const normalizedQuery = query.replace(/\s+/g, " ").trim().toLowerCase();
  if (normalizedQuery.length < 2) return [];
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 12, 1), 25);

  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      `SELECT r.registration_code,r.participant_role,r.title,r.first_name,r.last_name,COALESCE(r.citizen_id,'') AS citizen_id,r.phone,r.position,r.division,r.bureau,r.status,r.checked_in_at,r.checked_in_by_email,r.registered_at,COALESCE(u.email,'') AS email,u.provider
       FROM registrations r
       JOIN users u ON u.id=r.user_id
       WHERE LOWER(CONCAT_WS(' ',r.registration_code,r.title,r.first_name,r.last_name,r.citizen_id,r.phone,r.position,r.division,r.bureau,r.status,u.email)) LIKE ?
       ORDER BY r.status='attended', r.status='cancelled', r.registered_at DESC
       LIMIT ${safeLimit}`,
      [`%${normalizedQuery}%`],
    );
    return (rows as RegistrationRecord[]).map((item) => ({ ...item, participant_role: normalizeParticipantRole(item.participant_role) }));
  } catch (error) {
    if (isDatabaseSchemaFallback(error)) return searchLocalParticipantRecords(await listParticipantsCompat(), normalizedQuery, safeLimit);
    if (!isDatabaseUnavailable(error)) throw error;
    return searchLocalParticipantRecords(await listLocalRegistrations(), normalizedQuery, safeLimit);
  }
}

export async function updateParticipant(input: RegistrationUpdateInput) {
  try {
    await ensureDatabaseSchema();
    await db.execute(
      "UPDATE users u JOIN registrations r ON r.user_id=u.id SET u.email=NULLIF(?,''),u.provider=?,u.display_name=?,r.participant_role=?,r.title=?,r.first_name=?,r.last_name=?,r.citizen_id=NULLIF(?,''),r.phone=?,r.position=?,r.division=?,r.bureau=?,r.status=?,r.checked_in_at=CASE WHEN ?='attended' THEN COALESCE(r.checked_in_at,CURRENT_TIMESTAMP(3)) ELSE NULL END,r.checked_in_by_email=CASE WHEN ?='attended' THEN r.checked_in_by_email ELSE NULL END WHERE r.registration_code=?",
      [
        input.email.trim().toLowerCase(),
        input.provider,
        `${input.firstName} ${input.lastName}`,
        input.participantRole,
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
        input.status,
        input.registrationCode,
      ],
    );
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    await updateLocalRegistration(input);
  }
}

export async function createParticipant(input: RegistrationInput) {
  let record: RegistrationRecord;
  let created = true;
  try {
    await ensureDatabaseSchema();
    const result = await transaction(async (connection) => {
      const registrationCode = await nextRegistrationCode(async (candidate) => {
        const [codeRows] = await connection.execute("SELECT registration_code FROM registrations WHERE registration_code=? LIMIT 1", [candidate]);
        return (codeRows as Array<{ registration_code: string }>).length > 0;
      });
      const citizenId = input.citizenId.trim();
      const [existingRows] = await connection.execute(
        "SELECT registration_code FROM registrations WHERE (first_name=? AND last_name=?) OR (? <> '' AND citizen_id=?) LIMIT 1",
        [input.firstName, input.lastName, citizenId, citizenId],
      );
      if ((existingRows as Array<{ registration_code: string }>).length > 0) {
        throw Object.assign(new Error("duplicate registration"), { code: citizenId ? "DUPLICATE_CITIZEN_ID" : "DUPLICATE_NAME" });
      }

      const userId = randomUUID();
      const registrationId = randomUUID();
      const email = input.email.trim().toLowerCase();
      await connection.execute(
        "INSERT INTO users(id,email,provider,display_name) VALUES(?,?,?,?)",
        [userId, email || null, input.provider, `${input.firstName} ${input.lastName}`],
      );
      await connection.execute(
        "INSERT INTO registrations(id,registration_code,user_id,participant_role,title,first_name,last_name,citizen_id,phone,position,division,bureau,consent_pdpa) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [registrationId, registrationCode, userId, input.participantRole ?? "Guest", input.title, input.firstName, input.lastName, citizenId || null, input.phone, input.position, input.division, input.bureau, true],
      );
      return registrationCode;
    });
    const found = await findRegisteredParticipantRecord(result);
    if (!found) throw Object.assign(new Error("registration not found"), { code: "NOT_FOUND" });
    record = found;
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    const result = await createLocalRegistration(input);
    record = result.record;
  }

  const email = await sendRegistrationConfirmation(record);
  return { record, emailStatus: email.status };
}

export async function findExistingUserEmails(emails: string[]) {
  const uniqueEmails = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (!uniqueEmails.length) return new Set<string>();

  try {
    await ensureDatabaseSchema();
    const placeholders = uniqueEmails.map(() => "?").join(",");
    const [rows] = await db.execute(
      `SELECT LOWER(email) AS email FROM users WHERE email IS NOT NULL AND LOWER(email) IN (${placeholders})`,
      uniqueEmails,
    );
    return new Set((rows as Array<{ email: string }>).map((row) => row.email));
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    const local = await listLocalRegistrations();
    return new Set(local.map((item) => item.email.trim().toLowerCase()).filter((email) => uniqueEmails.includes(email)));
  }
}

async function nextRegistrationCode(hasCollision: (candidate: string) => Promise<boolean>) {
  let registrationCode = code("REG");
  while (await hasCollision(registrationCode)) {
    registrationCode = code("REG");
  }
  return registrationCode;
}

export async function registerSubmissionAsParticipant(submissionCode: string) {
  const result = await ensureSubmissionMemberParticipant(submissionCode, 1);
  const email = result.created ? await sendRegistrationConfirmation(result.record) : { status: "skipped" as const };
  return { ...result, emailStatus: email.status };
}

export async function ensureSubmissionMemberParticipant(submissionCode: string, memberOrder: number) {
  const submission = await getSubmissionDetail(submissionCode);
  if (!submission) throw Object.assign(new Error("submission not found"), { code: "NOT_FOUND" });
  const member = submission.members.find((item) => item.member_order === memberOrder) ?? submission.members[0];
  if (!member) throw Object.assign(new Error("submission member not found"), { code: "NOT_FOUND" });

  const input = {
    email: (member.email || submission.email).trim().toLowerCase(),
    provider: "local" as const,
    participantRole: "Competitor" as const,
    title: member.title,
    firstName: member.first_name,
    lastName: member.last_name,
    citizenId: member.citizen_id,
    phone: member.phone,
    position: member.position,
    division: member.division,
    bureau: member.bureau,
  };

  const existing = await findRegistrationByName(input.firstName, input.lastName, input.citizenId);
  if (existing) return { record: existing, created: false, member };

  let record: RegistrationRecord;
  let created = true;
  try {
    await ensureDatabaseSchema();
    const result = await transaction(async (connection) => {
      const [existingRows] = await connection.execute(
        "SELECT r.registration_code,r.user_id FROM registrations r WHERE (r.first_name=? AND r.last_name=?) OR (? <> '' AND r.citizen_id=?) LIMIT 1",
        [input.firstName, input.lastName, input.citizenId, input.citizenId],
      );
      const existing = (existingRows as Array<{ registration_code: string; user_id: string }>)[0];
      if (existing) {
        await connection.execute(
          "UPDATE users SET email=?,provider=?,display_name=?,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",
          [input.email, input.provider, `${input.firstName} ${input.lastName}`, existing.user_id],
        );
        await connection.execute(
          "UPDATE registrations SET participant_role='Competitor',title=?,first_name=?,last_name=?,phone=?,position=?,division=?,bureau=?,status=CASE WHEN status='cancelled' THEN 'registered' ELSE status END WHERE registration_code=?",
          [input.title, input.firstName, input.lastName, input.phone, input.position, input.division, input.bureau, existing.registration_code],
        );
        return { registrationCode: existing.registration_code, created: false };
      }

      let registrationCode = code("REG");
      let collision = true;
      while (collision) {
        const [codeRows] = await connection.execute("SELECT registration_code FROM registrations WHERE registration_code=? LIMIT 1", [registrationCode]);
        collision = (codeRows as Array<{ registration_code: string }>).length > 0;
        if (collision) registrationCode = code("REG");
      }

      const userId = randomUUID();
      const registrationId = randomUUID();
      await connection.execute(
        "INSERT INTO users(id,email,provider,display_name) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),updated_at=CURRENT_TIMESTAMP(3)",
        [userId, input.email, input.provider, `${input.firstName} ${input.lastName}`],
      );
      const [users] = await connection.execute("SELECT id FROM users WHERE email=? LIMIT 1", [input.email]);
      const actualUserId = (users as Array<{ id: string }>)[0].id;
      await connection.execute(
        "INSERT INTO registrations(id,registration_code,user_id,participant_role,title,first_name,last_name,citizen_id,phone,position,division,bureau,consent_pdpa) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [registrationId, registrationCode, actualUserId, "Competitor", input.title, input.firstName, input.lastName, input.citizenId, input.phone, input.position, input.division, input.bureau, true],
      );
      return { registrationCode, created: true };
    });
    const found = await findRegisteredParticipantRecord(result.registrationCode);
    if (!found) throw Object.assign(new Error("registration not found"), { code: "NOT_FOUND" });
    record = found;
    created = result.created;
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    const local = await registerLocalSubmissionParticipant(input);
    record = local.record;
    created = local.created;
  }
  return { record, created, member };
}

async function findRegisteredParticipantRecord(registrationCode: string) {
  const [rows] = await db.execute(
    "SELECT r.registration_code,r.participant_role,r.title,r.first_name,r.last_name,COALESCE(r.citizen_id,'') AS citizen_id,r.phone,r.position,r.division,r.bureau,r.status,r.checked_in_at,r.checked_in_by_email,r.registered_at,COALESCE(u.email,'') AS email,u.provider FROM registrations r JOIN users u ON u.id=r.user_id WHERE r.registration_code=? LIMIT 1",
    [registrationCode],
  );
  const record = (rows as RegistrationRecord[])[0];
  return record ? { ...record, participant_role: normalizeParticipantRole(record.participant_role) } : null;
}

async function registerLocalSubmissionParticipant(input: {
  email: string;
  provider: "local";
  participantRole: "Competitor";
  title: string;
  firstName: string;
  lastName: string;
  citizenId: string;
  phone: string;
  position: string;
  division: string;
  bureau: string;
}) {
  const nameKey = participantNameKey(input.firstName, input.lastName);
  const existing = (await listLocalRegistrations()).find((item) => (
    participantNameKey(item.first_name, item.last_name) === nameKey
    || (input.citizenId && item.citizen_id === input.citizenId)
  ));
  if (existing) {
    const record = await updateLocalRegistration({
      ...input,
      registrationCode: existing.registration_code,
      status: existing.status === "cancelled" ? "registered" : existing.status,
    });
    return { record, created: false };
  }
  const result = await createLocalRegistration(input);
  return { record: result.record, created: true };
}

function searchLocalParticipantRecords(records: RegistrationRecord[], query: string, limit: number) {
  return records
    .filter((item) => [
      item.registration_code,
      item.email,
      item.citizen_id,
      item.phone,
      item.title,
      item.first_name,
      item.last_name,
      item.participant_role,
      item.position,
      item.division,
      item.bureau,
      item.status,
    ].join(" ").toLowerCase().includes(query))
    .sort((a, b) => Number(a.status === "attended") - Number(b.status === "attended") || Number(a.status === "cancelled") - Number(b.status === "cancelled") || b.registered_at.localeCompare(a.registered_at))
    .slice(0, limit);
}

export async function deleteParticipant(registrationCode: string) {
  try {
    await db.execute("DELETE FROM registrations WHERE registration_code=?", [registrationCode.trim()]);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    await deleteLocalRegistration(registrationCode);
  }
}

export async function deleteParticipants(registrationCodes: string[]) {
  const codes = [...new Set(registrationCodes.map((item) => item.trim()).filter(Boolean))];
  for (const registrationCode of codes) {
    await deleteParticipant(registrationCode);
  }
  return codes.length;
}

export async function checkInParticipant(registrationCode: string, checkedInByEmail?: string | null) {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      "SELECT r.registration_code,r.participant_role,r.title,r.first_name,r.last_name,COALESCE(r.citizen_id,'') AS citizen_id,r.phone,r.position,r.division,r.bureau,r.status,r.checked_in_at,r.checked_in_by_email,r.registered_at,COALESCE(u.email,'') AS email,u.provider FROM registrations r JOIN users u ON u.id=r.user_id WHERE r.registration_code=? LIMIT 1",
      [registrationCode.trim()],
    );
    const record = (rows as RegistrationRecord[])[0];
    if (!record) throw Object.assign(new Error("registration not found"), { code: "NOT_FOUND" });
    if (record.status === "cancelled") throw Object.assign(new Error("registration cancelled"), { code: "CANCELLED" });
    const now = new Date().toISOString();
    const wasAlreadyCheckedIn = Boolean(record.checked_in_at);
    await db.execute(
      "UPDATE registrations SET status='attended',checked_in_at=COALESCE(checked_in_at,CURRENT_TIMESTAMP(3)),checked_in_by_email=COALESCE(checked_in_by_email,?) WHERE registration_code=?",
      [checkedInByEmail?.trim().toLowerCase() || null, registrationCode.trim()],
    );
    const checkedRecord = {
      ...record,
      participant_role: normalizeParticipantRole(record.participant_role),
      status: "attended" as RegistrationStatus,
      checked_in_at: record.checked_in_at ?? now,
      checked_in_by_email: record.checked_in_by_email ?? checkedInByEmail ?? null,
      wasAlreadyCheckedIn,
    };
    const teamCheckIn = await autoCheckInSubmissionTeamMembers(checkedRecord, checkedInByEmail);
    return {
      ...checkedRecord,
      teamCheckIns: teamCheckIn.members,
      teamSubmissionCode: teamCheckIn.submissionCode,
      teamName: teamCheckIn.teamName,
    };
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    const checkedRecord = await checkInLocalRegistration(registrationCode, checkedInByEmail);
    const teamCheckIn = await autoCheckInLocalSubmissionTeamMembers(checkedRecord, checkedInByEmail);
    return {
      ...checkedRecord,
      teamCheckIns: teamCheckIn.members,
      teamSubmissionCode: teamCheckIn.submissionCode,
      teamName: teamCheckIn.teamName,
    };
  }
}

async function autoCheckInSubmissionTeamMembers(
  record: RegistrationRecord & { wasAlreadyCheckedIn?: boolean },
  checkedInByEmail?: string | null,
) {
  const empty = { members: [] as TeamMemberCheckInRecord[], submissionCode: undefined as string | undefined, teamName: undefined as string | null | undefined };
  const [submissionRows] = await db.execute(
    `SELECT s.id,s.submission_code,s.submission_type,s.team_name,u.email
     FROM submissions s
     JOIN users u ON u.id=s.user_id
     JOIN submission_members m ON m.submission_id=s.id
     WHERE m.citizen_id=?
     ORDER BY s.submitted_at DESC
     LIMIT 1`,
    [record.citizen_id],
  );
  const submission = (submissionRows as Array<{ id: string; submission_code: string; submission_type: string; team_name: string | null; email: string }>)[0];
  if (!submission || submission.submission_type !== "team") return empty;

  const [memberRows] = await db.execute(
    "SELECT member_order,title,first_name,last_name,citizen_id,phone,email,position,division,bureau FROM submission_members WHERE submission_id=? ORDER BY member_order ASC",
    [submission.id],
  );
  const members = (memberRows as SubmissionMemberDetail[])
    .filter((member) => member.citizen_id && member.citizen_id !== record.citizen_id);
  if (!members.length) return { ...empty, submissionCode: submission.submission_code, teamName: submission.team_name };

  const checkedInBy = checkedInByEmail?.trim().toLowerCase() || null;
  const fallbackEmail = submission.email.trim().toLowerCase();
  const checked = await transaction(async (connection) => {
    const results: Array<{ registrationCode: string; wasAlreadyCheckedIn: boolean }> = [];
    const seenCitizenIds = new Set<string>();
    for (const member of members) {
      if (seenCitizenIds.has(member.citizen_id)) continue;
      seenCitizenIds.add(member.citizen_id);

      const [existingRows] = await connection.execute(
        "SELECT registration_code,checked_in_at FROM registrations WHERE citizen_id=? LIMIT 1",
        [member.citizen_id],
      );
      const existing = (existingRows as Array<{ registration_code: string; checked_in_at: string | Date | null }>)[0];
      if (existing) {
        const wasAlreadyCheckedIn = Boolean(existing.checked_in_at);
        await connection.execute(
          "UPDATE registrations SET participant_role='Competitor',title=?,first_name=?,last_name=?,phone=?,position=?,division=?,bureau=?,status='attended',checked_in_at=COALESCE(checked_in_at,CURRENT_TIMESTAMP(3)),checked_in_by_email=COALESCE(checked_in_by_email,?) WHERE registration_code=?",
          [member.title, member.first_name, member.last_name, member.phone, member.position, member.division, member.bureau, checkedInBy, existing.registration_code],
        );
        results.push({ registrationCode: existing.registration_code, wasAlreadyCheckedIn });
        continue;
      }

      let registrationCode = code("REG");
      let collision = true;
      while (collision) {
        const [codeRows] = await connection.execute("SELECT registration_code FROM registrations WHERE registration_code=? LIMIT 1", [registrationCode]);
        collision = (codeRows as Array<{ registration_code: string }>).length > 0;
        if (collision) registrationCode = code("REG");
      }

      const memberEmail = member.email.trim().toLowerCase() || fallbackEmail;
      const userId = randomUUID();
      const registrationId = randomUUID();
      await connection.execute(
        "INSERT INTO users(id,email,provider,display_name) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE updated_at=CURRENT_TIMESTAMP(3)",
        [userId, memberEmail, "local", `${member.first_name} ${member.last_name}`],
      );
      const [users] = await connection.execute("SELECT id FROM users WHERE email=? LIMIT 1", [memberEmail]);
      const actualUserId = (users as Array<{ id: string }>)[0].id;
      await connection.execute(
        "INSERT INTO registrations(id,registration_code,user_id,participant_role,title,first_name,last_name,citizen_id,phone,position,division,bureau,status,checked_in_at,checked_in_by_email,consent_pdpa) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(3),?,?)",
        [registrationId, registrationCode, actualUserId, "Competitor", member.title, member.first_name, member.last_name, member.citizen_id, member.phone, member.position, member.division, member.bureau, "attended", checkedInBy, true],
      );
      results.push({ registrationCode, wasAlreadyCheckedIn: false });
    }
    return results;
  });

  const records = await Promise.all(checked.map(async (item) => {
    const checkedRecord = await findRegisteredParticipantRecord(item.registrationCode);
    return checkedRecord ? teamMemberCheckInRecord(checkedRecord, item.wasAlreadyCheckedIn) : null;
  }));

  return {
    submissionCode: submission.submission_code,
    teamName: submission.team_name,
    members: records.filter((item): item is TeamMemberCheckInRecord => Boolean(item)),
  };
}

async function autoCheckInLocalSubmissionTeamMembers(
  record: RegistrationRecord & { wasAlreadyCheckedIn?: boolean },
  checkedInByEmail?: string | null,
) {
  const empty = { members: [] as TeamMemberCheckInRecord[], submissionCode: undefined as string | undefined, teamName: undefined as string | null | undefined };
  const submissions = await listLocalSubmissions();
  const submission = submissions.find((item) => item.submission_type === "team" && item.members.some((member) => member.citizen_id === record.citizen_id));
  if (!submission) return empty;

  const fallbackEmail = submission.email.trim().toLowerCase();
  const checked: TeamMemberCheckInRecord[] = [];
  const seenCitizenIds = new Set<string>();
  for (const member of submission.members.filter((item) => item.citizen_id && item.citizen_id !== record.citizen_id)) {
    if (seenCitizenIds.has(member.citizen_id)) continue;
    seenCitizenIds.add(member.citizen_id);

    const existing = (await listLocalRegistrations()).find((item) => item.citizen_id === member.citizen_id);
    const input = {
      email: member.email.trim().toLowerCase() || fallbackEmail,
      provider: "local" as const,
      participantRole: "Competitor" as const,
      title: member.title,
      firstName: member.first_name,
      lastName: member.last_name,
      citizenId: member.citizen_id,
      phone: member.phone,
      position: member.position,
      division: member.division,
      bureau: member.bureau,
    };

    const registrationCode = existing
      ? existing.registration_code
      : (await createLocalRegistration(input)).registrationCode;
    if (existing && existing.status === "cancelled") {
      await updateLocalRegistration({ ...input, registrationCode, status: "registered" });
    } else if (existing && existing.participant_role !== "Competitor") {
      await updateLocalRegistration({ ...input, registrationCode, status: existing.status });
    }
    const checkedRecord = await checkInLocalRegistration(registrationCode, checkedInByEmail);
    checked.push(teamMemberCheckInRecord(checkedRecord, Boolean(checkedRecord.wasAlreadyCheckedIn)));
  }

  return {
    submissionCode: submission.submission_code,
    teamName: submission.team_name,
    members: checked,
  };
}

function teamMemberCheckInRecord(record: RegistrationRecord, wasAlreadyCheckedIn: boolean): TeamMemberCheckInRecord {
  return {
    registrationCode: record.registration_code,
    name: `${record.title}${record.first_name} ${record.last_name}`,
    participantRole: normalizeParticipantRole(record.participant_role),
    status: record.status,
    checkedInAt: record.checked_in_at,
    wasAlreadyCheckedIn,
  };
}

export async function listSubmissions(options?: { assignedAdminEmail?: string | null }): Promise<SubmissionListItem[]> {
  try {
    await ensureDatabaseSchema();
    const assignedEmail = options?.assignedAdminEmail?.trim().toLowerCase();
    const [rows] = await db.execute(
      `SELECT s.submission_code,s.submission_type,s.team_name,s.title_th,s.title_en,s.summary,s.hashtags,s.work_category,s.video_url,s.status,s.review_assigned_admin_email,s.review_assigned_at,s.review_scored_by_email,s.review_rules_score,s.review_problem_score,s.review_innovation_score,s.review_evidence_score,s.review_impact_score,s.review_total_score,s.review_note,s.review_submitted_at,s.submitted_at,u.email,m.title,m.first_name,m.last_name,m.position,m.division,m.bureau
       FROM submissions s
       JOIN users u ON u.id=s.user_id
       JOIN submission_members m ON m.submission_id=s.id AND m.member_order=1
       ${assignedEmail ? "WHERE LOWER(s.review_assigned_admin_email)=?" : ""}
       ORDER BY s.submitted_at DESC LIMIT 500`,
      assignedEmail ? [assignedEmail] : [],
    );
    return (rows as Array<Omit<SubmissionListItem, "hashtags" | "work_category"> & { title_en?: string | null; summary?: string | null; hashtags?: string | null; work_category?: string | null }>).map(submissionListRowToItem);
  } catch (error) {
    if (isDatabaseSchemaFallback(error)) return listSubmissionsCompat(options);
    if (!isDatabaseUnavailable(error)) {
      console.error("primary submission list query failed; trying compatibility query", error);
      try {
        return await listSubmissionsCompat(options);
      } catch (compatibilityError) {
        if (!isDatabaseUnavailable(compatibilityError) && !isDatabaseSchemaFallback(compatibilityError)) throw error;
      }
    }
    const local = (await listLocalSubmissions()).map(localSubmissionToListItem);
    const assignedEmail = options?.assignedAdminEmail?.trim().toLowerCase();
    return assignedEmail ? local.filter((item) => item.review_assigned_admin_email?.toLowerCase() === assignedEmail) : local;
  }
}

export async function listSubmissionTemplateRows(): Promise<SubmissionTemplateRow[]> {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      "SELECT submission_code,title_th,submitted_at FROM submissions ORDER BY submitted_at ASC,submission_code ASC",
    );
    return (rows as SubmissionTemplateRow[]).map((row) => ({
      submission_code: String(row.submission_code ?? "").trim(),
      title_th: String(row.title_th ?? "").trim(),
      submitted_at: String(row.submitted_at ?? ""),
    })).filter((row) => row.submission_code && row.title_th);
  } catch (error) {
    console.warn("direct committee template submission query failed; using local submission store", error);
    return (await listLocalSubmissions())
      .map((submission) => ({
        submission_code: submission.submission_code,
        title_th: submission.title_th,
        submitted_at: submission.submitted_at,
      }))
      .sort((left, right) => left.submitted_at.localeCompare(right.submitted_at) || left.submission_code.localeCompare(right.submission_code));
  }
}

export async function listSubmissionApplicantsForExport(): Promise<SubmissionApplicantExportRow[]> {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      `SELECT s.submission_code,s.title_th,s.submission_type,s.team_name,s.submitted_at,
        m.member_order,m.title,m.first_name,m.last_name,m.citizen_id,m.position,m.division,m.bureau,m.email,m.phone
       FROM submissions s
       JOIN submission_members m ON m.submission_id=s.id
       ORDER BY s.submitted_at DESC,m.member_order ASC
       LIMIT 3000`,
    );
    return rows as SubmissionApplicantExportRow[];
  } catch (error) {
    if (isDatabaseSchemaFallback(error)) return listSubmissionApplicantsForExportCompat();
    if (!isDatabaseUnavailable(error)) throw error;
    return listLocalSubmissionApplicantsForExport();
  }
}

export async function listSubmissionChecklistRows(): Promise<SubmissionChecklistRow[]> {
  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      `SELECT s.submission_code,s.title_th,s.submission_type,s.team_name,s.video_url,s.submitted_at,
        u.email,m.title,m.first_name,m.last_name,m.phone,m.position,m.division,m.bureau,
        GROUP_CONCAT(f.document_type ORDER BY FIELD(f.document_type,'ownership','concept','prototype','implementation') SEPARATOR ',') AS file_types
       FROM submissions s
       JOIN users u ON u.id=s.user_id
       JOIN submission_members m ON m.submission_id=s.id AND m.member_order=1
       LEFT JOIN submission_files f ON f.submission_id=s.id
       GROUP BY s.submission_code,s.title_th,s.submission_type,s.team_name,s.video_url,s.submitted_at,
        u.email,m.title,m.first_name,m.last_name,m.phone,m.position,m.division,m.bureau
       ORDER BY s.submitted_at DESC
       LIMIT 1000`,
    );
    return (rows as Array<Omit<SubmissionChecklistRow, "files"> & { file_types: string | null }>).map(checklistRowToItem);
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    return (await listLocalSubmissions()).map(localSubmissionToChecklistRow);
  }
}

export async function getSubmissionDetail(submissionCode: string) {
  const code = submissionCode.trim();
  try {
    await ensureDatabaseSchema();
    const [submissionRows] = await db.execute(
      `SELECT s.id,s.submission_code,s.submission_type,s.team_name,s.title_th,s.title_en,s.summary,s.hashtags,s.work_category,s.video_url,s.status,s.review_assigned_admin_email,s.review_assigned_at,s.review_scored_by_email,s.review_rules_score,s.review_problem_score,s.review_innovation_score,s.review_evidence_score,s.review_impact_score,s.review_total_score,s.review_note,s.review_submitted_at,s.submitted_at,u.email
       FROM submissions s JOIN users u ON u.id=s.user_id WHERE s.submission_code=? LIMIT 1`,
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
      hashtags: string | null;
      work_category: string | null;
      video_url: string | null;
      status: string;
      review_assigned_admin_email: string | null;
      review_assigned_at: string | null;
      review_scored_by_email: string | null;
      review_rules_score: number | null;
      review_problem_score: number | null;
      review_innovation_score: number | null;
      review_evidence_score: number | null;
      review_impact_score: number | null;
      review_total_score: number | null;
      review_note: string | null;
      review_submitted_at: string | null;
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
      "SELECT document_type,original_name,stored_name,mime_type,byte_size,sha256 FROM submission_files WHERE submission_id=? ORDER BY FIELD(document_type,'ownership','concept','prototype','implementation'), byte_size DESC, original_name ASC",
      [submission.id],
    );

    return {
      ...submission,
      hashtags: parseSubmissionHashtags(submission.hashtags, { titleTh: submission.title_th, titleEn: submission.title_en, summary: submission.summary }),
      work_category: submissionWorkCategory(submission),
      title: primary?.title ?? "",
      first_name: primary?.first_name ?? "",
      last_name: primary?.last_name ?? "",
      position: primary?.position ?? "",
      division: primary?.division ?? "",
      bureau: primary?.bureau ?? "",
      members,
      files: uniqueSubmissionFiles(fileRows as SubmissionFileDetail[]),
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
      "SELECT s.id AS submission_id,f.document_type,f.original_name,f.stored_name,f.mime_type,f.byte_size,f.sha256 FROM submissions s JOIN submission_files f ON f.submission_id=s.id WHERE s.submission_code=? AND f.document_type=? ORDER BY f.byte_size DESC, f.original_name ASC LIMIT 1",
      [code, type],
    );
    const file = (rows as Array<SubmissionFileDetail & { submission_id: string }>)[0];
    if (!file) return getLocalSubmissionFile(code, type);
    return {
      document_type: file.document_type,
      original_name: file.original_name,
      stored_name: file.stored_name,
      mime_type: file.mime_type,
      byte_size: file.byte_size,
      sha256: file.sha256,
      filePath: path.join(storageDir, "uploads", file.submission_id, file.stored_name),
    } satisfies AdminSubmissionFile;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return getLocalSubmissionFile(code, type);
  }
}

export async function replaceSubmissionFile(input: SubmissionFileReplaceInput) {
  const code = input.submissionCode.trim();
  const type = input.documentType.trim();
  const bytes = Buffer.from(input.bytes);
  const originalName = path.basename(input.originalName).replace(/[\u0000-\u001f]/g, "").trim().slice(0, 255) || `${type}.pdf`;
  const storedName = `${type}-${randomUUID()}.pdf`;
  const hash = createHash("sha256").update(bytes).digest("hex");
  const mimeType = input.mimeType?.trim() || "application/pdf";

  try {
    await ensureDatabaseSchema();
    const [rows] = await db.execute(
      "SELECT id FROM submissions WHERE submission_code=? LIMIT 1",
      [code],
    );
    const submission = (rows as Array<{ id: string }>)[0];
    if (!submission) throw Object.assign(new Error("submission not found"), { code: "NOT_FOUND" });

    const uploadRoot = path.join(storageDir, "uploads", submission.id);
    const newPath = path.join(uploadRoot, storedName);
    await mkdir(uploadRoot, { recursive: true });
    await writeFile(newPath, bytes);

    let oldStoredNames: string[] = [];
    try {
      await transaction(async (connection) => {
        const [fileRows] = await connection.execute(
          "SELECT stored_name FROM submission_files WHERE submission_id=? AND document_type=?",
          [submission.id, type],
        );
        oldStoredNames = (fileRows as Array<{ stored_name: string }>).map((file) => file.stored_name);
        await connection.execute(
          "DELETE FROM submission_files WHERE submission_id=? AND document_type=?",
          [submission.id, type],
        );
        await connection.execute(
          "INSERT INTO submission_files(id,submission_id,document_type,original_name,stored_name,mime_type,byte_size,sha256) VALUES(?,?,?,?,?,?,?,?)",
          [randomUUID(), submission.id, type, originalName, storedName, mimeType, bytes.length, hash],
        );
      });
    } catch (error) {
      await unlink(newPath).catch(() => undefined);
      throw error;
    }

    await Promise.all(oldStoredNames
      .filter((name) => name && name !== storedName)
      .map((name) => unlink(path.join(uploadRoot, name)).catch(() => undefined)));

    return {
      document_type: type,
      original_name: originalName,
      stored_name: storedName,
      mime_type: mimeType,
      byte_size: bytes.length,
      sha256: hash,
      filePath: newPath,
    } satisfies AdminSubmissionFile;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const local = await findLocalSubmissionByCode(code);
    if (!local) throw Object.assign(new Error("submission not found"), { code: "NOT_FOUND" });
    const uploadId = local.upload_id;
    if (!uploadId) throw Object.assign(new Error("submission upload folder not found"), { code: "NOT_FOUND" });
    const uploadRoot = path.join(storageDir, "uploads", uploadId);
    const newPath = path.join(uploadRoot, storedName);
    await mkdir(uploadRoot, { recursive: true });
    await writeFile(newPath, bytes);
    try {
      const result = await replaceLocalSubmissionFile({
        submissionCode: code,
        documentType: type,
        originalName,
        storedName,
        byteSize: bytes.length,
        sha256: hash,
      });
      await Promise.all(result.oldStoredNames
        .filter((name) => name && name !== storedName)
        .map((name) => unlink(path.join(uploadRoot, name)).catch(() => undefined)));
    } catch (localError) {
      await unlink(newPath).catch(() => undefined);
      throw localError;
    }
    return {
      document_type: type,
      original_name: originalName,
      stored_name: storedName,
      mime_type: mimeType,
      byte_size: bytes.length,
      sha256: hash,
      filePath: newPath,
    } satisfies AdminSubmissionFile;
  }
}

function uniqueSubmissionFiles(files: SubmissionFileDetail[]) {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.document_type)) return false;
    seen.add(file.document_type);
    return true;
  });
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
      const [fileRows] = await connection.execute(
        "SELECT document_type,original_name,stored_name FROM submission_files WHERE submission_id=?",
        [submission.id],
      );
      const documentText = await buildSubmissionHashtagContext((fileRows as Array<{
        document_type: string;
        original_name: string;
        stored_name: string;
      }>).map((file) => ({
        documentType: file.document_type,
        originalName: file.original_name,
        filePath: path.join(storageDir, "uploads", submission.id, file.stored_name),
      })));
      await connection.execute(
        "UPDATE users SET email=?,display_name=?,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",
        [input.email.trim().toLowerCase(), `${primary.first_name} ${primary.last_name}`, submission.user_id],
      );
      await connection.execute(
        "UPDATE submissions SET submission_type=?,team_name=?,title_th=?,title_en=?,summary=?,hashtags=?,work_category=?,video_url=?,status=? WHERE id=?",
        [
          input.submissionType,
          input.submissionType === "team" ? input.teamName : null,
          input.titleTh,
          input.titleEn || null,
          input.summary.slice(0, 500),
          serializeSubmissionHashtags(generateSubmissionHashtags({ titleTh: input.titleTh, titleEn: input.titleEn, summary: input.summary, documentText })),
          normalizeWorkCategory(input.workCategory) ?? defaultWorkCategory,
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
      workCategory: input.workCategory,
      members: input.members,
    });
  }
}

export async function updateSubmissionWorkCategory(submissionCode: string, workCategory: WorkCategory) {
  const code = submissionCode.trim();
  const category = normalizeWorkCategory(workCategory);
  if (!category) throw new Error("สายงานไม่ถูกต้อง");
  try {
    await ensureDatabaseSchema();
    await db.execute(
      "UPDATE submissions SET work_category=? WHERE submission_code=?",
      [category, code],
    );
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    await updateLocalSubmissionWorkCategory(code, category);
  }
}

export async function deleteSubmission(submissionCode: string) {
  const code = submissionCode.trim();
  try {
    await ensureDatabaseSchema();
    await db.execute("DELETE FROM submissions WHERE submission_code=?", [code]);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    await deleteLocalSubmission(code);
  }
}

export async function assignSubmissionReviewer(submissionCode: string, adminEmail: string | null) {
  const code = submissionCode.trim();
  const email = adminEmail?.trim().toLowerCase() || null;
  const now = new Date().toISOString();
  try {
    await ensureDatabaseSchema();
    await db.execute(
      "UPDATE submissions SET review_assigned_admin_email=?,review_assigned_at=?,status=CASE WHEN status='submitted' THEN 'screening' ELSE status END WHERE submission_code=?",
      [email, email ? now : null, code],
    );
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    await updateLocalSubmissionReview({
      submissionCode: code,
      assignedAdminEmail: email,
    });
  }
}

export async function saveSubmissionScore(input: SubmissionScoreInput) {
  const code = input.submissionCode.trim();
  const actorEmail = input.actorEmail.trim().toLowerCase();
  const totalScore = roundScore(input.rulesScore + input.problemScore + input.innovationScore + input.evidenceScore + input.impactScore);
  validateScoreInput(input, totalScore);
  const submittedAt = new Date().toISOString();

  try {
    await ensureDatabaseSchema();
    await transaction(async (connection) => {
      const [rows] = await connection.execute(
        "SELECT review_assigned_admin_email,review_submitted_at FROM submissions WHERE submission_code=? LIMIT 1",
        [code],
      );
      const current = (rows as Array<{ review_assigned_admin_email: string | null; review_submitted_at: string | null }>)[0];
      if (!current) throw Object.assign(new Error("submission not found"), { code: "NOT_FOUND" });
      if (input.actorRole !== "super_admin" && current.review_assigned_admin_email?.toLowerCase() !== actorEmail) {
        throw Object.assign(new Error("not assigned to this admin"), { code: "FORBIDDEN" });
      }
      if (input.actorRole !== "super_admin" && current.review_submitted_at) {
        throw Object.assign(new Error("score already submitted"), { code: "LOCKED" });
      }
      await connection.execute(
        `UPDATE submissions
         SET review_scored_by_email=?,review_rules_score=?,review_problem_score=?,review_innovation_score=?,review_evidence_score=?,review_impact_score=?,review_total_score=?,review_note=?,review_submitted_at=?,status=CASE WHEN status IN ('submitted','screening') THEN 'screening' ELSE status END
         WHERE submission_code=?`,
        [
          actorEmail,
          input.rulesScore,
          input.problemScore,
          input.innovationScore,
          input.evidenceScore,
          input.impactScore,
          totalScore,
          input.note.trim() || null,
          submittedAt,
          code,
        ],
      );
    });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const local = await findLocalSubmissionByCode(code);
    if (!local) throw Object.assign(new Error("submission not found"), { code: "NOT_FOUND" });
    if (input.actorRole !== "super_admin" && local.review_assigned_admin_email?.toLowerCase() !== actorEmail) {
      throw Object.assign(new Error("not assigned to this admin"), { code: "FORBIDDEN" });
    }
    if (input.actorRole !== "super_admin" && local.review_submitted_at) {
      throw Object.assign(new Error("score already submitted"), { code: "LOCKED" });
    }
    await updateLocalSubmissionReview({
      submissionCode: code,
      scoredByEmail: actorEmail,
      rulesScore: input.rulesScore,
      problemScore: input.problemScore,
      innovationScore: input.innovationScore,
      evidenceScore: input.evidenceScore,
      impactScore: input.impactScore,
      totalScore,
      note: input.note.trim() || null,
      submittedAt,
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
      "SELECT id,title,excerpt,body,image_name,image_original_name,attachment_name,attachment_original_name,publish_at,published,created_at FROM news_posts ORDER BY publish_at DESC, created_at DESC LIMIT 100",
    );
    return filterAndSortNews((rows as NewsDbRow[]).map(newsDbRowToRecord), options?.publicOnly);
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    return filterAndSortNews(await readJson<NewsRecord[]>(newsStorePath, []), options?.publicOnly);
  }
}

export async function addNews(input: NewsInput) {
  const now = new Date().toISOString();
  const id = randomUUID();
  const image = input.image && input.image.size > 0 ? await saveNewsImage(input.image) : null;
  const attachment = input.attachment && input.attachment.size > 0 ? await saveNewsAttachment(input.attachment) : null;
  const record: NewsRecord = {
    id,
    title: input.title.trim(),
    excerpt: input.excerpt.trim(),
    body: input.body.trim(),
    imageName: image?.storedName ?? null,
    imageOriginalName: image?.originalName ?? null,
    attachmentName: attachment?.storedName ?? null,
    attachmentOriginalName: attachment?.originalName ?? null,
    publishAt: input.publishAt || now,
    published: input.published,
    createdAt: now,
  };

  try {
    await ensureNewsTable();
    await db.execute(
      "INSERT INTO news_posts(id,title,excerpt,body,image_name,image_original_name,attachment_name,attachment_original_name,publish_at,published,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      [
        record.id,
        record.title,
        record.excerpt,
        record.body,
        record.imageName,
        record.imageOriginalName,
        record.attachmentName,
        record.attachmentOriginalName,
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
  let attachmentName: string | null = null;
  try {
    await ensureNewsTable();
    const [rows] = await db.execute("SELECT image_name,attachment_name FROM news_posts WHERE id=? LIMIT 1", [targetId]);
    imageName = ((rows as Array<{ image_name: string | null }>)[0]?.image_name) ?? null;
    attachmentName = ((rows as Array<{ attachment_name: string | null }>)[0]?.attachment_name) ?? null;
    await db.execute("DELETE FROM news_posts WHERE id=?", [targetId]);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const news = await readJson<NewsRecord[]>(newsStorePath, []);
    imageName = news.find((item) => item.id === targetId)?.imageName ?? null;
    attachmentName = news.find((item) => item.id === targetId)?.attachmentName ?? null;
    await writeJson(newsStorePath, news.filter((item) => item.id !== targetId));
  }
  if (imageName) await deleteNewsImage(imageName);
  if (attachmentName) await deleteNewsAttachment(attachmentName);
}

export async function updateNews(id: string, input: NewsUpdateInput) {
  const targetId = id.trim();
  const current = (await listNews()).find((item) => item.id === targetId);
  if (!current) throw new Error("ไม่พบข่าวประชาสัมพันธ์ที่ต้องการแก้ไข");

  const image = input.image && input.image.size > 0 ? await saveNewsImage(input.image) : null;
  const attachment = input.attachment && input.attachment.size > 0 ? await saveNewsAttachment(input.attachment) : null;
  const nextImageName = image?.storedName ?? current.imageName;
  const nextImageOriginalName = image?.originalName ?? current.imageOriginalName;
  const nextAttachmentName = attachment
    ? attachment.storedName
    : input.removeAttachment
      ? null
      : current.attachmentName;
  const nextAttachmentOriginalName = attachment
    ? attachment.originalName
    : input.removeAttachment
      ? null
      : current.attachmentOriginalName;
  const next: NewsRecord = {
    ...current,
    title: input.title.trim(),
    excerpt: input.excerpt.trim(),
    body: input.body.trim(),
    imageName: nextImageName,
    imageOriginalName: nextImageOriginalName,
    attachmentName: nextAttachmentName,
    attachmentOriginalName: nextAttachmentOriginalName,
    publishAt: input.publishAt?.trim() || current.publishAt,
    published: input.published,
  };

  try {
    await ensureNewsTable();
    await db.execute(
      "UPDATE news_posts SET title=?,excerpt=?,body=?,image_name=?,image_original_name=?,attachment_name=?,attachment_original_name=?,publish_at=?,published=? WHERE id=?",
      [
        next.title,
        next.excerpt,
        next.body,
        next.imageName,
        next.imageOriginalName,
        next.attachmentName,
        next.attachmentOriginalName,
        next.publishAt,
        next.published,
        targetId,
      ],
    );
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const news = await readJson<NewsRecord[]>(newsStorePath, []);
    await writeJson(newsStorePath, news.map((item) => item.id === targetId ? next : item));
  }

  if (image?.storedName && current.imageName) await deleteNewsImage(current.imageName);
  if (attachment?.storedName && current.attachmentName) await deleteNewsAttachment(current.attachmentName);
  if (input.removeAttachment && current.attachmentName && !attachment) await deleteNewsAttachment(current.attachmentName);
  return next;
}

export async function getHomePopup() {
  return readJson<HomePopupRecord | null>(homePopupStorePath, null);
}

export async function saveHomePopup(input: { enabled: boolean; image?: File | null }) {
  const current = await getHomePopup();
  const hasNewImage = Boolean(input.image && input.image.size > 0);
  if (!current && !hasNewImage) throw new Error("กรุณาอัปโหลดรูปภาพ popup");
  const image = hasNewImage ? await saveHomePopupImage(input.image as File) : null;
  const next: HomePopupRecord = {
    id: current?.id ?? randomUUID(),
    imageName: image?.storedName ?? current?.imageName ?? "",
    imageOriginalName: image?.originalName ?? current?.imageOriginalName ?? "",
    enabled: input.enabled,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(homePopupStorePath, next);
  if (image && current?.imageName) await deleteHomePopupImage(current.imageName);
  return next;
}

export async function deleteHomePopup() {
  const current = await getHomePopup();
  await writeJson(homePopupStorePath, null);
  if (current?.imageName) await deleteHomePopupImage(current.imageName);
}

export function getNewsImagePath(imageName: string) {
  const safeName = path.basename(imageName);
  if (!safeName || safeName !== imageName) return null;
  return path.join(newsUploadsDir, safeName);
}

export function getNewsAttachmentPath(attachmentName: string) {
  const safeName = path.basename(attachmentName);
  if (!safeName || safeName !== attachmentName) return null;
  return path.join(newsAttachmentsDir, safeName);
}

export function getHomePopupImagePath(imageName: string) {
  const safeName = path.basename(imageName);
  if (!safeName || safeName !== imageName) return null;
  return path.join(homePopupUploadsDir, safeName);
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    if (error instanceof SyntaxError) {
      console.warn(`runtime JSON store is invalid: ${filePath}`, error);
      return fallback;
    }
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
  return parseThaiDate(value);
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
  attachment_name: string | null;
  attachment_original_name: string | null;
  publish_at: string | Date;
  published: boolean | number;
  created_at: string | Date;
};

type ParkingReservationDbRow = {
  id: string;
  registration_code: string;
  car_plate: string;
  note: string;
  created_by_email: string;
  updated_by_email: string;
  created_at: string | Date;
  updated_at: string | Date;
  participant_role: string;
  title: string;
  first_name: string;
  last_name: string;
  phone: string;
  position: string;
  division: string;
  bureau: string;
  email: string;
};

function newsDbRowToRecord(row: NewsDbRow): NewsRecord {
  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    imageName: row.image_name,
    imageOriginalName: row.image_original_name,
    attachmentName: row.attachment_name,
    attachmentOriginalName: row.attachment_original_name,
    publishAt: normalizeStoredDate(row.publish_at),
    published: Boolean(row.published),
    createdAt: normalizeStoredDate(row.created_at),
  };
}

function parkingReservationDbRowToRecord(row: ParkingReservationDbRow): ParkingReservationRecord {
  return {
    id: row.id,
    registrationCode: row.registration_code,
    participantRole: normalizeParkingRole(row.participant_role),
    participantName: formatApplicantName(row),
    phone: row.phone,
    email: row.email,
    position: row.position,
    division: row.division,
    bureau: row.bureau,
    carPlate: row.car_plate,
    note: row.note,
    createdByEmail: row.created_by_email,
    updatedByEmail: row.updated_by_email,
    createdAt: normalizeStoredDate(row.created_at),
    updatedAt: normalizeStoredDate(row.updated_at),
  };
}

async function findParkingEligibleParticipant(registrationCode: string) {
  const [rows] = await db.execute(
    `SELECT r.registration_code,r.participant_role,r.title,r.first_name,r.last_name,COALESCE(r.citizen_id,'') AS citizen_id,r.phone,r.position,r.division,r.bureau,r.status,r.checked_in_at,r.checked_in_by_email,r.registered_at,COALESCE(u.email,'') AS email,u.provider
     FROM registrations r
     JOIN users u ON u.id=r.user_id
     WHERE r.registration_code=? AND r.participant_role IN ('VIP','Exhibitor','Staff') AND r.status<>'cancelled'
     LIMIT 1`,
    [registrationCode],
  );
  const participant = (rows as RegistrationRecord[])[0];
  return participant ? { ...participant, participant_role: normalizeParticipantRole(participant.participant_role) } : null;
}

async function hydrateLocalParkingReservations(records: ParkingReservationRecord[]) {
  const participants = await listLocalRegistrations();
  const participantMap = new Map(participants.map((participant) => [participant.registration_code, participant]));
  return records
    .map((record) => {
      const participant = participantMap.get(record.registrationCode);
      if (!participant || !isParkingEligibleRole(participant.participant_role) || participant.status === "cancelled") return record;
      return {
        ...record,
        ...parkingRecordFromParticipant(participant),
      };
    })
    .filter((record) => isParkingEligibleRole(record.participantRole));
}

function normalizeParkingInput(input: { registrationCode: string; carPlate: string; note?: string; actorEmail: string }) {
  const registrationCode = input.registrationCode.trim();
  const carPlate = input.carPlate.replace(/\s+/g, " ").trim();
  if (!registrationCode) throw new Error("registrationCode is required");
  if (!carPlate) throw new Error("carPlate is required");
  return {
    registrationCode,
    carPlate: carPlate.slice(0, 32),
    note: (input.note ?? "").replace(/\s+/g, " ").trim().slice(0, 255),
    actorEmail: input.actorEmail.trim().toLowerCase(),
  };
}

function parkingRecordFromParticipant(participant: RegistrationRecord) {
  return {
    registrationCode: participant.registration_code,
    participantRole: normalizeParkingRole(participant.participant_role),
    participantName: `${participant.title}${participant.first_name} ${participant.last_name}`.replace(/\s+/g, " ").trim(),
    phone: participant.phone,
    email: participant.email,
    position: participant.position,
    division: participant.division,
    bureau: participant.bureau,
  };
}

function normalizeParkingRole(role: unknown): ParkingReservationRecord["participantRole"] {
  if (role === "VIP") return "VIP";
  if (role === "Staff") return "Staff";
  return "Exhibitor";
}

function isParkingEligibleRole(role: unknown): role is ParkingReservationRecord["participantRole"] {
  return role === "VIP" || role === "Exhibitor" || role === "Staff";
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

function validateScoreInput(input: SubmissionScoreInput, totalScore: number) {
  const ranges = [
    ["ความเป็นผลงานของตำรวจ", input.rulesScore, 20],
    ["ปัญหาและความจำเป็น", input.problemScore, 15],
    ["แนวคิดหรือรูปแบบนวัตกรรม", input.innovationScore, 25],
    ["หลักฐานผลลัพธ์เบื้องต้น", input.evidenceScore, 20],
    ["ความคุ้มค่าและการขยายผล", input.impactScore, 20],
  ] as const;
  for (const [label, value, max] of ranges) {
    if (!isValidScore(value) || value < 0 || value > max) {
      throw new Error(`คะแนน ${label} ต้องอยู่ระหว่าง 0-${max} และมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง`);
    }
  }
  if (totalScore < 0 || totalScore > 100) throw new Error("คะแนนรวมต้องอยู่ระหว่าง 0-100");
}

function isValidScore(value: number) {
  return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
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

async function saveNewsAttachment(file: File) {
  const allowedExtensions = new Set([".pdf", ".xlsx", ".xls", ".docx", ".doc", ".csv"]);
  const extension = path.extname(file.name).toLowerCase();
  if (!allowedExtensions.has(extension)) throw new Error("ไฟล์แนบต้องเป็น PDF, Excel, Word หรือ CSV");
  if (file.size > 20 * 1024 * 1024) throw new Error("ไฟล์แนบต้องมีขนาดไม่เกิน 20 MB");
  await mkdir(newsAttachmentsDir, { recursive: true });
  const storedName = `${randomUUID()}${extension}`;
  await writeFile(path.join(newsAttachmentsDir, storedName), Buffer.from(await file.arrayBuffer()));
  return { storedName, originalName: file.name || storedName };
}

async function saveHomePopupImage(file: File) {
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!allowedTypes.has(file.type)) throw new Error("รองรับเฉพาะไฟล์ภาพ JPG, PNG, WebP หรือ GIF");
  if (file.size > 10 * 1024 * 1024) throw new Error("ไฟล์ภาพ popup ต้องมีขนาดไม่เกิน 10 MB");
  await mkdir(homePopupUploadsDir, { recursive: true });
  const extension = extensionFromFile(file);
  const storedName = `${randomUUID()}${extension}`;
  await writeFile(path.join(homePopupUploadsDir, storedName), Buffer.from(await file.arrayBuffer()));
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

async function deleteNewsAttachment(attachmentName: string) {
  const filePath = getNewsAttachmentPath(attachmentName);
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function deleteHomePopupImage(imageName: string) {
  const filePath = getHomePopupImagePath(imageName);
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
      attachment_name VARCHAR(255) NULL,
      attachment_original_name VARCHAR(255) NULL,
      publish_at VARCHAR(40) NOT NULL,
      published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_news_publish (published, publish_at)
    ) ENGINE=InnoDB
  `);
  for (const column of [
    "ALTER TABLE news_posts ADD COLUMN attachment_name VARCHAR(255) NULL",
    "ALTER TABLE news_posts ADD COLUMN attachment_original_name VARCHAR(255) NULL",
  ]) {
    try {
      await db.execute(column);
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }
  }
}

function isDuplicateColumnError(error: unknown) {
  const typed = error as { code?: string; message?: string };
  return typed.code === "ER_DUP_FIELDNAME" || typed.message?.toLowerCase().includes("duplicate column") === true;
}

async function listParticipantsCompat() {
  try {
    const [rows] = await db.execute(
      "SELECT r.registration_code,'Guest' AS participant_role,r.title,r.first_name,r.last_name,COALESCE(r.citizen_id,'') AS citizen_id,r.phone,'' AS position,'' AS division,'' AS bureau,r.status,NULL AS checked_in_at,NULL AS checked_in_by_email,r.registered_at,COALESCE(u.email,'') AS email,u.provider FROM registrations r JOIN users u ON u.id=r.user_id ORDER BY r.registered_at DESC LIMIT 500",
    );
    return (rows as RegistrationRecord[]).map((item) => ({ ...item, participant_role: normalizeParticipantRole(item.participant_role) }));
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    return listLocalRegistrations();
  }
}

async function listSubmissionsCompat(options?: { assignedAdminEmail?: string | null }) {
  try {
    const assignedEmail = options?.assignedAdminEmail?.trim().toLowerCase();
    const [rows] = await db.execute(
      `SELECT s.submission_code,s.submission_type,s.team_name,s.title_th,NULL AS title_en,'' AS hashtags,NULL AS work_category,NULL AS video_url,s.status,NULL AS review_assigned_admin_email,NULL AS review_assigned_at,NULL AS review_scored_by_email,NULL AS review_rules_score,NULL AS review_problem_score,NULL AS review_innovation_score,NULL AS review_evidence_score,NULL AS review_impact_score,NULL AS review_total_score,NULL AS review_note,NULL AS review_submitted_at,s.submitted_at,u.email,m.title,m.first_name,m.last_name,'' AS position,'' AS division,'' AS bureau
       FROM submissions s
       JOIN users u ON u.id=s.user_id
       JOIN submission_members m ON m.submission_id=s.id AND m.member_order=1
       ${assignedEmail ? "WHERE 1=0" : ""}
       ORDER BY s.submitted_at DESC LIMIT 500`,
    );
    return (rows as Array<Omit<SubmissionListItem, "hashtags" | "work_category"> & { hashtags?: string | null; work_category?: string | null }>).map(submissionListRowToItem);
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    const local = (await listLocalSubmissions()).map(localSubmissionToListItem);
    const assignedEmail = options?.assignedAdminEmail?.trim().toLowerCase();
    return assignedEmail ? local.filter((item) => item.review_assigned_admin_email?.toLowerCase() === assignedEmail) : local;
  }
}

async function listSubmissionApplicantsForExportCompat(): Promise<SubmissionApplicantExportRow[]> {
  try {
    const [rows] = await db.execute(
      `SELECT s.submission_code,s.title_th,s.submission_type,s.team_name,s.submitted_at,
        m.member_order,m.title,m.first_name,m.last_name,m.citizen_id,'' AS position,'' AS division,'' AS bureau,m.email,m.phone
       FROM submissions s
       JOIN submission_members m ON m.submission_id=s.id
       ORDER BY s.submitted_at DESC,m.member_order ASC
       LIMIT 3000`,
    );
    return rows as SubmissionApplicantExportRow[];
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    return listLocalSubmissionApplicantsForExport();
  }
}

async function listLocalSubmissionApplicantsForExport(): Promise<SubmissionApplicantExportRow[]> {
  const submissions = await listLocalSubmissions();
  return submissions.flatMap((submission) => {
    const fallbackMembers = submission.members?.length ? submission.members : [{
      title: submission.title,
      first_name: submission.first_name,
      last_name: submission.last_name,
      citizen_id: submission.citizen_id,
      phone: submission.phone,
      email: submission.email,
      position: submission.position,
      division: submission.division,
      bureau: submission.bureau,
    }];
    return fallbackMembers.map((member, index) => ({
      submission_code: submission.submission_code,
      title_th: submission.title_th,
      submission_type: submission.submission_type,
      team_name: submission.team_name,
      member_order: index + 1,
      title: member.title,
      first_name: member.first_name,
      last_name: member.last_name,
      citizen_id: member.citizen_id,
      position: member.position,
      division: member.division,
      bureau: member.bureau,
      email: member.email,
      phone: member.phone,
      submitted_at: submission.submitted_at,
    }));
  }).sort((left, right) => (
    right.submitted_at.localeCompare(left.submitted_at)
    || left.submission_code.localeCompare(right.submission_code)
    || left.member_order - right.member_order
  ));
}

function localSubmissionToListItem(local: LocalSubmissionRecord): SubmissionListItem {
  const hashtags = parseSubmissionHashtags(local.hashtags, { titleTh: local.title_th, titleEn: local.title_en, summary: local.summary });
  return {
    submission_code: local.submission_code,
    submission_type: local.submission_type,
    team_name: local.team_name,
    title_th: local.title_th,
    title_en: local.title_en,
    video_url: local.video_url || null,
    work_category: normalizeWorkCategory(local.work_category) ?? defaultWorkCategory,
    hashtags,
    status: local.status,
    review_assigned_admin_email: local.review_assigned_admin_email ?? null,
    review_assigned_at: local.review_assigned_at ?? null,
    review_scored_by_email: local.review_scored_by_email ?? null,
    review_rules_score: local.review_rules_score ?? null,
    review_problem_score: local.review_problem_score ?? null,
    review_innovation_score: local.review_innovation_score ?? null,
    review_evidence_score: local.review_evidence_score ?? null,
    review_impact_score: local.review_impact_score ?? null,
    review_total_score: local.review_total_score ?? null,
    review_note: local.review_note ?? null,
    review_submitted_at: local.review_submitted_at ?? null,
    submitted_at: local.submitted_at,
    email: local.email,
    title: local.title,
    first_name: local.first_name,
    last_name: local.last_name,
    position: local.position,
    division: local.division,
    bureau: local.bureau,
  };
}

function localSubmissionToChecklistRow(local: LocalSubmissionRecord): SubmissionChecklistRow {
  const primary = local.members[0];
  return {
    submission_code: local.submission_code,
    title_th: local.title_th,
    submission_type: local.submission_type,
    team_name: local.team_name,
    video_url: local.video_url || null,
    submitted_at: local.submitted_at,
    email: local.email,
    title: primary?.title ?? local.title,
    first_name: primary?.first_name ?? local.first_name,
    last_name: primary?.last_name ?? local.last_name,
    phone: primary?.phone ?? local.phone,
    position: primary?.position ?? local.position,
    division: primary?.division ?? local.division,
    bureau: primary?.bureau ?? local.bureau,
    files: filePresence(local.files.map((file) => file.document_type)),
  };
}

function localSubmissionToAdminDetail(local: LocalSubmissionRecord): AdminSubmissionDetail {
  const primary = local.members[0];
  const hashtags = parseSubmissionHashtags(local.hashtags, { titleTh: local.title_th, titleEn: local.title_en, summary: local.summary });
  return {
    submission_code: local.submission_code,
    submission_type: local.submission_type,
    team_name: local.team_name,
    title_th: local.title_th,
    title_en: local.title_en,
    summary: local.summary,
    hashtags,
    work_category: normalizeWorkCategory(local.work_category) ?? defaultWorkCategory,
    video_url: local.video_url,
    status: local.status,
    review_assigned_admin_email: local.review_assigned_admin_email ?? null,
    review_assigned_at: local.review_assigned_at ?? null,
    review_scored_by_email: local.review_scored_by_email ?? null,
    review_rules_score: local.review_rules_score ?? null,
    review_problem_score: local.review_problem_score ?? null,
    review_innovation_score: local.review_innovation_score ?? null,
    review_evidence_score: local.review_evidence_score ?? null,
    review_impact_score: local.review_impact_score ?? null,
    review_total_score: local.review_total_score ?? null,
    review_note: local.review_note ?? null,
    review_submitted_at: local.review_submitted_at ?? null,
    submitted_at: local.submitted_at,
    email: local.email,
    title: primary?.title ?? local.title,
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

function submissionListRowToItem(row: Omit<SubmissionListItem, "hashtags" | "work_category"> & {
  title_en?: string | null;
  summary?: string | null;
  hashtags?: string | null;
  work_category?: string | null;
}): SubmissionListItem {
  const hashtags = parseSubmissionHashtags(row.hashtags, { titleTh: row.title_th, titleEn: row.title_en, summary: row.summary });
  return {
    ...row,
    hashtags,
    work_category: normalizeWorkCategory(row.work_category) ?? defaultWorkCategory,
  };
}

function checklistRowToItem(row: Omit<SubmissionChecklistRow, "files"> & { file_types: string | null }): SubmissionChecklistRow {
  return {
    submission_code: row.submission_code,
    title_th: row.title_th,
    submission_type: row.submission_type,
    team_name: row.team_name,
    video_url: row.video_url,
    submitted_at: row.submitted_at,
    email: row.email,
    title: row.title,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    position: row.position,
    division: row.division,
    bureau: row.bureau,
    files: filePresence(row.file_types?.split(",") ?? []),
  };
}

function filePresence(types: string[]): SubmissionChecklistRow["files"] {
  const set = new Set(types.map((type) => type.trim()).filter(Boolean));
  return {
    ownership: set.has("ownership"),
    concept: set.has("concept"),
    prototype: set.has("prototype"),
    implementation: set.has("implementation"),
  };
}

function submissionWorkCategory(submission: {
  title_th?: string | null;
  title_en?: string | null;
  summary?: string | null;
  hashtags?: string | null;
  work_category?: string | null;
}) {
  return normalizeWorkCategory(submission.work_category) ?? defaultWorkCategory;
}
