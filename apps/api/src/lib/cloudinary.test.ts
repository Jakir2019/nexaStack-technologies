import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DOWNLOAD_URL_TTL_SECONDS,
  ATTACHMENT_DOWNLOAD_MAX_SIZE_BYTES,
  fetchAttachmentStream,
  buildPrivateDownloadUrl,
  canonicalAttachmentUrl,
  contentDispositionAttachment,
  parseStoredAttachmentUrl,
  safeDownloadName,
  signCloudinaryParams,
  sniffAttachmentType,
  type CloudinaryConfig,
} from './cloudinary.js';

const CLOUD = 'testcloud';
const CONFIG: CloudinaryConfig = { cloudName: CLOUD, apiKey: '123456', apiSecret: 'shh-secret' };

describe('legacy private attachment download sizes', () => {
  it('serves an existing 10 MiB file even though new uploads are capped at 4 MiB', async (t) => {
    const bytes = new Uint8Array(10 * 1024 * 1024);
    bytes.set(new TextEncoder().encode('%PDF-1.7'));
    t.mock.method(globalThis, 'fetch', async () => new Response(bytes, { headers: { 'content-length': String(bytes.length) } }));
    const ref = parseStoredAttachmentUrl(`https://res.cloudinary.com/${CLOUD}/image/authenticated/v1/nexastack/quotations/legacy.pdf`, CLOUD)!;
    const result = await fetchAttachmentStream(ref, CONFIG);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    let received = 0;
    for await (const chunk of result.stream) received += (chunk as Buffer).length;
    assert.equal(received, bytes.length);
    assert.equal(ATTACHMENT_DOWNLOAD_MAX_SIZE_BYTES, bytes.length);
  });
  it('still rejects files above the historical cap', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response('too large', { headers: { 'content-length': String(ATTACHMENT_DOWNLOAD_MAX_SIZE_BYTES + 1) } }));
    const ref = parseStoredAttachmentUrl(`https://res.cloudinary.com/${CLOUD}/image/authenticated/v1/nexastack/quotations/legacy.pdf`, CLOUD)!;
    assert.deepEqual(await fetchAttachmentStream(ref, CONFIG), { ok: false, reason: 'too-large' });
  });
});

