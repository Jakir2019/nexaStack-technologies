import type { Readable } from 'node:stream';

import {
  ERROR_CODES,
  QUOTATION_NOTES_MAX,
  canTransitionQuotation,
  type Paginated,
  type QuotationAdminDetail,
  type QuotationAdminSummary,
  type QuotationAttachmentAdmin,
  type QuotationNoteAdmin,
  type QuotationStatus,
} from '@nexastack/shared';
import mongoose from 'mongoose';

import { env } from '../config/env.js';
import {
  contentDispositionAttachment,
  fetchAssetMetadata,
  fetchAttachmentStream,
  parseStoredAttachmentUrl,
  safeDownloadName,
  type CloudinaryConfig,
} from '../lib/cloudinary.js';
import { AppError, ConflictError, NotFoundError, ServiceUnavailableError } from '../lib/errors.js';
import { skipFor, toPaginated } from '../lib/listQuery.js';
import { logger } from '../lib/logger.js';
import { buildQuotationCsv } from '../lib/quotationExport.js';
import {
  buildQuotationFilter,
  normalizeStatus,
  type QuotationFilter,
} from '../lib/quotationQuery.js';
import { AdminUser } from '../models/AdminUser.js';
import { QuotationSubmission } from '../models/QuotationSubmission.js';
import { type AdminActionContext, logAdminAction } from './adminActivityLog.service.js';
import { EXPORT_MAX_ROWS } from './adminEnquiries.service.js';

export type { QuotationFilter } from '../lib/quotationQuery.js';

const NOT_FOUND_MESSAGE = 'This quotation request was not found. It may have been removed.';

/** Attachment display names are the uploader's own file names: shown as text, capped in length. */
const DISPLAY_NAME_MAX = 100;

function cloudinaryConfig(): CloudinaryConfig | null {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return null;
  return {
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    apiSecret: CLOUDINARY_API_SECRET,
  };
}

/** The fields a list row needs. The list never loads the long free-text answers or the notes. */
const SUMMARY_FIELDS = [
  'referenceNumber',
  'fullName',
  'email',
  'companyName',
  'projectType',
  'budgetRange',
  'status',
  'archived',
  'createdAt',
] as const;

/** What the CSV adds: the flat, short columns a sales-pipeline sheet needs. */
const EXPORT_FIELDS = [
  ...SUMMARY_FIELDS,
  'telephone',
  'country',
  'requiredServices',
  'preferredStartDate',
  'targetCompletionDate',
  'maintenanceRequired',
] as const;

interface QuotationRow {
  _id: mongoose.Types.ObjectId;
  referenceNumber: string;
  fullName: string;
  email: string;
  companyName?: string | null;
  projectType: string;
  budgetRange: string;
  status: string;
  archived?: boolean | null;
  createdAt: Date;
  notesCount: number;
  attachmentCount: number;
}

interface QuotationExportRow extends QuotationRow {
  telephone: string;
  country: string;
  requiredServices: string[];
  preferredStartDate: string;
  targetCompletionDate?: string | null;
  maintenanceRequired: string;
}

/**
 * Matching rows, newest first, with computed `notesCount` and `attachmentCount`. Only the named
 * fields are loaded: the notes array and the attachment URLs are replaced by their counts, and the
 * long free-text answers are left out unless asked for.
 */
