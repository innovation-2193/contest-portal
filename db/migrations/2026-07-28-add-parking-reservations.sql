CREATE TABLE IF NOT EXISTS parking_reservations (
  id CHAR(36) PRIMARY KEY,
  registration_code VARCHAR(32) NOT NULL,
  car_plate VARCHAR(32) NOT NULL,
  note VARCHAR(255) NOT NULL DEFAULT '',
  created_by_email VARCHAR(255) NOT NULL,
  updated_by_email VARCHAR(255) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_parking_registration FOREIGN KEY (registration_code) REFERENCES registrations(registration_code) ON DELETE CASCADE,
  INDEX idx_parking_registration (registration_code),
  INDEX idx_parking_created (created_at)
) ENGINE=InnoDB;
