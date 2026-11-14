'use client';

import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import { useCallback, useRef } from 'react';

import { Button } from '@/components/ui/Button';
import { company } from '@/config/company';
import { getWhatsAppLink } from '@/lib/whatsapp';

const LINK_CLASSES =
  'rounded-field text-primary-blue underline-offset-4 focus-ring hover:text-primary-blue-hover hover:underline';

/** WhatsApp glyph, Simple Icons (CC0-1.0) — byte-for-byte the same path already used in
 * `WhatsAppLink.tsx` and `ShareLinks.tsx`, so every WhatsApp icon on the site is the same asset. */
function WhatsAppGlyph({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

/**
 * Site-wide floating WhatsApp entry point. Rendered once, in the `(marketing)` route group's
 * layout — that structurally excludes `(admin)` (its own separate layout) and `/dev/*` routes
 * (outside both route groups, root layout only), the same way those routes are already left out
 * of `sitemap.ts`/`robots.ts` (never added to an allowlist, rather than filtered by path).
 *
 * Built on `@radix-ui/react-dialog` (already a dependency — same primitive `MobileMenu` uses)
 * with `modal={false}`: no scroll lock, no full focus trap, so a visitor can keep reading the
 * page while this is open, matching `ThemeMenu`'s own `modal={false}` choice for its popover.
 * No `Dialog.Overlay` — a visible backdrop would misrepresent this as a blocking action. Radix
 * still handles Escape-to-close, outside-click-to-close, and moving focus in; the trigger's
 * `aria-haspopup`/`aria-expanded`/`aria-controls` are Radix's built-in `Dialog.Trigger` wiring.
 */
export function WhatsAppWidget() {
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Same fix as MobileMenu/ThemeMenu: Radix's default focus() can scroll toward the sticky
  // header's in-flow position and jump a scrolled page back to the top.
  const returnFocusToTrigger = useCallback((event: Event) => {
    event.preventDefault();
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <Dialog.Root modal={false}>
      <Dialog.Trigger ref={triggerRef} asChild>
        <button
          type="button"
          aria-label="Chat with us on WhatsApp"
          className="fixed right-6 z-40 flex size-14 items-center justify-center rounded-full bg-primary-blue text-on-primary shadow-card transition-colors duration-150 ease-out hover:bg-primary-blue-hover focus-ring"
          // Matches the `right-6`/`bottom-6` (1.5rem) offset used everywhere else in this file,
          // extended with the safe-area inset so it doesn't sit under a device's home indicator.
          style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        >
          <WhatsAppGlyph className="size-6" />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Content
          id="whatsapp-widget-panel"
          aria-describedby={undefined}
          onCloseAutoFocus={returnFocusToTrigger}
          className="fixed right-6 left-6 z-40 rounded-card border border-default bg-surface p-5 shadow-card sm:left-auto sm:w-96 state-open:animate-menu-in state-closed:animate-menu-out"
          // 6rem clears the 3.5rem (size-14) trigger button plus a gap; extended with the
          // safe-area inset for the same reason as the trigger's own offset above.
          style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-card font-semibold tracking-tight text-primary">
              Chat with us on WhatsApp
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="shrink-0 rounded-field p-1 text-secondary focus-ring hover:text-primary"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-5"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          <p className="mt-3 text-body text-secondary">Have a question? Chat with us on WhatsApp.</p>

          <dl className="mt-4 space-y-1.5 text-label text-secondary">
            <div className="flex justify-between gap-4">
              <dt className="font-medium text-primary">Business hours</dt>
              <dd>{company.hours.display}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-medium text-primary">Time zone</dt>
              <dd>
                {company.hours.timeZone} (UTC{company.hours.utcOffset})
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-label text-secondary">
            Messages sent outside business hours are answered once we&rsquo;re next open.
          </p>

          <Button
            href={getWhatsAppLink(company.whatsapp.prefilledMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 w-full justify-center"
          >
            <WhatsAppGlyph className="size-5 shrink-0" />
            Chat on WhatsApp
          </Button>

          <div className="mt-4 space-y-2 border-t border-default pt-4 text-label text-secondary">
            <p>Prefer another way to reach us?</p>
            <p>
              <a
                href={company.email.href}
                className="inline-block min-h-11 content-center rounded-field wrap-anywhere text-primary-blue underline underline-offset-4 focus-ring hover:text-primary-blue-hover"
              >
                {company.email.general}
              </a>
            </p>
            <p>
              <Link href="/contact" className={LINK_CLASSES}>
                Use the contact form
              </Link>
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
