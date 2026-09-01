# RKVeda GSC History – Production Fix

## Fixes included

1. **History sync no longer sends JSON `null`** from the frontend. It sends `{}` so Express JSON parsing cannot fail on the request body.
2. **`syncPerformanceHistory` is exported by the backend service.** This fixes the runtime `syncPerformanceHistory is not a function` error in the controller.
3. **Backward-compatible frontend alias** is included for `syncPerformanceHistory`, while the current page uses `syncGscHistory`.
4. **Backend JSON parsing accepts legacy JSON primitives** (`strict: false`) so an older frontend posting `null` does not fail at the body-parser layer.
5. Project-scoped authorization and GSC property matching remain enforced.
6. History sync caps final-data requests at yesterday and treats an empty Search Console result as a successful zero-day sync.

## Deployment

### Backend

Deploy the contents of this project without `node_modules` and keep the existing production `.env` values.

Required environment variables include:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `JWT_SECRET`
- Database variables used by `config/database.js`
- `FRONTEND_URL` (recommended, e.g. `https://seo.rkveda.in`)

Install dependencies on the server:

```bash
npm ci --omit=dev
npm start
```

### Frontend

Set:

```env
VITE_API_BASE_URL=https://api.rkveda.in/api
```

Then:

```bash
npm ci
npm run build
```

Deploy the generated `dist/` directory.

## Database

Run `database/gsc-performance-cache.sql` once against the production database if the daily cache table does not already exist.

The application also creates the table lazily, but running the migration explicitly is recommended for production.

## Smoke test

1. Open a project that is already connected to its correct GSC property.
2. Open `/projects/<projectId>/gsc`.
3. Confirm the property shown belongs to the same project.
4. Click **Sync History**.
5. Browser Network request should be:
   `POST /api/projects/<projectId>/gsc/history/sync`
   with JSON body `{}` and query parameters `startDate`, `endDate`, and `dataState=final`.
6. Expected response is HTTP 200 with `success: true` and `savedDays` (possibly `0` when Google has no data yet).
7. Confirm there is no `syncPerformanceHistory is not a function` error in the API logs.
