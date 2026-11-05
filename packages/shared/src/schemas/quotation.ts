import { z } from 'zod';

import { COUNTRIES } from '../constants/countries.js';

/**
 * `/quotation` page's five-step request form. Used by the wizard (React Hook Form resolver,
 * one field subset per step) and by `POST /api/quotation` (the actual security boundary —
 * client validation is convenience only, root CLAUDE.md section 10).
 */

/** Trims a string, turning `''` or all-whitespace into `undefined` so a field stays optional. */
function optionalTrimmedString(max: number, maxMessage: string) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max, { error: maxMessage }).optional(),
  );
}

/**
 * Real service slugs from `apps/web/config/services.ts` (the single source of truth for the
 * services list, root CLAUDE.md 22.10), duplicated here as a literal union because
 * `packages/shared` cannot import from `apps/web` (this package's own CLAUDE.md keeps it
 * environment/app-agnostic). Update both lists together if a service is added, renamed or
 * removed. `'not-sure'` is a distinct, clearly-labelled non-service option, not a fabricated
 * seventh service.
 */
export const REQUIRED_SERVICE_OPTIONS = [
  { value: 'business-websites', label: 'Business website development' },
  { value: 'mern-nextjs-applications', label: 'MERN and Next.js application development' },
  { value: 'admin-dashboards', label: 'Admin dashboard development' },
  { value: 'backend-and-apis', label: 'Backend and API development' },
  { value: 'maintenance-and-bug-fixing', label: 'Bug fixing and maintenance' },
  { value: 'performance-seo-audits', label: 'Performance, SEO and accessibility audits' },
  { value: 'not-sure', label: "Not sure yet" },
] as const;

const REQUIRED_SERVICE_VALUES = REQUIRED_SERVICE_OPTIONS.map((option) => option.value) as [
  string,
  ...string[],
];

/**
 * No existing config in the repo defines a "project type" taxonomy (`config/services.ts` is
 * services, not project shapes; `config/projects.ts` is portfolio case studies with `tags`, not
 * categories). This is a best-effort list built from language NexaStack's own services already
 * use, not an invented, unrelated taxonomy — flagged as an assumption in this task's report.
 */
export const PROJECT_TYPE_OPTIONS = [
  { value: 'new-website', label: 'New website' },
  { value: 'web-application', label: 'Web application' },
  { value: 'ecommerce-store', label: 'E-commerce store' },
  { value: 'admin-dashboard', label: 'Admin dashboard / internal tool' },
  { value: 'api-backend-only', label: 'API / backend only' },
  { value: 'not-sure', label: 'Not sure yet' },
] as const;

const PROJECT_TYPE_VALUES = PROJECT_TYPE_OPTIONS.map((option) => option.value) as [
  string,
  ...string[],
];

export const NUMBER_OF_PAGES_OPTIONS = [
  { value: '1-5', label: '1–5 pages' },
  { value: '6-15', label: '6–15 pages' },
  { value: '16+', label: '16+ pages' },
  { value: 'not-sure', label: 'Not sure yet' },
] as const;

const NUMBER_OF_PAGES_VALUES = NUMBER_OF_PAGES_OPTIONS.map((option) => option.value) as [
  string,
  ...string[],
];

export const DESIGN_REQUIREMENTS_OPTIONS = [
  { value: 'need-full-design', label: 'I need full design from scratch' },
  { value: 'have-some-direction', label: 'I have some direction (colors, references, brand)' },
  { value: 'have-final-designs', label: 'I have final designs ready' },
] as const;

/**
 * Draft placeholder brackets (root CLAUDE.md 22 open decision 3, plus 22.9 target-market
 * unresolved): currency-free size labels so nothing here reads as a real number to ship.
 * Replace with real figures once target market and currency are decided.
 */
export const BUDGET_RANGE_OPTIONS = [
  { value: 'small', label: 'Small project' },
  { value: 'medium', label: 'Medium project' },
  { value: 'large', label: 'Large project' },
  { value: 'enterprise', label: 'Enterprise / ongoing' },
  { value: 'not-sure', label: 'Not sure yet' },
] as const;

