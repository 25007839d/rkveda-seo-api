-- RKVeda Unified SEO Platform foundation
-- Run against the existing RKVeda database.

CREATE TABLE IF NOT EXISTS ga4_connections (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  property_id VARCHAR(100) NULL,
  property_name VARCHAR(255) NULL,
  access_token TEXT NULL,
  refresh_token TEXT NULL,
  token_expiry DATETIME NULL,
  status ENUM('connected','disconnected','error') NOT NULL DEFAULT 'connected',
  last_synced_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ga4_project (project_id),
  CONSTRAINT fk_ga4_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gbp_connections (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  account_id VARCHAR(255) NULL,
  location_id VARCHAR(255) NULL,
  location_name VARCHAR(255) NULL,
  access_token TEXT NULL,
  refresh_token TEXT NULL,
  token_expiry DATETIME NULL,
  status ENUM('connected','disconnected','error') NOT NULL DEFAULT 'connected',
  last_synced_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gbp_project (project_id),
  CONSTRAINT fk_gbp_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_connections (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  platform ENUM('facebook','instagram','linkedin','youtube','x','tiktok','other') NOT NULL,
  account_id VARCHAR(255) NULL,
  account_name VARCHAR(255) NULL,
  access_token TEXT NULL,
  refresh_token TEXT NULL,
  token_expiry DATETIME NULL,
  status ENUM('connected','disconnected','error') NOT NULL DEFAULT 'connected',
  last_synced_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_social_project_platform (project_id, platform),
  CONSTRAINT fk_social_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS content_plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  keyword_id BIGINT UNSIGNED NULL,
  title VARCHAR(500) NOT NULL,
  search_intent ENUM('informational','commercial','transactional','navigational','local','unknown') DEFAULT 'unknown',
  target_url VARCHAR(1000) NULL,
  status ENUM('idea','planned','draft','published','archived') DEFAULT 'idea',
  priority ENUM('low','medium','high','critical') DEFAULT 'medium',
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_content_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_content_keyword FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE SET NULL,
  KEY idx_content_project_status (project_id,status)
);

CREATE TABLE IF NOT EXISTS seo_ai_recommendations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  source_type ENUM('gsc','ga4','technical','keyword','content','backlink','local','social','competitor','manual') NOT NULL,
  category VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  recommendation TEXT NOT NULL,
  priority ENUM('low','medium','high','critical') DEFAULT 'medium',
  status ENUM('open','in_progress','done','dismissed') DEFAULT 'open',
  evidence_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE,
  KEY idx_ai_project_status (project_id,status,priority)
);

CREATE TABLE IF NOT EXISTS seo_reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  report_name VARCHAR(255) NOT NULL,
  report_type ENUM('overview','monthly','audit','custom') DEFAULT 'overview',
  date_from DATE NULL,
  date_to DATE NULL,
  status ENUM('queued','generating','completed','failed') DEFAULT 'queued',
  file_path VARCHAR(1000) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_report_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE,
  KEY idx_report_project_created (project_id,created_at)
);
