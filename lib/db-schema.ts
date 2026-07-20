import { db } from "./db";
import { isDatabaseSchemaFallback, isDatabaseUnavailable } from "./local-registrations";

let schemaPromise: Promise<void> | null = null;

export async function ensureDatabaseSchema() {
  schemaPromise ??= runSchemaRepair().catch((error) => {
    schemaPromise = null;
    if (isDatabaseUnavailable(error)) {
      console.warn("database unavailable while checking schema", error);
      return;
    }
    if (isDatabaseSchemaFallback(error)) {
      console.warn("database schema repair skipped", error);
      return;
    }
    throw error;
  });
  return schemaPromise;
}

async function runSchemaRepair() {
  await ensureRegistrationColumns();
  await ensureSubmissionColumns();
  await ensureSatisfactionEvaluationsTable();
  await ensureNewsPostsTable();
  await ensureAppAuditEventsTable();
}

async function ensureRegistrationColumns() {
  if (!await tableExists("registrations")) return;
  await db.execute("ALTER TABLE registrations MODIFY status ENUM('registered','attended','cancelled') NOT NULL DEFAULT 'registered'");
  await ensureColumn("registrations", "participant_role", "ALTER TABLE registrations ADD COLUMN participant_role VARCHAR(32) NOT NULL DEFAULT 'Guest' AFTER user_id");
  await ensureColumn("registrations", "position", "ALTER TABLE registrations ADD COLUMN position VARCHAR(255) NOT NULL DEFAULT '' AFTER phone");
  await ensureColumn("registrations", "division", "ALTER TABLE registrations ADD COLUMN division VARCHAR(255) NOT NULL DEFAULT '' AFTER position");
  await ensureColumn("registrations", "bureau", "ALTER TABLE registrations ADD COLUMN bureau VARCHAR(255) NOT NULL DEFAULT '' AFTER division");
  await ensureColumn("registrations", "checked_in_at", "ALTER TABLE registrations ADD COLUMN checked_in_at TIMESTAMP(3) NULL AFTER status");
  await ensureColumn("registrations", "checked_in_by_email", "ALTER TABLE registrations ADD COLUMN checked_in_by_email VARCHAR(255) NULL AFTER checked_in_at");
}

async function ensureSubmissionColumns() {
  if (await tableExists("submissions")) {
    await ensureColumn("submissions", "title_en", "ALTER TABLE submissions ADD COLUMN title_en VARCHAR(255) NULL AFTER title_th");
    await ensureColumn("submissions", "video_url", "ALTER TABLE submissions ADD COLUMN video_url VARCHAR(1000) NULL AFTER summary");
    await ensureColumn("submissions", "review_assigned_admin_email", "ALTER TABLE submissions ADD COLUMN review_assigned_admin_email VARCHAR(255) NULL AFTER status");
    await ensureColumn("submissions", "review_assigned_at", "ALTER TABLE submissions ADD COLUMN review_assigned_at VARCHAR(40) NULL AFTER review_assigned_admin_email");
    await ensureColumn("submissions", "review_scored_by_email", "ALTER TABLE submissions ADD COLUMN review_scored_by_email VARCHAR(255) NULL AFTER review_assigned_at");
    await ensureColumn("submissions", "review_rules_score", "ALTER TABLE submissions ADD COLUMN review_rules_score TINYINT UNSIGNED NULL AFTER review_scored_by_email");
    await ensureColumn("submissions", "review_problem_score", "ALTER TABLE submissions ADD COLUMN review_problem_score TINYINT UNSIGNED NULL AFTER review_rules_score");
    await ensureColumn("submissions", "review_innovation_score", "ALTER TABLE submissions ADD COLUMN review_innovation_score TINYINT UNSIGNED NULL AFTER review_problem_score");
    await ensureColumn("submissions", "review_evidence_score", "ALTER TABLE submissions ADD COLUMN review_evidence_score TINYINT UNSIGNED NULL AFTER review_innovation_score");
    await ensureColumn("submissions", "review_impact_score", "ALTER TABLE submissions ADD COLUMN review_impact_score TINYINT UNSIGNED NULL AFTER review_evidence_score");
    await ensureColumn("submissions", "review_total_score", "ALTER TABLE submissions ADD COLUMN review_total_score SMALLINT UNSIGNED NULL AFTER review_impact_score");
    await ensureColumn("submissions", "review_note", "ALTER TABLE submissions ADD COLUMN review_note VARCHAR(1000) NULL AFTER review_total_score");
    await ensureColumn("submissions", "review_submitted_at", "ALTER TABLE submissions ADD COLUMN review_submitted_at VARCHAR(40) NULL AFTER review_note");
  }

  if (!await tableExists("submission_members")) return;
  await ensureColumn("submission_members", "position", "ALTER TABLE submission_members ADD COLUMN position VARCHAR(255) NOT NULL DEFAULT '' AFTER email");
  await ensureColumn("submission_members", "division", "ALTER TABLE submission_members ADD COLUMN division VARCHAR(255) NOT NULL DEFAULT '' AFTER position");
  await ensureColumn("submission_members", "bureau", "ALTER TABLE submission_members ADD COLUMN bureau VARCHAR(255) NOT NULL DEFAULT '' AFTER division");
}

async function ensureSatisfactionEvaluationsTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS satisfaction_evaluations (
      id CHAR(36) PRIMARY KEY,
      registration_code VARCHAR(32) NOT NULL UNIQUE,
      gender VARCHAR(60) NOT NULL,
      gender_other VARCHAR(255) NULL,
      age_range VARCHAR(60) NOT NULL,
      organization_type VARCHAR(120) NOT NULL,
      organization_other VARCHAR(255) NULL,
      attendee_status VARCHAR(120) NOT NULL,
      attendee_status_other VARCHAR(255) NULL,
      q1 TINYINT UNSIGNED NOT NULL,
      q2 TINYINT UNSIGNED NOT NULL,
      q3 TINYINT UNSIGNED NOT NULL,
      q4 TINYINT UNSIGNED NOT NULL,
      q5 TINYINT UNSIGNED NOT NULL,
      q6 TINYINT UNSIGNED NOT NULL,
      q7 TINYINT UNSIGNED NOT NULL,
      q8 TINYINT UNSIGNED NOT NULL,
      q9 TINYINT UNSIGNED NOT NULL,
      q10 TINYINT UNSIGNED NOT NULL,
      q11 TINYINT UNSIGNED NOT NULL,
      q12 TINYINT UNSIGNED NOT NULL,
      q13 TINYINT UNSIGNED NOT NULL,
      q14 TINYINT UNSIGNED NOT NULL,
      q15 TINYINT UNSIGNED NOT NULL,
      q16 TINYINT UNSIGNED NOT NULL,
      q17 TINYINT UNSIGNED NOT NULL,
      q18 TINYINT UNSIGNED NOT NULL,
      impressive_text VARCHAR(1000) NOT NULL DEFAULT '',
      suggestion_text VARCHAR(1000) NOT NULL DEFAULT '',
      submitted_at VARCHAR(40) NOT NULL,
      lucky_draw_prize TINYINT UNSIGNED NULL,
      lucky_drawn_at VARCHAR(40) NULL,
      lucky_drawn_by_email VARCHAR(255) NULL,
      lucky_notified_at VARCHAR(40) NULL,
      CONSTRAINT fk_evaluation_registration FOREIGN KEY (registration_code) REFERENCES registrations(registration_code) ON DELETE CASCADE,
      UNIQUE KEY uq_lucky_draw_prize (lucky_draw_prize),
      INDEX idx_evaluation_submitted (submitted_at)
    ) ENGINE=InnoDB
  `);
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
  await db.execute("ALTER TABLE app_audit_events MODIFY actor_type ENUM('public','admin','super_admin','system') NOT NULL");
  await ensureColumn("app_audit_events", "actor_email", "ALTER TABLE app_audit_events ADD COLUMN actor_email VARCHAR(255) NULL AFTER actor_type");
  await ensureColumn("app_audit_events", "entity_type", "ALTER TABLE app_audit_events ADD COLUMN entity_type VARCHAR(80) NOT NULL DEFAULT '' AFTER action");
  await ensureColumn("app_audit_events", "entity_id", "ALTER TABLE app_audit_events ADD COLUMN entity_id VARCHAR(120) NULL AFTER entity_type");
  await ensureColumn("app_audit_events", "payload", "ALTER TABLE app_audit_events ADD COLUMN payload JSON NULL AFTER summary");
  await ensureColumn("app_audit_events", "ip_address", "ALTER TABLE app_audit_events ADD COLUMN ip_address VARCHAR(64) NULL AFTER payload");
  await ensureColumn("app_audit_events", "user_agent", "ALTER TABLE app_audit_events ADD COLUMN user_agent VARCHAR(500) NULL AFTER ip_address");
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
