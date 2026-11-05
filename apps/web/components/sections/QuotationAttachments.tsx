'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileUploadField, type FileUploadFieldProps } from '@/components/ui/FileUploadField';
import { TurnstileWidget } from '@/components/ui/Turnstile';
import { Button } from '@/components/ui/Button';
import { env } from '@/lib/env';

/** Separate upload challenge: its token is never reused for the final quotation submission. */
export function QuotationAttachments(props: FileUploadFieldProps) {
  const [expiresAt, setExpiresAt] = useState(0);
  const [challenge, setChallenge] = useState(false);
  const [message, setMessage] = useState(
    env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
      ? ''
      : 'Attachments are unavailable until verification is configured. You can continue without files.',
  );
  const callback = useRef(props.onFilesChange);
  useEffect(() => {
    callback.current = props.onFilesChange;
  }, [props.onFilesChange]);
  const [restored, setRestored] = useState<string[] | undefined>(undefined);
  const [generation, setGeneration] = useState(0);
  const busy = useRef(false);
  const expire = useCallback(() => {
    setExpiresAt(0);
    setChallenge(false);
    setMessage(
      'Renew attachment verification to continue uploading or removing files. Your form details are safe.',
    );
  }, []);

  const restore = useCallback(async () => {
    const response = await fetch('/api/quotation/upload/session', { method: 'POST' });
    const result = await response.json();
    if (result.success) {
      setExpiresAt(Date.parse(result.data.expiresAt));
      // Recover successful uploads whose response was lost. The server is the source of ownership.
      setRestored(result.data.urls);
      callback.current(result.data.urls);
      setGeneration((value) => value + 1);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve()
      .then(restore)
      .catch(() => {});
  }, [restore]);
  useEffect(() => {
    if (!expiresAt) return;
    const timeout = setTimeout(expire, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [expiresAt, expire]);
  const verify = useCallback(
    async (turnstileToken: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const response = await fetch('/api/quotation/upload/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ turnstileToken }),
        });
        const result = await response.json();
        if (!result.success)
          throw new Error(result.error?.message ?? 'Verification failed. Please try again.');
        setExpiresAt(Date.parse(result.data.expiresAt));
        setMessage('Attachments enabled. Each file is uploaded securely.');
        await restore();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : 'Verification failed. Please try again.',
        );
      } finally {
        busy.current = false;
        setChallenge(false);
      }
    },
    [restore],
  );

  return (
    <div className="space-y-3">
      {!expiresAt && (
        <Button
          type="button"
          disabled={!env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          variant="secondary"
          onClick={() => {
            setChallenge(true);
            setMessage('Complete the verification to enable attachments.');
          }}
        >
          Enable or renew attachments
        </Button>
      )}
      {challenge && (
        <TurnstileWidget action="quotation-upload" onVerify={verify} onExpire={expire} />
      )}
      {message && (
        <p role="status" className="text-label text-secondary">
          {message}
        </p>
      )}
      <FileUploadField
        key={generation}
        {...props}
        initialUrls={restored ?? props.initialUrls}
        disabled={!expiresAt}
      />
    </div>
  );
}
