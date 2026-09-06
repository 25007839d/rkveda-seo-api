-- RKVeda social publishing migration v4.4
-- Safe additive migration. Existing analytics/fetching tables are preserved.
-- The application also creates these tables automatically at runtime.

CREATE TABLE IF NOT EXISTS social_publish_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  caption TEXT NULL,
  link_url VARCHAR(2000) NULL,
  media_url VARCHAR(2000) NULL,
  media_type ENUM('none','image','video') NOT NULL DEFAULT 'none',
  scheduled_at DATETIME NULL,
  status ENUM('draft','scheduled','publishing','published','partial','failed','cancelled') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  published_at DATETIME NULL,
  error_message TEXT NULL,
  KEY idx_publish_jobs_due(status,scheduled_at),
  KEY idx_publish_jobs_project(project_id),
  CONSTRAINT fk_publish_jobs_project FOREIGN KEY(project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS social_publish_targets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id BIGINT UNSIGNED NOT NULL,
  platform ENUM('facebook','instagram','gbp') NOT NULL,
  location_id VARCHAR(255) NULL,
  status ENUM('pending','publishing','published','failed','cancelled') NOT NULL DEFAULT 'pending',
  external_id VARCHAR(1000) NULL,
  external_url VARCHAR(2000) NULL,
  error_message TEXT NULL,
  published_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_publish_target(job_id,platform,location_id),
  KEY idx_publish_targets_job(job_id),
  CONSTRAINT fk_publish_target_job FOREIGN KEY(job_id) REFERENCES social_publish_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB;
