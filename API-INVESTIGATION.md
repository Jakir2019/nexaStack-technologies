# NOT_FOUND investigation — 2026-11-11

## A. Executive summary

The reported JSON is Express's intentional unmatched-method/path response. Local HTTP tests reproduce it exactly for GET `/`, `/api/v1`, `/api/v1/health`, `/auth/session`, a duplicated API prefix, unknown routes, and GET `/api/v1/auth/login` (login requires POST). None of these requests establishes an application defect.

The original failing production request/action has not been supplied. Production probes were blocked by this execution environment; the web-fetch fallback also could not access the API. Therefore this report does **not** establish a production outage, DNS failure, stale deployment, or a production fix. No application route was changed merely to suppress 404s.

## B. Root cause and request lifecycle

Confirmed source of the exact message: `apps/api/src/middleware/notFound.ts:7`. `apps/api/src/lib/errors.ts:37` assigns HTTP 404 / NOT_FOUND. `apps/api/src/app.ts:67` mounts routes before the fallback and global error handler. `apps/api/src/routes/index.ts:37` mounts health at `/health`; line 38 mounts business routers at `/api/v1`. Neither `/` nor the version-prefix root has a GET handler.

`apps/api/src/index.ts:14` listens on the validated platform PORT without a localhost-only binding. Database connection retries start separately, so liveness can be 200 while readiness is 503. Readiness checks both connection state and a ping (`services/health.service.ts:25`). Missing MongoDB does not produce the quoted unmatched-endpoint message.

Admin browser request: Netlify page → `lib/adminApi.ts:17` → configured API origin + explicit `/api/v1/...` → DNS/TLS/Render → Helmet → CORS → cookies → request logger → JSON parser → router → rate limit/session/permission/CSRF/validation as applicable → controller → service → MongoDB → response envelope. Route-specific ordering is retained. DNS/TLS/proxy/hosting state could not be inspected remotely.

Admin SSR: Netlify Next server → `lib/adminSession.server.ts:28`, `lib/adminForward.server.ts:25`, or `lib/adminDashboard.server.ts:21` → same API origin, incoming cookie forwarded, no-store fetch. Browser credentials are included by the client helpers. CORS restricts origins and permits the required CSRF header (`apps/api/src/app.ts:19`). CSRF separately verifies Origin and `X-Requested-With` (`middleware/csrf.ts`). No security controls were relaxed.

Public forms follow a different path: browser → same-origin Next Route Handler on Netlify → server-side validation/Turnstile → MongoDB (and Cloudinary for files). They do not traverse Render. Public blog reads MongoDB directly through `apps/web/lib/blog.ts`. Next page `notFound()` calls render missing-page behavior; they do not generate the quoted Express message.

Other NOT_FOUND producers indicate missing records, with different messages: `services/blogPost.service.ts:161,233,308,329`; `blogCategory.service.ts:80,114`; `adminUsers.service.ts:87,146,254`; `adminEnquiries.service.ts:104,169,201`; `adminQuotations.service.ts:209,274,305,368,371,382`; `adminMedia.service.ts:154,229,299,399,425` (all under `apps/api/src`). The shared error-code constant is a definition, not a response producer. No Axios client/baseURL implementation was found.

## C. Changes implemented

| File | Previous gap | Change | Reason |
| --- | --- | --- | --- |
| `apps/api/src/routes/routing.http.test.ts` | Exact reported routing cases lacked database-independent HTTP coverage | Added 17 real-Express HTTP tests | Preserve root/prefix/method 404s, readiness failure, login validation, authentication gates and CORS preflight |
| `API-INVESTIGATION.md` | No task-specific evidence/runbook | Added this report and inventory | Make expected behavior and remaining production checks reproducible |

Pre-existing working-tree changes in `apps/web/lib/env.ts` and untracked `apps/web/lib/env.test.ts` were preserved, not authored by this investigation. They already validate an origin-only API URL and test prefix construction. Their presence locally does not prove they are committed or deployed.

## D. API verification

Local tests use an ephemeral loopback port and no database connection unless run by the isolated integration harness.

