import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cleanupQuotationUploads } from '@/lib/quotationUploadLifecycle';
import { UploadError, uploadErrorResponse } from '@/lib/quotationUploadSecurity';

export async function POST(request: Request): Promise<Response> {
  try {
    const secret = process.env.QUOTATION_CLEANUP_SECRET;
    const supplied = request.headers.get('authorization') ?? '';
    if (!secret || secret.length < 32) throw new UploadError(503, 'Cleanup is not configured.');
    const expected = `Bearer ${secret}`;
    if (
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      throw new UploadError(401, 'Not authorized.');
    const result = await cleanupQuotationUploads();
    return NextResponse.json(
      { success: result.failed === 0, data: result },
      { status: result.failed ? 503 : 200 },
    );
  } catch (error) {
    return uploadErrorResponse(error);
  }
}
