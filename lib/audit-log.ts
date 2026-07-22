import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { db } from "./db";
import { ensureAppAuditEventsTable } from "./db-schema";
import { isDatabaseSchemaFallback, isDatabaseUnavailable } from "./local-registrations";
import type { AdminSession } from "./admin-auth";

export type AuditActor = {
  type: "public" | "admin" | "super_admin" | "system";
  email?: string | null;
};

export type AuditEventInput = {
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  payload?: Record<string, unknown>;
};

export type AuditEventRecord = AuditEventInput & {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type AuditEventRow = {
  id: string;
  actor_type: AuditActor["type"];
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  payload: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string | Date;
};

type AuditActorFilter = AuditActor["type"] | "admin_any" | "";

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");
const auditLogPath = path.join(storageDir, "audit-events.json");
const maxLocalEvents = 5000;
const maxAuditAgeDays = 90;
const allowedAuditActions = new Set([
  "auth.super_admin_login",
  "auth.admin_login",
  "registration.created",
  "registration.updated",
  "registration.deleted",
  "registration.bulk_deleted",
  "registration.checked_in",
  "registration.export_pdf",
  "registration.export_xlsx",
  "submission.created",
  "submission.updated",
  "submission.deleted",
  "submission.delete_otp_requested",
  "submission.file_opened",
  "submission.print_packet",
  "submission.review.assigned",
  "submission.score.submitted",
  "submission.scoreboard_pdf",
  "admin.settings.updated",
  "admin_user.created",
  "admin_user.updated",
  "admin_user.password_link_sent",
  "admin_user.password_set",
  "admin_user.deleted",
  "news.created",
  "news.deleted",
  "winner.created",
  "winner.deleted",
  "evaluation.lucky_draw",
]);
const allowedActionList = [...allowedAuditActions];

let writeQueue: Promise<unknown> = Promise.resolve();

export function actorFromAdminSession(session: AdminSession): AuditActor {
  return {
    type: session.role === "super_admin" ? "super_admin" : "admin",
    email: session.email,
  };
}

export async function recordAuditEvent(input: AuditEventInput, headers?: Headers) {
  if (!allowedAuditActions.has(input.action)) return;

  const record: AuditEventRecord = {
    ...input,
    id: randomUUID(),
    entityId: input.entityId ?? null,
    payload: input.payload ?? {},
    ipAddress: clientIp(headers),
    userAgent: headers?.get("user-agent") ?? null,
    createdAt: new Date().toISOString(),
  };

  try {
    await ensureAuditTableBestEffort();
    const values: Array<string | null> = [
      record.id,
      record.actor.type,
      record.actor.email ?? null,
      record.action,
      record.entityType,
      record.entityId ?? null,
      record.summary,
      JSON.stringify(record.payload ?? {}),
      record.ipAddress,
      record.userAgent,
      record.createdAt,
    ];
    await db.execute(
      "INSERT INTO app_audit_events(id,actor_type,actor_email,action,entity_type,entity_id,summary,payload,ip_address,user_agent,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      values,
    );
  } catch (error) {
    if (!isDatabaseUnavailable(error)) console.error("audit log failed", error);
    await writeLocalAuditEvent(record);
  }
}

export type AuditEventListOptions = {
  limit?: number;
  offset?: number;
  days?: number;
  action?: string;
  actorType?: AuditActor["type"] | "admin_any";
  actorEmail?: string;
  query?: string;
  from?: string;
  to?: string;
};

export type AuditEventListResult = {
  events: AuditEventRecord[];
  total: number;
  limit: number;
  offset: number;
};

type LegacyAuditEventRow = {
  id?: string | number | null;
  actor_user_id?: string | null;
  actor_email?: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload: string | null;
  created_at: string | Date;
};

export async function listAuditEvents(options: AuditEventListOptions | number = {}) {
  const normalized = normalizeListOptions(options);
  const dateRange = auditDateRange(normalized.days, normalized.from, normalized.to);
  const actions = normalized.action && allowedAuditActions.has(normalized.action)
    ? [normalized.action]
    : allowedActionList;
  const sourceFilters = {
    actions,
    actorType: normalized.actorType,
    actorEmail: normalized.actorEmail,
    query: normalized.query,
    from: dateRange.from,
    to: dateRange.to,
    limit: normalized.limit + normalized.offset,
  };

  const [modern, legacy, derived, localEvents] = await Promise.all([
    listModernAuditEvents(sourceFilters),
    listLegacyAuditEvents(sourceFilters),
    listDerivedAuditEvents(sourceFilters),
    safeReadLocalAuditEvents().then((events) => filterAuditEventRecords(events, sourceFilters)),
  ]);
  const events = mergeAuditEventSources(modern.events, legacy.events, localEvents, derived.events);

  return {
    events: events.slice(normalized.offset, normalized.offset + normalized.limit),
    total: Math.max(events.length, modern.total + legacy.total + localEvents.length + derived.total),
    limit: normalized.limit,
    offset: normalized.offset,
  };
}

async function listModernAuditEvents(filters: {
  actions: string[];
  actorType?: AuditActor["type"] | "admin_any" | "";
  actorEmail?: string;
  query?: string;
  from: string;
  to: string;
  limit: number;
}) {
  const where = [
    `action IN (${filters.actions.map(() => "?").join(",")})`,
    "created_at >= ?",
    "created_at <= ?",
  ];
  const values: Array<string | number> = [...filters.actions, filters.from, filters.to];
  if (filters.actorType) {
    if (filters.actorType === "admin_any") {
      where.push("actor_type IN ('admin','super_admin')");
    } else {
      where.push("actor_type = ?");
      values.push(filters.actorType);
    }
  }
  if (filters.actorEmail) {
    where.push("LOWER(actor_email) = ?");
    values.push(filters.actorEmail.toLowerCase());
  }
  if (filters.query) {
    where.push("(summary LIKE ? OR entity_id LIKE ? OR actor_email LIKE ? OR action LIKE ?)");
    const like = `%${filters.query}%`;
    values.push(like, like, like, like);
  }
  const whereSql = where.join(" AND ");

  try {
    await ensureAuditTableBestEffort();
    const [rows] = await db.execute(
      `SELECT id,actor_type,actor_email,action,entity_type,entity_id,summary,payload,ip_address,user_agent,created_at
       FROM app_audit_events
       WHERE ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET 0`,
      [...values, filters.limit],
    );
    const [countRows] = await db.execute(
      `SELECT COUNT(*) AS total FROM app_audit_events WHERE ${whereSql}`,
      values,
    );
    const modernEvents = (rows as AuditEventRow[]).map(rowToRecord);
    const modernTotal = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);
    return { events: modernEvents, total: modernTotal };
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) {
      console.error("audit log list failed", error);
    }
    return { events: [] as AuditEventRecord[], total: 0 };
  }
}

