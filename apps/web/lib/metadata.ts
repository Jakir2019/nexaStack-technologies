import type { Metadata } from 'next';

import { company } from '@/config/company';
import { DEFAULT_SHARE_IMAGE } from '@/lib/blogImage';

type PageMetadata = Omit<Metadata, 'title' | 'description' | 'alternates'> & {
  title: string | { absolute: string };
  description: string;
  alternates?: { canonical: string };
};

/** Next.js replaces nested metadata: include the share image in every page override. */
export function withSocialMetadata(metadata: PageMetadata, sharePath?: string): Metadata {
  const title = typeof metadata.title === 'string' ? metadata.title : metadata.title.absolute;
  return {
    ...metadata,
    openGraph: {
      type: 'website',
      siteName: company.legalName,
      locale: 'en',
      title,
      description: metadata.description,
      url: sharePath ?? metadata.alternates?.canonical,
      images: [DEFAULT_SHARE_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: metadata.description,
      images: [DEFAULT_SHARE_IMAGE],
    },
  };
}
