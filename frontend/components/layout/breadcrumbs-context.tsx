'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { BreadcrumbItem } from './breadcrumbs';

type BreadcrumbsContextValue = {
  crumbs: BreadcrumbItem[] | null;
  setCrumbs: (crumbs: BreadcrumbItem[] | null) => void;
};

const BreadcrumbsContext = createContext<BreadcrumbsContextValue | null>(null);

export function BreadcrumbsProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, setCrumbs] = useState<BreadcrumbItem[] | null>(null);
  const value = useMemo(() => ({ crumbs, setCrumbs }), [crumbs]);
  return <BreadcrumbsContext.Provider value={value}>{children}</BreadcrumbsContext.Provider>;
}

export function useBreadcrumbsContext() {
  return useContext(BreadcrumbsContext);
}

export function useBreadcrumbs(crumbs: BreadcrumbItem[] | null) {
  const ctx = useContext(BreadcrumbsContext);

  useEffect(() => {
    if (!ctx) return;
    ctx.setCrumbs(crumbs);
    return () => ctx.setCrumbs(null);
  }, [ctx, crumbs]);
}