async function ensureAuditTableBestEffort() {
  try {
    await ensureAppAuditEventsTable();
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) {
      console.error("audit table repair skipped", error);
    }
  }
}

function mergeAuditEventSources(...sources: AuditEventRecord[][]) {
  const seen = new Set<string>();
  const derivedSeen = new Set<string>();
  return sources
    .flat()
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      const key = naturalAuditKey(event);
      if (event.id.startsWith("derived-") && derivedSeen.has(key)) return false;
      derivedSeen.add(key);
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function naturalAuditKey(event: AuditEventRecord) {
  return `${event.action}|${event.entityType}|${event.entityId ?? ""}`;
}

async function listLegacyAuditEvents(filters: {
  actions: string[];
  actorType?: AuditActor["type"] | "admin_any" | "";
  actorEmail?: string;
  query?: string;
  from: string;
  to: string;
  limit: number;
}) {
  try {
    if (!await legacyAuditTableExists()) return { events: [] as AuditEventRecord[], total: 0 };
    if (filters.actorType && filters.actorType !== "public") return { events: [] as AuditEventRecord[], total: 0 };

    const where = [
      `al.action IN (${filters.actions.map(() => "?").join(",")})`,
      "al.created_at >= ?",
      "al.created_at <= ?",
    ];
    const values: Array<string | number> = [...filters.actions, mysqlDateTime(filters.from), mysqlDateTime(filters.to)];
    if (filters.actorEmail) {
      where.push("LOWER(u.email) = ?");
      values.push(filters.actorEmail.toLowerCase());
    }
    if (filters.query) {
      where.push("(al.entity_id LIKE ? OR u.email LIKE ? OR al.action LIKE ? OR al.payload LIKE ?)");
      const like = `%${filters.query}%`;
      values.push(like, like, like, like);
    }
    const whereSql = where.join(" AND ");
    const [rows] = await db.execute(
      `SELECT al.id,al.actor_user_id,u.email AS actor_email,al.action,al.entity_type,al.entity_id,al.payload,al.created_at
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_user_id
       WHERE ${whereSql}
       ORDER BY al.created_at DESC
       LIMIT ?`,
      [...values, filters.limit],
    );
    const [countRows] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_user_id
       WHERE ${whereSql}`,
      values,
    );
    return {
      events: (rows as LegacyAuditEventRow[]).map(legacyRowToRecord),
      total: Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0),
    };
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) {
      console.error("legacy audit log list failed", error);
    }
    return { events: [] as AuditEventRecord[], total: 0 };
  }
}

async function listDerivedAuditEvents(filters: {
  actions: string[];
  actorType?: AuditActor["type"] | "admin_any" | "";
  actorEmail?: string;
  query?: string;
  from: string;
  to: string;
  limit: number;
}) {
  const events: AuditEventRecord[] = [];
  await appendRegistrationCreatedEvents(events);
  await appendRegistrationCheckInEvents(events);
  await appendSubmissionCreatedEvents(events);
  await appendSubmissionReviewEvents(events);
  const filtered = filterAuditEventRecords(events, filters);
  return {
    events: filtered.slice(0, filters.limit),
    total: filtered.length,
  };
}

async function appendRegistrationCreatedEvents(events: AuditEventRecord[]) {
  try {
    if (!await tableExists("registrations")) return;
    const [rows] = await db.execute(
      `SELECT r.registration_code,r.status,r.registered_at,u.email,r.title,r.first_name,r.last_name
       FROM registrations r
       JOIN users u ON u.id = r.user_id
       ORDER BY r.registered_at DESC
       LIMIT 5000`,
    );
    for (const row of rows as Array<{
      registration_code: string;
      status: string;
      registered_at: string | Date;
      email: string | null;
      title: string;
      first_name: string;
      last_name: string;
    }>) {
      const name = `${row.title ?? ""}${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
      events.push({
        id: `derived-registration-created-${row.registration_code}`,
        actor: { type: "public", email: row.email },
        action: "registration.created",
        entityType: "registration",
        entityId: row.registration_code,
        summary: `ลงทะเบียนเข้าร่วมงาน ${row.registration_code}${name ? ` • ${name}` : ""}`,
        payload: { registrationCode: row.registration_code, status: row.status },
        ipAddress: null,
        userAgent: null,
        createdAt: normalizeAuditDate(row.registered_at),
      });
    }
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) {
      console.error("derived registration audit failed", error);
    }
  }
}

