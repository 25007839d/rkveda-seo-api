-- RKVeda SEO Intelligence v3.7 - DataForSEO provider integration
-- Credentials are NOT stored in MySQL. Configure them as backend environment variables.

CREATE TABLE IF NOT EXISTS competitor_data_syncs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  competitor_id BIGINT UNSIGNED NULL,
  provider VARCHAR(50) NOT NULL,
  sync_type ENUM('keywords','backlinks','all') NOT NULL,
  status ENUM('running','success','failed') NOT NULL,
  items_synced INT DEFAULT 0,
  api_cost DECIMAL(12,6) DEFAULT 0,
  message VARCHAR(1000) NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  INDEX idx_comp_sync_project (project_id, started_at),
  INDEX idx_comp_sync_competitor (competitor_id, started_at)
) ENGINE=InnoDB;

-- Allows the same keyword to exist once per competitor per data source.
-- Existing installations are migrated lazily by competitor.controller.js.
ALTER TABLE competitor_keywords DROP INDEX uq_competitor_keyword;
ALTER TABLE competitor_keywords ADD UNIQUE KEY uq_competitor_keyword_source (competitor_id, keyword, source);
