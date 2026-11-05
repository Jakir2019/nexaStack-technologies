import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { quotationSchema, type QuotationInput } from '@nexastack/shared';
import {
  QuotationUpload,
  uploadSessions,
  ensureUploadDatabase,
  type UploadSession,
  type UploadAsset,
} from './models/QuotationUpload';
import { QuotationSubmission } from './models/QuotationSubmission';
import { uploadPolicy } from './quotationUploadPolicy';
import { hashCredential, UploadError, uploadRateLimit } from './quotationUploadSecurity';
import { deleteQuotationAsset } from './cloudinary';
import { serverEnv } from './env.server';

const sessions = uploadSessions;
export async function issueUploadSession(
  previous?: string,
): Promise<{ token: string; expiresAt: Date }> {
  await ensureUploadDatabase();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + uploadPolicy.ttlMs);
  if (previous) {
    const renewed = await sessions().findOneAndUpdate(
      {
        tokenHash: hashCredential(previous),
        purpose: 'quotation-upload',
        status: 'active',
        retainUntil: { $gt: expiresAt },
      },
      { $set: { expiresAt } },
    );
    if (renewed) return { token: previous, expiresAt };
  }
  const token = randomBytes(32).toString('hex');
  await QuotationUpload.create({
    tokenHash: hashCredential(token),
    purpose: 'quotation-upload',
    status: 'active',
    createdAt: now,
    expiresAt,
    retainUntil: new Date(now.getTime() + uploadPolicy.retentionMs),
    leaseUntil: new Date(0),
    attempts: 0,
    usedBytes: 0,
    assets: [],
    // No Cloudinary asset exists yet. Reservation atomically removes this TTL before upload.
    purgeAt: new Date(now.getTime() + uploadPolicy.retentionMs),
    cleanupFailures: 0,
  });
  return { token, expiresAt };
}
export async function activeUploadSession(token: string): Promise<UploadSession> {
  await ensureUploadDatabase();
  const session = await sessions().findOne({
    tokenHash: hashCredential(token),
    purpose: 'quotation-upload',
    status: 'active',
    expiresAt: { $gt: new Date() },
    retainUntil: { $gt: new Date() },
  });
  if (!session)
    throw new UploadError(
      401,
      'Attachment permission expired. Verify again to continue; your form details are safe.',
    );
  return session;
}
/** One atomic compare-and-set reserves a slot, bytes, and the single upload lease. Metadata
 * precedes Cloudinary, so even a killed worker leaves an exact asset ID for reconciliation. */
export async function reserveUpload(
  token: string,
  id: string,
  size: number,
  mime: string,
): Promise<{ asset: UploadAsset; existing: boolean }> {
  const current = await activeUploadSession(token);
  const existing = current.assets.find((a) => a.id === id);
  if (existing) {
    if (existing.status === 'uploaded' && existing.size === size && existing.mime === mime)
      return { asset: existing, existing: true };
    throw new UploadError(
      409,
      'This upload is still processing or was removed. Please retry shortly.',
    );
  }
  const now = Date.now();
  const asset: UploadAsset = {
    id,
    cloudName: serverEnv.CLOUDINARY_CLOUD_NAME!,
    publicId: `nexastack/quotations/q_${randomBytes(16).toString('hex')}`,
    resourceType: 'image',
    deliveryType: 'authenticated',
    size,
    mime,
    status: 'uploading',
    expiresAt: new Date(now + uploadPolicy.retentionMs),
  };
  const reserved = await sessions().findOneAndUpdate(
    {
      _id: current._id,
      status: 'active',
      expiresAt: { $gt: new Date(now) },
      leaseUntil: { $lte: new Date(now) },
      attempts: { $lt: uploadPolicy.attempts },
      usedBytes: { $lte: uploadPolicy.maxBytes - size },
      'assets.id': { $ne: id },
      $expr: {
        $lt: [
          {
            $size: {
              $filter: {
                input: '$assets',
                as: 'asset',
                cond: { $in: ['$$asset.status', ['uploading', 'uploaded']] },
              },
            },
          },
          uploadPolicy.maxFiles,
        ],
      },
    },
    {
      $push: { assets: asset },
      $inc: { attempts: 1, usedBytes: size },
      $max: { retainUntil: asset.expiresAt },
      $unset: { purgeAt: '' },
      $set: { leaseUntil: new Date(now + uploadPolicy.leaseMs), leaseOwner: id },
    },
  );
  if (!reserved)
    throw new UploadError(
      429,
      'Upload allowance reached or another file is processing. Wait before retrying, or submit without further attachments.',
    );
  // Conservative budgets include uncertain attempts; never refund a possible remote write.
  try {
    await uploadRateLimit('daily-files', uploadPolicy.dailyFiles, now, 1, 86400_000);
    await uploadRateLimit('daily-bytes', uploadPolicy.dailyBytes, now, size, 86400_000);
  } catch (error) {
    // No external write has started. This known failure can release the per-session reservation.
    // If this update itself fails, the durable reservation remains discoverable by cleanup.
    await sessions().updateOne(
      { _id: current._id, leaseOwner: id, 'assets.id': id },
      {
        $set: {
          'assets.$.status': 'deleted',
          leaseUntil: new Date(0),
          ...(current.assets.every((a) => a.status === 'deleted')
            ? { purgeAt: asset.expiresAt }
            : {}),
        },
        $inc: { usedBytes: -size },
        $unset: { leaseOwner: '' },
      },
    );
    throw error;
  }
  return { asset, existing: false };
}
export async function finishUpload(token: string, id: string, url: string): Promise<void> {
  const expiresAt = new Date(Date.now() + uploadPolicy.retentionMs);
  const result = await sessions().updateOne(
    { tokenHash: hashCredential(token), status: 'active', leaseOwner: id, 'assets.id': id },
    {
      $set: {
        'assets.$.status': 'uploaded',
        'assets.$.url': url,
        'assets.$.expiresAt': expiresAt,
        leaseUntil: new Date(0),
      },
      $max: { retainUntil: expiresAt },
      $unset: { leaseOwner: '' },
    },
  );
  if (result.modifiedCount !== 1)
    throw new UploadError(409, 'The upload could not be confirmed. Please retry shortly.');
}
export async function removeUpload(token: string, url: string): Promise<void> {
  const current = await activeUploadSession(token);
  await sessions().updateOne(
    { _id: current._id, status: 'active', assets: { $elemMatch: { url, status: 'uploaded' } } },
    {
      $set: { 'assets.$.status': 'cleanup_pending' },
    },
  );
  // Cleanup remains delayed until retention expiry, preventing any late upload completion race.
}
export const quotationPayloadHash = (payload: QuotationInput) =>
  hashCredential(JSON.stringify(payload));