async function appendRegistrationCheckInEvents(events: AuditEventRecord[]) {
  try {
    if (!await tableExists("registrations")) return;
    const [rows] = await db.execute(
      `SELECT registration_code,checked_in_at,checked_in_by_email
       FROM registrations
       WHERE checked_in_at IS NOT NULL
       ORDER BY checked_in_at DESC
       LIMIT 5000`,
    );
    for (const row of rows as Array<{
      registration_code: string;
      checked_in_at: string | Date;
      checked_in_by_email: string | null;
    }>) {
      events.push({
        id: `derived-registration-checked-in-${row.registration_code}`,
        actor: { type: "admin", email: row.checked_in_by_email },
        action: "registration.checked_in",
        entityType: "registration",
        entityId: row.registration_code,
        summary: `เช็คอินผู้เข้าร่วมงาน ${row.registration_code}`,
        payload: { registrationCode: row.registration_code },
        ipAddress: null,
        userAgent: null,
        createdAt: normalizeAuditDate(row.checked_in_at),
      });
    }
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) {
      console.error("derived check-in audit failed", error);
    }
  }
}

async function appendSubmissionCreatedEvents(events: AuditEventRecord[]) {
  try {
    if (!await tableExists("submissions")) return;
    const [rows] = await db.execute(
      `SELECT s.submission_code,s.submission_type,s.team_name,s.title_th,s.status,s.submitted_at,u.email,m.first_name,m.last_name
       FROM submissions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN submission_members m ON m.submission_id = s.id AND m.member_order = 1
       ORDER BY s.submitted_at DESC
       LIMIT 5000`,
    );
    for (const row of rows as Array<{
      submission_code: string;
      submission_type: string;
      team_name: string | null;
      title_th: string;
      status: string;
      submitted_at: string | Date;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
    }>) {
      events.push({
        id: `derived-submission-created-${row.submission_code}`,
        actor: { type: "public", email: row.email },
        action: "submission.created",
        entityType: "submission",
        entityId: row.submission_code,
        summary: `สมัครประกวดนวัตกรรม ${row.submission_code} • ${row.title_th}`,
        payload: {
          submissionCode: row.submission_code,
          submissionType: row.submission_type,
          teamName: row.team_name,
          status: row.status,
          applicant: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
        },
        ipAddress: null,
        userAgent: null,
        createdAt: normalizeAuditDate(row.submitted_at),
      });
    }
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) {
      console.error("derived submission audit failed", error);
    }
  }
}

