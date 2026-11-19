# CLAUDE.md — NexaStack Technologies

Project context for Claude Code. Read this fully before making changes.

`AGENTS.md` is a symlink to this file. Edit only `CLAUDE.md`.

---

## 1. Project overview

**NexaStack Technologies** is a founder-led web development firm based in Dhaka,
Bangladesh. This repository is the firm's own website: a public marketing site plus an
admin interface for managing content, enquiries and quotation requests.

The site is both a business asset and a demonstration of the firm's technical ability.
Code quality, accessibility and performance are therefore part of the product, not
optional polish.

**Tagline:** We Build Better Websites
**Positioning:** A capable founder-led development firm. The copy and design must never
imply a large corporation or a team that does not exist.

---

## 2. Golden rules

1. **Follow the design tokens in section 7 exactly.** Never invent a colour, radius or
   spacing value. If a needed token is missing, ask before adding it.
2. **Never redesign parts of the UI you were not asked to change.** Targeted changes only.
3. **Never add a dependency without asking first.** State what it is, why the existing
   stack cannot do it, and its size.
4. **Validation schemas live in `packages/shared` and are imported by both apps.** Never
   duplicate a schema.
5. **Accessibility requirements in section 14 are non-negotiable**, not a later pass.
6. **Preserve existing functionality.** When editing a file, change what was asked and
   leave the rest alone.
7. **Ask before any destructive operation** — deleting files, rewriting migrations,
   force-pushing, dropping collections.
8. Use **plan mode for any change spanning more than two files.**

---

## 3. Repository structure

pnpm workspace monorepo.

```
nexastack/
├── CLAUDE.md                    # this file (canonical)
├── AGENTS.md                    # symlink → CLAUDE.md
├── README.md                    # installation and deployment
├── pnpm-workspace.yaml
├── .claude/
│   ├── settings.json            # committed permissions
│   └── commands/                # custom slash commands
├── apps/
│   ├── web/                     # Next.js App Router (public site + admin UI)
│   │   ├── app/
│   │   │   ├── (marketing)/     # public route group
│   │   │   ├── (admin)/         # admin route group, auth-guarded
│   │   │   ├── api/             # Route Handlers (see 6.2 for what belongs here)
│   │   │   ├── layout.tsx
│   │   │   ├── sitemap.ts
│   │   │   └── robots.ts
│   │   ├── components/
│   │   │   ├── ui/              # primitives: Button, Card, Input, Badge
│   │   │   ├── sections/        # page sections: Hero, ServicesGrid, CTABand
│   │   │   ├── layout/          # Navbar, Footer, ThemeToggle
│   │   │   └── admin/           # admin-only components
│   │   ├── lib/                 # client utilities, fetchers, helpers
│   │   ├── config/
│   │   │   └── company.ts       # single source for company facts (section 4)
│   │   └── styles/
│   └── api/                     # Express REST API
│       └── src/
│           ├── routes/          # route definitions only
│           ├── controllers/     # request/response handling
│           ├── services/        # business logic
│           ├── models/          # Mongoose schemas
│           ├── middleware/      # auth, RBAC, rate limit, error handler
│           ├── lib/             # mailer, cloudinary, logger
│           └── index.ts
└── packages/
    └── shared/                  # Zod schemas + TypeScript types used by BOTH apps
        └── src/
            ├── schemas/         # one Zod schema file per domain
            ├── types/           # types inferred from schemas
            ├── constants/       # roles, content statuses, error codes
            └── index.ts         # explicit public exports
```

Each app has its own `CLAUDE.md` with app-specific conventions. Read the nearest one.

`apps/e2e/` is a third workspace holding only the Playwright browser tests (section 20); it has no
application code and nothing imports it. `scripts/` holds `run-integration.mjs` and `lib/mongod.mjs`,
the runner that starts a throwaway local MongoDB for the integration tests.

---

## 4. Company facts

These values live in **`apps/web/config/company.ts`** and are imported everywhere —
footer, contact page, JSON-LD, email templates, legal pages. **Never hardcode them into a
component.**

