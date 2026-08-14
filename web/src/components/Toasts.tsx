import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { cx } from '../utils';

type ToastKind = 'success' | 'error';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              'pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-medium shadow-lg animate-toast-in',
              toast.kind === 'success' && 'border-line bg-panel text-ink',
              toast.kind === 'error' && 'toast-error border-red-200 bg-red-50 text-red-800',
            )}
          >
            <span
              className={cx(
                'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                toast.kind === 'success' ? 'bg-emerald-500' : 'bg-red-500',
              )}
            />
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