async function appendSubmissionReviewEvents(events: AuditEventRecord[]) {
  try {
    if (!await tableExists("submissions")) return;
    const [rows] = await db.execute(
      `SELECT submission_code,title_th,review_assigned_admin_email,review_assigned_at,review_scored_by_email,review_total_score,review_submitted_at
       FROM submissions
       WHERE review_assigned_at IS NOT NULL OR review_submitted_at IS NOT NULL
       ORDER BY COALESCE(review_submitted_at, review_assigned_at) DESC
       LIMIT 5000`,
    );
    for (const row of rows as Array<{
      submission_code: string;
      title_th: string;
      review_assigned_admin_email: string | null;
      review_assigned_at: string | Date | null;
      review_scored_by_email: string | null;
      review_total_score: number | null;
      review_submitted_at: string | Date | null;
    }>) {
      if (row.review_assigned_at) {
        events.push({
          id: `derived-submission-review-assigned-${row.submission_code}`,
          actor: { type: "admin", email: row.review_assigned_admin_email },
          action: "submission.review.assigned",
          entityType: "submission",
          entityId: row.submission_code,
          summary: `assign ใบสมัคร ${row.submission_code}${row.review_assigned_admin_email ? ` ให้ ${row.review_assigned_admin_email}` : ""}`,
          payload: { submissionCode: row.submission_code, titleTh: row.title_th, adminEmail: row.review_assigned_admin_email },
          ipAddress: null,
          userAgent: null,
          createdAt: normalizeAuditDate(row.review_assigned_at),
        });
      }
      if (row.review_submitted_at) {
        const reviewerEmail = row.review_scored_by_email || row.review_assigned_admin_email;
        events.push({
          id: `derived-submission-score-submitted-${row.submission_code}`,
          actor: { type: "admin", email: reviewerEmail },
          action: "submission.score.submitted",
          entityType: "submission",
          entityId: row.submission_code,
          summary: `ส่งคะแนนรอบแรก ${row.submission_code} • ${row.review_total_score ?? "-"} คะแนน`,
          payload: { submissionCode: row.submission_code, titleTh: row.title_th, totalScore: row.review_total_score },
          ipAddress: null,
          userAgent: null,
          createdAt: normalizeAuditDate(row.review_submitted_at),
        });
      }
    }
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) {
      console.error("derived review audit failed", error);
    }
  }
}