| Endpoint | Method | Expected | Actual local | Diagnosis |
| --- | --- | --- | --- | --- |
| `/health` | GET | 200 | 200 | Liveness works without DB |
| `/health/ready` | GET | 503 without DB; 200 with DB | 503 in routing suite; 200 in integration suite | Readiness works in both states |
| `/` | GET | 404 NOT_FOUND | 404, exact reported JSON | No root route by design |
| `/api/v1` | GET | 404 NOT_FOUND | 404, exact JSON | Router prefix is not an endpoint |
| `/api/v1/health` | GET | 404 NOT_FOUND | 404, exact JSON | Health is unversioned |
| `/api/v1/api/v1/auth/session` | GET | 404 NOT_FOUND | 404, exact JSON | Duplicated prefix |
| `/auth/session` | GET | 404 NOT_FOUND | 404, exact JSON | Missing prefix |
| `/api/v1/no-such-route` | GET | 404 NOT_FOUND | 404, exact JSON | Fallback preserved |
| `/api/v1/auth/login` | GET | 404 NOT_FOUND | 404, exact JSON | Wrong method |
| `/api/v1/auth/login`, empty body with valid local CSRF headers | POST | 400 VALIDATION_ERROR | 400 | Correct route reaches validation; no login/DB write |
| `/api/v1/auth/session` | GET | 401 without cookie | 401 | Session guard preserved |
| `/api/v1/admin/{dashboard/stats,enquiries,quotations,blog/posts,media,users}` | GET | 401 without cookie | 401 each | Guard preserved; 401 alone does not prove downstream controller execution |
| `/api/v1/auth/login`, allowed-origin preflight | OPTIONS | 204 | 204, credentialed allow-origin/header | Local browser preflight works |

Production GET probes attempted on **both** `https://api.nexastacktechnologies.com` and `https://nexastack-api-t4bm.onrender.com`: `/health`, `/health/ready`, `/`, `/api/v1`, `/api/v1/health`, `/api/v1/auth/session`. **Actual HTTP status: unavailable for every request** (socket access forbidden locally). Expected statuses are as above, with readiness 200 only if the deployed DB is usable. No production submissions, login attempts, emails, uploads, cleanup calls or record modifications were performed.

## E. Frontend integration and endpoint inventory

The current frontend expects an **origin only**, with no `/api/v1` suffix (`apps/web/lib/env.ts:36`). Every admin caller supplies the versioned path. The user-provided custom API origin is structurally correct for this code, but actual Netlify settings and compiled bundles are unverified. No private environment files or deployed secret values were printed. Both SSR and browser clients use the same public API-origin variable; private database/provider settings stay server-side.

All paths below are relative to their stated host. JSON success uses `{success:true,data:...}`; failures use `{success:false,error:...}`. Admin JSON/form request helpers report error envelopes or safe network/malformed-response errors; SSR reads preserve HTTP status, while dashboard/session helpers return null on failure. Detail pages use Next `notFound()` for missing records. Public forms display validation/server/network failures. Exports/downloads return files on success. Logout currently redirects even if its request fails; that is separate from this routing report.

