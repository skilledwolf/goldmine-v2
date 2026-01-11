import { useEffect, useState } from 'react';

export type RecentItem = {
  id: number;
  type: 'lecture' | 'series';
  title: string;
  subtitle?: string;
  href: string;
  timestamp: number;
};

const KEY = 'gm_recent_items_v1';
const EVENT = 'gm-recent-update';
const MAX_ITEMS = 8;

function readStorage(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(items: RecentItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
}

export function addRecentItem(item: Omit<RecentItem, 'timestamp'>) {
  if (typeof window === 'undefined') return;
  const existing = readStorage().filter((entry) => !(entry.type === item.type && entry.id === item.id));
  const next = [{ ...item, timestamp: Date.now() }, ...existing].slice(0, MAX_ITEMS);
  writeStorage(next);
  window.dispatchEvent(new Event(EVENT));
}

export function useRecentItems() {
  const [items, setItems] = useState<RecentItem[]>(() => readStorage());

  useEffect(() => {
    const handler = () => setItems(readStorage());
    window.addEventListener('storage', handler);
    window.addEventListener(EVENT, handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(EVENT, handler);
    };
  }, []);

  return items;
}
