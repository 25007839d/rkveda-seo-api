# GSC production build

This build keeps the project-isolated OAuth flow and upgrades the Search Console performance module.

## Backend

Updated:
- `controllers/googleSearchConsole.controller.js`
- `services/googleSearchConsole.service.js`

Features:
- Project/user-scoped connection and OAuth state.
- Exact project-to-GSC property matching.
- Performance date validation.
- Dimensions: date, query, page, country, device, searchAppearance.
- Search types: web, image, video, news, discover, googleNews.
- Final vs all available data state.
- Optional dimension filters.
- Correct aggregate KPI summary (clicks, impressions, CTR, average position).
- Access-token refresh using the stored refresh token.
- Better 400/401/403/429 error messages.

## Frontend

Updated:
- `src/pages/GoogleSearchConsole.jsx`
- `src/index.css`

Features:
- 7/28/30/90 day and custom date ranges.
- Search type selector.
- Final/all data selector.
- KPI cards backed by the aggregate API summary.
- Daily clicks + impressions chart.
- Query, page, country, device and search-appearance breakdown tabs.
- Client-side table filtering.
- CSV export for the active breakdown.
- Existing project-isolation safety check retained.

## Environment

Do not commit `.env`. Use `.env.example` as the template.

For local development:
- Backend `FRONTEND_URL=http://localhost:5173`
- Frontend `VITE_API_BASE_URL=http://localhost:3000/api`

For production, set the real frontend/API URLs and ensure the Google OAuth redirect URI exactly matches the URI configured in Google Cloud.

## Database

No new table is required for this GSC performance build. The existing `google_search_console_connections` project-level unique key remains required.