| Feature / frontend source | Methods and paths | Access / expected success |
| --- | --- | --- |
| `components/sections/ContactForm.tsx:101` | Web POST `/api/contact` | Public, schema/Turnstile/rate limit; 201 received |
| `components/sections/QuotationWizard.tsx:197` | Web POST `/api/quotation` | Public, Origin/nonce/schema/Turnstile; 201 reference |
| `QuotationAttachments.tsx:34,59`, `lib/quotationUpload.ts:43`, `ui/FileUploadField.tsx:156` | Web POST `/api/quotation/upload`, POST `/api/quotation/upload/authorize`, POST/DELETE `/api/quotation/upload/session` | Upload-session ownership, limits and validation; JSON file/session data |
| `netlify/functions/quotation-cleanup.mjs:9` | Web POST `/api/quotation/upload/cleanup` | Scheduled server-only bearer authorization; never a browser/admin endpoint |
| `LoginForm.tsx:51`, `LogoutButton.tsx:16`, `ChangePasswordForm.tsx:60`, `ForgotPasswordForm.tsx:45`, `ResetPasswordForm.tsx:44` under `components/admin` | API POST `/api/v1/auth/{login,logout,change-password,password-reset/request,password-reset/confirm}` | CSRF for all; session for logout/change; validation/rate limits where configured; 200 envelopes |
| `lib/adminSession.server.ts:28`, `adminAudit.server.ts:30` | API GET `/api/v1/auth/{session,activity}` | Session; activity additionally audit:view; 200 identity/paginated audit |
| `lib/adminDashboard.server.ts:44,49,71,94` | API GET `/api/v1/admin/dashboard/stats`, `/api/v1/admin/activity/recent`, enquiry/quotation lists | Session and appropriate capabilities; 200 counts/lists |
| `lib/adminEnquiries.server.ts`, `components/admin/enquiries/*` | API GET `/api/v1/admin/enquiries`, `/export`, `/:id`; PATCH `/:id/status`, `/:id/archive`, `/:id/unarchive`; POST `/:id/notes` | manage:enquiries; CSRF on mutations; 200 lists/details/updates, CSV export. Detail GET marks new enquiries read, so do not probe real records casually |
| `lib/adminQuotations.server.ts`, `components/admin/quotations/*` | API GET `/api/v1/admin/quotations`, `/export`, `/:id`, `/:id/attachments/:attachmentId`; PATCH `/:id/status`, `/:id/archive`, `/:id/unarchive`; POST `/:id/notes` | manage:quotations; CSRF on mutations; JSON, CSV or private download |
| `lib/adminBlog.server.ts`, `components/admin/blog/*`, shared content action buttons | API GET/POST `/api/v1/admin/blog/posts`; GET/PATCH/DELETE `/posts/:id`; POST `/posts/:id/status`; GET/POST `/categories`; PUT `/categories/order`; PATCH/DELETE `/categories/:id` | Session, content capabilities and draft/publish rules; CSRF on mutations; 200 reads/updates, 201 creates |
| `lib/adminMedia.server.ts`, `components/admin/media/*` | API GET/POST `/api/v1/admin/media`; GET/PATCH/DELETE `/:id`; GET `/:id/usage`; POST `/:id/replace` | media:read/manage:media/media:delete as applicable; CSRF, multipart validation; 201 upload, 200 reads/updates |
| `lib/adminUsers.server.ts:7`, `components/admin/users/*` | API GET/POST `/api/v1/admin/users`; PATCH `/:id/role`, `/:id/status`; POST `/:id/reset-password` | manage:admins; CSRF on mutations; 200 reads/updates, 201 create |
| No current public frontend caller | API POST `/api/v1/contact` | Retired; valid request returns 410, invalid 400, limiter 429 |
| Uptime/operations only | API GET `/health`, `/health/ready` | Unauthenticated liveness/readiness |

Routes are defined in `apps/api/src/routes/{auth,admin,adminBlog,adminEnquiries,adminQuotations,adminMedia,adminUsers,contact,health}.routes.ts`, mounted in `routes/index.ts`. There is no Express public quotation endpoint, Next catch-all admin proxy, or implemented settings/projects CRUD. Blog cache invalidation/media picking/reference scanning use authenticated Next Server Actions, not fixed REST routes. No source-level method/path mismatch was found in the reviewed callers.

## F. Verification results

- `pnpm lint`: passed repository-wide; focused lint also rerun for the new test.
- `pnpm typecheck`: passed after correcting response types in the added test. Initial failures in that test were corrected, not ignored.
- `pnpm test`: passed 783 existing tests (175 shared, 116 web, 492 API), including pre-existing API-origin tests.
- `pnpm --filter api exec tsx --test src/routes/routing.http.test.ts`: final rerun passed all 17 tests, no skips/failures.
- `pnpm test:integration`: passed 430 tests (326 API, 104 web), no skips/failures, against throwaway local MongoDB. Includes auth/RBAC/CSRF, real ready-health, publishing and public-form workflows.
- `pnpm build`: shared and API production builds passed. Web build failed because `next/font` could not fetch Geist and Geist Mono from Google Fonts in this network-restricted environment. This is an existing build-time network dependency, not a routing-test failure. Build used synthetic public origins and a loopback test DB override; it is not a production-environment certification. Rerun on a machine/CI runner with font access before release.
- Browser/E2E and real provider delivery: not run. Authenticated production functionality remains unverified.