async function findRows<T extends QuotationRow>(
  filter: Record<string, unknown>,
  skip: number,
  limit: number,
  fields: readonly string[],
): Promise<T[]> {
  return QuotationSubmission.aggregate<T>([
    { $match: filter },
    { $sort: { createdAt: -1, _id: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $addFields: {
        notesCount: { $size: { $ifNull: ['$notes', []] } },
        attachmentCount: { $size: { $ifNull: ['$attachments', []] } },
      },
    },
    {
      $project: {
        ...Object.fromEntries(fields.map((field) => [field, 1])),
        notesCount: 1,
        attachmentCount: 1,
      },
    },
  ]);
}

function toSummary(row: QuotationRow): QuotationAdminSummary {
  return {
    id: String(row._id),
    referenceNumber: row.referenceNumber,
    fullName: row.fullName,
    email: row.email,
    companyName: row.companyName ?? undefined,
    projectType: row.projectType,
    budgetRange: row.budgetRange,
    status: normalizeStatus(row.status),
    archived: row.archived === true,
    createdAt: row.createdAt.toISOString(),
    attachmentCount: row.attachmentCount,
    notesCount: row.notesCount,
  };
}

export async function listQuotations(
  filter: QuotationFilter,
  page: number,
  limit: number,
): Promise<Paginated<QuotationAdminSummary>> {
  const mongoFilter = buildQuotationFilter(filter);
  const [rows, total] = await Promise.all([
    findRows<QuotationRow>(mongoFilter, skipFor(page, limit), limit, SUMMARY_FIELDS),
    QuotationSubmission.countDocuments(mongoFilter),
  ]);
  return toPaginated(rows.map(toSummary), total, page, limit);
}

/** Notes carry an author id; the UI shows the author's email. A deleted account reads as null. */
async function authorEmails(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  // `trusted`: `sanitizeFilter` would otherwise turn `$in` into `$eq`. The ids are read from our
  // own note subdocuments, never from the request.
  const objectIds = ids.map((value) => new mongoose.Types.ObjectId(value));
  const admins = await AdminUser.find({ _id: mongoose.trusted({ $in: objectIds }) })
    .select('email')
    .lean();
  return new Map(admins.map((admin) => [String(admin._id), admin.email]));
}

/**
 * The attachment list as the admin sees it. The stored values are untrusted URL strings, so each is
 * parsed strictly; an unrecognisable one is listed as unavailable and never linked or fetched. The
 * stored URL itself is never returned. Name and size come from Cloudinary (best-effort).
 */
async function describeAttachments(stored: readonly string[]): Promise<QuotationAttachmentAdmin[]> {
  const config = cloudinaryConfig();

  return Promise.all(
    stored.map(async (raw, index): Promise<QuotationAttachmentAdmin> => {
      const generic = { index, name: `Attachment ${index + 1}`, format: null, sizeBytes: null };
      if (!config) return { ...generic, available: false };

      const ref = parseStoredAttachmentUrl(raw, config.cloudName);
      if (!ref) return { ...generic, available: false };

      const meta = await fetchAssetMetadata(ref, config);
      const original = meta?.originalFilename?.trim().slice(0, DISPLAY_NAME_MAX);
      return {
        index,
        name: original ? `${original}.${ref.format}` : generic.name,
        format: ref.format === 'jpeg' ? 'JPG' : ref.format.toUpperCase(),
        sizeBytes: meta?.bytes ?? null,
        available: true,
      };
    }),
  );
}

async function loadDetail(id: string): Promise<QuotationAdminDetail> {
  const doc = await QuotationSubmission.findById(id).lean();
  if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);

  const notes = doc.notes ?? [];
  const [emails, attachments] = await Promise.all([
    authorEmails([...new Set(notes.map((note) => String(note.authorAdminId)))]),
    describeAttachments(doc.attachments ?? []),
  ]);

  return {
    id: String(doc._id),
    referenceNumber: doc.referenceNumber,
    fullName: doc.fullName,
    email: doc.email,
    companyName: doc.companyName ?? undefined,
    projectType: doc.projectType,
    budgetRange: doc.budgetRange,
    status: normalizeStatus(doc.status),
    archived: doc.archived === true,
    createdAt: (doc.createdAt as Date).toISOString(),
    attachmentCount: attachments.length,
    notesCount: notes.length,

    telephone: doc.telephone,
    country: doc.country,
    requiredServices: doc.requiredServices,
    businessObjectives: doc.businessObjectives,
    targetUsers: doc.targetUsers,
    projectStatus: doc.projectStatus,
    requiredFeatures: doc.requiredFeatures,
    numberOfPages: doc.numberOfPages,
    designRequirements: doc.designRequirements,
    needsAdminDashboard: doc.needsAdminDashboard,
    needsAuthentication: doc.needsAuthentication,
    integrations: doc.integrations ?? undefined,
    referenceWebsites: doc.referenceWebsites ?? [],
    preferredStartDate: doc.preferredStartDate,
    targetCompletionDate: doc.targetCompletionDate ?? undefined,
    maintenanceRequired: doc.maintenanceRequired,
    additionalMessage: doc.additionalMessage ?? undefined,
    attachments,

    archivedAt: doc.archivedAt ? doc.archivedAt.toISOString() : null,
    notes: notes.map(
      (note): QuotationNoteAdmin => ({
        id: String(note._id),
        text: note.text,
        createdAt: note.createdAt.toISOString(),
        authorEmail: emails.get(String(note.authorAdminId)) ?? null,
      }),
    ),
  };
}

