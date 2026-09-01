-- RKVeda SEO Intelligence v3.1
-- Safe additive migration for backlink opportunities.
-- The backend also auto-creates this table on first opportunity read.

CREATE TABLE IF NOT EXISTS backlink_opportunities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  referring_domain VARCHAR(255) NOT NULL,
  source_url VARCHAR(1000) NULL,
  target_url VARCHAR(1000) NULL,
  anchor_text VARCHAR(500) NULL,
  opportunity_type ENUM('competitor_link','lost_link','resource','guest_post','directory','other') DEFAULT 'competitor_link',
  priority ENUM('low','medium','high','critical') DEFAULT 'medium',
  status ENUM('open','contacted','won','rejected') DEFAULT 'open',
  authority DECIMAL(6,2) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_backlink_opp_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE,
  KEY idx_backlink_opp_project_status (project_id,status),
  KEY idx_backlink_opp_project_priority (project_id,priority)
) ENGINE=InnoDB;