export async function revokeUnusedSession(token: string): Promise<void> {
  // A no-attachment submission also closes any upload permission for the current draft.
  await sessions().updateOne(
    { tokenHash: hashCredential(token), purpose: 'quotation-upload', status: 'active' },
    { $set: { status: 'revoked' } },
  );
}

/** Frozen finalizing state is an outbox: cleanup can finish the insert after a crash but can
 * never delete its selected files. Deterministic _id makes retries safe without transactions. */
export async function reconcileQuotation(session: UploadSession): Promise<string> {
  if (!session.quotationId || !session.referenceNumber)
    throw new Error('Missing finalization identity');
  if (session.status === 'submitted') return session.referenceNumber;
  if (session.status !== 'finalizing' || !session.payload)
    throw new UploadError(409, 'The quotation is not ready to submit.');
  const data = quotationSchema.parse(session.payload);
  await QuotationSubmission.updateOne(
    { _id: session.quotationId },
    { $setOnInsert: { ...data, referenceNumber: session.referenceNumber } },
    { upsert: true, runValidators: true },
  );
  const assets = session.assets.map((asset) => ({
    ...asset,
    status: data.attachments?.includes(asset.url ?? '') ? ('committed' as const) : asset.status,
  }));
  await sessions().updateOne(
    { _id: session._id, status: 'finalizing' },
    {
      $set: {
        status: 'submitted',
        assets,
        ...(assets.every((a) => a.status === 'committed' || a.status === 'deleted')
          ? { purgeAt: new Date(Date.now() + 30 * 86400_000) }
          : {}),
      },
      $unset: { payload: '' },
    },
  );
  return session.referenceNumber;
}
export async function retryQuotation(
  token: string,
  data: QuotationInput,
): Promise<string | undefined> {
  await ensureUploadDatabase();
  const existing = await sessions().findOne({
    tokenHash: hashCredential(token),
    purpose: 'quotation-upload',
    status: { $in: ['finalizing', 'submitted'] },
  });
  if (!existing) return;
  if (existing.payloadHash !== quotationPayloadHash(data))
    throw new UploadError(
      409,
      'This draft was already submitted. Start a new quotation for different details.',
    );
  return reconcileQuotation(existing);
}
export async function commitQuotation(token: string, data: QuotationInput): Promise<string> {
  const retry = await retryQuotation(token, data);
  if (retry) return retry;
  let current: UploadSession;
  try {
    current = await activeUploadSession(token);
  } catch (error) {
    // Another request may have completed between the first retry lookup and authorization read.
    const completed = await retryQuotation(token, data);
    if (completed) return completed;
    throw error;
  }
  const urls = data.attachments ?? [];
  if (
    new Set(urls).size !== urls.length ||
    urls.some(
      (url) =>
        !current.assets.some(
          (a) => a.url === url && a.status === 'uploaded' && a.expiresAt.getTime() > Date.now(),
        ),
    )
  ) {
    throw new UploadError(
      400,
      'An attachment does not belong to this draft or is no longer available. Remove it and upload it again.',
    );
  }
  const quotationId = new mongoose.Types.ObjectId();
  const frozen = await sessions().findOneAndUpdate(
    {
      _id: current._id,
      status: 'active',
      expiresAt: { $gt: new Date() },
      leaseUntil: { $lte: new Date() },
      // Compare the complete asset snapshot: a remove/upload racing this write must retry.
      assets: current.assets,
    },
    {
      $set: {
        status: 'finalizing',
        payload: data,
        payloadHash: quotationPayloadHash(data),
        quotationId,
        referenceNumber: `NXQ-${quotationId.toHexString().slice(-8).toUpperCase()}`,
      },
    },
    { returnDocument: 'after' },
  );
  if (!frozen)
    throw new UploadError(
      409,
      'Files are still changing. Wait for uploads to finish, then submit again.',
    );
  return reconcileQuotation(frozen);
}

