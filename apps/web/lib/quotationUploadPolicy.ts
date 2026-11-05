import { ATTACHMENT_MAX_FILES, ATTACHMENT_MAX_SIZE_BYTES } from '@nexastack/shared';
import { z } from 'zod';

const seconds = (fallback: number, max: number) =>
  z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(60).max(max).default(fallback),
  );
const count = (fallback: number, max: number) =>
  z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(1).max(max).default(fallback),
  );
const config = z
  .object({
    QUOTATION_UPLOAD_TTL_SECONDS: seconds(600, 3600),
    QUOTATION_UPLOAD_RETENTION_SECONDS: seconds(86400, 604800),
    QUOTATION_UPLOAD_AUTH_ATTEMPTS: count(120, 1000),
    QUOTATION_UPLOAD_SESSIONS: count(30, 500),
    QUOTATION_UPLOAD_ATTEMPTS: count(20, 100),
    QUOTATION_UPLOAD_GLOBAL_REQUESTS: count(600, 5000),
    QUOTATION_UPLOAD_DAILY_FILES: count(100, 1000),
    QUOTATION_UPLOAD_DAILY_BYTES: count(100 * 1024 * 1024, 500 * 1024 * 1024),
    QUOTATION_CLEANUP_BATCH_SIZE: count(2, 5),
  })
  .refine(
    (values) =>
      values.QUOTATION_UPLOAD_RETENTION_SECONDS >= values.QUOTATION_UPLOAD_TTL_SECONDS + 300,
    { message: 'Upload retention must exceed authorization lifetime by at least five minutes.' },
  )
  .parse(process.env);

export const uploadPolicy = {
  ttlMs: config.QUOTATION_UPLOAD_TTL_SECONDS * 1000,
  retentionMs: config.QUOTATION_UPLOAD_RETENTION_SECONDS * 1000,
  authAttempts: config.QUOTATION_UPLOAD_AUTH_ATTEMPTS,
  sessions: config.QUOTATION_UPLOAD_SESSIONS,
  attempts: config.QUOTATION_UPLOAD_ATTEMPTS,
  globalRequests: config.QUOTATION_UPLOAD_GLOBAL_REQUESTS,
  dailyFiles: config.QUOTATION_UPLOAD_DAILY_FILES,
  dailyBytes: config.QUOTATION_UPLOAD_DAILY_BYTES,
  sessionRequests: 60,
  submitRequests: 120,
  batch: config.QUOTATION_CLEANUP_BATCH_SIZE,
  windowMs: 15 * 60_000,
  leaseMs: 5 * 60_000,
  maxFiles: ATTACHMENT_MAX_FILES,
  maxBytes: ATTACHMENT_MAX_FILES * ATTACHMENT_MAX_SIZE_BYTES,
};
