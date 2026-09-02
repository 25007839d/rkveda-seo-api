-- RKVeda GA4 Intelligence v1
ALTER TABLE ga4_connections
  ADD COLUMN IF NOT EXISTS account_id VARCHAR(255) NULL AFTER property_name,
  ADD COLUMN IF NOT EXISTS account_name VARCHAR(255) NULL AFTER account_id;

CREATE TABLE IF NOT EXISTS ga4_daily_metrics (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  property_id VARCHAR(100) NOT NULL,
  metric_date DATE NOT NULL,
  active_users BIGINT UNSIGNED DEFAULT 0,
  sessions BIGINT UNSIGNED DEFAULT 0,
  engaged_sessions BIGINT UNSIGNED DEFAULT 0,
  engagement_rate DECIMAL(12,6) DEFAULT 0,
  bounce_rate DECIMAL(12,6) DEFAULT 0,
  screen_page_views BIGINT UNSIGNED DEFAULT 0,
  event_count BIGINT UNSIGNED DEFAULT 0,
  key_events DECIMAL(20,6) DEFAULT 0,
  total_revenue DECIMAL(20,6) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ga4_daily_project_date (project_id, metric_date),
  KEY idx_ga4_daily_project_date (project_id, metric_date),
  CONSTRAINT fk_ga4_daily_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
);