function rowToRecord(row: AuditEventRow): AuditEventRecord {
  return {
    id: row.id,
    actor: {
      type: row.actor_type,
      email: row.actor_email,
    },
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    payload: parsePayload(row.payload),
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function legacyRowToRecord(row: LegacyAuditEventRow): AuditEventRecord {
  const createdAt = normalizeAuditDate(row.created_at);
  return {
    id: `legacy-${row.id ?? `${row.action}-${row.entity_id ?? ""}-${createdAt}`}`,
    actor: {
      type: "public",
      email: row.actor_email ?? null,
    },
    action: row.action,
    entityType: row.entity_type,
    entityId: legacyEntityId(row),
    summary: legacySummary(row),
    payload: parsePayload(row.payload),
    ipAddress: null,
    userAgent: null,
    createdAt,
  };
}

async function legacyAuditTableExists() {
  return tableExists("audit_logs");
}

async function tableExists(tableName: string) {
  const [rows] = await db.execute(
    "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [tableName],
  );
  return Number((rows as Array<{ count: number | string }>)[0]?.count ?? 0) > 0;
}

function legacyEntityId(row: LegacyAuditEventRow) {
  const payload = parsePayload(row.payload);
  const code = typeof payload.registrationCode === "string"
    ? payload.registrationCode
    : typeof payload.submissionCode === "string"
      ? payload.submissionCode
      : "";
  return code || row.entity_id;
}

function legacySummary(row: LegacyAuditEventRow) {
  const entityId = legacyEntityId(row);
  if (row.action === "registration.created") return `ลงทะเบียนเข้าร่วมงาน ${entityId || row.entity_id || ""}`.trim();
  if (row.action === "submission.created") return `ส่งใบสมัครประกวดนวัตกรรม ${entityId || row.entity_id || ""}`.trim();
  if (row.action === "submission.updated") return `แก้ไขใบสมัครประกวด ${entityId || row.entity_id || ""}`.trim();
  return `บันทึกจากระบบเดิม ${row.action}${entityId ? ` • ${entityId}` : ""}`;
}

function normalizeAuditDate(value: string | Date) {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

async function writeLocalAuditEvent(record: AuditEventRecord) {
  const work = async () => {
    const events = await readLocalAuditEvents();
    events.unshift(record);
    await writeLocalAuditEvents(events.slice(0, maxLocalEvents));
  };
  const next = writeQueue.then(work, work);
  writeQueue = next.catch(() => undefined);
  return next;
}

async function readLocalAuditEvents(): Promise<AuditEventRecord[]> {
  try {
    const events = JSON.parse(await readFile(auditLogPath, "utf8")) as AuditEventRecord[];
    return Array.isArray(events) ? events : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function safeReadLocalAuditEvents(): Promise<AuditEventRecord[]> {
  try {
    return await readLocalAuditEvents();
  } catch (error) {
    console.error("local audit log read failed", error);
    return [];
  }
}

async function writeLocalAuditEvents(events: AuditEventRecord[]) {
  await mkdir(path.dirname(auditLogPath), { recursive: true });
  const tempPath = `${auditLogPath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(events, null, 2)}\n`, "utf8");
  await rename(tempPath, auditLogPath);
}

function clientIp(headers?: Headers) {
  const forwardedFor = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || headers?.get("x-real-ip") || headers?.get("cf-connecting-ip") || null;
}

function parsePayload(value: unknown) {
  if (!value) return {};
  if (typeof value !== "string") return value as Record<string, unknown>;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return { raw: value };
  }
}

function normalizeListOptions(options: AuditEventListOptions | number) {
  const raw = typeof options === "number" ? { limit: options } : options;
  const limit = Math.min(Math.max(Number(raw.limit ?? 10), 1), 100);
  const offset = Math.max(Number(raw.offset ?? 0), 0);
  const days = Math.min(Math.max(Number(raw.days ?? maxAuditAgeDays), 1), maxAuditAgeDays);
  const action = typeof raw.action === "string" ? raw.action : "";
  const actorType: AuditActorFilter = isAuditActorFilter(raw.actorType) ? raw.actorType : "";
  const actorEmail = typeof raw.actorEmail === "string" ? raw.actorEmail.trim().toLowerCase().slice(0, 255) : "";
  const query = typeof raw.query === "string" ? raw.query.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  const from = typeof raw.from === "string" ? raw.from : "";
  const to = typeof raw.to === "string" ? raw.to : "";
  return { limit, offset, days, action, actorType, actorEmail, query, from, to };
}

function isAuditActorFilter(value: unknown): value is AuditActorFilter {
  return value === "" || value === "public" || value === "admin" || value === "super_admin" || value === "system" || value === "admin_any";
}

function auditDateRange(days: number, fromValue?: string, toValue?: string) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const from = parseAuditDate(fromValue, "start");
  const to = parseAuditDate(toValue, "end");
  return {
    from: maxIso(cutoff.toISOString(), from?.toISOString()),
    to: minIso(now.toISOString(), to?.toISOString()),
  };
}

function parseAuditDate(value: string | undefined, edge: "start" | "end") {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const suffix = edge === "start" ? "T00:00:00.000+07:00" : "T23:59:59.999+07:00";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function maxIso(left: string, right?: string) {
  return right && right > left ? right : left;
}

function minIso(left: string, right?: string) {
  return right && right < left ? right : left;
}

function mysqlDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").replace(/\.\d{3}Z$/, "");
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function filterAuditEventRecords(events: AuditEventRecord[], filters: {
  actions: string[];
  actorType?: AuditActor["type"] | "admin_any" | "";
  actorEmail?: string;
  query?: string;
  from: string;
  to: string;
}) {
  const query = filters.query?.toLowerCase();
  return events
    .filter((event) => filters.actions.includes(event.action))
    .filter((event) => event.createdAt >= filters.from && event.createdAt <= filters.to)
    .filter((event) => {
      if (!filters.actorType) return true;
      if (filters.actorType === "admin_any") return event.actor.type === "admin" || event.actor.type === "super_admin";
      return event.actor.type === filters.actorType;
    })
    .filter((event) => !filters.actorEmail || event.actor.email?.toLowerCase() === filters.actorEmail.toLowerCase())
    .filter((event) => {
      if (!query) return true;
      return [
        event.summary,
        event.entityId,
        event.actor.email,
        event.action,
      ].some((value) => String(value ?? "").toLowerCase().includes(query));
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
