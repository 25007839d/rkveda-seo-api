-- Run this against the EXISTING RKVeda database before testing GSC again.
-- It is safe to run the CREATE TABLE statement when the table already exists.

CREATE TABLE IF NOT EXISTS google_search_console_connections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    google_email VARCHAR(255) NULL,
    google_account_id VARCHAR(255) NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NULL,
    token_expiry DATETIME NULL,
    property_url VARCHAR(500) NOT NULL,
    status ENUM('connected', 'disconnected', 'error') DEFAULT 'connected',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_gsc_project (project_id)
);

-- IMPORTANT: after confirming the column names above, remove any stale/wrong
-- connection for project 1 before reconnecting it to Infinity AI Cloud Academy.
-- This avoids Amazon being reused by the old connection.
-- DELETE FROM google_search_console_connections WHERE project_id = 1;
