# Portfolio source review

Reviewed on 2026-11-19. The repositories were identified through the connected GitHub account, scoped first to Jakirhossain80 and Jakir2019. Both READMEs identify the project and author. These sources were read only; no source repositories were changed.

## LiveTasker

- Repository: https://github.com/Jakirhossain80/live-tasker
- Reviewed tree: `7e27dff537b6a6f3a2a57eeffd827defc9642b9e`.
- Frontend and backend are in `client/` and `server/` in the same repository.
- Evidence: README; both package manifests; client routes, ProjectBoard, authentication store and invite API; server app, Task/Workspace models, authentication/workspace/task services, socket setup, AI route/service.
- The board code implements dnd-kit movement, TanStack Query mutations, local ordering, move-event deduplication and failure recovery. Workspace services and socket subscriptions check membership. Owner/admin/member roles are implemented despite the README listing role-based permissions as future work.
- Dependencies confirm React, Vite, TypeScript, Tailwind, TanStack Query, Zustand, Axios, Express, Mongoose, JWT, bcryptjs and Socket.IO. Version claims from README badges were not copied.
- Gemini description generation exists in server code; provider operation was not tested. Email/push notifications, file attachments and calendar integration remain README roadmap items.
- Published screenshot `screenshots/task-board.png` is reused unchanged at `apps/web/public/images/portfolio/livetasker-task-board.png` (147,556 bytes). Visually inspected: board UI and task examples; no credentials, email addresses or personal contact details. The source README grants reuse under MIT; the asset remains attributed here. No synthetic screenshot was generated.
- README frontend URL: https://live-tasker.vercel.app
- README backend deployment: https://livetasker-server.onrender.com
- Direct network access was restricted and the web tool could not retrieve the frontend. These are documented deployment addresses, not verified working demos. Public demo buttons are omitted until availability can be checked.
- Review classification: demonstration; implemented code is not an end-to-end production certification. Workspace joining uses the workspace identifier rather than a separately expiring invite token.

## NextCart

- Repository: https://github.com/Jakirhossain80/next-cart
- Reviewed tree: `af384efcd32fbb178b8ba6759c7316ca381ccdba`.
- Evidence: README, package manifest, App Router tree, Shop component, Zustand store, checkout action, webhook handler, Clerk proxy, order page, Sanity queries, product/order schemas and Studio mount.
- The project is a commerce application. Dependencies and code confirm Next.js 16, React, TypeScript, Tailwind, Zustand, Clerk, Sanity and Stripe. Sanity's README version differs from the manifest, so no Sanity version is advertised.
- Products/categories/brands and blogs come from Sanity. Shop filters use GROQ parameters. Cart/favorites use Zustand persist. Orders are queried by Clerk user ID. The server action creates Stripe sessions; the signature-verified webhook creates Sanity orders and attempts stock updates.
- Backend functionality lives in the same Next.js repository; no separate backend repository is required by the inspected architecture.
- Limits: checkout accepts submitted prices/customer metadata; proxy catch continues requests; webhook order creation has no observed duplicate-event guard, and stock changes are not atomic with order creation. Do not describe this as production-ready payment processing. Order statuses do not establish carrier integration.
- Product artwork and logos exist, but no authentic application screenshots were found. A labelled CSS project illustration is used; no product image is passed off as a screenshot.
- README frontend URL: https://next-cart-psi.vercel.app
- The web tool could not retrieve that URL. Public demo buttons are omitted pending availability verification.
- Review classification: demonstration with production-hardening gaps; real payments, CMS permissions and hosted operation were not exercised.

## Maintenance

`apps/web/config/projects.ts` owns card data; `case-studies.ts` owns long-form content. The dynamic route and sitemap derive their slugs from these files. A slug is the stable project ID. Add `liveUrl` only after checking the documented deployment. For screenshots, add a local asset, meaningful `imageAlt`, and a case-study screenshot entry. CareerBridge's original data is preserved, including its reserved image path; it continues to use a fallback until an actual screenshot is supplied.

All three projects are visible by default. No filters were implemented previously; three projects do not need a new filter interface. Existing generic social-share imagery and per-page metadata are reused. No dependencies, schemas, APIs or hosting settings were changed.

## Verification and release handoff

- `pnpm lint`: passed across the workspace after the implementation.
- `pnpm typecheck`: passed across the workspace, including Next route type generation and the added tests.
- `pnpm test`: passed across the workspace. A subsequent `pnpm --filter web test` passed all 122 web tests, including the new portfolio integrity tests.
- CareerBridge's project and case-study objects were evaluated and compared against Git HEAD: identical data.
- `git diff --check`: passed. No manifest or lockfile changes.
- `pnpm build`: shared and API builds passed; the web build failed because Google Fonts requests for Geist and Geist Mono could not connect. No font configuration was changed to hide this failure.
- `pnpm test:e2e --grep portfolio`: attempted; stopped during its production-build prerequisite after the independent build established the font-network blocker. No browser assertions or axe checks are claimed as passing.
- Local preview started, but the portfolio request timed out while compiling. The connected browser host was unavailable. Mobile/tablet/desktop appearance, keyboard interaction and light/dark/system rendering therefore remain unverified in a browser. The new browser tests cover 375, 768, 1280 and 1920 widths plus light/dark axe checks; existing theme tests cover system preference.

Before release, run `pnpm install --frozen-lockfile` if dependencies are absent, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e --grep portfolio` in the existing environment with Google Fonts access, local test MongoDB and Playwright Chromium. Follow the existing hosting workflow documented in README; preserve current hosting settings and production environment variables. Check `/portfolio` and all three detail routes, homepage links, screenshot loading and the sitemap in the resulting preview before manually releasing. No deployment, commit or push was performed for this change.
