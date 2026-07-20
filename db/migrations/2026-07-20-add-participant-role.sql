ALTER TABLE registrations
  ADD COLUMN participant_role VARCHAR(32) NOT NULL DEFAULT 'Guest' AFTER user_id;

ALTER TABLE registrations
  ADD COLUMN checked_in_by_email VARCHAR(255) NULL AFTER checked_in_at;