describe('signCloudinaryParams', () => {
  it('matches the worked example in Cloudinary’s signature documentation', () => {
    // eager, public_id and timestamp with secret "abcd" (order in the input must not matter).
    const signature = signCloudinaryParams(
      {
        timestamp: 1315060510,
        eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
        public_id: 'sample_image',
      },
      'abcd',
    );
    assert.equal(signature, 'bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('never signs file, cloud_name, resource_type or api_key, and drops empty values', () => {
    const base = signCloudinaryParams({ public_id: 'a', timestamp: 1 }, 's');
    const withExcluded = signCloudinaryParams(
      {
        public_id: 'a',
        timestamp: 1,
        file: 'x',
        cloud_name: 'c',
        resource_type: 'image',
        api_key: 'k',
        format: '',
        type: undefined,
      },
      's',
    );
    assert.equal(withExcluded, base);
  });
});

describe('parseStoredAttachmentUrl', () => {
  const PUBLIC = `https://res.cloudinary.com/${CLOUD}/image/upload/v1712345678/nexastack/quotations/abc123XYZ.pdf`;
  const AUTH = `https://res.cloudinary.com/${CLOUD}/image/authenticated/v1712345678/nexastack/quotations/abc123XYZ.pdf`;

  it('accepts a legacy public upload', () => {
    assert.deepEqual(parseStoredAttachmentUrl(PUBLIC, CLOUD), {
      resourceType: 'image',
      type: 'upload',
      version: '1712345678',
      publicId: 'nexastack/quotations/abc123XYZ',
      format: 'pdf',
    });
  });

  it('accepts a canonical authenticated URL, with or without a signature segment', () => {
    const expected = {
      resourceType: 'image',
      type: 'authenticated',
      version: '1712345678',
      publicId: 'nexastack/quotations/abc123XYZ',
      format: 'pdf',
    };
    assert.deepEqual(parseStoredAttachmentUrl(AUTH, CLOUD), expected);
    assert.deepEqual(
      parseStoredAttachmentUrl(
        `https://res.cloudinary.com/${CLOUD}/image/authenticated/s--AbCd1234--/v1712345678/nexastack/quotations/abc123XYZ.pdf`,
        CLOUD,
      ),
      expected,
    );
  });

  it('accepts a URL without a version, and png/jpg/jpeg extensions (case-insensitive)', () => {
    const ref = parseStoredAttachmentUrl(
      `https://res.cloudinary.com/${CLOUD}/image/upload/nexastack/quotations/pic_1.JPG`,
      CLOUD,
    );
    assert.equal(ref?.version, null);
    assert.equal(ref?.format, 'jpg');
    assert.equal(
      parseStoredAttachmentUrl(AUTH.replace('.pdf', '.png'), CLOUD)?.format,
      'png',
    );
    assert.equal(
      parseStoredAttachmentUrl(AUTH.replace('.pdf', '.jpeg'), CLOUD)?.format,
      'jpeg',
    );
  });

  it('round-trips through canonicalAttachmentUrl', () => {
    const ref = parseStoredAttachmentUrl(PUBLIC, CLOUD);
    assert.ok(ref);
    const canonical = canonicalAttachmentUrl(CLOUD, { ...ref, type: 'authenticated' });
    assert.equal(canonical, AUTH);
    assert.deepEqual(parseStoredAttachmentUrl(canonical, CLOUD), {
      ...ref,
      type: 'authenticated',
    });
  });

  const REJECTED: [string, string][] = [
    ['javascript: URL', 'javascript:alert(1)'],
    ['data: URL', 'data:text/html,<script>alert(1)</script>'],
    ['plain http', PUBLIC.replace('https:', 'http:')],
    ['an attacker host', 'https://evil.example/phish.pdf'],
    ['a look-alike host', PUBLIC.replace('res.cloudinary.com', 'res.cloudinary.com.evil.example')],
    ['a look-alike subdomain', PUBLIC.replace('res.cloudinary.com', 'evil.res.cloudinary.com')],
    ['another Cloudinary account', PUBLIC.replace(`/${CLOUD}/`, '/someone-else/')],
    ['another folder', PUBLIC.replace('nexastack/quotations', 'nexastack/other')],
    ['the folder prefix only as a substring', PUBLIC.replace('nexastack/quotations/', 'xnexastack/quotations/')],
    ['a video resource', PUBLIC.replace('/image/', '/video/')],
    ['a private delivery type', PUBLIC.replace('/upload/', '/private/')],
    ['a disallowed extension', PUBLIC.replace('.pdf', '.exe')],
    ['no extension', PUBLIC.replace('.pdf', '')],
    ['a percent-encoded path', PUBLIC.replace('abc123XYZ', 'abc%2e%2e')],
    ['dot-dot traversal', PUBLIC.replace('quotations/abc123XYZ', 'quotations/../secret')],
    ['an empty path segment', PUBLIC.replace('quotations/abc', 'quotations//abc')],
    ['a query string', `${PUBLIC}?x=1`],
    ['a fragment', `${PUBLIC}#x`],
    ['userinfo', PUBLIC.replace('https://', 'https://user:pw@')],
    ['a custom port', PUBLIC.replace('res.cloudinary.com', 'res.cloudinary.com:8443')],
    ['a backslash', PUBLIC.replace('nexastack/', 'nexastack\\')],
    ['an empty string', ''],
    ['not a URL', 'not a url'],
    ['an absurdly long value', `${PUBLIC}${'a'.repeat(3000)}`],
  ];

  for (const [label, value] of REJECTED) {
    it(`rejects ${label}`, () => {
      assert.equal(parseStoredAttachmentUrl(value, CLOUD), null);
    });
  }
});

describe('buildPrivateDownloadUrl', () => {
  const ref = parseStoredAttachmentUrl(
    `https://res.cloudinary.com/${CLOUD}/image/authenticated/v1/nexastack/quotations/abc.pdf`,
    CLOUD,
  );

  it('targets Cloudinary’s download endpoint for this account and resource type', () => {
    assert.ok(ref);
    const url = new URL(buildPrivateDownloadUrl(ref, CONFIG, 1_700_000_000));
    assert.equal(url.origin, 'https://api.cloudinary.com');
    assert.equal(url.pathname, `/v1_1/${CLOUD}/image/download`);
    assert.equal(url.searchParams.get('public_id'), 'nexastack/quotations/abc');
    assert.equal(url.searchParams.get('format'), 'pdf');
    assert.equal(url.searchParams.get('type'), 'authenticated');
    assert.equal(url.searchParams.get('api_key'), CONFIG.apiKey);
  });

  it('expires shortly, carries a valid signature and never contains the secret', () => {
    assert.ok(ref);
    const now = 1_700_000_000;
    const raw = buildPrivateDownloadUrl(ref, CONFIG, now);
    const url = new URL(raw);

    assert.equal(url.searchParams.get('expires_at'), String(now + DOWNLOAD_URL_TTL_SECONDS));
    assert.ok(DOWNLOAD_URL_TTL_SECONDS <= 300, 'must stay short-lived');
    assert.equal(raw.includes(CONFIG.apiSecret), false);

    const expected = signCloudinaryParams(
      {
        expires_at: now + DOWNLOAD_URL_TTL_SECONDS,
        format: 'pdf',
        public_id: 'nexastack/quotations/abc',
        timestamp: now,
        type: 'authenticated',
      },
      CONFIG.apiSecret,
    );
    assert.equal(url.searchParams.get('signature'), expected);
  });
});

describe('sniffAttachmentType', () => {
  it('identifies PDF, PNG and JPEG by their leading bytes', () => {
    assert.equal(sniffAttachmentType(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])), 'application/pdf');
    assert.equal(
      sniffAttachmentType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      'image/png',
    );
    assert.equal(sniffAttachmentType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  });

  it('rejects everything else, including HTML and executables', () => {
    assert.equal(sniffAttachmentType(new TextEncoder().encode('<html><script>')), null);
    assert.equal(sniffAttachmentType(Uint8Array.from([0x4d, 0x5a, 0x90, 0x00])), null);
    assert.equal(sniffAttachmentType(new Uint8Array()), null);
  });
});

