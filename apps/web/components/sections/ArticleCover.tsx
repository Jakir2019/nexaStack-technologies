'use client';

import Image from 'next/image';
import { useState } from 'react';

interface ArticleCoverProps {
  src: string | undefined;
  alt: string;
}

export function ArticleCover({ src, alt }: ArticleCoverProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div aria-hidden="true" className="mt-6 h-1 w-16 rounded-full bg-primary-blue" />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={1200}
      height={630}
      sizes="(min-width: 1024px) 56rem, 100vw"
      className="mt-8 h-auto max-h-96 w-auto max-w-full rounded-media object-contain"
      priority
      onError={() => setFailed(true)}
    />
  );
}
