# Google Business Profile OAuth redirect fix

## Why GBP was opening the GSC page

The GBP OAuth client previously fell back to `GOOGLE_REDIRECT_URI`. If that variable points to the GSC callback (`/api/gsc/callback`), Google sends the GBP authorization code to the GSC callback, which then redirects to `/projects/:projectId/gsc`.

GBP now has its own mandatory callback URI.

## Backend `.env`

For local development:

```env
GOOGLE_GBP_REDIRECT_URI=http://localhost:3000/api/gbp/callback
```

For production, use the public backend callback:

```env
GOOGLE_GBP_REDIRECT_URI=https://api.rkveda.in/api/gbp/callback
```

Keep your existing GSC variable separately:

```env
GOOGLE_REDIRECT_URI=http://localhost:3000/api/gsc/callback
```

Do not replace the GSC value with the GBP value.

## Google Cloud Console

In the OAuth client used by RKVeda, add the GBP callback URL under **Authorized redirect URIs**:

```text
http://localhost:3000/api/gbp/callback
```

and/or production:

```text
https://api.rkveda.in/api/gbp/callback
```

The exact URI must match the environment value character-for-character.

## Expected flow

```text
SEO Command Center
   ↓
Google Business Profile
   ↓
/projects/:projectId/gbp
   ↓
GET /api/projects/:projectId/gbp/connect
   ↓
Google OAuth
   ↓
/api/gbp/callback
   ↓
/projects/:projectId/gbp?gbp_connected=1
```

GSC remains isolated:

```text
Google OAuth
   ↓
/api/gsc/callback
   ↓
/projects/:projectId/gsc
```

## DataForSEO

DataForSEO remains disabled as a required dependency. Competitor Intelligence uses the free research-tool workflow and manual observations.