| Field | Value |
|---|---|
| Legal name | NexaStack Technologies |
| Tagline | We Build Better Websites |
| Founded | 2026 |
| Founder | Md. Jakir Hossain, CEO |
| Address | House 14, Road 06, Uttara, Dhaka 1230, Bangladesh |
| Phone (display) | +880 1712-119253 |
| Phone (`tel:`) | `tel:+8801712119253` |
| WhatsApp link | `https://wa.me/8801712119253` |
| General email | nexastack@mail.com *(placeholder — see section 18)* |
| Hours | 10:00–18:00, six days a week |
| Weekly holiday | Friday |
| Time zone | Asia/Dhaka (UTC+6) |
| GitHub | https://github.com/Jakirhossain80 |
| LinkedIn | https://www.linkedin.com/in/jakir-hossain-dev |

**Phone format matters.** Bangladesh's country code is `+880`. The leading `0` in
`01712119253` is the domestic trunk prefix and is dropped internationally. The WhatsApp
click-to-chat URL requires digits only: `8801712119253`. `88001712119253` will not resolve.

---

## 5. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js, App Router |
| UI | React + TypeScript (strict mode) |
| Styling | Tailwind CSS |
| Monorepo | pnpm workspaces |
| Backend | Node.js + Express.js REST API |
| Database | MongoDB Atlas + Mongoose |
| Auth | Email/password, bcrypt, JWT in HTTP-only cookies |
| Forms | React Hook Form + Zod + @hookform/resolvers |
| Server state | native `fetch` (public SSR), TanStack Query (admin only) |
| Media | Cloudinary, `next/image` |
| Email | Transactional provider (Resend / Postmark / Brevo — TBD) |
| Spam | Cloudflare Turnstile + express-rate-limit |
| Logging | Pino |
| Monitoring | Sentry, uptime service, health-check endpoints |
| API docs | OpenAPI / Swagger |
| Hosting | Vercel (web), Render (api), Atlas (db), Cloudinary (media) |

**Record exact pinned versions here after `pnpm install`.** Do not assume API shapes from
training data — when unsure about a Next.js, Tailwind or Mongoose API, fetch the current
docs.

### Pinned versions (installed 2026-09-13, Node 22.23.1, pnpm 11.5.2)

All versions are exact pins. `zod`, `typescript` and `@types/node` are pinned once in the
`catalog:` of `pnpm-workspace.yaml`.

| Workspace | Package | Version |
|---|---|---|
| root (dev) | typescript | 6.0.3 |
| root (dev) | eslint / @eslint/js | 9.39.5 |
| root (dev) | typescript-eslint | 8.70.0 |
| root (dev) | eslint-config-next | 16.3.5 |
| root (dev) | eslint-config-prettier | 10.1.8 |
| root (dev) | globals | 17.12.0 |
| root (dev) | prettier | 3.9.6 |
| root (dev) | prettier-plugin-tailwindcss | 0.8.1 |
| shared | zod | 4.6.2 |
| web | next | 16.3.5 |
| web | react / react-dom | 19.3.0 |
| web | tailwindcss / @tailwindcss/postcss | 4.3.3 |
| web | clsx | 2.1.1 |
| web | tailwind-merge | 3.7.0 |
| web | @vercel/speed-insights | 2.0.0 |
| web | @radix-ui/react-dialog | 1.1.23 |
| web | @radix-ui/react-dropdown-menu | 2.1.24 |
| web | react-hook-form | 7.65.0 |
| web | @hookform/resolvers | 5.2.2 |
| web, api | mongoose | 9.10.0 *(catalog)* |
| web (dev) | @types/react / @types/react-dom | 19.3.0 |
| api | express | 5.2.1 |
| api | mongoose | 9.10.0 |
| api | helmet | 8.3.0 |
| api | cors | 2.8.6 |
| api | cookie-parser | 1.4.7 |
| api | express-rate-limit | 8.7.0 |
| api | pino | 10.3.1 |
| api | pino-http | 11.0.0 |
| api (dev) | tsx | 4.23.13 |
| api (dev) | pino-pretty | 13.1.3 |
| api (dev) | @types/express | 5.0.6 |
| api (dev) | @types/cors | 2.8.19 |
| api (dev) | @types/cookie-parser | 1.4.10 |
| web, api (dev) | @types/node | 22.20.2 |
| shared (dev) | @types/node | 22.20.2 *(catalog; typing the tests only, kept out of the build)* |
| api, web, shared (dev) | tsx | 4.23.13 *(catalog; runs the `node:test` suites)* |
| e2e (dev) | @playwright/test | 1.63.0 |
| e2e (dev) | axe-core | 4.13.0 *(was already resolved transitively via eslint-plugin-jsx-a11y)* |

