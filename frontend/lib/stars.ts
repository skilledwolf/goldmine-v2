import { useCallback, useEffect, useState } from 'react';

const KEY = 'gm_starred_lectures_v1';
const EVENT = 'gm-starred-update';

function readStorage(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as number[];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'number') : [];
  } catch {
    return [];
  }
}

function writeStorage(items: number[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function useStarredLectures() {
  const [starredIds, setStarredIds] = useState<number[]>(() => readStorage());

  useEffect(() => {
    const handler = () => setStarredIds(readStorage());
    window.addEventListener('storage', handler);
    window.addEventListener(EVENT, handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(EVENT, handler);
    };
  }, []);

  const isStarred = useCallback(
    (id: number) => starredIds.includes(id),
    [starredIds]
  );

  const toggleStar = useCallback(
    (id: number) => {
      const next = starredIds.includes(id)
        ? starredIds.filter((v) => v !== id)
        : [id, ...starredIds];
      setStarredIds(next);
      writeStorage(next);
    },
    [starredIds]
  );

  return { starredIds, isStarred, toggleStar };
}