const BUDGET_RANGE_VALUES = BUDGET_RANGE_OPTIONS.map((option) => option.value) as [
  string,
  ...string[],
];

export const MAINTENANCE_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'not-sure', label: 'Not sure yet' },
] as const;

/** Quotation uploads: one file per request, sized for Netlify Free Functions. */
export const ATTACHMENT_MAX_FILES = 5;
export const ATTACHMENT_MAX_SIZE_BYTES = 4 * 1024 * 1024;
export const ATTACHMENT_SIZE_LABEL = `${ATTACHMENT_MAX_SIZE_BYTES / (1024 * 1024)} MB`;
export const ATTACHMENT_SIZE_ERROR = `The maximum file size is ${ATTACHMENT_SIZE_LABEL} per attachment. Please select a smaller file.`;
// Bound the WHOLE multipart body, including filenames/fields/boundaries. Base64 of this cap
// is 5,614,252 bytes, leaving headroom below even a decimal 6 MB platform payload limit.
export const ATTACHMENT_MAX_REQUEST_BYTES = ATTACHMENT_MAX_SIZE_BYTES + 16 * 1024;
export const ATTACHMENT_REQUEST_SIZE_ERROR = `The upload request is too large. Attach one file up to ${ATTACHMENT_SIZE_LABEL} with a shorter filename and try again.`;
// A separate schema because quotationSchema receives stored URLs, not File objects or trusted sizes.
export const attachmentSizeSchema = z.number().int()
  .min(1, { error: 'That file appears to be empty. Please choose another file.' })
  .max(ATTACHMENT_MAX_SIZE_BYTES, { error: ATTACHMENT_SIZE_ERROR });
export const ATTACHMENT_ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
export const ATTACHMENT_ACCEPTED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'] as const;

export const quotationUploadAuthorizationSchema = z.object({ turnstileToken: z.string().min(1).max(2048) });
export const quotationUploadIdSchema = z.uuid();
export const quotationUploadRemovalSchema = z.object({ url: z.url().max(2048) });

/** `YYYY-MM-DD` that is also a real calendar day: `2026-02-31` and `2026-13-45` match the shape but are not dates. */
function isRealCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls an overflowing day or month into the next one, so a real date round-trips unchanged.
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const dateFieldSchema = (label: string) =>
  z
    .string({ error: `Please choose ${label}` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: `Please choose ${label} using the date picker` })
    .refine(isRealCalendarDate, { error: `Please choose ${label} using the date picker` });

/**
 * Base object schema (pre-refine) so per-step `.pick()` subsets can be derived from it —
 * `.refine()` below returns a `ZodEffects` wrapper that no longer exposes `.pick()`.
 */
