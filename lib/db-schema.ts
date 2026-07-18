import { db } from "./db";
import { isDatabaseUnavailable } from "./local-registrations";

let schemaPromise: Promise<void> | null = null;

export async function ensureDatabaseSchema() {
  schemaPromise ??= runSchemaRepair().catch((error) => {
    schemaPromise = null;
    if (isDatabaseUnavailable(error)) {
      console.warn("database unavailable while checking schema", error);
      return;
    }
    throw error;
  });
  return schemaPromise;
}

async function runSchemaRepair() {
  await ensureRegistrationColumns();
  await ensureSubmissionColumns();
  await ensureNewsPostsTable();
  await ensureAppAuditEventsTable();
}

async function ensureRegistrationColumns() {
  if (!await tableExists("registrations")) return;
  await db.execute("ALTER TABLE registrations MODIFY status ENUM('registered','attended','cancelled') NOT NULL DEFAULT 'registered'");
  await ensureColumn("registrations", "position", "ALTER TABLE registrations ADD COLUMN position VARCHAR(255) NOT NULL DEFAULT '' AFTER phone");
  await ensureColumn("registrations", "division", "ALTER TABLE registrations ADD COLUMN division VARCHAR(255) NOT NULL DEFAULT '' AFTER position");
  await ensureColumn("registrations", "bureau", "ALTER TABLE registrations ADD COLUMN bureau VARCHAR(255) NOT NULL DEFAULT '' AFTER division");
  await ensureColumn("registrations", "checked_in_at", "ALTER TABLE registrations ADD COLUMN checked_in_at TIMESTAMP(3) NULL AFTER status");
}

async function ensureSubmissionColumns() {
  if (await tableExists("submissions")) {
    await ensureColumn("submissions", "title_en", "ALTER TABLE submissions ADD COLUMN title_en VARCHAR(255) NULL AFTER title_th");
    await ensureColumn("submissions", "video_url", "ALTER TABLE submissions ADD COLUMN video_url VARCHAR(1000) NULL AFTER summary");
  }

  if (!await tableExists("submission_members")) return;
  await ensureColumn("submission_members", "position", "ALTER TABLE submission_members ADD COLUMN position VARCHAR(255) NOT NULL DEFAULT '' AFTER email");
  await ensureColumn("submission_members", "division", "ALTER TABLE submission_members ADD COLUMN division VARCHAR(255) NOT NULL DEFAULT '' AFTER position");
  await ensureColumn("submission_members", "bureau", "ALTER TABLE submission_members ADD COLUMN bureau VARCHAR(255) NOT NULL DEFAULT '' AFTER division");
}

async function ensureNewsPostsTable() {
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

async function ensureAppAuditEventsTable() {
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

async function ensureColumn(tableName: string, columnName: string, alterSql: string) {
  if (await columnExists(tableName, columnName)) return;
  await db.execute(alterSql);
}

async function tableExists(tableName: string) {
  const [rows] = await db.execute(
    "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [tableName],
  );
  return Number((rows as Array<{ count: number | string }>)[0]?.count ?? 0) > 0;
}

async function columnExists(tableName: string, columnName: string) {
  const [rows] = await db.execute(
    "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [tableName, columnName],
  );
  return Number((rows as Array<{ count: number | string }>)[0]?.count ?? 0) > 0;
}
