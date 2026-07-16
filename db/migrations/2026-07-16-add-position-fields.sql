USE police_innovation;

ALTER TABLE registrations
  ADD COLUMN position VARCHAR(255) NOT NULL DEFAULT '' AFTER phone;

ALTER TABLE submission_members
  ADD COLUMN position VARCHAR(255) NOT NULL DEFAULT '' AFTER email;
