import { quotationUploadRemovalSchema } from '@nexastack/shared';
import { NextResponse } from 'next/server';
import { activeUploadSession, removeUpload } from '@/lib/quotationUploadLifecycle';
import { uploadPolicy } from '@/lib/quotationUploadPolicy';
import {
  boundedUploadJson,
  hashCredential,
  requireUploadOrigin,
  UploadError,
  uploadErrorResponse,
  uploadRateLimit,
  uploadToken,
} from '@/lib/quotationUploadSecurity';

export async function POST(request: Request): Promise<Response> {
  try {
    requireUploadOrigin(request);
    await uploadRateLimit('upload-global', uploadPolicy.globalRequests);
    const token = uploadToken(request);
    const session = await activeUploadSession(token);
    await uploadRateLimit(`session:${hashCredential(token)}`, uploadPolicy.sessionRequests);
    return NextResponse.json(
      {
        success: true,
        data: {
          expiresAt: session.expiresAt.toISOString(),
          urls: session.assets.filter((a) => a.status === 'uploaded').map((a) => a.url),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return uploadErrorResponse(error);
  }
}
export async function DELETE(request: Request): Promise<Response> {
  try {
    requireUploadOrigin(request);
    await uploadRateLimit('upload-global', uploadPolicy.globalRequests);
    const token = uploadToken(request);
    await activeUploadSession(token);
    await uploadRateLimit(`session:${hashCredential(token)}`, uploadPolicy.sessionRequests);
    const parsed = quotationUploadRemovalSchema.safeParse(await boundedUploadJson(request));
    if (!parsed.success) throw new UploadError(400, 'Choose an attachment from this draft.');
    await removeUpload(token, parsed.data.url);
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    return uploadErrorResponse(error);
  }
}
