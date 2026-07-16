CREATE DATABASE IF NOT EXISTS police_innovation CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE police_innovation;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  provider ENUM('google','microsoft','local') NOT NULL DEFAULT 'local',
  provider_subject VARCHAR(255) NULL,
  display_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_provider_subject (provider, provider_subject)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS registrations (
  id CHAR(36) PRIMARY KEY,
  registration_code VARCHAR(32) NOT NULL UNIQUE,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(32) NOT NULL,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL,
  citizen_id CHAR(13) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  position VARCHAR(255) NOT NULL,
  division VARCHAR(255) NOT NULL,
  bureau VARCHAR(255) NOT NULL,
  status ENUM('registered','attended','cancelled') NOT NULL DEFAULT 'registered',
  checked_in_at TIMESTAMP(3) NULL,
  consent_pdpa BOOLEAN NOT NULL DEFAULT FALSE,
  registered_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_registration_user FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uq_registration_citizen (citizen_id),
  INDEX idx_registration_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS submissions (
  id CHAR(36) PRIMARY KEY,
  submission_code VARCHAR(32) NOT NULL UNIQUE,
  user_id CHAR(36) NOT NULL,
  submission_type ENUM('individual','team') NOT NULL,
  team_name VARCHAR(255) NULL,
  title_th VARCHAR(255) NOT NULL,
  title_en VARCHAR(255) NULL,
  summary VARCHAR(500) NOT NULL,
  video_url VARCHAR(1000) NULL,
  status ENUM('draft','submitted','screening','qualified','rejected') NOT NULL DEFAULT 'submitted',
  consent_rules BOOLEAN NOT NULL,
  consent_pdpa BOOLEAN NOT NULL,
  submitted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_submission_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_submission_user (user_id),
  INDEX idx_submission_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS submission_members (
  id CHAR(36) PRIMARY KEY,
  submission_id CHAR(36) NOT NULL,
  member_order TINYINT UNSIGNED NOT NULL,
  title VARCHAR(32) NOT NULL,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL,
  citizen_id CHAR(13) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  position VARCHAR(255) NOT NULL,
  division VARCHAR(255) NOT NULL,
  bureau VARCHAR(255) NOT NULL,
  CONSTRAINT fk_member_submission FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  UNIQUE KEY uq_submission_member_order (submission_id, member_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS submission_files (
  id CHAR(36) PRIMARY KEY,
  submission_id CHAR(36) NOT NULL,
  document_type ENUM('ownership','concept','prototype','implementation') NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  byte_size INT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_file_submission FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  UNIQUE KEY uq_submission_document (submission_id, document_type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  actor_user_id CHAR(36) NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id CHAR(36) NULL,
  ip_address VARCHAR(64) NULL,
  payload JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_user FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS site_content (
  id CHAR(36) PRIMARY KEY,
  content_key VARCHAR(120) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  body LONGTEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
