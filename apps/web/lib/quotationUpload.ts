import {
  ATTACHMENT_ACCEPTED_EXTENSIONS,
  ATTACHMENT_MAX_REQUEST_BYTES,
  ATTACHMENT_REQUEST_SIZE_ERROR,
  ATTACHMENT_SIZE_ERROR,
  attachmentSizeSchema,
  type ApiResponse,
} from '@nexastack/shared';

/** Browser convenience checks; the route independently checks size and actual file bytes. */
export function quotationFileError(file: Pick<File, 'name' | 'size'>): string | undefined {
  const size = attachmentSizeSchema.safeParse(file.size);
  if (!size.success) return size.error.issues[0]!.message;
  if (!ATTACHMENT_ACCEPTED_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension))) {
    return 'Only PDF, PNG or JPG files are accepted.';
  }
  return undefined;
}

type UploadData = { url: string; name: string; size: number };

/** One file per HTTP request. Only a successful response can become a quotation reference. */
let uploadQueue: Promise<unknown> = Promise.resolve();
const uploadIds = new WeakMap<File, string>();
export function uploadQuotationAttachment(file: File): Promise<ApiResponse<UploadData>> {
  const result = uploadQueue.then(() => sendQuotationAttachment(file));
  uploadQueue = result.catch(() => {});
  return result;
}
async function sendQuotationAttachment(file: File): Promise<ApiResponse<UploadData>> {
  const error = quotationFileError(file);
  if (error) throw new Error(error);
  if (!uploadIds.has(file)) uploadIds.set(file, crypto.randomUUID());
  const form = new FormData();
  form.append('file', file);
  // Serialize once so the exact multipart bytes (including unusual filenames) can be checked
  // before network I/O. Send this same Blob and boundary, rather than rebuilding the body.
  const encoded = new Response(form);
  const body = await encoded.blob();
  if (body.size > ATTACHMENT_MAX_REQUEST_BYTES) throw new Error(ATTACHMENT_REQUEST_SIZE_ERROR);
  let response: Response;
  try {
    response = await fetch('/api/quotation/upload', {
      method: 'POST',
      headers: { 'Content-Type': encoded.headers.get('content-type')!, 'X-Upload-Id': uploadIds.get(file)! },
      body,
    });
  } catch {
    throw new Error('Upload failed. Check your connection and try again.');
  }
  // The hosting platform can return HTML/plain text instead of our JSON envelope.
  if (response.status === 413) throw new Error(ATTACHMENT_SIZE_ERROR);
  let result: ApiResponse<UploadData>;
  try {
    result = await response.json() as ApiResponse<UploadData>;
  } catch {
    throw new Error('Upload failed. Please try again in a moment.');
  }
  if (!response.ok && result.success) throw new Error('Upload failed. Please try again in a moment.');
  return result;
}
