USE police_innovation;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

DELIMITER $$

DROP PROCEDURE IF EXISTS ensure_contest_column $$
CREATE PROCEDURE ensure_contest_column(
  IN table_name_value VARCHAR(64),
  IN column_name_value VARCHAR(64),
  IN alter_sql_value TEXT
)
BEGIN
  IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = table_name_value
  ) AND NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = table_name_value
      AND COLUMN_NAME = column_name_value
  ) THEN
    SET @contest_alter_sql = alter_sql_value;
    PREPARE contest_stmt FROM @contest_alter_sql;
    EXECUTE contest_stmt;
    DEALLOCATE PREPARE contest_stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS ensure_contest_statement_for_table $$
CREATE PROCEDURE ensure_contest_statement_for_table(
  IN table_name_value VARCHAR(64),
  IN statement_sql_value TEXT
)
BEGIN
  IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = table_name_value
  ) THEN
    SET @contest_statement_sql = statement_sql_value;
    PREPARE contest_stmt FROM @contest_statement_sql;
    EXECUTE contest_stmt;
    DEALLOCATE PREPARE contest_stmt;
  END IF;
END $$

DELIMITER ;

CALL ensure_contest_statement_for_table(
  'registrations',
  "ALTER TABLE registrations MODIFY status ENUM('registered','attended','cancelled') NOT NULL DEFAULT 'registered'"
);

CALL ensure_contest_column('registrations', 'position', "ALTER TABLE registrations ADD COLUMN position VARCHAR(255) NOT NULL DEFAULT '' AFTER phone");
CALL ensure_contest_column('registrations', 'division', "ALTER TABLE registrations ADD COLUMN division VARCHAR(255) NOT NULL DEFAULT '' AFTER position");
CALL ensure_contest_column('registrations', 'bureau', "ALTER TABLE registrations ADD COLUMN bureau VARCHAR(255) NOT NULL DEFAULT '' AFTER division");
CALL ensure_contest_column('registrations', 'checked_in_at', "ALTER TABLE registrations ADD COLUMN checked_in_at TIMESTAMP(3) NULL AFTER status");

CALL ensure_contest_column('submissions', 'title_en', "ALTER TABLE submissions ADD COLUMN title_en VARCHAR(255) NULL AFTER title_th");
CALL ensure_contest_column('submissions', 'video_url', "ALTER TABLE submissions ADD COLUMN video_url VARCHAR(1000) NULL AFTER summary");

CALL ensure_contest_column('submission_members', 'position', "ALTER TABLE submission_members ADD COLUMN position VARCHAR(255) NOT NULL DEFAULT '' AFTER email");
CALL ensure_contest_column('submission_members', 'division', "ALTER TABLE submission_members ADD COLUMN division VARCHAR(255) NOT NULL DEFAULT '' AFTER position");
CALL ensure_contest_column('submission_members', 'bureau', "ALTER TABLE submission_members ADD COLUMN bureau VARCHAR(255) NOT NULL DEFAULT '' AFTER division");

DROP PROCEDURE IF EXISTS ensure_contest_column;
DROP PROCEDURE IF EXISTS ensure_contest_statement_for_table;