**Held back deliberately:** TypeScript 7 (`typescript-eslint` 8.70 supports `<6.1.0`) and
ESLint 10 (`eslint-config-next` 16.3.5 bundles `eslint-plugin-react` 7.37.5, whose peer range
stops at ESLint 9). Revisit both when those packages widen their ranges.

### Explicitly not used

- **Redux, Zustand, Jotai, MobX** — URL search params and TanStack Query cover the state
  needs. Do not introduce a global store without explicit approval.
- **CSS-in-JS** (styled-components, Emotion) — Tailwind only.
- **Component libraries that ship their own visual design** (MUI, Ant Design, Chakra) —
  they fight the design system. Headless primitives (Radix, React Aria) are acceptable for
  accessible behaviour where hand-rolling is risky: dialogs, dropdowns, accordions.
- **Firebase Authentication** — deferred. The JWT scheme in section 11 is the auth system.
  Do not add a second one.

---

## 6. Commands

```bash
pnpm install                      # install all workspaces
pnpm dev                          # run web + api together
pnpm --filter web dev             # Next.js only
pnpm --filter api dev             # Express only
pnpm build                        # build all
pnpm lint                         # ESLint across workspaces
pnpm typecheck                    # tsc --noEmit across workspaces
pnpm test                         # unit tests, every workspace (seconds, no database, no browser)
pnpm test:integration             # real HTTP + real MongoDB (starts a throwaway local mongod)
pnpm test:e2e                     # browser tests, Chromium only (builds and boots the whole stack)
pnpm test:e2e:full                # + Firefox, WebKit, Pixel/iPhone/iPad profiles (pre-release)
pnpm format                       # Prettier write
```

**Before considering any task complete, run `pnpm lint` and `pnpm typecheck`.** A change
that does not typecheck is not finished.

---

## 7. Design tokens

Authoritative. Full specification in the project's design-system document; this section is
the build contract.

### 7.1 Colour

| Role | Light | Dark |
|---|---|---|
| Background | `#F8FAFC` | `#080D1A` |
| Background alt | `#F1F5F9` | `#0D1424` |
| Card surface | `#FFFFFF` | `#111A2E` |
| Text primary | `#0F172A` | `#F8FAFC` |
| Text secondary | `#475569` | `#A8B4C7` |
| Border | `#DCE4EE` | `#26334A` |
| Primary blue | `#1463FF` | `#4D8BFF` |
| Cyan accent | `#08B7ED` | `#25C7F5` |
| Violet accent | `#5530D9` | `#7957F2` |
| Success | `#15803D` | `#4ADE80` |
| Error | `#DC2626` | `#F87171` |
| On primary (text/icons on primary blue) | `#FFFFFF` | `#080D1A` |
| Border strong (form-field borders) | `#7E8A9A` | `#5F6B80` |
| Primary blue hover | `#135AE5` | `#689CFF` |
| Card surface hover | `#F4F7FA` | `#1A2336` |
| Border hover | `#BEC7D3` | `#404D63` |
| On success (text/icons on success) | `#FFFFFF` | `#080D1A` |
| On error (text/icons on error) | `#FFFFFF` | `#080D1A` |

Define these once as CSS custom properties with light/dark variants and expose them to
Tailwind as semantic names (`bg-surface`, `text-secondary`, `border-default`). **Never
write a raw hex value in a component.**

Tailwind classes, as implemented in `apps/web/styles/globals.css`:

