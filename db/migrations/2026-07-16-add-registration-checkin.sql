USE police_innovation;

ALTER TABLE registrations
  MODIFY status ENUM('registered','attended','cancelled') NOT NULL DEFAULT 'registered',
  ADD COLUMN checked_in_at TIMESTAMP(3) NULL AFTER status;
