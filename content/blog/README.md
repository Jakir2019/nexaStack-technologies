# Initial editorial package

The four Markdown files and manifest are import artifacts, not a second public content store.
After import, MongoDB is authoritative; edit posts through `/admin/blog`. The manifest excerpt
is also the SEO description, following the existing article metadata implementation.

## Validate without connecting

From the repository root:

```powershell
pnpm build:shared
pnpm --filter api exec tsx scripts/import-blog.ts
```

This validates shared schemas, unique slugs, 1,200–1,800 word bodies, cover paths, and safe
rendered HTML. It does not load database credentials or perform HTTP requests.

## Development import

Use a dedicated local MongoDB database named with `_dev` or `_development`, configured in
`apps/api/.env`. Start the local API with that exact configuration (no environment overrides
or forwarding to a remote service). Do not repoint this importer at production.
Log in with an existing development account allowed to create content. Store its Cookie header
value in a private temporary file outside the repository; never commit or share that file.

```powershell
pnpm --filter api exec tsx scripts/import-blog.ts --apply --api http://localhost:4000 --origin http://localhost:3000 --session-file C:/private/dev-session.txt
```

The importer refuses remote APIs, remote databases, production configuration, and database
names without a development suffix. Existing API authentication, CSRF, validation, permissions,
Markdown rendering, and audit logging remain active. Existing slugs in every status are skipped;
categories are reused by name or slug. No updates, deletes, or status transitions are sent.
If interrupted, rerun: previously created posts are skipped. A concurrent slug conflict stops
the import safely; rerun after reviewing it. Remove the private session file after use and log out.

Check all four drafts and covers in `/admin/blog`, edit a draft, save, and open Preview.
Draft public URLs intentionally return 404 until an authorized administrator publishes them.

## Covers and licensing

Four original SVG illustrations live in `apps/web/public/images/blog/`, named after each slug.
They were authored for this project, contain no external images, fonts, scripts, or embedded HTML,
and require no third-party attribution. They are illustrations, not screenshots or raster assets.
The existing validated local-cover path supports SVG. Deploy these assets with the web application.
An administrator can later replace a cover with a Media Library selection and meaningful alt text.
SVG social sharing support varies by platform; a raster social image remains a recommended follow-up.

## Production procedure

Do not run this development importer against production. After deploying the reviewed code and
cover assets through the existing authorized release workflow, an authorized administrator can
create each post in `/admin/blog` using the manifest fields and corresponding Markdown body.
Reuse existing categories, check for the exact slug first, and save as Draft. Choose the local
cover path (or upload the original SVG through the existing Media Library) and supplied alt text.
Preview, check internal links, then use Publish with an account holding `content:publish`.
Publishing through the admin UI invalidates the existing blog cache. Verify `/blog`, each detail
URL, filters, images, and sitemap after publishing. No production publication is implied by files
being present in this repository. Cross-article links become public when all four are published.

## Table support

Pipe tables accept a header and matching dash delimiter row, optional outside pipes, inline
formatting, and escaped pipes. Short rows are padded; excess cells are ignored. Alignment markers
are accepted but tables use consistent left alignment. This is a focused GFM-style subset,
not a full GFM parser. Tables use column headers and a labelled keyboard-scrollable region.
Raw HTML stays escaped and link targets retain the existing allow-list checks.
