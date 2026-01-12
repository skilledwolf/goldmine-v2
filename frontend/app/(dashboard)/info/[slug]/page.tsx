import { redirect } from 'next/navigation';

const SLUG_TO_ANCHOR: Record<string, string> = {
  about: 'about',
  usage: 'browse',
  browse: 'browse',
  downloads: 'downloads',
  upload: 'staff',
  staff: 'staff',
  faq: 'faq',
};

export default function InfoSlugRedirectPage({ params }: { params: { slug: string } }) {
  const slug = (params.slug || '').toLowerCase();
  const anchor = SLUG_TO_ANCHOR[slug] || 'about';
  redirect(`/info#${encodeURIComponent(anchor)}`);
}
