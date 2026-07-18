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
