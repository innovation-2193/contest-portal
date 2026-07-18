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
