import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { db } from "./db";
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
  "registration.created",
  "registration.updated",
  "registration.deleted",
  "registration.checked_in",
  "submission.created",
  "submission.updated",
  "submission.deleted",
  "submission.review.assigned",
  "submission.score.submitted",
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
    await ensureAuditEventsTable();
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

export async function listAuditEvents(options: AuditEventListOptions | number = {}) {
  const normalized = normalizeListOptions(options);
  const dateRange = auditDateRange(normalized.days, normalized.from, normalized.to);
  const actions = normalized.action && allowedAuditActions.has(normalized.action)
    ? [normalized.action]
    : allowedActionList;
  const where = [
    `action IN (${actions.map(() => "?").join(",")})`,
    "created_at >= ?",
    "created_at <= ?",
  ];
  const values: Array<string | number> = [...actions, dateRange.from, dateRange.to];
  if (normalized.actorType) {
    if (normalized.actorType === "admin_any") {
      where.push("actor_type IN ('admin','super_admin')");
    } else {
      where.push("actor_type = ?");
      values.push(normalized.actorType);
    }
  }
  if (normalized.actorEmail) {
    where.push("LOWER(actor_email) = ?");
    values.push(normalized.actorEmail.toLowerCase());
  }
  if (normalized.query) {
    where.push("(summary LIKE ? OR entity_id LIKE ? OR actor_email LIKE ? OR action LIKE ?)");
    const like = `%${normalized.query}%`;
    values.push(like, like, like, like);
  }
  const whereSql = where.join(" AND ");

  try {
    await ensureAuditEventsTable();
    const [rows] = await db.execute(
      `SELECT id,actor_type,actor_email,action,entity_type,entity_id,summary,payload,ip_address,user_agent,created_at
       FROM app_audit_events
       WHERE ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...values, normalized.limit, normalized.offset],
    );
    const [countRows] = await db.execute(
      `SELECT COUNT(*) AS total FROM app_audit_events WHERE ${whereSql}`,
      values,
    );
    return {
      events: (rows as AuditEventRow[]).map(rowToRecord),
      total: Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0),
      limit: normalized.limit,
      offset: normalized.offset,
    };
  } catch (error) {
    if (!isDatabaseUnavailable(error) && !isDatabaseSchemaFallback(error)) throw error;
    const filtered = filterLocalAuditEvents(await readLocalAuditEvents(), {
      actions,
      actorType: normalized.actorType,
      actorEmail: normalized.actorEmail,
      query: normalized.query,
      from: dateRange.from,
      to: dateRange.to,
    });
    return {
      events: filtered.slice(normalized.offset, normalized.offset + normalized.limit),
      total: filtered.length,
      limit: normalized.limit,
      offset: normalized.offset,
    };
  }
}

async function ensureAuditEventsTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_audit_events (
      id CHAR(36) PRIMARY KEY,
      actor_type ENUM('public','admin','super_admin','system') NOT NULL,
      actor_email VARCHAR(255) NULL,
      action VARCHAR(120) NOT NULL,
      entity_type VARCHAR(80) NOT NULL,
      entity_id VARCHAR(120) NULL,
      summary VARCHAR(500) NOT NULL,
      payload JSON NULL,
      ip_address VARCHAR(64) NULL,
      user_agent VARCHAR(500) NULL,
      created_at VARCHAR(40) NOT NULL,
      INDEX idx_audit_created (created_at),
      INDEX idx_audit_action (action),
      INDEX idx_audit_actor (actor_type, actor_email)
    ) ENGINE=InnoDB
  `);
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

function parsePayload(value: string | null) {
  if (!value) return {};
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

function filterLocalAuditEvents(events: AuditEventRecord[], filters: {
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
