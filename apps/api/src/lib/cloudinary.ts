import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStreamReadResult } from 'node:stream/web';

import { sniffFileType, type SniffedFileType } from '@nexastack/shared';

// Historical quotation uploads allowed 10 MiB. Keep those private files downloadable;
// the new 4 MiB upload limit must not retroactively invalidate stored attachments.
export const ATTACHMENT_DOWNLOAD_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Server-side access to quotation attachments stored in Cloudinary. Built from `fetch` and Node's
 * `crypto` (no SDK, no new dependency), like `apps/web/lib/cloudinary.ts`.
 *
 * WHY THIS EXISTS. Uploads are stored as Cloudinary `type=authenticated`, so their bare URL does not
 * work. Only this API (which holds the API secret) can retrieve one, and only after the admin
 * session has been checked. No Cloudinary address is ever sent to the browser: the admin UI receives
 * an index and asks the API to stream the file.
 *
 * The stored `attachments` values are URL strings that originated in a public request body, so they
 * are UNTRUSTED. `parseStoredAttachmentUrl` accepts only an https URL on `res.cloudinary.com` in this
 * account's cloud, inside the quotations folder, with a plain public id and an allowed extension.
 * Anything else (`javascript:`, another host, another folder, traversal, percent-encoding) is
 * rejected and never fetched or linked.
 *
 * This module is pure: configuration is passed in, so it can be unit-tested without the environment.
 */

export const CLOUDINARY_FOLDER = 'nexastack/quotations';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export type CloudinaryDeliveryType = 'upload' | 'authenticated';

export interface CloudinaryAssetRef {
  resourceType: 'image' | 'raw';
  type: CloudinaryDeliveryType;
  /** Digits only, without the leading `v`; null if the URL had no version segment. */
  version: string | null;
  /** Includes the folder, excludes the extension: `nexastack/quotations/abc123`. */
  publicId: string;
  /** Lower-case extension: `pdf`, `png`, `jpg` or `jpeg`. */
  format: AttachmentFormat;
}

export const ATTACHMENT_FORMATS = ['pdf', 'png', 'jpg', 'jpeg'] as const;
export type AttachmentFormat = (typeof ATTACHMENT_FORMATS)[number];

/** Letters, digits, `_`, `-` and `/` only: nothing that could change the meaning of a URL or path. */
const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_\-/]+$/;
const VERSION_PATTERN = /^v(\d+)$/;
const SIGNATURE_SEGMENT_PATTERN = /^s--[A-Za-z0-9_-]+--$/;

export function isAttachmentFormat(value: string): value is AttachmentFormat {
  return (ATTACHMENT_FORMATS as readonly string[]).includes(value);
}

/**
 * Parses a stored attachment value into an asset reference, or null if it is not an upload made by
 * this site's own pipeline. Both shapes are accepted: the legacy public
 * `…/image/upload/v1/nexastack/quotations/x.pdf` and the canonical authenticated
 * `…/image/authenticated/v1/nexastack/quotations/x.pdf` (a signature segment, if one was stored, is
 * ignored).
 */
export function parseStoredAttachmentUrl(raw: string, cloudName: string): CloudinaryAssetRef | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
  // No percent-encoding anywhere: our own ids never need it, and it is the usual traversal disguise.
  if (raw.includes('%') || raw.includes('\\')) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (url.hostname !== 'res.cloudinary.com') return null;
  if (url.username || url.password || url.port || url.search || url.hash) return null;

  // pathname is `/<cloud>/<resource_type>/<type>/[s--sig--/][v123/]<public_id>.<ext>`
  const segments = url.pathname.split('/').slice(1);
  const [cloud, resourceType, type, ...rest] = segments;
  if (cloud !== cloudName) return null;
  if (resourceType !== 'image' && resourceType !== 'raw') return null;
  if (type !== 'upload' && type !== 'authenticated') return null;

  let index = 0;
  if (rest[index] !== undefined && SIGNATURE_SEGMENT_PATTERN.test(rest[index] as string)) index += 1;

  let version: string | null = null;
  const versionMatch = rest[index] !== undefined ? VERSION_PATTERN.exec(rest[index] as string) : null;
  if (versionMatch) {
    version = versionMatch[1] as string;
    index += 1;
  }

  const idWithExtension = rest.slice(index).join('/');
  const dot = idWithExtension.lastIndexOf('.');
  if (dot <= 0) return null;

  const publicId = idWithExtension.slice(0, dot);
  const format = idWithExtension.slice(dot + 1).toLowerCase();

  if (!isAttachmentFormat(format)) return null;
  if (!PUBLIC_ID_PATTERN.test(publicId)) return null;
  if (publicId.split('/').some((part) => part === '' || part === '.' || part === '..')) return null;
  if (!publicId.startsWith(`${CLOUDINARY_FOLDER}/`)) return null;

  return { resourceType, type, version, publicId, format };
}

/** The canonical URL stored for an asset: no signature, so the stored value grants nothing on its own. */
export function canonicalAttachmentUrl(cloudName: string, ref: CloudinaryAssetRef): string {
  const version = ref.version ? `v${ref.version}/` : '';
  return `https://res.cloudinary.com/${cloudName}/${ref.resourceType}/${ref.type}/${version}${ref.publicId}.${ref.format}`;
}

const UNSIGNED_PARAMS = new Set(['file', 'cloud_name', 'resource_type', 'api_key']);

/**
 * Cloudinary's request signature: parameters sorted by name and joined as `name=value&…`, the API
 * secret appended, SHA-1, hex. `file`, `cloud_name`, `resource_type` and `api_key` are never signed.
 * Undefined and empty values are dropped.
 */