const quotationObjectSchema = z.object({
    // Step 1 — Client information
    fullName: z
      .string({ error: 'Please enter your full name' })
      .trim()
      .min(2, { error: 'Please enter your full name (at least 2 characters)' })
      .max(120, { error: 'Please shorten your name to 120 characters or fewer' }),
    email: z
      .string({ error: 'Please enter your email address' })
      .trim()
      .max(254, { error: 'Please use an email address of 254 characters or fewer' })
      .pipe(z.email({ error: 'Please enter a valid email address, like name@example.com' })),
    telephone: z
      .string({ error: 'Please enter a telephone number' })
      .trim()
      .min(6, { error: 'Please enter a valid telephone number (at least 6 characters)' })
      .max(30, { error: 'Please shorten this to 30 characters or fewer' }),
    companyName: optionalTrimmedString(160, 'Please shorten this to 160 characters or fewer'),
    country: z
      .string({ error: 'Please choose your country' })
      .refine((value) => COUNTRIES.includes(value), {
        error: 'Please choose a country from the list',
      }),

    // Step 2 — Project information
    projectType: z.enum(PROJECT_TYPE_VALUES, { error: 'Please choose a project type' }),
    requiredServices: z
      .array(z.enum(REQUIRED_SERVICE_VALUES), { error: 'Please choose at least one service' })
      .min(1, { error: 'Please choose at least one service' }),
    businessObjectives: z
      .string({ error: 'Please describe your business objectives' })
      .trim()
      .min(10, { error: 'Please tell us a little more (at least 10 characters)' })
      .max(2000, { error: 'Please shorten this to 2,000 characters or fewer' }),
    targetUsers: z
      .string({ error: 'Please describe who this project is for' })
      .trim()
      .min(3, { error: 'Please tell us a little more (at least 3 characters)' })
      .max(500, { error: 'Please shorten this to 500 characters or fewer' }),
    projectStatus: z.enum(['new', 'existing'], {
      error: 'Please choose whether this is a new or existing project',
    }),

    // Step 3 — Project requirements
    requiredFeatures: z
      .string({ error: 'Please describe the features you need' })
      .trim()
      .min(10, { error: 'Please tell us a little more (at least 10 characters)' })
      .max(2000, { error: 'Please shorten this to 2,000 characters or fewer' }),
    numberOfPages: z.enum(NUMBER_OF_PAGES_VALUES, {
      error: 'Please choose an approximate number of pages',
    }),
    designRequirements: z.enum(
      DESIGN_REQUIREMENTS_OPTIONS.map((option) => option.value) as [string, ...string[]],
      { error: 'Please choose your design requirements' },
    ),
    needsAdminDashboard: z.boolean({ error: 'Please choose yes or no' }),
    needsAuthentication: z.boolean({ error: 'Please choose yes or no' }),
    integrations: optionalTrimmedString(1000, 'Please shorten this to 1,000 characters or fewer'),
    referenceWebsites: z
      // http(s) only: a reference website is a web page. `z.url()` alone accepts any scheme (`javascript:`, `file:`).
      .array(
        z
          .string()
          .trim()
          .pipe(z.url({ protocol: /^https?$/, error: 'Please enter a valid URL, like https://example.com' })),
      )
      .max(5, { error: 'Please list 5 or fewer reference websites' })
      .optional(),

    // Step 4 — Budget and timeline
    budgetRange: z.enum(BUDGET_RANGE_VALUES, { error: 'Please choose a budget range' }),
    preferredStartDate: dateFieldSchema('a preferred start date'),
    targetCompletionDate: z
      .preprocess(
        (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
        dateFieldSchema('a target completion date').optional(),
      ),
    maintenanceRequired: z.enum(['yes', 'no', 'not-sure'], {
      error: 'Please choose yes, no, or not sure',
    }),

    // Step 5 — Final submission
    attachments: z
      .array(z.string().url())
      .max(ATTACHMENT_MAX_FILES, { error: `Please attach ${ATTACHMENT_MAX_FILES} files or fewer` })
      .optional(),
    additionalMessage: optionalTrimmedString(2000, 'Please shorten this to 2,000 characters or fewer'),
    consent: z.literal(true, {
      error: 'Please confirm you agree before submitting the request',
    }),
});

export const quotationSchema = quotationObjectSchema.refine(
  (data) => !data.targetCompletionDate || data.targetCompletionDate >= data.preferredStartDate,
  {
    error: 'Target completion date should be on or after the preferred start date',
    path: ['targetCompletionDate'],
  },
);

/** Per-step field subsets, exported for documentation/testability (root CLAUDE.md 10). The
 * wizard itself gates progression with React Hook Form's `trigger(stepFieldNames)` against a
 * single resolver built from the full `quotationSchema`, which is the standard RHF+zod
 * multi-step pattern and avoids juggling five separate resolvers. */
export const quotationStep1Schema = quotationObjectSchema.pick({
  fullName: true,
  email: true,
  telephone: true,
  companyName: true,
  country: true,
});

export const quotationStep2Schema = quotationObjectSchema.pick({
  projectType: true,
  requiredServices: true,
  businessObjectives: true,
  targetUsers: true,
  projectStatus: true,
});

export const quotationStep3Schema = quotationObjectSchema.pick({
  requiredFeatures: true,
  numberOfPages: true,
  designRequirements: true,
  needsAdminDashboard: true,
  needsAuthentication: true,
  integrations: true,
  referenceWebsites: true,
});

export const quotationStep4Schema = quotationObjectSchema.pick({
  budgetRange: true,
  preferredStartDate: true,
  targetCompletionDate: true,
  maintenanceRequired: true,
});
