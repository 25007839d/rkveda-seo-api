# RKVeda GSC fix

## Problems fixed
1. OAuth callback no longer selects `properties[0]`.
2. The Google Search Console property is matched to the current project's `website_url` / domain.
3. If there is no matching property, the user is returned to the correct project's GSC page with an error instead of attaching the wrong website.
4. Successful OAuth redirects back to `/projects/:projectId/gsc` instead of showing raw JSON in the browser.
5. GSC performance endpoint now reads `startDate`, `endDate`, and `dimension` from the frontend.
6. Frontend HTTP requests have a 30-second timeout so an audit/API request cannot leave the UI spinning forever.

## Install
Replace the existing backend `googleSearchConsole.controller.js` with:

`googleSearchConsole.controller.fixed.js`

Rename it to the existing controller filename after backup.

Set:

`FRONTEND_URL=https://seo.rkveda.in`

If your frontend is hosted somewhere else, use that URL.

## Important
The service function `getPerformanceData()` must accept the optional fourth argument `dimension` if you want the Query/Page tables to use different Search Console dimensions.

## Frontend
Use the included `rkveda-seo-frontend` source. It:
- shows only the connected GSC property in the connection card (no duplicate Website/GSC labels),
- displays OAuth callback errors on the GSC page,
- clears callback query parameters after handling them,
- uses a 30-second Axios timeout.
