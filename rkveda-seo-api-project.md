# RKVeda SEO API — Project Documentation

## 1. Project Overview

**Project:** RKVeda SEO API  
**Production API:** https://api.rkveda.in  
**Frontend:** https://seo.rkveda.in  
**Backend repository:** `rkveda-seo-api`

The RKVeda SEO API is the backend for an SEO auditing platform. It manages projects, audits, audit status, audit summaries, detailed audit results, user authentication, and communication with the SEO worker.

The frontend will be maintained in a separate repository.

---

## 2. Production Architecture

```text
seo.rkveda.in
      |
      | HTTPS / JWT
      v
api.rkveda.in
      |
      +---- MySQL: rkveda_seo
      |
      +---- SEO Worker
              |
              +---- Website Crawler
              +---- SEO Analyzer
```

### Audit flow

```text
User
  |
  v
Frontend
  |
  +--> POST create audit
          |
          v
      API creates pending audit
          |
          v
      Worker gets audit
          |
          v
      Worker marks running
          |
          v
      Crawl + analyze website
          |
          v
      Worker sends result to API
          |
          v
      API stores summary + detailed result
          |
          v
      Frontend displays report
```

---

## 3. Technology Stack

### Backend
- Node.js
- Express.js
- JavaScript
- MySQL
- JWT authentication
- Worker-token authentication
- REST API

### Worker
- Node.js
- Website crawler
- SEO analyzer

### Hosting
- Hostinger
- API domain: `api.rkveda.in`
- Frontend domain: `seo.rkveda.in`

---

# 4. Project Structure

```text
rkveda-seo-api/
|
+-- config/
|   +-- database.js
|
+-- controllers/
|   +-- audit.controller.js
|
+-- middleware/
|   +-- auth.middleware.js
|   +-- workerAuth.middleware.js
|
+-- routes/
|   +-- audit.routes.js
|
+-- services/
|   +-- seoAuditService.js
|   +-- seo/
|       +-- audit.service.js
|
+-- worker.js
+-- test-db.js
+-- package.json
+-- .env
```

Additional files can be added as the API grows.

---

# 5. Environment Variables

Current environment configuration:

```env
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=rkveda_seo

JWT_SECRET=RKVeda_SEO_SuperSecret_Key_2026_ChangeThis

WORKER_TOKEN=YOUR_LONG_RANDOM_TOKEN

API_BASE_URL=https://api.rkveda.in
```

## Security

Never commit `.env` to GitHub.

Never expose these to the frontend:

```text
DB_PASSWORD
JWT_SECRET
WORKER_TOKEN
```

Frontend only needs:

```env
VITE_API_BASE_URL=https://api.rkveda.in
```

---

# 6. Authentication

There are two authentication mechanisms.

## 6.1 User JWT Authentication

Header:

```http
Authorization: Bearer <JWT_TOKEN>
```

Middleware:

```text
middleware/auth.middleware.js
```

JWT is verified with:

```javascript
process.env.JWT_SECRET
```

Decoded information is assigned to:

```javascript
req.user
```

The current audit controller uses:

```javascript
req.user.userId
```

---

## 6.2 Worker Authentication

Header:

```http
Authorization: Bearer <WORKER_TOKEN>
```

Middleware:

```text
middleware/workerAuth.middleware.js
```

The middleware compares the supplied token with:

```javascript
process.env.WORKER_TOKEN
```

using `crypto.timingSafeEqual`.

On success:

```javascript
req.worker = true;
```

Worker authentication is separate from user JWT authentication.

---

# 7. API Base URL

Production:

```text
https://api.rkveda.in
```

Example:

```text
https://api.rkveda.in/api/audits/20
```

---

# 8. Audit Routes

Current routes:

```text
POST   /api/projects/:projectId/audits
GET    /api/projects/:projectId/audits

GET    /api/audits/:id
PUT    /api/audits/:id
DELETE /api/audits/:id
```

Worker routes:

```text
GET /api/worker/audits/:id

PUT /api/audits/:id/status

PUT /api/audits/:id/result
```

---

# 9. User APIs

## Create Audit

```http
POST /api/projects/:projectId/audits
```

Authentication:

```text
Bearer JWT
```

Example response:

```json
{
  "success": true,
  "message": "SEO audit queued successfully",
  "audit": {
    "id": 20,
    "project_id": "1",
    "website_url": "https://infinityaicloudacademy.com",
    "score": 0,
    "pages_crawled": 0,
    "issues_count": 0,
    "warnings_count": 0,
    "audit_status": "pending"
  }
}
```

Lifecycle:

```text
pending -> running -> completed
                                           -> failed
```

---

## Get Project Audits

```http
GET /api/projects/:projectId/audits
```

Authentication:

```text
Bearer JWT
```

Returns audits belonging to the project.

---

## Get Single Audit

```http
GET /api/audits/:id
```

Authentication:

```text
Bearer JWT
```

The audit controller verifies the audit belongs to a project owned by the authenticated user.

The detailed response is intended to include:

```text
issues
warnings
passed
pageResults
```

---

## Update Audit

```http
PUT /api/audits/:id
```

Authentication:

```text
Bearer JWT
```

---

## Delete Audit

```http
DELETE /api/audits/:id
```

Authentication:

```text
Bearer JWT
```

---

# 10. Worker APIs

Worker APIs use:

```text
Authorization: Bearer <WORKER_TOKEN>
```

They do not use the normal user JWT.

---

## Get Audit for Worker

```http
GET /api/worker/audits/:id
```

Purpose:

Allows the worker to retrieve the audit and website URL.

Example successful response:

```json
{
  "success": true,
  "audit": {
    "id": 20,
    "project_id": 1,
    "website_url": "https://infinityaicloudacademy.com",
    "score": "75.00",
    "pages_crawled": 2,
    "issues_count": 4,
    "warnings_count": 2,
    "audit_status": "completed",
    "started_at": "2026-08-23T15:41:24.000Z",
    "completed_at": "2026-08-23T15:41:32.000Z",
    "created_at": "2026-08-23T11:48:15.000Z"
  }
}
```

---

## Mark Audit Running

```http
PUT /api/audits/:id/status
```

Example:

```json
{
  "audit_status": "running",
  "started_at": "2026-08-23T12:30:33.505Z"
}
```

---

## Update Audit Result

```http
PUT /api/audits/:id/result
```

Example:

```json
{
  "score": 75,
  "pages_crawled": 2,
  "issues_count": 4,
  "warnings_count": 2,
  "audit_status": "completed",
  "started_at": "2026-08-23T16:18:51.522Z",
  "completed_at": "2026-08-23T16:18:56.308Z",
  "audit_result": {
    "success": true,
    "auditStatus": "completed",
    "score": 75,
    "pagesCrawled": 2,
    "pagesAnalyzed": 2,
    "issuesCount": 4,
    "warningsCount": 2,
    "issues": [],
    "warnings": [],
    "passed": [],
    "pageResults": []
  }
}
```

The API stores summary values in `seo_audits` and detailed data in `seo_audit_results`.

---

# 11. Audit Result Structure

The worker generates a result similar to:

```json
{
  "success": true,
  "auditStatus": "completed",
  "startedAt": "...",
  "completedAt": "...",
  "score": 75,
  "pagesCrawled": 2,
  "pagesAnalyzed": 2,
  "pagesOk": 1,
  "pagesFailed": 0,
  "pagesNotFound": 1,
  "issuesCount": 4,
  "warningsCount": 2,
  "passedCount": 8,
  "issues": [],
  "warnings": [],
  "passed": [],
  "pageResults": [],
  "crawlTime": 4674
}
```

---

# 12. SEO Checks Currently Implemented

## Passed

```text
HTTP_OK
TITLE_PRESENT
META_DESCRIPTION_PRESENT
H1_PRESENT
CANONICAL_PRESENT
ROBOTS_PRESENT
CONTENT_LENGTH_OK
IMAGE_ALT_OK
PAGE_SPEED_OK
```

## Issues

```text
DUPLICATE_TITLE
DUPLICATE_META_DESCRIPTION
HTTP_ERROR
PAGE_NOT_FOUND
```

## Warnings

```text
TITLE_TOO_LONG
MODERATE_PAGE_SPEED
```

---