/** Reading a request changes nothing: opening it does not alter its status (see `quotationStatus.ts`). */
export async function getQuotation(id: string): Promise<QuotationAdminDetail> {
  return loadDetail(id);
}

/** A manual status change. Allowed moves come from the shared `QUOTATION_STATUS_TRANSITIONS`. */
export async function changeQuotationStatus(
  id: string,
  next: QuotationStatus,
  context: AdminActionContext,
): Promise<QuotationAdminDetail> {
  const doc = await QuotationSubmission.findById(id).select('status').lean();
  if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);

  const from = normalizeStatus(doc.status);
  if (!canTransitionQuotation(from, next)) {
    throw new ConflictError(`This request is ${from}, so it can't be changed to ${next}.`);
  }

  // Conditional on the status we just read, so a concurrent change is a 409, not a silent overwrite.
  const result = await QuotationSubmission.updateOne(
    { _id: id, status: doc.status },
    { $set: { status: next } },
  );
  if (result.modifiedCount !== 1) {
    throw new ConflictError('This request was changed by someone else. Reload the page and try again.');
  }

  await logAdminAction(context, 'quotation_status_changed', {
    quotationId: id,
    from,
    to: next,
  });
  return loadDetail(id);
}

/** Append-only. Logs the note's id and length, never its text (the text already lives on the request). */
export async function addQuotationNote(
  id: string,
  text: string,
  context: AdminActionContext,
): Promise<QuotationAdminDetail> {
  const current = await QuotationSubmission.findById(id).select('notes').lean();
  if (!current) throw new NotFoundError(NOT_FOUND_MESSAGE);
  if ((current.notes?.length ?? 0) >= QUOTATION_NOTES_MAX) {
    throw new ConflictError(`A request can hold at most ${QUOTATION_NOTES_MAX} notes.`);
  }

  const noteId = new mongoose.Types.ObjectId();
  await QuotationSubmission.updateOne(
    { _id: id },
    {
      $push: {
        notes: { _id: noteId, authorAdminId: context.adminId, text, createdAt: new Date() },
      },
    },
  );

  await logAdminAction(context, 'quotation_note_added', {
    quotationId: id,
    noteId: String(noteId),
    length: text.length,
  });
  return loadDetail(id);
}

/** Idempotent: archiving an archived request changes and logs nothing. Status is left alone. */
export async function setQuotationArchived(
  id: string,
  archived: boolean,
  context: AdminActionContext,
): Promise<QuotationAdminDetail> {
  const filter = archived
    ? { _id: id, archived: mongoose.trusted({ $ne: true }) }
    : { _id: id, archived: true };
  const update = archived
    ? { $set: { archived: true, archivedAt: new Date() } }
    : { $set: { archived: false, archivedAt: null } };

  const result = await QuotationSubmission.updateOne(filter, update);

  if (result.modifiedCount === 1) {
    await logAdminAction(context, archived ? 'quotation_archived' : 'quotation_unarchived', {
      quotationId: id,
    });
  }
  return loadDetail(id);
}

export interface AttachmentDownload {
  stream: Readable;
  contentType: string;
  contentDisposition: string;
}