describe('safeDownloadName / contentDispositionAttachment', () => {
  it('keeps a normal name and forces the real extension', () => {
    assert.equal(safeDownloadName('Project brief', 0, 'pdf'), 'Project brief.pdf');
    assert.equal(safeDownloadName('logo.final', 1, 'png'), 'logo.png');
  });

  it('strips path and header-breaking characters', () => {
    const name = safeDownloadName('../../etc/passwd"\r\nX-Evil: 1', 0, 'pdf');
    assert.ok(/^[A-Za-z0-9._ -]+\.pdf$/.test(name), name);
    assert.equal(name.includes('/'), false);
  });

  it('falls back to a numbered name when nothing usable remains', () => {
    assert.equal(safeDownloadName(null, 2, 'jpg'), 'attachment-3.jpg');
    assert.equal(safeDownloadName('???', 0, 'pdf'), 'attachment-1.pdf');
    assert.equal(safeDownloadName('   ', 0, 'pdf'), 'attachment-1.pdf');
  });

  it('caps the length', () => {
    assert.ok(safeDownloadName('a'.repeat(500), 0, 'pdf').length <= 84);
  });

  it('builds a header with an ASCII name and an encoded UTF-8 name, no control characters', () => {
    const header = contentDispositionAttachment('Brief.pdf', 'বাংলা\r\nbrief.pdf');
    assert.ok(header.startsWith('attachment; filename="Brief.pdf"; filename*=UTF-8\'\''));
    assert.equal(/[\r\n]/.test(header), false);
    assert.ok(header.includes(encodeURIComponent('বাংলা')));
  });
});