/** Final-submit nonce is separate from upload authorization and grants no upload permission.
 * The caller must verify the final Turnstile challenge before first creating this outbox. */
export async function commitUnattachedQuotation(
  nonce: string,
  data: QuotationInput,
): Promise<string> {
  const token = `submission:${nonce}`;
  const retry = await retryQuotation(token, data);
  if (retry) return retry;
  const quotationId = new mongoose.Types.ObjectId();
  const now = new Date();
  try {
    await QuotationUpload.create({
      tokenHash: hashCredential(token),
      purpose: 'quotation-upload',
      status: 'finalizing',
      createdAt: now,
      expiresAt: now,
      retainUntil: new Date(Date.now() + uploadPolicy.retentionMs),
      leaseUntil: new Date(0),
      attempts: 0,
      usedBytes: 0,
      assets: [],
      cleanupFailures: 0,
      payload: data,
      payloadHash: quotationPayloadHash(data),
      quotationId,
      referenceNumber: `NXQ-${quotationId.toHexString().slice(-8).toUpperCase()}`,
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  const result = await retryQuotation(token, data);
  if (!result) throw new Error('Submission recovery failed');
  return result;
}

/** Bounded work with durable leases. A crashed worker's lease can be reclaimed. Assets cannot
 * be recommitted once cleaning wins the atomic state transition. Never touch legacy assets. */
export async function cleanupQuotationUploads(): Promise<{
  deleted: number;
  failed: number;
  recovered: number;
}> {
  await ensureUploadDatabase();
  const deadline = Date.now() + 18_000;
  const result = { deleted: 0, failed: 0, recovered: 0 };
  const pending = await sessions()
    .find({ status: 'finalizing' })
    .limit(uploadPolicy.batch)
    .toArray();
  for (const session of pending) {
    try {
      await reconcileQuotation(session);
      result.recovered++;
    } catch {
      result.failed++;
    }
  }
  for (let batch = 0; batch < uploadPolicy.batch && Date.now() < deadline; batch++) {
    const owner = randomUUID();
    const now = new Date();
    const session = await sessions().findOneAndUpdate(
      {
        status: { $in: ['active', 'submitted', 'revoked', 'cleaning'] },
        retainUntil: { $lte: now },
        leaseUntil: { $lte: now },
        purgeAt: { $exists: false },
      },
      {
        $set: {
          status: 'cleaning',
          leaseOwner: owner,
          leaseUntil: new Date(Date.now() + uploadPolicy.leaseMs),
        },
      },
      { returnDocument: 'after' },
    );
    if (!session) break;
    let failed = false;
    for (const asset of session.assets) {
      if (Date.now() >= deadline) break;
      if (asset.status === 'deleted' || asset.status === 'committed') continue;
      try {
        // Defense in depth: a real quotation reference always wins, even after historical/manual repair.
        const referenced =
          asset.url && (await QuotationSubmission.exists({ attachments: asset.url }));
        if (!referenced) {
          await deleteQuotationAsset(asset);
          result.deleted++;
        }
        await sessions().updateOne(
          { _id: session._id, status: 'cleaning', leaseOwner: owner, 'assets.id': asset.id },
          { $set: { 'assets.$.status': referenced ? 'committed' : 'deleted' } },
        );
      } catch {
        failed = true;
        result.failed++;
      }
    }
    const latest = await sessions().findOne({ _id: session._id, leaseOwner: owner });
    if (!latest) continue;
    const complete = latest.assets.every((a) => a.status === 'committed' || a.status === 'deleted');
    await sessions().updateOne(
      { _id: session._id, leaseOwner: owner },
      {
        $set: {
          status: session.quotationId ? 'submitted' : 'revoked',
          leaseUntil: new Date(Date.now() + (failed ? uploadPolicy.windowMs : 0)),
          ...(complete ? { purgeAt: new Date(Date.now() + 30 * 86400_000) } : {}),
        },
        $unset: { leaseOwner: '' },
        ...(failed ? { $inc: { cleanupFailures: 1 } } : {}),
      },
    );
  }
  console.info('[quotation-cleanup]', result);
  return result;
}