# 13. Verified Audit Example

Website:

```text
https://infinityaicloudacademy.com
```

A successful worker execution produced:

```text
Score: 75
Pages: 2
Issues: 4
Warnings: 2
Status: completed
```

The crawler detected:

```text
https://infinityaicloudacademy.com/courses
```

as:

```text
HTTP 404
```

The homepage also produced duplicate title and duplicate meta-description findings.

---

# 14. Worker Architecture

Entry point:

```text
worker.js
```

Environment:

```env
AUDIT_ID=20
```

Run:

```powershell
node worker.js
```

Execution:

```text
worker.js
   |
   +--> processAudit(auditId)
          |
          +--> GET /api/worker/audits/:id
          |
          +--> PUT /api/audits/:id/status
          |
          +--> runAudit(project, 20)
          |
          +--> crawl website
          |
          +--> analyze pages
          |
          +--> PUT /api/audits/:id/result
```

---

# 15. SEO Audit Service

File:

```text
services/seoAuditService.js
```

Main function:

```javascript
processAudit(auditId)
```

Responsibilities:

1. Get audit from API
2. Read website URL
3. Mark audit as running
4. Create project object
5. Run crawler/analyzer
6. Handle failure
7. Send successful result to API
8. Return worker result

---

# 16. SEO Audit Engine

File:

```text
services/seo/audit.service.js
```

Main function:

```javascript
runAudit(project, maxPages)
```

Current worker call:

```javascript
runAudit(project, 20)
```

The engine has been tested successfully against the production API.

---

# 17. Database

Database:

```text
rkveda_seo
```

Known tables:

```text
seo_projects
seo_audits
seo_audit_results
```

## seo_projects

Associates websites/projects with users.

Known relationship:

```text
seo_projects.user_id
```

---

## seo_audits

Stores audit summary:

```text
id
project_id
score
pages_crawled
issues_count
warnings_count
audit_status
started_at
completed_at
created_at
```

Relationship:

```text
seo_audits.project_id
        |
        v
seo_projects.id
```

---

## seo_audit_results

Stores detailed result:

```text
audit_id
issues
warnings
passed
page_results
updated_at
```

The arrays are stored as JSON.

Relationship:

```text
seo_audit_results.audit_id
        |
        v
seo_audits.id
```

---

# 18. Audit Status

Current workflow:

```text
pending
   |
   v
running
   |
   +----> completed
   |
   +----> failed
```

---

# 19. Error Responses

Standard:

```json
{
  "success": false,
  "message": "Internal server error"
}
```

User authentication:

```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```

Worker authentication:

```json
{
  "success": false,
  "message": "Invalid worker token"
}
```

Not found:

```json
{
  "success": false,
  "message": "Audit not found"
}
```

---

# 20. Frontend Integration

Frontend repository:

```text
rkveda-seo-frontend
```

Production domain:

```text
https://seo.rkveda.in
```

Frontend environment:

```env
VITE_API_BASE_URL=https://api.rkveda.in
```

Example:

```javascript
const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL;

fetch(`${API_BASE_URL}/api/audits/20`, {
    headers: {
        Authorization: `Bearer ${token}`
    }
});
```

The frontend must never contain:

```text
WORKER_TOKEN
JWT_SECRET
DB_PASSWORD
```

---

# 21. Deployment

```text
GitHub
|
+-- rkveda-seo-api
|      |
|      +-- Hostinger
|             |
|             +-- api.rkveda.in
|
+-- rkveda-seo-frontend
       |
       +-- seo.rkveda.in
```

Frontend and backend are intentionally separate repositories.

---

# 22. Security Rules

1. Never commit `.env`.
2. Use JWT for user APIs.
3. Use Worker Token only for worker APIs.
4. Never expose Worker Token to React.
5. Never expose DB credentials to React.
6. Never expose JWT secret to React.
7. Verify project ownership for user audit access.
8. Keep worker endpoints restricted to the worker token.
9. Use HTTPS in production.
10. Keep production secrets in server/deployment environment variables.

---

# 23. Current Verified Production Flow

Successfully tested:

```text
Create audit
    |
    v
Audit ID 20
    |
    v
GET worker audit -> 200
    |
    v
Mark running
    |
    v
Crawl website
    |
    v
Analyze pages
    |
    v
Generate score
    |
    v
Update audit result -> successful
    |
    v
Audit completed
```

Example:

```text
Audit ID: 20
Score: 75
Pages: 2
Issues: 4
Warnings: 2
Status: completed
```

---

# 24. Current Backend Limitation / Next Task

The audit summary is working.

Detailed results are stored in:

```text
seo_audit_results
```

The user-facing:

```text
GET /api/audits/:id
```

needs to return the stored detailed result consistently:

```text
issues
warnings
passed
pageResults
```

This should be finalized before the frontend report screen is completed.

---

# 25. Planned Frontend

Repository:

```text
rkveda-seo-frontend
```

Planned pages:

```text
/login
/dashboard
/projects
/projects/:id
/audits/:id
```

Main dashboard:

```text
Projects
SEO Score
Audits
Issues
Warnings
Passed Checks
Pages Crawled
Audit Status
Audit History
Detailed Page Results
```

---

# 26. Future SEO Features

Potential additions:

```text
Broken links
HTTPS check
robots.txt
XML sitemap
Open Graph
Twitter/X cards
Schema / JSON-LD
H1/H2 structure
Internal links
External links
Image size
Image format
Image dimensions
Noindex detection
Canonical validation
Redirect detection
Response headers
Core Web Vitals
Mobile checks
Structured-data validation
```

These should be added incrementally after the current API/frontend foundation is stable.

---

# 27. Architecture Decision — LOCKED

```text
rkveda-seo-api
    =
Backend API + SEO Worker

rkveda-seo-frontend
    =
Frontend UI

api.rkveda.in
    =
Backend API

seo.rkveda.in
    =
Frontend
```

Backend and frontend remain separate repositories.

---

# 28. Recommended Build Order

```text
Backend API
    |
    v
Worker
    |
    v
Database result storage
    |
    v
Detailed result API
    |
    v
Frontend
    |
    v
Frontend/API integration
    |
    v
Production deployment
    |
    v
SEO dashboard
    |
    v
Advanced SEO checks
```

---

## Document Status

**Status:** Backend API + Worker architecture established and tested.

**Next backend task:** finalize detailed audit-result retrieval.

**Next frontend task:** create separate `rkveda-seo-frontend` repository and connect it to `https://api.rkveda.in`.

| Module                     | API needed                               | Current |
| -------------------------- | ---------------------------------------- | ------- |
| 🔐 Authentication          | Register/Login/Profile                   | ✅       |
| 🌐 Projects/Websites       | CRUD projects                            | ✅       |
| 🔍 Technical SEO           | Audit/Crawler/Issues                     | ✅       |
| 📊 SEO Dashboard           | Summary/KPIs                             | ❌       |
| 🔎 Google Search Console   | Search/query/page data                   | ❌       |
| 📈 Google Analytics        | Traffic/conversions                      | ❌       |
| 📍 Google Business Profile | GBP/reviews/photos/posts                 | ❌       |
| 📱 Social Media            | Instagram/Facebook/YouTube/LinkedIn etc. | ❌       |
| 🤖 AI SEO                  | AI recommendations/content               | ❌       |
| 📝 Content/Keywords        | Keywords/content planning                | ❌       |
| 🔗 Backlinks               | Backlink monitoring                      | ❌       |
| 📑 Reporting               | SEO reports/PDF/email                    | ❌       |
[]()
| #  | Module                      | Status      |
| -- | --------------------------- | ----------- |
| 1  | Authentication              | ✅           |
| 2  | Projects/Websites           | ✅           |
| 3  | Technical SEO / Audit       | ✅           |
| 4  | Google Search Console       | ⏭️ **Next** |
| 5  | Google Analytics            | 🔜          |
| 6  | Google Business Profile     | 🔜          |
| 7  | Social Media                | 🔜          |
| 8  | Keywords & Content          | 🔜          |
| 9  | Backlinks                   | 🔜          |
| 10 | AI SEO                      | 🔜          |
| 11 | Reporting/PDF               | 🔜          |
| 12 | **Final Unified Dashboard** | 🏁 **Last** |
