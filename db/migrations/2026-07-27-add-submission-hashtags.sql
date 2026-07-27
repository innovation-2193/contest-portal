USE police_innovation;

DELIMITER $$

DROP PROCEDURE IF EXISTS ensure_contest_column $$
CREATE PROCEDURE ensure_contest_column(
  IN table_name_value VARCHAR(64),
  IN column_name_value VARCHAR(64),
  IN alter_sql_value TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = table_name_value
      AND COLUMN_NAME = column_name_value
  ) THEN
    SET @alter_sql = alter_sql_value;
    PREPARE stmt FROM @alter_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DELIMITER ;

CALL ensure_contest_column('submissions', 'hashtags', "ALTER TABLE submissions ADD COLUMN hashtags VARCHAR(255) NOT NULL DEFAULT '' AFTER summary");

DROP PROCEDURE IF EXISTS ensure_contest_column;
