import {
  ATTACHMENT_ACCEPTED_TYPES,
  ATTACHMENT_MAX_SIZE_BYTES,
  ATTACHMENT_REQUEST_SIZE_ERROR,
  attachmentSizeSchema,
  ERROR_CODES,
  sniffFileType,
  type ApiResponse,
} from '@nexastack/shared';
import { NextResponse } from 'next/server';

import { isCloudinaryConfigured, uploadBufferToCloudinary } from '@/lib/cloudinary';
import { checkQuotationUploadRateLimit, getClientIp } from '@/lib/quotationRateLimit';
import { readQuotationUpload, UploadRequestTooLargeError } from '@/lib/quotationUploadRequest';

/**
 * Uploads a single `/quotation` Step 5 attachment. The browser sends the raw file here (never
 * straight to Cloudinary) so this route can validate type and size against the real file bytes
 * — root CLAUDE.md 15 and this task's honesty note 6: a client-side `accept` attribute is
 * convenience, not security. Only after that check passes does the file get forwarded to
 * Cloudinary via a signed upload (lib/cloudinary.ts).
 */

interface UploadResponseData {
  url: string;
  name: string;
  size: number;
}

function jsonSuccess(data: UploadResponseData, status = 201): NextResponse<ApiResponse<UploadResponseData>> {
  return NextResponse.json({ success: true, data }, { status });
}

function jsonError(
  status: number,
  code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
  message: string,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function POST(request: Request): Promise<NextResponse<ApiResponse<unknown>>> {
  const ip = getClientIp(request);
  const rateLimit = checkQuotationUploadRateLimit(ip);
  if (!rateLimit.allowed) {
    return jsonError(
      429,
      ERROR_CODES.RATE_LIMITED,
      'Too many uploads have been sent from your connection. Please wait 15 minutes and try again.',
    );
  }

  let formData: FormData;
  try {
    formData = await readQuotationUpload(request);
  } catch (error) {
    if (error instanceof UploadRequestTooLargeError) {
      return jsonError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, ATTACHMENT_REQUEST_SIZE_ERROR);
    }
    return jsonError(400, ERROR_CODES.INVALID_JSON, 'Send the file as multipart/form-data under the "file" field.');
  }

  const file = formData.get('file');
  if ([...formData.keys()].length !== 1) {
    return jsonError(400, ERROR_CODES.VALIDATION_ERROR, 'Upload one file at a time under the "file" field.');
  }
  if (!(file instanceof File)) {
    return jsonError(400, ERROR_CODES.VALIDATION_ERROR, 'Please choose a file to upload.');
  }

  const size = attachmentSizeSchema.safeParse(file.size);
  if (!size.success) {
    const tooLarge = file.size > ATTACHMENT_MAX_SIZE_BYTES;
    return jsonError(
      tooLarge ? 413 : 400,
      tooLarge ? ERROR_CODES.PAYLOAD_TOO_LARGE : ERROR_CODES.VALIDATION_ERROR,
      size.error.issues[0]!.message,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffedType = sniffFileType(new Uint8Array(buffer));

  if (!sniffedType || !ATTACHMENT_ACCEPTED_TYPES.includes(sniffedType)) {
    return jsonError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `"${file.name}" isn't a supported file type. Please attach a PDF, PNG or JPG file.`,
    );
  }

  if (!isCloudinaryConfigured()) {
    return jsonError(
      503,
      ERROR_CODES.SERVICE_UNAVAILABLE,
      'File uploads aren’t available yet. You can still submit your request without attachments, or add them later by replying to your confirmation.',
    );
  }

  try {
    const result = await uploadBufferToCloudinary(buffer, file.name);
    return jsonSuccess({ url: result.url, name: file.name, size: file.size });
  } catch (err) {
    console.error('[quotation] Failed to upload attachment', err);
    return jsonError(500, ERROR_CODES.INTERNAL_ERROR, 'Something went wrong uploading that file. Please try again.');
  }
}
