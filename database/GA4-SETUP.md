# RKVeda GA4 Production Setup

## 1. Google Cloud APIs
Enable these APIs in the same Google Cloud project used by the OAuth client:
- Google Analytics Admin API
- Google Analytics Data API

## 2. OAuth redirect URI
Keep the existing GSC redirect URI unchanged. Add a second authorized redirect URI for GA4:

Local:
`http://localhost:3000/api/ga4/callback`

Production:
`https://api.rkveda.in/api/ga4/callback`

Set:
`GOOGLE_GA4_REDIRECT_URI=https://api.rkveda.in/api/ga4/callback`

The backend falls back to `GOOGLE_REDIRECT_URI` only if `GOOGLE_GA4_REDIRECT_URI` is not set.

## 3. Environment variables
```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_GA4_REDIRECT_URI=https://api.rkveda.in/api/ga4/callback
FRONTEND_URL=https://seo.rkveda.in
JWT_SECRET=...
```

## 4. Database
Run `GA4-ACCOUNT-ID-SCHEMA-FIX.sql` once. The backend also self-heals the canonical `ga4_connections` table at runtime, so an existing foundation installation is upgraded automatically.

Do not use `google_analytics4_connections`; RKVeda's canonical table is `ga4_connections`.

## 5. Connection flow
1. Project user opens SEO Command Center → Google Analytics 4.
2. Backend creates a signed, project-scoped Google OAuth state.
3. Google returns to `/api/ga4/callback`.
4. Tokens are stored only against that project.
5. RKVeda lists the Google account's accessible GA4 properties.
6. User selects the property if an exact project match cannot be inferred.
7. Reports use the selected property and automatically refresh the OAuth access token when needed.

## 6. Required Google access
The Google account must have access to the GA4 property. RKVeda requests read-only Analytics access.
