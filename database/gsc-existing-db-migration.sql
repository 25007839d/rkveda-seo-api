-- RKVeda GSC existing-database migration
-- Run this once on the EXISTING Hostinger MySQL database.

-- 1) Keep only the newest GSC connection for each project.
DELETE c1
FROM google_search_console_connections c1
JOIN google_search_console_connections c2
  ON c1.project_id = c2.project_id
 AND c1.id < c2.id;

-- 2) Prevent a project from ever having two GSC connections.
-- Add the unique index only when it does not already exist.
SET @gsc_index_exists := (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'google_search_console_connections'
      AND index_name = 'uq_gsc_project'
);

SET @gsc_alter_sql := IF(
    @gsc_index_exists = 0,
    'ALTER TABLE google_search_console_connections ADD UNIQUE KEY uq_gsc_project (project_id)',
    'SELECT 1'
);

PREPARE gsc_stmt FROM @gsc_alter_sql;
EXECUTE gsc_stmt;
DEALLOCATE PREPARE gsc_stmt;

-- 3) Project #1 is Infinity AI Cloud Academy in the current setup.
-- Remove its stale Amazon connection. The next OAuth flow will select
-- sc-domain:infinityaicloudacademy.com based on the project website.
DELETE FROM google_search_console_connections
WHERE project_id = 1;
