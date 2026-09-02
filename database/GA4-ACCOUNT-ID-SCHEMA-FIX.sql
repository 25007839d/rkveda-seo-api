-- RKVeda GA4 production schema (idempotent)
-- Canonical table name: ga4_connections.
-- Run against the same database used by the API.

CREATE TABLE IF NOT EXISTS ga4_connections (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  account_id VARCHAR(255) NULL,
  property_id VARCHAR(100) NULL,
  property_name VARCHAR(255) NULL,
  google_email VARCHAR(255) NULL,
  access_token TEXT NULL,
  refresh_token TEXT NULL,
  token_expiry DATETIME NULL,
  status ENUM('connected','needs_property','disconnected','error') NOT NULL DEFAULT 'connected',
  last_synced_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ga4_project (project_id),
  KEY idx_ga4_project_status (project_id, status)
);

-- Compatibility for an existing ga4_connections table.
SET @db_name = DATABASE();
SET @sql = (SELECT IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=@db_name AND table_name='ga4_connections' AND column_name='account_id'), 'ALTER TABLE ga4_connections ADD COLUMN account_id VARCHAR(255) NULL AFTER project_id', 'SELECT 1')); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = (SELECT IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=@db_name AND table_name='ga4_connections' AND column_name='google_email'), 'ALTER TABLE ga4_connections ADD COLUMN google_email VARCHAR(255) NULL AFTER property_name', 'SELECT 1')); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = (SELECT IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=@db_name AND table_name='ga4_connections' AND column_name='last_synced_at'), 'ALTER TABLE ga4_connections ADD COLUMN last_synced_at DATETIME NULL AFTER status', 'SELECT 1')); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.columns
WHERE table_schema=DATABASE() AND table_name='ga4_connections'
ORDER BY ORDINAL_POSITION;
