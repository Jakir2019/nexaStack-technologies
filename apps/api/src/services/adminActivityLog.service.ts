import type { AdminAuditEntry, Paginated, Role } from '@nexastack/shared';
import mongoose, { type Types } from 'mongoose';

import { adminEmailsById } from '../lib/adminEmails.js';
import { dhakaDayRange } from '../lib/auditDates.js';
import { summarizeAdminEvent } from '../lib/auditSummary.js';
import { skipFor, toPaginated } from '../lib/listQuery.js';
import { logger } from '../lib/logger.js';
import { AdminActivityLog, type AdminActivityEventType } from '../models/AdminActivityLog.js';

export interface LogAdminActivityInput {
  adminUserId?: Types.ObjectId | string | null;
  attemptedEmail?: string;
  eventType: AdminActivityEventType;
  ipAddress: string;
  userAgent: string | undefined;
  metadata?: Record<string, unknown>;
}

/**
 * The only writer of AdminActivityLog. Never pass a password, token, or any other secret in
 * `metadata` — this is a durable audit trail, not a debug log, and nothing here is redacted the
 * way `lib/logger.ts`'s Pino output is.
 * it so a sam
 */
export async function logAdminActivity(input: LogAdminActivityInput): Promise<void> {
  await AdminActivityLog.create({
    adminUserId: input.adminUserId ?? null,
    attemptedEmail: input.attemptedEmail,
    eventType: input.eventType,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: input.metadata,
  });
}

/** Who did something and from where. Built by a controller from `req.admin` and the request;
 * services take it as a plain value and never touch `req`/`res`. */
export interface AdminActionContext {
  adminId: string;
  role: Role;
  ipAddress: string;
  userAgent: string | undefined;
}

/**
 * Audit an admin content action (root CLAUDE.md 17, apps/api/CLAUDE.md 5). Call it AFTER the
 * change has been saved. A failure to write the audit entry is logged loudly but does not fail
 * the request: the change is already durable, and reporting an error for it would tell the
 * admin the save failed when it did not.
 */
export async function logAdminAction(
  context: AdminActionContext,
  eventType: AdminActivityEventType,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await logAdminActivity({
      adminUserId: context.adminId,
      eventType,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata,
    });
  } catch (err) {
    logger.error({ err, eventType, adminId: context.adminId }, 'Failed to write admin audit entry');
  }
}

/** Default page size for the full `/admin/activity` page. The dashboard's compact feed
 * passes a smaller explicit limit instead (see routes/admin.routes.ts). */
const RECENT_ACTIVITY_LIMIT = 100;

export interface RecentActivityEntry {
  id: string;
  eventType: AdminActivityEventType;
  attemptedEmail: string | undefined;
  ipAddress: string | undefined;
  userAgent: string | undefined;
  createdAt: Date;
}

/** Read-only, for `/admin/activity` and the dashboard's compact activity feed. `.lean()`
 * since this is display-only, per root CLAUDE.md 11.5. */
export async function listRecentAdminActivity(
  limit: number = RECENT_ACTIVITY_LIMIT,
): Promise<RecentActivityEntry[]> {
  const entries = await AdminActivityLog.find().sort({ createdAt: -1 }).limit(limit).lean();

  return entries.map((entry) => ({
    id: entry._id.toString(),
    eventType: entry.eventType as AdminActivityEventType,
    attemptedEmail: entry.attemptedEmail ?? undefined,
    ipAddress: entry.ipAddress ?? undefined,
    userAgent: entry.userAgent ?? undefined,
    createdAt: entry.createdAt as Date,
  }));
}

export interface AuditFilter {
  event?: AdminActivityEventType | undefined;
  /** `YYYY-MM-DD`, a day in Asia/Dhaka (see `lib/auditDates.ts`). */
  from?: string | undefined;
  to?: string | undefined;
}

/**
 * The audit view's data: newest first, filtered by event type and/or date range IN THE DATABASE query,
 * paginated. Each row names the admin who acted (one batched lookup for the page), and account events
 * carry a short summary. `.lean()`: display-only.
 */
export async function queryAdminActivity(
  filter: AuditFilter,
  page: number,
  limit: number,
): Promise<Paginated<AdminAuditEntry>> {
  const mongoFilter: Record<string, unknown> = {};
  if (filter.event) mongoFilter.eventType = filter.event;

  const range = dhakaDayRange(filter.from, filter.to);
  if (range.gte || range.lte) {
    // `trusted`: `sanitizeFilter` would otherwise turn `$gte`/`$lte` into `$eq`. The operands are Dates
    // built from a validated `YYYY-MM-DD`, never raw request objects.
    mongoFilter.createdAt = mongoose.trusted({
      ...(range.gte ? { $gte: range.gte } : {}),
      ...(range.lte ? { $lte: range.lte } : {}),
    });
  }

  const [docs, total] = await Promise.all([
    AdminActivityLog.find(mongoFilter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skipFor(page, limit))
      .limit(limit)
      .lean(),
    AdminActivityLog.countDocuments(mongoFilter),
  ]);

  const emails = await adminEmailsById(
    docs.flatMap((doc) => (doc.adminUserId ? [String(doc.adminUserId)] : [])),
  );

  const items = docs.map(
    (doc): AdminAuditEntry => ({
      id: String(doc._id),
      eventType: doc.eventType as AdminActivityEventType,
      actorEmail: doc.adminUserId ? (emails.get(String(doc.adminUserId)) ?? null) : null,
      attemptedEmail: doc.attemptedEmail ?? undefined,
      ipAddress: doc.ipAddress ?? undefined,
      summary: summarizeAdminEvent(
        doc.eventType,
        (doc.metadata ?? undefined) as Record<string, unknown> | undefined,
      ),
      createdAt: (doc.createdAt as Date).toISOString(),
    }),
  );

  return toPaginated(items, total, page, limit);
}
