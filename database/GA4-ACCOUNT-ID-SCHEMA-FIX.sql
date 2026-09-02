-- RKVeda GA4 production schema compatibility fix
-- Error addressed: Unknown column 'account_id' in 'INSERT INTO' from googleAnalytics4.service.js::saveConnection
-- Run once against the same database used by the API.

SET @db_name = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema=@db_name AND table_name='google_analytics4_connections'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema=@db_name AND table_name='google_analytics4_connections' AND column_name='account_id'
    ),
    'ALTER TABLE google_analytics4_connections ADD COLUMN account_id VARCHAR(255) NULL AFTER project_id',
    'SELECT 1'
  )
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verify after running:
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.columns
WHERE table_schema=DATABASE()
  AND table_name='google_analytics4_connections'
ORDER BY ORDINAL_POSITION;
