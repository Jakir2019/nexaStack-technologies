'use client';

import {
  ATTACHMENT_ACCEPTED_EXTENSIONS,
  ATTACHMENT_MAX_FILES,
  ATTACHMENT_SIZE_LABEL,
} from '@nexastack/shared';
import { useCallback, useEffect, useId, useState } from 'react';

import { cn } from '@/lib/cn';
import { quotationFileError, uploadQuotationAttachment } from '@/lib/quotationUpload';

interface UploadEntry {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'done' | 'error';
  url?: string;
  error?: string;
}

export interface FileUploadFieldProps {
  id: string;
  initialUrls?: string[];
  onFilesChange: (urls: string[]) => void;
  describedById?: string;
}

function nameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || url;
  } catch {
    return url;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Step 5 attachment control. Uploads each file to `/api/quotation/upload` immediately on
 * selection — the real server-side type/size check happens there (root CLAUDE.md 15); the
 * client-side extension/size check here is convenience only, same as everywhere else in the
 * form (root CLAUDE.md 10). Drag-and-drop is a progressive enhancement over the native file
 * input, which alone is fully keyboard/AT operable.
 */
export function FileUploadField({ id, initialUrls, onFilesChange, describedById }: FileUploadFieldProps) {
  // Re-hydrates from URLs already in the form (e.g. the user went Back then Next again — this
  // component remounts, but React Hook Form kept the `attachments` field value) so a previously
  // uploaded file doesn't visually disappear even though it's still part of the submission.
  const [entries, setEntries] = useState<UploadEntry[]>(() =>
    (initialUrls ?? []).map((url) => ({
      id: url,
      name: nameFromUrl(url),
      size: 0,
      status: 'done',
      url,
    })),
  );
  const [announcement, setAnnouncement] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const liveRegionId = useId();

  useEffect(() => {
    onFilesChange(
      entries.filter((entry) => entry.status === 'done' && entry.url).map((entry) => entry.url!),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const uploadOne = useCallback(async (entryId: string, file: File) => {
    try {
      const result = await uploadQuotationAttachment(file);

      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === entryId
            ? result.success
              ? { ...entry, status: 'done' as const, url: result.data.url }
              : { ...entry, status: 'error' as const, error: result.error.message }
            : entry,
        ),
      );
      setAnnouncement(
        result.success ? `${file.name} uploaded.` : `${file.name} failed: ${result.error.message}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed. Check your connection and try again.';
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === entryId
            ? { ...entry, status: 'error' as const, error: message }
            : entry,
        ),
      );
      setAnnouncement(`${file.name} failed: ${message}`);
    }
  }, []);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;

      const room = ATTACHMENT_MAX_FILES - entries.length;
      if (room <= 0) {
        setAnnouncement(`You can attach up to ${ATTACHMENT_MAX_FILES} files.`);
        return;
      }

      const incoming = Array.from(list).slice(0, room);
      const newEntries: UploadEntry[] = incoming.map((file) => {
        const error = quotationFileError(file);
        if (error) {
          return {
            id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            size: file.size,
            status: 'error',
            error,
          };
        }
        return {
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          size: file.size,
          status: 'uploading',
        };
      });

      setEntries((prev) => [...prev, ...newEntries]);
      const rejected = newEntries.filter((entry) => entry.error).map((entry) => `${entry.name}: ${entry.error}`);
      const overflow = list.length > room ? ` Only ${room} files were added; you can attach up to ${ATTACHMENT_MAX_FILES} files.` : '';
      setAnnouncement(`${incoming.length} file${incoming.length === 1 ? '' : 's'} added. ${rejected.join(' ')}${overflow}`);

      newEntries.forEach((entry, index) => {
        if (entry.status === 'uploading') void uploadOne(entry.id, incoming[index]!);
      });
    },
    [entries.length, uploadOne],
  );

  const removeEntry = useCallback((entryId: string) => {
    setEntries((prev) => {
      const removed = prev.find((entry) => entry.id === entryId);
      if (removed) setAnnouncement(`${removed.name} removed.`);
      return prev.filter((entry) => entry.id !== entryId);
    });
  }, []);

  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          'flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-field border border-dashed px-4 py-6 text-center text-body text-secondary focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-blue',
          dragActive ? 'border-primary-blue bg-surface-hover' : 'border-strong bg-surface',
        )}
      >
        <span className="text-body font-medium text-primary">Drag files here or click to browse</span>
        <span className="text-label text-secondary">
          PDF, PNG or JPG — up to {ATTACHMENT_SIZE_LABEL} each, {ATTACHMENT_MAX_FILES} files max
        </span>
        <input
          id={id}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPTED_EXTENSIONS.join(',')}
          className="sr-only"
          aria-describedby={describedById ? `${describedById} ${liveRegionId}` : liveRegionId}
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </label>

      {entries.length > 0 && (
        <ul className="mt-3 space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-field border border-default bg-surface px-3.5 py-2.5 text-body"
            >
              <div className="min-w-0">
                <p className="truncate text-primary">{entry.name}</p>
                <p className={cn('text-label', entry.status === 'error' ? 'text-error' : 'text-secondary')}>
                  {entry.size > 0 && formatSize(entry.size)}
                  {entry.status === 'uploading' && ' — uploading…'}
                  {entry.status === 'error' && ` — ${entry.error}`}
                  {entry.status === 'done' && ' — uploaded'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeEntry(entry.id)}
                className="shrink-0 rounded-field px-2 py-1 text-label text-error underline underline-offset-4 focus-ring"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <p id={liveRegionId} role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
