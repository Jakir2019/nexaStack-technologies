import { quotationNoteSchema, quotationStatusChangeSchema } from '@nexastack/shared';
import { Router } from 'express';

import * as controller from '../controllers/adminQuotations.controller.js';
import { csrfProtection } from '../middleware/csrf.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { requireSession } from '../middleware/requireSession.js';
import { validate } from '../middleware/validate.js';
import {
  attachmentParamsSchema,
  quotationExportQuerySchema,
  quotationListQuerySchema,
} from '../schemas/adminQuotations.js';
import { mongoIdParamSchema } from '../schemas/adminSubmissions.js';

/**
 * Quotation-request management, mounted at `/api/v1/admin/quotations` BEFORE `adminRouter` (see
 * routes/index.ts). Every route needs the `manage:quotations` capability (see `ROLE_PERMISSIONS` in
 * `@nexastack/shared`; today `super_admin` and `admin`, not `content_editor`).
 *
 * Every mutation also passes `csrfProtection` (exact Origin + custom header). Reads do not need
 * it. `/export` is registered BEFORE `/:id` so "export" is never parsed as an id. No rate limiter,
 * consistent with the other session-gated admin routes.
 */
export const adminQuotationsRouter = Router();

adminQuotationsRouter.use(requireSession, requirePermission('manage:quotations'));

const idParams = { params: mongoIdParamSchema };

/**
 * @openapi
 * /api/v1/admin/quotations:
 *   get:
 *     summary: Search, filter and paginate quotation requests
 *     description: >
 *       Query parameters `q` (name/email/company/reference/objectives/project type, matched literally),
 *       `status` (one value or a comma list, e.g. `new,reviewing`), `projectType`, `archived`
 *       (`false` = active view, the default; `true` = archived only), `page`, `limit` (default 20,
 *       max 100). Filtering happens in the database.
 *     tags: [Admin Quotations]
 *     responses:
 *       200: { description: "A page of requests: { items, page, limit, total, totalPages }." }
 *       400: { description: Invalid query (VALIDATION_ERROR). }
 *       401: { description: Not authenticated (UNAUTHENTICATED). }
 *       403: { description: Role not permitted (FORBIDDEN). }
 */
adminQuotationsRouter.get('/', validate({ query: quotationListQuerySchema }), controller.listQuotations);

/**
 * @openapi
 * /api/v1/admin/quotations/export:
 *   get:
 *     summary: Export the currently filtered quotation requests as CSV
 *     description: >
 *       Takes the same `q`, `status`, `projectType` and `archived` parameters as the list and returns
 *       exactly the matching rows (no pagination), one flat row each. RFC 4180 quoting,
 *       formula-injection guard, UTF-8 BOM. Free-text answers, internal notes and attachment URLs are
 *       not exported; attachments appear as a count. Refused with 413 above 5,000 rows. Audited.
 *     tags: [Admin Quotations]
 *     responses:
 *       200: { description: A text/csv attachment. }
 *       400: { description: Invalid query (VALIDATION_ERROR). }
 *       413: { description: Too many rows to export (PAYLOAD_TOO_LARGE). }
 */
adminQuotationsRouter.get(
  '/export',
  validate({ query: quotationExportQuerySchema }),
  controller.exportQuotations,
);

/**
 * @openapi
 * /api/v1/admin/quotations/{id}:
 *   get:
 *     summary: One quotation request, with its attachment list and internal notes
 *     description: >
 *       Has no side effects: opening a request does not change its status. Attachments are listed as
 *       `{ index, name, format, sizeBytes, available }`; the stored Cloudinary URL is never returned.
 *     tags: [Admin Quotations]
 *     responses:
 *       200: { description: The request. }
 *       404: { description: Not found (NOT_FOUND). }
 */
adminQuotationsRouter.get('/:id', validate(idParams), controller.getQuotation);

/**
 * @openapi
 * /api/v1/admin/quotations/{id}/attachments/{attachmentId}:
 *   get:
 *     summary: Download one attachment (admin session required)
 *     description: >
 *       `attachmentId` is the file's index in the request's attachment list. The API fetches the file
 *       from private storage with a short-lived signed request and streams it; the client never
 *       receives a storage URL. Only PDF, PNG and JPEG (verified on the bytes) up to the historical
 *       10 MiB download cap are served; new quotation uploads are limited to 4 MiB,
 *       as `Content-Disposition: attachment` with `nosniff`. Audited.
 *     tags: [Admin Quotations]
 *     responses:
 *       200: { description: The file. }
 *       401: { description: Not authenticated (UNAUTHENTICATED). }
 *       404: { description: No such request or attachment, or an unrecognised stored link (NOT_FOUND). }
 *       413: { description: The stored file is over the size limit (PAYLOAD_TOO_LARGE). }
 *       422: { description: The stored file is not a PDF, PNG or JPEG (VALIDATION_ERROR). }
 *       503: { description: File storage is not configured or could not be reached (SERVICE_UNAVAILABLE). }
 */
adminQuotationsRouter.get(
  '/:id/attachments/:attachmentId',
  validate({ params: attachmentParamsSchema }),
  controller.downloadAttachment,
);

/**
 * @openapi
 * /api/v1/admin/quotations/{id}/status:
 *   patch:
 *     summary: Change a request's status (new, reviewing, quote-sent, accepted, declined, closed)
 *     description: >
 *       Body `{ status }`. Allowed moves come from the shared transition table. Independent of
 *       archiving.
 *     tags: [Admin Quotations]
 *     responses:
 *       200: { description: The updated request. }
 *       400: { description: Invalid status value (VALIDATION_ERROR). }
 *       404: { description: Not found (NOT_FOUND). }
 *       409: { description: Change not allowed from the current status (CONFLICT). }
 */
adminQuotationsRouter.patch(
  '/:id/status',
  csrfProtection,
  validate({ ...idParams, body: quotationStatusChangeSchema }),
  controller.changeStatus,
);

/**
 * @openapi
 * /api/v1/admin/quotations/{id}/notes:
 *   post:
 *     summary: Add an internal note (append-only, attributed to the signed-in admin)
 *     tags: [Admin Quotations]
 *     responses:
 *       201: { description: The updated request, including the new note. }
 *       400: { description: Invalid note (VALIDATION_ERROR). }
 *       404: { description: Not found (NOT_FOUND). }
 *       409: { description: Note limit reached (CONFLICT). }
 */
adminQuotationsRouter.post(
  '/:id/notes',
  csrfProtection,
  validate({ ...idParams, body: quotationNoteSchema }),
  controller.addNote,
);

/**
 * @openapi
 * /api/v1/admin/quotations/{id}/archive:
 *   patch:
 *     summary: Archive a request (any status). Idempotent.
 *     tags: [Admin Quotations]
 *     responses:
 *       200: { description: The updated request. }
 *       404: { description: Not found (NOT_FOUND). }
 * /api/v1/admin/quotations/{id}/unarchive:
 *   patch:
 *     summary: Restore an archived request to the active view. Idempotent.
 *     tags: [Admin Quotations]
 *     responses:
 *       200: { description: The updated request. }
 *       404: { description: Not found (NOT_FOUND). }
 */
adminQuotationsRouter.patch('/:id/archive', csrfProtection, validate(idParams), controller.archive);
adminQuotationsRouter.patch(
  '/:id/unarchive',
  csrfProtection,
  validate(idParams),
  controller.unarchive,
);
