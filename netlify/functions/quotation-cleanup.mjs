/* global process, fetch, console, AbortSignal, URL */
// Netlify scheduled functions cannot be invoked at a public URL. The Next.js worker also
// requires a server-only secret. Production deploys only; no Render dependency.
export default async () => {
  const secret = process.env.QUOTATION_CLEANUP_SECRET;
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!secret || secret.length < 32 || !origin)
    throw new Error('Quotation cleanup is not configured');
  const response = await fetch(new URL('/api/quotation/upload/cleanup', origin), {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok)
    throw new Error(`Quotation cleanup failed (${response.status}); inspect worker logs`);
  console.info('Quotation cleanup completed');
};
export const config = { schedule: '*/15 * * * *' };
