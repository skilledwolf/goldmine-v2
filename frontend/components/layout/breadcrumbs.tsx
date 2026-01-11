'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBreadcrumbsContext } from './breadcrumbs-context';

export type BreadcrumbItem = {
  label: string;
  href: string;
  isCurrent?: boolean;
};

const STATIC_LABELS: Record<string, string> = {
  lectures: 'Lectures',
  search: 'Search',
  series: 'Series',
};

function buildCrumbs(pathname: string): BreadcrumbItem[] {
  if (!pathname || pathname === '/') {
    return [{ label: 'Dashboard', href: '/', isCurrent: true }];
  }
  const parts = pathname.split('/').filter(Boolean);
  const crumbs: BreadcrumbItem[] = [{ label: 'Dashboard', href: '/' }];
  let currentPath = '';
  parts.forEach((part, idx) => {
    currentPath += `/${part}`;
    if (part === 'series' && /^\d+$/.test(parts[idx + 1] || '')) {
      return;
    }
    const prev = parts[idx - 1];
    const isLast = idx === parts.length - 1;
    let label = STATIC_LABELS[part] || part;
    if (/^\d+$/.test(part)) {
      if (prev === 'lectures') label = `Lecture ${part}`;
      else if (prev === 'series') label = `Series ${part}`;
      else label = part;
    }
    crumbs.push({ label, href: currentPath, isCurrent: isLast });
  });
  return crumbs;
}

export function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const ctx = useBreadcrumbsContext();
  const crumbs = ctx?.crumbs ?? buildCrumbs(pathname);

  if (crumbs.length <= 1) return null;

  return (
    <nav className={cn('mb-4 text-sm text-muted-foreground', className)} aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2">
        {crumbs.map((crumb, idx) => (
          <li key={`${crumb.href}-${idx}`} className="flex items-center gap-2">
            {idx > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground/70" aria-hidden />}
            {crumb.isCurrent ? (
              <span className="font-medium text-foreground">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="hover:text-foreground">
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
