-- RKVeda SEO Intelligence v3.2
-- Competitor Intelligence bootstrap/fix.
-- Safe/idempotent: creates only missing additive intelligence tables.

CREATE TABLE IF NOT EXISTS competitor_keywords (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  competitor_id BIGINT UNSIGNED NOT NULL,
  keyword VARCHAR(255) NOT NULL,
  ranking_position DECIMAL(8,2) NULL,
  search_volume INT NULL,
  ranking_url VARCHAR(1000) NULL,
  traffic_estimate INT NULL,
  difficulty DECIMAL(6,2) NULL,
  source VARCHAR(50) DEFAULT 'manual',
  checked_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_comp_keyword_competitor
    FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
  UNIQUE KEY uq_competitor_keyword (competitor_id,keyword),
  KEY idx_comp_keyword_position (competitor_id,ranking_position)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS competitor_backlinks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  competitor_id BIGINT UNSIGNED NOT NULL,
  source_url VARCHAR(1000) NOT NULL,
  target_url VARCHAR(1000) NULL,
  anchor_text VARCHAR(500) NULL,
  domain_authority DECIMAL(6,2) NULL,
  status ENUM('active','lost','new') DEFAULT 'active',
  first_seen_at DATETIME NULL,
  last_seen_at DATETIME NULL,
  source VARCHAR(50) DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_comp_backlink_competitor
    FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
  KEY idx_comp_backlink_status (competitor_id,status)
) ENGINE=InnoDB;

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
  CONSTRAINT fk_backlink_opp_project
    FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE,
  KEY idx_backlink_opp_project_status (project_id,status),
  KEY idx_backlink_opp_project_priority (project_id,priority)
) ENGINE=InnoDB;
