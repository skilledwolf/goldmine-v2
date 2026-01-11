'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

type Toast = {
  id: string;
  title: string;
  description?: string;
  tone?: 'default' | 'success' | 'error';
};

type ToastContextValue = {
  pushToast: (toast: Omit<Toast, 'id'>) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function toneClasses(tone: Toast['tone']) {
  switch (tone) {
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    case 'error':
      return 'border-destructive/40 bg-destructive/10 text-destructive';
    default:
      return 'border-border bg-card text-foreground';
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, ...toast }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[100] flex w-80 flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border px-3 py-2 shadow-sm',
              toneClasses(toast.tone)
            )}
            role="status"
            aria-live="polite"
          >
            <div className="flex-1">
              <div className="text-sm font-semibold">{toast.title}</div>
              {toast.description && (
                <div className="text-xs text-muted-foreground">{toast.description}</div>
              )}
            </div>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
