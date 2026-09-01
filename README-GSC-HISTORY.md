# GSC Performance History

The GSC module now keeps a project-isolated daily performance cache in `google_search_console_daily_performance`.

## Migration
Run:

```sql
SOURCE database/gsc-performance-cache.sql;
```

The API also creates the table lazily when history is first used.

## Endpoints

- `GET /api/projects/:projectId/gsc/performance?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&dimension=date&dataState=final`
- `POST /api/projects/:projectId/gsc/history/sync?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&dataState=final`
- `GET /api/projects/:projectId/gsc/history?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

All project endpoints require the logged-in user and are scoped to `projectId`.

The normal date performance endpoint automatically upserts daily rows into the cache. Manual Sync History is useful for backfilling a selected period.
