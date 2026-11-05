import { createHash } from 'node:crypto';

import { serverEnv } from './env.server';

/**
 * Signed Cloudinary upload built from `fetch` + Node's built-in `crypto` (SHA-1, per
 * Cloudinary's documented signing algorithm) instead of the `cloudinary` npm package — no new
 * dependency, same "plain script/fetch over an SDK" approach already used for Cloudflare
 * Turnstile (see components/ui/Turnstile.tsx).
 *
 * No real Cloudinary account is configured in this environment yet (root CLAUDE.md 5's stack
 * table lists Cloudinary, but no credentials exist). `isCloudinaryConfigured` lets the upload
 * route degrade the same way `/api/contact` degrades when Turnstile is unset: a clear error
 * instead of a fake success.
 *
 * CONFIDENTIALITY. Quotation attachments are client project material, so they are uploaded as
 * Cloudinary `type=authenticated`: the bare URL does not work, and only apps/api (which holds the
 * API secret) can retrieve a file, after checking the admin session (see
 * apps/api/src/lib/cloudinary.ts). Before Quotation Management they were uploaded with the default
 * `type=upload`, a public URL that never expires; `apps/api/scripts/migrate-quotation-attachments.ts`
 * moves the ones that already exist.
 */

const DELIVERY_TYPE = 'authenticated';

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    serverEnv.CLOUDINARY_CLOUD_NAME && serverEnv.CLOUDINARY_API_KEY && serverEnv.CLOUDINARY_API_SECRET,
  );
}

export interface CloudinaryUploadResult {
  url: string;
  bytes: number;
  format: string;
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  filename: string,
  publicId: string,
): Promise<CloudinaryUploadResult> {
  const cloudName = serverEnv.CLOUDINARY_CLOUD_NAME;
  const apiKey = serverEnv.CLOUDINARY_API_KEY;
  const apiSecret = serverEnv.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary is not configured');
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  // Cloudinary signs every parameter sent except file, cloud_name, resource_type and api_key,
  // sorted alphabetically as `key=value&key=value...` with the API secret appended.
  if (!/^nexastack\/quotations\/q_[a-f0-9]{32}$/.test(publicId)) throw new Error('Invalid tracked upload identity');
  const paramsToSign = `overwrite=false&public_id=${publicId}&timestamp=${timestamp}&type=${DELIVERY_TYPE}`;
  const signature = createHash('sha1').update(paramsToSign + apiSecret).digest('hex');

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)]), filename);
  form.append('api_key', apiKey);
  form.append('timestamp', timestamp);
  form.append('public_id', publicId);
  form.append('overwrite', 'false');
  form.append('type', DELIVERY_TYPE);
  form.append('signature', signature);

  // PDF, PNG and JPEG use Cloudinary's image resource type. Fix it before upload so a
  // terminated worker can delete the exact asset without guessing a resource type.
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
    // Leave time for parsing and a controlled error within Netlify's 60-second execution limit.
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Cloudinary upload failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    bytes: number;
    format?: string;
    public_id?: string;
    resource_type?: string;
    type?: string;
    version?: number;
  };

  // Never store something as private that Cloudinary did not actually make private.
  if (data.type !== DELIVERY_TYPE) {
    throw new Error('Cloudinary did not store the upload as authenticated');
  }
  if (data.public_id !== publicId || data.resource_type !== 'image' || typeof data.version !== 'number' || data.bytes !== buffer.length || !['pdf', 'png', 'jpg', 'jpeg'].includes(data.format ?? '')) {
    throw new Error('Cloudinary returned an unexpected upload response');
  }

  // Deliberately NOT `secure_url`: for an authenticated asset that URL embeds a signature that never
  // expires, so storing it would keep a live bearer link in the database. This canonical form has no
  // signature and grants nothing on its own; apps/api parses it to fetch the file with the secret.
  const extension = data.format ? `.${data.format}` : '';
  const url = `https://res.cloudinary.com/${cloudName}/${data.resource_type}/${DELIVERY_TYPE}/v${data.version}/${data.public_id}${extension}`;
  return { url, bytes: data.bytes, format: data.format ?? '' };
}

/** Only tracked lifecycle IDs can be destroyed. Never accepts arbitrary URLs or folders. */
export async function deleteQuotationAsset(asset: { cloudName: string; publicId: string; resourceType: string; deliveryType: string }): Promise<void> {
  if (asset.cloudName !== serverEnv.CLOUDINARY_CLOUD_NAME || !/^nexastack\/quotations\/q_[a-f0-9]{32}$/.test(asset.publicId) || asset.resourceType !== 'image' || asset.deliveryType !== DELIVERY_TYPE) throw new Error('Refusing unowned asset deletion');
  if (!isCloudinaryConfigured()) throw new Error('Storage unavailable');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const parameters = `public_id=${asset.publicId}&timestamp=${timestamp}&type=${DELIVERY_TYPE}`;
  const signature = createHash('sha1').update(parameters + serverEnv.CLOUDINARY_API_SECRET).digest('hex');
  const body = new URLSearchParams({ public_id: asset.publicId, timestamp, type: DELIVERY_TYPE, signature, api_key: serverEnv.CLOUDINARY_API_KEY! });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${serverEnv.CLOUDINARY_CLOUD_NAME}/image/destroy`, { method: 'POST', body, signal: AbortSignal.timeout(5_000) });
  const result = await response.json() as { result?: string };
  if (!response.ok || !['ok', 'not found'].includes(result.result ?? '')) throw new Error('Storage deletion failed');
}

// File-type detection by magic number is `sniffFileType` in `@nexastack/shared`: the one implementation,
// shared with apps/api (which serves and accepts these files), so the two cannot disagree. The upload
// route imports it from there.

/**
 * `attachments` on a quotation submission are URLs the browser sends back after uploading, so they are
 * untrusted input: nothing stops a client posting `javascript:…` or a link into another folder or
 * account. This accepts only the exact canonical shape `uploadBufferToCloudinary` produces: https,
 * `res.cloudinary.com`, THIS account, `authenticated` delivery, inside the quotations folder, a plain
 * id, an allowed extension, no query string or fragment. apps/api re-validates the stored value with the
 * same rule before it ever fetches a file (`parseStoredAttachmentUrl`); this is the earlier check, so
 * junk is not stored at all. With no Cloudinary account configured no upload can have happened, so no
 * attachment is acceptable.
 */
const OWN_ATTACHMENT_PATH =
  /^(?:image|raw)\/authenticated\/v\d+\/nexastack\/quotations\/[A-Za-z0-9_-]+\.(?:pdf|png|jpe?g)$/i;

export function isOwnAttachmentUrl(value: string): boolean {
  const cloudName = serverEnv.CLOUDINARY_CLOUD_NAME;
  if (!cloudName || value.length > 2048) return false;

  const prefix = `https://res.cloudinary.com/${cloudName}/`;
  return value.startsWith(prefix) && OWN_ATTACHMENT_PATH.test(value.slice(prefix.length));
}