| Token | Classes |
|---|---|
| Background / Background alt / Card surface | `bg-background`, `bg-background-alt`, `bg-surface` |
| Card surface hover | `bg-surface-hover` |
| Text primary / secondary | `text-primary`, `text-secondary` |
| Border / Border hover / Border strong | `border-default`, `border-default-hover`, `border-strong` |
| Primary blue / hover | `*-primary-blue`, `*-primary-blue-hover` (bg, text, border, ring, outline…) |
| Cyan / Violet / Success / Error | `*-cyan`, `*-violet`, `*-success`, `*-error` |
| On primary / success / error | `text-on-primary`, `text-on-success`, `text-on-error` |

Pairing rules and verified contrast ratios for the added tokens:

| Pairing | Light | Dark | Required |
|---|---|---|---|
| `border-strong` on background / background alt / surface | 3.35 / 3.20 / 3.51 | 3.60 / 3.41 / 3.22 | ≥3:1 |
| `text-on-primary` on `primary-blue-hover` | 5.80 | 7.19 | ≥4.5:1 |
| `text-primary-blue-hover` on background / surface | 5.54 / 5.80 | 7.19 / 6.43 | ≥4.5:1 |
| `text-on-success` on `success` | 5.02 | 11.13 | ≥4.5:1 |
| `text-on-error` on `error` | 4.83 | 7.01 | ≥4.5:1 |
| `text-primary` / `text-secondary` on `surface-hover` | 16.60 / 7.05 | 15.01 / 7.49 | ≥4.5:1 |

- Use `border-strong` for form fields and any border that is the only thing identifying a
  control. `border-default` and `border-default-hover` are for cards and dividers.
- Primary blue hover is darker in light mode and lighter in dark mode, so it keeps contrast
  with `text-on-primary` in both. White text on the dark hover value is 2.70:1 — never put
  white on primary blue in dark mode.

**Contrast caution:** white on light `#1463FF` is 4.93:1 and passes AA for normal text.
White on dark `#4D8BFF` is only 3.25:1 and fails, which is why the dark `On primary` value is
the dark background `#080D1A` (5.96:1). Always pair `bg-primary-blue` with `text-on-primary`.
Also note: `border-default` is 1.23:1 (light) and 1.53:1 (dark) against the backgrounds —
below the 3:1 needed for form-field boundaries, so form fields use `border-strong` — and light
cyan `#08B7ED` is 2.23:1 on the background, so it is decorative only, never text. Verify any
new colour pairing.

### 7.2 Brand gradient

Cyan → Royal Blue → Violet.

Permitted on: logo-related accents, hero artwork, primary highlights, selected headings,
decorative lines, featured-project accents.

**Forbidden on:** body text, every card, every button, large background areas.

### 7.3 Typography

- Primary: **Geist Sans** (fallback Inter, then Manrope)
- Mono: **Geist Mono** — technical labels and code only, never body copy

| Level | Desktop | Mobile |
|---|---|---|
| Hero heading | 56–72px | 38–48px |
| Page heading | 44–56px | 36px |
| Section heading | 32–44px | 28px |
| Card heading | 20–24px | — |
| Body | 16–18px | — |
| Small label | 13–14px | — |

Heading sizes are fluid (`clamp()`), scaling linearly from the mobile value at a 375px
viewport to the desktop value at 1280px. Implemented as `text-hero` (40→64px), `text-page`
(36→48px), `text-section` (28→40px) and `text-card` (20→22px).

Body line height 1.6–1.75. Body line length 60–75 characters.

### 7.4 Spacing and layout

| Token | Value |
|---|---|
| Max content width | 1200–1280px |
| Side padding — desktop | 32–48px |
| Side padding — tablet | 24–32px |
| Side padding — mobile | 16–20px |
| Section spacing — desktop | 80–120px |
| Section spacing — tablet | 56–80px |
| Section spacing — mobile | 40–64px |

12-column responsive grid on desktop.

### 7.5 Radii, borders, shadows

| Element | Radius |
|---|---|
| Card | 12–16px |
| Button | 10–12px |
| Large media | 16–20px |
| Form field | 8–10px |

