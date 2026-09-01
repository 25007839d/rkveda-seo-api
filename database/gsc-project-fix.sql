-- RKVeda GSC project-isolation cleanup
-- Run after taking a DB backup.
-- This removes only connections whose property host does not match the project's domain.

DELETE c
FROM google_search_console_connections c
JOIN seo_projects p ON p.id = c.project_id
WHERE LOWER(
        REPLACE(
          REPLACE(c.property_url, 'sc-domain:', ''),
          'www.', ''
        )
      ) <> LOWER(REPLACE(p.domain, 'www.', ''))
  AND c.property_url IS NOT NULL;

-- Ensure each project can have at most one GSC connection.
SET @idx_exists := (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'google_search_console_connections'
      AND index_name = 'uq_gsc_project'
);

SET @sql := IF(
    @idx_exists = 0,
    'ALTER TABLE google_search_console_connections ADD UNIQUE KEY uq_gsc_project (project_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
