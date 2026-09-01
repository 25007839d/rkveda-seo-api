# RKVeda GSC Project-Isolation Patch

## What this fixes
- OAuth state now carries both `projectId` and the authenticated `userId`.
- OAuth callback verifies the project belongs to that user.
- Callback never selects the first Google Search Console property.
- The property is matched to the current project's domain/URL.
- GSC connection is saved using the exact OAuth `projectId`.
- Status/performance remain project-scoped.
- Frontend refuses to render a connection whose `project_id` differs from the route project.
- Performance refreshes an expired/near-expiry Google access token when a refresh token exists.

## Before testing
1. Back up the MySQL database.
2. Run `database/gsc-project-fix.sql`.
3. Deploy/restart the backend from this source. The running API must actually contain this controller/service; an old process can continue returning the old project-1 behavior.
4. Build/deploy the frontend from this source.
5. Log in again if needed and test project 4 (`rkveda.in`).

## Expected database result
For project 4:

`project_id = 4`
`property_url = sc-domain:rkveda.in`
`status = connected`

Project 1 should remain:

`project_id = 1`
`property_url = sc-domain:infinityaicloudacademy.com`

## Important
The Google account used for a project must have access to that project's Search Console property. If Google returns no matching property, the app redirects back to the same project with an error instead of attaching another website.