/**
 * Streams one attachment to an authenticated admin. The stored value is parsed strictly, fetched
 * from Cloudinary server-side with a short-lived signed request, checked to really be a PDF/PNG/JPEG
 * and within the size limit, and audited. The browser never learns a Cloudinary address.
 */
export async function getAttachmentDownload(
  id: string,
  index: number,
  context: AdminActionContext,
): Promise<AttachmentDownload> {
  const doc = await QuotationSubmission.findById(id).select('attachments').lean();
  if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);

  const raw = doc.attachments?.[index];
  if (raw === undefined) throw new NotFoundError('That attachment was not found.');

  const config = cloudinaryConfig();
  if (!config) {
    throw new ServiceUnavailableError(
      'Attachment downloads are not set up on this server yet. Ask the site owner to configure file storage.',
    );
  }

  const ref = parseStoredAttachmentUrl(raw, config.cloudName);
  if (!ref) {
    throw new NotFoundError(
      'This file cannot be downloaded: its stored link is not a recognised NexaStack upload.',
    );
  }

  const [meta, fetched] = await Promise.all([
    fetchAssetMetadata(ref, config),
    fetchAttachmentStream(ref, config),
  ]);

  if (!fetched.ok) {
    logger.warn({ quotationId: id, attachmentIndex: index, reason: fetched.reason }, 'Attachment fetch refused');
    if (fetched.reason === 'too-large') {
      throw new AppError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, 'This file exceeds the supported download size, so it was not served.');
    }
    if (fetched.reason === 'not-allowed-type') {
      throw new AppError(422, ERROR_CODES.VALIDATION_ERROR, 'This file is not a PDF, PNG or JPG, so it was not served.');
    }
    throw new ServiceUnavailableError('The file could not be retrieved right now. Please try again shortly.');
  }

  await logAdminAction(context, 'quotation_attachment_downloaded', {
    quotationId: id,
    attachmentIndex: index,
  });

  const asciiName = safeDownloadName(meta?.originalFilename ?? null, index, ref.format);
  const utf8Name = meta?.originalFilename
    ? `${meta.originalFilename.slice(0, DISPLAY_NAME_MAX)}.${ref.format}`
    : asciiName;

  return {
    stream: fetched.stream,
    contentType: fetched.contentType,
    contentDisposition: contentDispositionAttachment(asciiName, utf8Name),
  };
}

export interface QuotationExport {
  csv: string;
  rowCount: number;
}

/**
 * A CSV of EXACTLY the rows the list shows for the same filter (same `buildQuotationFilter`), as one
 * flat row per request. It carries the short pipeline columns only: the long free-text answers,
 * internal notes and attachment URLs are deliberately left out (attachments appear as a COUNT; the
 * files themselves are reachable only one at a time through the session-checked download endpoint).
 * Enum values are written as the labels the admin sees. Logs the export with the active filter.
 */
export async function exportQuotations(
  filter: QuotationFilter,
  context: AdminActionContext,
): Promise<QuotationExport> {
  const mongoFilter = buildQuotationFilter(filter);

  const total = await QuotationSubmission.countDocuments(mongoFilter);
  if (total > EXPORT_MAX_ROWS) {
    throw new AppError(
      413,
      ERROR_CODES.PAYLOAD_TOO_LARGE,
      `${total.toLocaleString('en-US')} requests match, which is more than the ${EXPORT_MAX_ROWS.toLocaleString('en-US')} an export can hold. Narrow the search or filters and try again.`,
    );
  }

  const rows = await findRows<QuotationExportRow>(mongoFilter, 0, EXPORT_MAX_ROWS, EXPORT_FIELDS);
  const csv = buildQuotationCsv(rows);

  await logAdminAction(context, 'quotation_exported', {
    filter: {
      q: filter.q ?? null,
      status: filter.status ?? null,
      projectType: filter.projectType ?? null,
      archived: filter.archived,
    },
    rowCount: rows.length,
  });
  return { csv, rowCount: rows.length };
}
