import type { Metadata } from 'next';

import { withSocialMetadata } from '@/lib/metadata';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/Accordion';
import { FaqCategoryFilterLinks } from '@/components/sections/FaqCategoryFilterLinks';
import { FaqSearchInput } from '@/components/sections/FaqSearchInput';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { company } from '@/config/company';
import { faqCategories, faqItems, type FaqCategoryId, type FaqItem } from '@/config/faq';
import { env } from '@/lib/env';
import { renderFaqAnswer } from '@/lib/faq';

// Full `/faq` page — every question across all 5 categories, with search and category
// filtering, superseding the earlier absence of a dedicated FAQ page. The homepage FAQ section
// (components/sections/FAQ.tsx) is untouched in behavior: it still shows exactly the same
// curated subset it always did (now via an explicit `showOnHomepage` flag instead of "every
// item that happened to exist"). Server Component; `FaqSearchInput` is the only Client
// Component, pushed down to a single leaf — category filters are plain links, since changing
// the URL is the whole mechanism and needs no JavaScript.

interface FaqPageProps {
  searchParams: Promise<{ q?: string; category?: string }>;
}

export const metadata: Metadata = withSocialMetadata({
  title: 'Frequently Asked Questions',
  description: 'Answers to common questions about working with NexaStack Technologies — services, pricing, the development process and support.',
  alternates: { canonical: '/faq' },
});

function matchesQuery(item: FaqItem, query: string) {
  const haystack = `${item.question} ${item.answer}`.toLowerCase();
  return haystack.includes(query);
}

export default async function FaqPage({ searchParams }: FaqPageProps) {
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase();
  const activeCategory = params.category as FaqCategoryId | undefined;

  const filteredItems = faqItems.filter((item) => {
    if (activeCategory && item.category !== activeCategory) return false;
    if (query && !matchesQuery(item, query)) return false;
    return true;
  });

  const categoriesWithMatches = faqCategories
    .map((category) => ({
      category,
      items: filteredItems.filter((item) => item.category === category.id),
    }))
    .filter((group) => group.items.length > 0);

  // Category filter options: only categories with at least one question in the *unfiltered*
  // set (never an empty filter option), independent of the current search/category selection.
  const availableCategories = faqCategories.filter((category) =>
    faqItems.some((item) => item.category === category.id),
  );

  // Built from exactly what this request renders — the filtered/grouped result above, not a
  // static full list — so it's never wrong for a filtered URL (e.g. /faq?category=pricing).
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: filteredItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${env.NEXT_PUBLIC_SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'FAQ', item: `${env.NEXT_PUBLIC_SITE_URL}/faq` },
    ],
  };

  return (
    <div className="page-container section-y">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'FAQ' }]} />

      <ScrollReveal className="mt-8">
        <div className="max-w-prose">
          <h1 className="text-page font-semibold tracking-tight text-primary">
            Frequently Asked Questions
          </h1>
          <p className="mt-4 text-body-lg text-secondary">
            Answers to common questions about working with {company.legalName} — search or
            filter by category to find what you need.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-6 border-y border-default py-6 md:flex-row md:items-end md:justify-between">
          <FaqSearchInput id="faq-search" />
          <FaqCategoryFilterLinks
            categories={availableCategories}
            activeCategory={activeCategory}
            currentParams={params}
          />
        </div>

        {categoriesWithMatches.length > 0 ? (
          <div className="mt-10 flex flex-col gap-12">
            {categoriesWithMatches.map(({ category, items }) => (
              <div key={category.id}>
                <h2 className="text-section font-semibold tracking-tight text-primary">
                  {category.label}
                </h2>
                <Accordion type="multiple" className="mt-4 max-w-2xl border-t border-default">
                  {items.map((item) => (
                    <AccordionItem key={item.id} value={item.id}>
                      <AccordionTrigger>{item.question}</AccordionTrigger>
                      <AccordionContent>
                        <p>{renderFaqAnswer(item)}</p>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-10 text-center text-body-lg text-secondary">
            No matching questions — try a different search or category.
          </p>
        )}
      </ScrollReveal>

      <ScrollReveal className="mt-12 max-w-prose border-t border-default pt-10">
        <h2 className="text-section font-semibold tracking-tight text-primary">
          Still have questions?
        </h2>
        <p className="mt-4 text-body-lg text-secondary">
          Tell {company.legalName} what you&rsquo;re building and get a project-specific quote.
        </p>
        <Button href="/quotation" className="mt-6">
          Request a Quote
        </Button>
      </ScrollReveal>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </div>
  );
}
