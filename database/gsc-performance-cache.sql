-- RKVeda GSC daily performance cache / history
CREATE TABLE IF NOT EXISTS google_search_console_daily_performance (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    property_url VARCHAR(500) NOT NULL,
    report_date DATE NOT NULL,
    clicks BIGINT UNSIGNED NOT NULL DEFAULT 0,
    impressions BIGINT UNSIGNED NOT NULL DEFAULT 0,
    ctr DECIMAL(12,8) NOT NULL DEFAULT 0,
    position DECIMAL(12,4) NOT NULL DEFAULT 0,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gsc_daily_project FOREIGN KEY (project_id)
        REFERENCES seo_projects(id) ON DELETE CASCADE,
    UNIQUE KEY uq_gsc_daily_project_date (project_id, report_date),
    KEY idx_gsc_daily_project_date (project_id, report_date)
);