Border width: **1px**. Shadows: soft, low-opacity, vertically restrained. In dark mode
rely on borders rather than shadows.

| Shadow | Class | Light | Dark |
|---|---|---|---|
| Card | `shadow-card` | `0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)` | `0 1px 2px rgb(0 0 0 / 0.2)` |
| Card hover | `shadow-card-hover` | `0 2px 4px rgb(15 23 42 / 0.05), 0 4px 12px rgb(15 23 42 / 0.08)` | `0 2px 4px rgb(0 0 0 / 0.24)` |

Light shadows are tinted with Text primary. Dark shadows are near-invisible on navy by design.

### 7.6 Motion

Duration **150–300ms**. Permitted: button hover, small card elevation, link-arrow
movement, accordion expansion, menu open/close, validation feedback, skeleton loading,
subtle section fade-and-rise, project image zoom 2–3%.

Every non-essential animation must be disabled under `prefers-reduced-motion: reduce`.
Implement this once as a global rule, not per component.

---

## 8. Design rules that are easy to violate

Read this list before writing any UI.

**Glassmorphism is permitted in exactly four places:**

1. A small hero statistic panel
2. A floating technology summary
3. Selected decorative elements
4. Optional desktop navigation background

Nowhere else. Never on cards holding important content. Never on form fields — it destroys
legibility.

**Cards** use Flat Design 2.0: solid surface, 1px border, subtle shadow, consistent radius,
slight elevation on hover. Not glass, not neumorphic, not heavily shadowed.

**Bento layouts** are for selected technology and capability sections only — not the
general page layout.

**Buttons:** three variants only (primary solid blue, secondary bordered, text with arrow).
Minimum height 44–48px. No fully-rounded pill shapes. No glow. Clear focus ring always.

**Forms:** solid neutral surfaces, labels above fields, 1px borders, blue focus rings.
Never translucent, never neumorphic.

**Light theme:** do not use pure white for every surface — sections lose separation. Use
the background/background-alt pair.

**Dark theme:** dim navy, never pure black. Reduced gradient brightness. Minimal glow. The
reversed logo variant is used automatically.

**Never build:** moving backgrounds, parallax, cursor-following effects, glitch effects,
kinetic typography, video backgrounds, large 3D or WebGL scenes, animation on every
element.

**Imagery:** genuine project screenshots, browser/device mockups, clean geometric
illustrations, subtle grid or node patterns. Never generic stock photos of people at
computers, cartoon characters, or cyberpunk visuals.

---

## 9. Component conventions

### 9.1 Server and Client Components

**Server Components are the default.** Add `'use client'` only when the component needs
state, effects, event handlers, or browser APIs — and push it as far down the tree as
possible. A page should not be a Client Component because one button inside it is
interactive.

### 9.2 Structure

- Primitives in `components/ui/` — no business logic, no data fetching
- Page sections in `components/sections/` — compose primitives, receive data as props
- One component per file, named export, PascalCase filename matching the component
- Props interfaces named `<Component>Props`, defined in the same file
- Use `cn()` (clsx + tailwind-merge) for conditional classes

### 9.3 Every interactive component must have

- A visible focus state using the token focus ring
- Correct light and dark rendering
- Keyboard operability
- Reduced-motion handling if it animates
- A touch target of at least 44px on mobile

---

## 10. Forms and validation

**The pattern, without exception:**

1. Zod schema defined in `packages/shared/src/schemas/`
2. `apps/web` imports it for React Hook Form via `@hookform/resolvers/zod`
3. `apps/api` imports the **same** schema to validate the request body

Client validation is convenience. Server validation is the security boundary. **Never trust
client-validated data.**

Forms use: labels above fields, explicit required indicators, inline validation, helpful
error messages (say what to do, not just what is wrong), visible success confirmation, and
logical field grouping.

The quotation form is multi-step. Keep step state local; persist to the server only on
final submit.

---

## 11. API conventions

### 11.1 Layering

`routes/` define paths and attach middleware → `controllers/` parse requests and shape
responses → `services/` hold business logic → `models/` hold Mongoose schemas.