## G. Deployment instructions

No runtime routing fix was justified, so the new test/report alone require **no redeployment**. If the existing API-origin validation is not deployed, review and commit it separately with its tests, then redeploy the frontend. No commit, push, deployment, hosting-setting or DNS change was made here.

### Render

1. Open the API service Settings. Confirm the linked repository and branch against the intended release; neither is proven by local source. Keep the working directory at repository root so workspace packages resolve.
2. Build command: `pnpm install --frozen-lockfile && pnpm build:shared && pnpm --filter api build`. Start command: `pnpm --filter api start`. Use the pinned pnpm and a compatible Node version (engine >=22.12.0). Preserve shared workspace build output.
3. Privately check required API configuration, production mode, exact CORS web origins, WEB_APP_URL and actual proxy-hop count. Use `/health` for liveness; monitor `/health/ready` separately for database availability. No Render manifest is present; dashboard settings are authoritative and unverified.
4. If code changes need release, you must commit and push to the linked branch yourself. Check Auto-Deploy and the Deploys page for the expected commit. For manual deployment choose **Manual Deploy → Deploy latest commit**. Review build and runtime logs, not just the deployment badge. [Render deployment documentation](https://render.com/docs/deploys)
5. Test the paths below on both API hostnames. A 200 from each health endpoint plus the expected session 401 validates only those checks. Match the live commit in Render and correlate a supplied `X-Request-Id` with runtime logs to confirm custom-domain requests reach the intended service. There is no commit-version endpoint; matching generic bodies alone cannot prove an exact release.

### Netlify

1. Open **Project configuration → Environment variables**. Check Production-context `NEXT_PUBLIC_API_URL`: it must be the intended API **origin only**, with no path/query/fragment. Check NEXT_PUBLIC_SITE_URL and required public Turnstile configuration. Include Builds scope for compiled public variables; retain server-only secrets in appropriate runtime scopes. Do not paste values into logs. Changes require a new build/deploy. [Netlify variable instructions](https://docs.netlify.com/build/environment-variables/get-started/)
2. Under **Project configuration → Developer settings → Continuous deployment → Build settings**, confirm repository-root base, `apps/web` package directory, build command `pnpm build:shared && pnpm --filter web build`, and Next publish output `apps/web/.next` relative to root. Keep Next's runtime adapter; this app cannot be deployed as a static export. Root `netlify.toml` only sets the scheduled-function directory, not these build settings. [Netlify build configuration](https://docs.netlify.com/build/configure-builds/overview/)
3. Check the production branch. Push reviewed source changes if necessary; otherwise an environment-only change needs no Git push. From Deploys trigger a production deploy and inspect its log for environment validation, workspace build and Next runtime setup. Verify the intended commit was published.
4. Open browser Developer Tools → Network → Preserve log. Repeat the originally failing action. Inspect **Request URL, Request Method, status, response and X-Request-Id**. Do not share cookies, Authorization headers, passwords or unredacted HAR files. Admin calls should contain exactly one `/api/v1`; public forms should target the web origin. A normal page load does not prove all requests work.
5. Use isolated staging for real login, protected-page refresh, logout, form persistence and uploads. The cross-host cookie issue below must be addressed before claiming production admin readiness.

### Read-only manual probes

Run in PowerShell with curl available. These commands do not submit forms or authenticate.

```powershell
$apiHosts = @('https://api.nexastacktechnologies.com', 'https://nexastack-api-t4bm.onrender.com')
foreach ($apiHost in $apiHosts) {
  foreach ($apiPath in @('/health', '/health/ready', '/', '/api/v1', '/api/v1/health', '/api/v1/auth/session')) {
    Write-Output "GET $apiHost$apiPath"
    curl.exe --silent --show-error --max-time 60 --include "$apiHost$apiPath"
  }
}
```

Record actual HTTP statuses and UTC time. In Render, search the returned request ID and inspect method/path/status. Unknown admin paths may return 401 before falling through because admin routers have blanket session middleware; do not interpret that alone as proof a business endpoint exists.

## H. Outstanding issues

- Exact original failing URL, method, action and production request ID are missing. Without them there is no evidence-supported production root cause to fix.
- Production HTTP, deployed commit, Netlify environment, DNS/TLS/proxy, CORS and Atlas readiness remain unverified due to access limits. The local socket failure is not evidence of a DNS defect.
- Separate existing integration limitation: `apps/api/src/lib/cookies.ts:19` issues a host-only session cookie; `apps/web/lib/adminSession.server.ts:24` requires the web request to contain that cookie. With direct browser login to the API subdomain, the web host does not receive that host-only cookie for SSR. A shared registrable domain alone does not solve this. This can cause a login/refresh redirect loop, not the quoted routing error. Repository guidance explicitly calls for raising cookie-topology decisions; no broad authentication redesign or cookie-domain expansion was silently introduced here.
- README hosting statements are partly stale (Vercel is mentioned despite Netlify configuration). Email hooks are not delivery integrations. Neither is evidence that the reported 404 is a routing malfunction.

## I. Final status

**UNRESOLVED — ADDITIONAL EVIDENCE REQUIRED** for the original production incident. The locally reproduced root/prefix/wrong-method cases are expected behavior, and regression coverage preserves that contract. No claim of a production fix is made.

## Appendix: registered Express methods and source lines

| Method | Full path | Source |
| --- | --- | --- |
| GET | `/health` | `apps/api/src/routes/health.routes.ts:30` |
| GET | `/health/ready` | `apps/api/src/routes/health.routes.ts:46` |
| POST | `/api/v1/contact` | `apps/api/src/routes/contact.routes.ts:45` |
| POST | `/api/v1/auth/login` | `apps/api/src/routes/auth.routes.ts:40` |
| POST | `/api/v1/auth/logout` | `apps/api/src/routes/auth.routes.ts:58` |
| GET | `/api/v1/auth/session` | `apps/api/src/routes/auth.routes.ts:73` |
| POST | `/api/v1/auth/change-password` | `apps/api/src/routes/auth.routes.ts:92` |
| POST | `/api/v1/auth/password-reset/request` | `apps/api/src/routes/auth.routes.ts:115` |
| POST | `/api/v1/auth/password-reset/confirm` | `apps/api/src/routes/auth.routes.ts:135` |
| GET | `/api/v1/auth/activity` | `apps/api/src/routes/auth.routes.ts:158` |
| GET | `/api/v1/admin/dashboard/stats` | `apps/api/src/routes/admin.routes.ts:37` |
| GET | `/api/v1/admin/activity/recent` | `apps/api/src/routes/admin.routes.ts:53` |
| GET | `/api/v1/admin/blog/posts` | `apps/api/src/routes/adminBlog.routes.ts:76` |
| POST | `/api/v1/admin/blog/posts` | `apps/api/src/routes/adminBlog.routes.ts:77` |
| GET | `/api/v1/admin/blog/posts/:id` | `apps/api/src/routes/adminBlog.routes.ts:113` |
| PATCH | `/api/v1/admin/blog/posts/:id` | `apps/api/src/routes/adminBlog.routes.ts:114` |
| DELETE | `/api/v1/admin/blog/posts/:id` | `apps/api/src/routes/adminBlog.routes.ts:121` |
| POST | `/api/v1/admin/blog/posts/:id/status` | `apps/api/src/routes/adminBlog.routes.ts:139` |
| GET | `/api/v1/admin/blog/categories` | `apps/api/src/routes/adminBlog.routes.ts:165` |
| POST | `/api/v1/admin/blog/categories` | `apps/api/src/routes/adminBlog.routes.ts:166` |
| PUT | `/api/v1/admin/blog/categories/order` | `apps/api/src/routes/adminBlog.routes.ts:188` |
| PATCH | `/api/v1/admin/blog/categories/:id` | `apps/api/src/routes/adminBlog.routes.ts:214` |
| DELETE | `/api/v1/admin/blog/categories/:id` | `apps/api/src/routes/adminBlog.routes.ts:221` |
| GET | `/api/v1/admin/enquiries` | `apps/api/src/routes/adminEnquiries.routes.ts:43` |
| GET | `/api/v1/admin/enquiries/export` | `apps/api/src/routes/adminEnquiries.routes.ts:60` |
| GET | `/api/v1/admin/enquiries/:id` | `apps/api/src/routes/adminEnquiries.routes.ts:79` |
| PATCH | `/api/v1/admin/enquiries/:id/status` | `apps/api/src/routes/adminEnquiries.routes.ts:96` |
| POST | `/api/v1/admin/enquiries/:id/notes` | `apps/api/src/routes/adminEnquiries.routes.ts:115` |
| PATCH | `/api/v1/admin/enquiries/:id/archive` | `apps/api/src/routes/adminEnquiries.routes.ts:139` |
| PATCH | `/api/v1/admin/enquiries/:id/unarchive` | `apps/api/src/routes/adminEnquiries.routes.ts:140` |
| GET | `/api/v1/admin/quotations` | `apps/api/src/routes/adminQuotations.routes.ts:48` |
| GET | `/api/v1/admin/quotations/export` | `apps/api/src/routes/adminQuotations.routes.ts:66` |
| GET | `/api/v1/admin/quotations/:id` | `apps/api/src/routes/adminQuotations.routes.ts:85` |
| GET | `/api/v1/admin/quotations/:id/attachments/:attachmentId` | `apps/api/src/routes/adminQuotations.routes.ts:107` |
| PATCH | `/api/v1/admin/quotations/:id/status` | `apps/api/src/routes/adminQuotations.routes.ts:128` |
| POST | `/api/v1/admin/quotations/:id/notes` | `apps/api/src/routes/adminQuotations.routes.ts:147` |
| PATCH | `/api/v1/admin/quotations/:id/archive` | `apps/api/src/routes/adminQuotations.routes.ts:171` |
| PATCH | `/api/v1/admin/quotations/:id/unarchive` | `apps/api/src/routes/adminQuotations.routes.ts:172` |
| GET | `/api/v1/admin/media` | `apps/api/src/routes/adminMedia.routes.ts:65` |
| POST | `/api/v1/admin/media` | `apps/api/src/routes/adminMedia.routes.ts:66` |
| GET | `/api/v1/admin/media/:id` | `apps/api/src/routes/adminMedia.routes.ts:100` |
| GET | `/api/v1/admin/media/:id/usage` | `apps/api/src/routes/adminMedia.routes.ts:115` |
| PATCH | `/api/v1/admin/media/:id` | `apps/api/src/routes/adminMedia.routes.ts:117` |
| DELETE | `/api/v1/admin/media/:id` | `apps/api/src/routes/adminMedia.routes.ts:124` |
| POST | `/api/v1/admin/media/:id/replace` | `apps/api/src/routes/adminMedia.routes.ts:150` |
| GET | `/api/v1/admin/users` | `apps/api/src/routes/adminUsers.routes.ts:51` |
| POST | `/api/v1/admin/users` | `apps/api/src/routes/adminUsers.routes.ts:52` |
| PATCH | `/api/v1/admin/users/:id/role` | `apps/api/src/routes/adminUsers.routes.ts:73` |
| PATCH | `/api/v1/admin/users/:id/status` | `apps/api/src/routes/adminUsers.routes.ts:95` |
| POST | `/api/v1/admin/users/:id/reset-password` | `apps/api/src/routes/adminUsers.routes.ts:117` |

## Appendix: frontend request source index

Paths below are source references, not evidence that production requests succeeded. Shared helpers and dynamic path constants are explained in section E.

- `apps/web/lib/adminApi.ts:17`
- `apps/web/lib/adminApi.ts:39`
- `apps/web/lib/adminAudit.server.ts:30`
- `apps/web/lib/adminBlog.server.ts:33`
- `apps/web/lib/adminBlog.server.ts:37`
- `apps/web/lib/adminBlog.server.ts:42`
- `apps/web/lib/adminDashboard.server.ts:21`
- `apps/web/lib/adminDashboard.server.ts:44`
- `apps/web/lib/adminDashboard.server.ts:48`
- `apps/web/lib/adminDashboard.server.ts:70`
- `apps/web/lib/adminDashboard.server.ts:93`
- `apps/web/lib/adminEnquiries.server.ts:30`
- `apps/web/lib/adminEnquiries.server.ts:38`
- `apps/web/lib/adminForward.server.ts:25`
- `apps/web/lib/adminMedia.server.ts:31`
- `apps/web/lib/adminMedia.server.ts:35`
- `apps/web/lib/adminMedia.server.ts:41`
- `apps/web/lib/adminQuotations.server.ts:33`
- `apps/web/lib/adminQuotations.server.ts:40`
- `apps/web/lib/adminRequest.ts:23`
- `apps/web/lib/adminSession.server.ts:28`
- `apps/web/lib/adminUsers.server.ts:7`
- `apps/web/lib/cloudinary.ts:68`
- `apps/web/lib/cloudinary.ts:112`
- `apps/web/lib/quotationUpload.ts:43`
- `apps/web/lib/turnstile.ts:46`
- `apps/web/components/admin/blog/BlogCategoryCreateForm.tsx:43`
- `apps/web/components/admin/blog/BlogCategoryManager.tsx:44`
- `apps/web/components/admin/blog/BlogCategoryRow.tsx:48`
- `apps/web/components/admin/blog/BlogPostForm.tsx:187`
- `apps/web/components/admin/blog/BlogPostForm.tsx:192`
- `apps/web/components/admin/ChangePasswordForm.tsx:60`
- `apps/web/components/admin/content/ConfirmDeleteButton.tsx:41`
- `apps/web/components/admin/content/StatusActionBar.tsx:64`
- `apps/web/components/admin/enquiries/EnquiryArchiveButton.tsx:31`
- `apps/web/components/admin/enquiries/EnquiryExportButton.tsx:43`
- `apps/web/components/admin/enquiries/EnquiryNoteForm.tsx:54`
- `apps/web/components/admin/enquiries/EnquiryStatusControl.tsx:42`
- `apps/web/components/admin/ForgotPasswordForm.tsx:45`
- `apps/web/components/admin/LoginForm.tsx:51`
- `apps/web/components/admin/LogoutButton.tsx:16`
- `apps/web/components/admin/media/MediaDeleteDialog.tsx:115`
- `apps/web/components/admin/media/MediaEditForm.tsx:65`
- `apps/web/components/admin/media/MediaUploadForm.tsx:170`
- `apps/web/components/admin/quotations/QuotationArchiveButton.tsx:31`
- `apps/web/components/admin/quotations/QuotationAttachmentList.tsx:50`
- `apps/web/components/admin/quotations/QuotationExportButton.tsx:44`
- `apps/web/components/admin/quotations/QuotationNoteForm.tsx:58`
- `apps/web/components/admin/quotations/QuotationStatusControl.tsx:48`
- `apps/web/components/admin/ResetPasswordForm.tsx:44`
- `apps/web/components/admin/users/AdminUserRow.tsx:111`
- `apps/web/components/admin/users/AdminUserRow.tsx:129`
- `apps/web/components/admin/users/AdminUserRow.tsx:152`
- `apps/web/components/admin/users/CreateAdminUserForm.tsx:59`
- `apps/web/components/sections/ContactForm.tsx:101`
- `apps/web/components/sections/QuotationAttachments.tsx:34`
- `apps/web/components/sections/QuotationAttachments.tsx:59`
- `apps/web/components/sections/QuotationWizard.tsx:197`
- `apps/web/components/ui/FileUploadField.tsx:156`
