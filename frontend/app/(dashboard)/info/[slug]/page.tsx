import { redirect } from 'next/navigation';

const SLUG_TO_ANCHOR: Record<string, string> = {
  about: 'purpose',
  purpose: 'purpose',
  why: 'why',
  semester: 'semester',
  during: 'semester',
  prep: 'prep',
  prepare: 'prep',
  standards: 'standards',
  contents: 'standards',
  ethuebung: 'ethuebung',
  package: 'ethuebung',
  downloads: 'ethuebung',
  upload: 'prep',
  staff: 'prep',
  faq: 'faq',
};

export default function InfoSlugRedirectPage({ params }: { params: { slug: string } }) {
  const slug = (params.slug || '').toLowerCase();
  const anchor = SLUG_TO_ANCHOR[slug] || 'purpose';
  redirect(`/info#${encodeURIComponent(anchor)}`);
}