**Controllers must not contain business logic. Services must not touch `req` or `res`.**

### 11.2 Response envelope

Consistent across every endpoint:

```
Success:  { "success": true,  "data": <payload> }
Error:    { "success": false, "error": { "code": "...", "message": "...", "details"?: ... } }
```

Status codes: `200` ok, `201` created, `400` validation, `401` unauthenticated,
`403` unauthorised, `404` not found, `409` conflict, `429` rate-limited, `500` server.

**Never leak internal error messages, stack traces or Mongo errors to the client.** Log
the detail with Pino; return a safe message.

### 11.3 Auth and RBAC

- Email/password, bcrypt-hashed (cost factor 12 or above)
- JWT stored in an HTTP-only, `Secure`, `SameSite` cookie — **never in `localStorage`**
- Roles: `super_admin`, `admin`, `content_editor`
- Role checks enforced by middleware on the route, **never in the UI alone**. Hiding a
  button is not authorisation.
- Sessions expire; logout invalidates
- Significant admin actions written to an audit log

**Cookie/domain note:** the web app and API must share a registrable domain
(`nexastack.example` and `api.nexastack.example`) so the session cookie can use
`SameSite=Lax`. If they end up on different sites, the cookie requires
`SameSite=None; Secure` with CORS `credentials: true` and an explicit origin allowlist —
and Safari's tracking prevention will still cause problems. Raise this rather than working
around it.

### 11.4 Mandatory on every endpoint

- Server-side Zod validation of body, params and query
- Helmet security headers
- CORS restricted to an explicit origin allowlist — never `*` with credentials
- `express-rate-limit` on auth, contact and quotation routes
- Sanitised input, guarding against NoSQL injection (never pass raw user objects into a
  query)
- A defined CSRF strategy for cookie-authenticated mutations
- Structured Pino logging with a request id
- An OpenAPI annotation

### 11.5 Database

- Indexes on slugs, search fields, content status, and submission timestamps
- Mongoose schema-level validation in addition to Zod
- `lean()` for read-only queries
- Never return password hashes or tokens from a query — use `select: false`

---

## 12. Data fetching

| Context | Approach |
|---|---|
| Public pages | Server Components with native `fetch`, appropriate caching |
| Admin interface | TanStack Query for caching, mutations, optimistic updates |
| Filters, pagination, search | **URL search params** — shareable, bookmarkable, back-button correct |

Do not lift filter state into React state when the URL can hold it.

---

## 13. SEO

Every public page requires:

- `metadata` export (Next.js Metadata API) — title, description, canonical
- Dynamic metadata for services, projects and blog posts
- Open Graph and Twitter card metadata with a generated share image
- JSON-LD structured data using the appropriate type: `Organization` (site-wide),
  `Service`, `Article`, `BreadcrumbList`
- Semantic heading order — exactly one `<h1>` per page, no level skipping

`sitemap.ts` and `robots.ts` live at the `app/` root and are generated, not hand-written.

---

## 14. Accessibility — non-negotiable

Target: **WCAG 2.1 AA**.

- Semantic HTML first. ARIA only where semantics are insufficient.
- Contrast ≥4.5:1 normal text, ≥3:1 large text and UI boundaries
- Every interactive element reachable and operable by keyboard, in logical order
- Visible focus indicators — never `outline: none` without a replacement
- Every form control has an associated label; errors linked via `aria-describedby`
- Never convey meaning by colour alone — pair with text or an icon
- All images have meaningful `alt`; decorative images use `alt=""`
- Accordions, dropdowns and dialogs follow the WAI-ARIA authoring patterns
- `prefers-reduced-motion` respected
- No horizontal scrolling at any breakpoint
- Touch targets ≥44px

Run axe-core checks on new pages before considering them done.

---

## 15. Media

- `next/image` for all images, with explicit `width`/`height` or `fill` plus `sizes`
- Uploads go to Cloudinary; metadata and alt text stored in MongoDB
- File type and size validated **server-side** — never trust the client
- Generate responsive variants and social-sharing images
- Alt text is a required field on upload, not optional

---

## 16. Responsive behaviour

