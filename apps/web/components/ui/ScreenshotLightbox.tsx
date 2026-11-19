'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';

export interface ScreenshotLightboxProps {
  /** Real screenshots only — the case-study page never passes a placeholder mockup here. */
  screenshots: readonly { src: string; alt: string }[];
}

/**
 * Manually-triggered lightbox for real project screenshots — never autoplaying, no carousel
 * (root CLAUDE.md 7.6/8). A native `<dialog>` gives focus-trapping, `Esc`-to-close and
 * backdrop-click-to-close for free, so nothing here hand-rolls that behaviour. The grid itself
 * stays keyboard-operable as a list of buttons; each opens the dialog on the matching image.
 */
export function ScreenshotLightbox({ screenshots }: ScreenshotLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const openAt = (index: number) => {
    setActiveIndex(index);
    dialogRef.current?.showModal();
  };

  const active = screenshots[activeIndex];

  return (
    <>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {screenshots.map((screenshot, index) => (
          <li key={screenshot.src}>
            <button
              type="button"
              onClick={() => openAt(index)}
              className="group relative block aspect-video w-full overflow-hidden rounded-card border border-default bg-background-alt focus-ring"
            >
              <Image
                src={screenshot.src}
                alt={screenshot.alt}
                fill
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="object-contain transition duration-150 ease-out group-hover:scale-[1.02]"
              />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        aria-label="Screenshot preview"
        className="m-auto max-h-[85vh] max-w-[90vw] rounded-card border border-default bg-surface p-4 shadow-card-hover backdrop:bg-background backdrop:opacity-80"
      >
        {active && (
          <div className="relative aspect-video w-[min(80vw,960px)] max-w-full">
            <Image
              src={active.src}
              alt={active.alt}
              fill
              sizes="90vw"
              className="rounded-field object-contain"
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="mt-4 inline-flex min-h-12 items-center justify-center rounded-btn border border-default bg-surface px-6 text-body font-semibold text-primary focus-ring hover:border-default-hover hover:bg-surface-hover"
        >
          Close
        </button>
      </dialog>
    </>
  );
}