export function signCloudinaryParams(
  params: Record<string, string | number | undefined>,
  apiSecret: string,
): string {
  const toSign = Object.entries(params)
    .filter(([name, value]) => value !== undefined && value !== '' && !UNSIGNED_PARAMS.has(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${String(value)}`)
    .join('&');
  return createHash('sha1')
    .update(toSign + apiSecret)
    .digest('hex');
}

/** How long a generated download URL stays valid. The API fetches it immediately, so this is short. */
export const DOWNLOAD_URL_TTL_SECONDS = 120;

/**
 * A short-lived, signed URL for Cloudinary's authenticated download endpoint (the documented
 * `private_download_url`). Unlike a signed delivery URL, which never expires, this one does.
 * Used only server-side; it is fetched by this API and never returned to a client.
 */
export function buildPrivateDownloadUrl(
  ref: CloudinaryAssetRef,
  config: CloudinaryConfig,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const params: Record<string, string | number> = {
    expires_at: nowSeconds + DOWNLOAD_URL_TTL_SECONDS,
    format: ref.format,
    public_id: ref.publicId,
    timestamp: nowSeconds,
    type: ref.type,
  };
  const signature = signCloudinaryParams(params, config.apiSecret);
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([name, value]) => [name, String(value)])),
    api_key: config.apiKey,
    signature,
  });
  return `https://api.cloudinary.com/v1_1/${config.cloudName}/${ref.resourceType}/download?${query.toString()}`;
}

export interface AssetMetadata {
  originalFilename: string | null;
  bytes: number | null;
}

/**
 * The original file name and size, from Cloudinary's Admin API. Best-effort: any failure (network,
 * quota, unexpected shape) returns null and the caller falls back to a generic label. Never throws.
 */
export async function fetchAssetMetadata(
  ref: CloudinaryAssetRef,
  config: CloudinaryConfig,
): Promise<AssetMetadata | null> {
  const basic = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64');
  const url = `https://api.cloudinary.com/v1_1/${config.cloudName}/resources/${ref.resourceType}/${ref.type}/${ref.publicId}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { original_filename?: unknown; bytes?: unknown };
    return {
      originalFilename:
        typeof body.original_filename === 'string' && body.original_filename.trim() !== ''
          ? body.original_filename
          : null,
      bytes: typeof body.bytes === 'number' && Number.isFinite(body.bytes) ? body.bytes : null,
    };
  } catch {
    return null;
  }
}

/**
 * The real type of a file from its first bytes, so only a PDF, PNG or JPEG is ever served. This is
 * the ONE shared implementation (`@nexastack/shared`), also used by apps/web's quotation upload; the
 * names below are kept so this module's callers and tests are unchanged.
 */
export type SniffedAttachmentType = SniffedFileType;
export const sniffAttachmentType = sniffFileType;

export type AttachmentFetchFailure = 'unavailable' | 'not-allowed-type' | 'too-large';

export type AttachmentFetchResult =
  | { ok: true; stream: Readable; contentType: SniffedAttachmentType }
  | { ok: false; reason: AttachmentFetchFailure };

/**
 * Fetches an attachment from Cloudinary (server-side, with a timeout) and returns it as a Node
 * stream. Refuses anything that is not really a PDF/PNG/JPEG (checked on the bytes, not on a header)
 * and anything larger than the legacy download limit, whatever the upstream says about its length.
 */
export async function fetchAttachmentStream(
  ref: CloudinaryAssetRef,
  config: CloudinaryConfig,
): Promise<AttachmentFetchResult> {
  let response: Response;
  try {
    response = await fetch(buildPrivateDownloadUrl(ref, config), {
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (!response.ok || !response.body) return { ok: false, reason: 'unavailable' };

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > ATTACHMENT_DOWNLOAD_MAX_SIZE_BYTES) {
    await response.body.cancel();
    return { ok: false, reason: 'too-large' };
  }

  const reader = response.body.getReader();
  const first = await reader.read();
  if (first.done || !first.value) return { ok: false, reason: 'unavailable' };

  const contentType = sniffAttachmentType(first.value);
  if (!contentType) {
    await reader.cancel();
    return { ok: false, reason: 'not-allowed-type' };
  }

  let received = 0;
  async function* chunks(): AsyncGenerator<Uint8Array> {
    let next: ReadableStreamReadResult<Uint8Array> = first;
    while (!next.done) {
      received += next.value.byteLength;
      if (received > ATTACHMENT_DOWNLOAD_MAX_SIZE_BYTES) {
        await reader.cancel();
        throw new Error('Attachment exceeded the size limit while streaming');
      }
      yield next.value;
      next = await reader.read();
    }
  }

  // No Content-Length is passed on: fetch decodes compressed bodies, so the upstream length may not
  // match the bytes streamed here. The response is sent chunked instead.
  return { ok: true, stream: Readable.from(chunks()), contentType };
}

/**
 * A safe download file name: the original name if Cloudinary reported one, else `attachment-<n>`,
 * always ending in the real extension. ASCII-only, no path characters.
 */
export function safeDownloadName(
  originalFilename: string | null,
  index: number,
  format: AttachmentFormat,
): string {
  const base = (originalFilename ?? `attachment-${index + 1}`)
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .replace(/[^A-Za-z0-9._ -]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base === '' || /^[._ -]+$/.test(base) ? `attachment-${index + 1}` : base}.${format}`;
}

/** A `Content-Disposition: attachment` value with an ASCII fallback and an RFC 5987 UTF-8 name. */
export function contentDispositionAttachment(asciiName: string, utf8Name: string): string {
  // Drop control characters (CR/LF would split the header) without a control-character regex.
  const cleaned = [...utf8Name]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    })
    .join('');
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(cleaned)}`;
}