Mobile-first. Three tiers:

**Desktop** — multi-column, full navigation, large hero type, split featured-project
layout, controlled bento sections.

**Tablet** — two-column cards, reduced type scale, simplified spacing.

**Mobile** — single column, compact header, full-height menu drawer, full-width primary
CTAs, stacked project details, simplified decorative elements, no horizontal scroll.

Test every new section at 375px, 768px, 1280px and 1920px.

---

## 17. Security checklist

- Secrets in environment variables only. **Never commit `.env*`. Never print a secret.**
- Validate every input server-side
- Escape and sanitise any user-generated content before rendering
- Rate-limit auth and public form endpoints
- Role middleware on every protected route
- Audit-log significant admin actions
- Database and media backups configured
- Dependencies kept current; no unmaintained packages

---

## 18. Environment variables

Every variable must appear in `.env.example` with a description and a dummy value.
`.env.example` is committed; `.env*` is not.

Expected set: MongoDB URI, JWT secret, cookie domain, Cloudinary credentials, email
provider API key, Turnstile keys, Sentry DSN, public site URL, public API URL.

`NEXT_PUBLIC_*` variables are visible in the browser. Never prefix a secret.

---

## 19. Git and workflow

- `main` is deployable at all times
- Branches: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`
- Conventional commit subjects: `feat(web): add services grid section`
- Small, focused PRs with a description of what changed and why
- `pnpm lint` and `pnpm typecheck` must pass before commit
- **Do not commit or push unless asked.**

---

## 20. Testing

Three tiers plus a browser tier, all committed and re-runnable. `node:test` (built in, run through `tsx`)
is the only unit/integration runner: do not add Vitest or Jest alongside it.

| Tier | Command | Needs | What it covers |
|---|---|---|---|
| Unit | `pnpm test` | nothing | every Zod schema and status table (`packages/shared`), `whatsapp`/`notifications`/`theme`/rate-limit/Turnstile/route-consistency logic (`apps/web/lib`), and the API's own suites (`apps/api/src/**/*.test.ts`) |
| Integration | `pnpm test:integration` | a local `mongod` | the real Express app over HTTP (`apps/api/src/integration/*.itest.ts`: auth, RBAC across all three roles, CSRF, injection, publishing state machine, XSS, enquiry/quotation workflows, users) and the real `/api/contact` and `/api/quotation` Route Handlers (`apps/web/integration/*.itest.ts`) |
| Browser, fast | `pnpm test:e2e` | mongod, a production build | Chromium: link crawl, SEO, axe, forms, theme (incl. no-flash on hard reload), responsive x theme, admin roles, publishing on the public site |
| Browser, full | `pnpm test:e2e:full` | + Firefox/WebKit installed | the same suite on three engines and three device profiles; run before a release |

Rules that keep the tiers trustworthy:

- **Never point a test at a real database.** `scripts/lib/mongod.mjs` starts a throwaway loopback `mongod`; every harness
  refuses anything but a loopback host and a database name ending `_test`. Fixtures are obviously synthetic (`Test User`,
  `test@example.com`). Tests never read `.env*`.
- **The API and web app are tested as they run**, not against mocks. Only Cloudflare's siteverify call is stubbed (offline
  integration tier); the browser tier uses Cloudflare's published always-pass test keys and needs internet, and skips visibly
  (never passes) if it is offline.
- **Contact email requests are tested with mocked Resend HTTPS responses**, including failures and safe logging; real inbox delivery is a production verification step. Integration tests prove MongoDB persistence survives email failures. Quotation and reset mail remain deferred. **Screen-reader behaviour is NOT tested**: axe-core does not verify assistive technology.
- `apps/web` test files are type-checked by `next build` (they sit in the web tsconfig), so they must typecheck.
- A known defect is tracked with `test.fail(true, reason)` and a comment, never by deleting or loosening the assertion.

---

## 21. Do not

- Add dependencies without asking
- Introduce a global state library
- Use `localStorage` for auth tokens
- Write raw hex colours or arbitrary spacing values in components
- Apply glassmorphism outside the four permitted uses
- Use gradients on body text, every card, or every button
- Skip server-side validation because the client validates
- Return internal errors to the client
- Redesign UI you were not asked to touch
- Delete or rewrite existing working code as a side effect of another task
- Commit `.env` files or print secrets
- Mark work complete without running lint and typecheck

---

## 22. Open decisions

Do not silently resolve these. Ask.

1. **Domain name** — not registered. Affects cookie strategy (section 11.3), email
   addresses, canonical URLs, and Open Graph URLs.
2. **Build phasing** — recommended: phase 1 marketing site with a working contact form;
   phase 2 admin dashboard and blog; phase 3 quotation system. Confirm before scaffolding
   the admin area.
3. **Blog content source** — Resolved 2026-09-19: DB-backed markdown authored in the admin
   dashboard (`/admin/blog`). Posts and categories live in MongoDB (`blogposts`,
   `blogcategories`); the Express API owns writes (`/api/v1/admin/blog/*`), and the public site
   reads published posts directly from MongoDB in `apps/web/lib/blog.ts` (no Render cold start on
   `/blog`). The body is markdown rendered on save by an in-house escaping renderer
   (`apps/api/src/lib/markdown.ts`): no rich-text editor and no new dependency. A post's cover
   image is chosen from the Media Library (`/admin/media`) and stored as `coverMediaId` plus a URL
   snapshot the API keeps in step (Replace repoints posts; Delete is refused while a post uses the
   image); a legacy site path (`/blog/x.png`) is still accepted. Images inside post bodies are not
   supported yet (the renderer has no image syntax). Public blog reads are cached under the
   `blog` tag (`unstable_cache` in `apps/web/lib/blog.ts`, 1-hour safety expiry); the admin UI
   expires the tag after each change through the `revalidateBlogAction` Server Action
   (`apps/web/lib/blogActions.ts`), so a publish or unpublish shows on the next request. The page
   itself stays rendered per request, never cached, so an unpublished post cannot linger.
4. **Transactional email provider** — Resolved 2026-11-19 for Contact notifications: Resend HTTPS API in apps/web/lib/notifications.ts. Quotation and API reset mail remain deferred.
5. **Render hosting tier** — the free tier sleeps and adds ~30s to the first request.
   Unacceptable for a contact form. Either pay, or serve contact/quotation from Next.js
   Route Handlers and reserve Express for the admin API. Resolved 2026-09-18 **for contact
   only**: `/contact` submits to `apps/web/app/api/contact/route.ts` (a Route Handler), not
   the Express API. The Express contact scaffold (`apps/api/src/routes/contact.routes.ts`
   and its controller/service/schema) is retired: valid requests return HTTP 410
   `ENDPOINT_RETIRED`, never an acknowledgement. Validation and rate limiting remain in place.
   The live site does not call it. Quotation's backend is still unresolved.
6. **General email address** — `nexastack@mail.com` is a free generic mailbox and weakens
   credibility. Move to `hello@<domain>` once registered. Do not publish an unmonitored
   address.
7. **Business type** — not specified. Needed for legal pages and `Organization` JSON-LD.
8. **Address publication** — the supplied address is residential in format. Decide whether
   to publish it fully or show only "Uttara, Dhaka, Bangladesh".
9. **Target market** — Resolved 2026-09-17: local and international both. NexaStack works
   with clients in Bangladesh and remotely elsewhere, through the same real channels
   (consultation, quotation form, WhatsApp) either way. Currency, time-zone handling and
   stated response times for international engagements are not yet decided — still open.
10. **Service list** — Resolved 2026-09-14: six services — `business-websites`,
    `mern-nextjs-applications`, `admin-dashboards`, `backend-and-apis`,
    `maintenance-and-bug-fixing`, `performance-seo-audits`. Defined in
    `apps/web/config/services.ts`, the single source of truth for the homepage Featured
    Services section, `/services` and `/services/[slug]`. The Solutions list is still open.
11. **Logo variants** — only a square raster PNG with a white background exists. A
    horizontal lockup, a mark-only version, a reversed dark-mode version and an SVG are all
    needed.
