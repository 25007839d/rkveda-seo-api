CREATE TABLE IF NOT EXISTS google_analytics_connections (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  account_id VARCHAR(100) NULL,
  account_name VARCHAR(255) NULL,
  property_id VARCHAR(100) NULL,
  property_name VARCHAR(255) NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NULL,
  token_expiry DATETIME NULL,
  status ENUM('pending','connected','error','disconnected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ga4_project (project_id),
  KEY idx_ga4_property (property_id),
  CONSTRAINT fk_ga4_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;
