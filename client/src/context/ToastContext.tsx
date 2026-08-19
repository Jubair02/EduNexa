import {
  createContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/utils/cn";

export type ToastVariant = "success" | "error";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

export interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4500;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((current) => [...current, { id, message, variant }]);
      window.setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((toast) => {
          const Icon = toast.variant === "success" ? CheckCircle2 : AlertCircle;
          return (
            <div
              key={toast.id}
              role="status"
              className={cn(
                "pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg",
                toast.variant === "success"
                  ? "border-success/30 bg-success-soft text-success"
                  : "border-danger/30 bg-danger-soft text-danger"
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p className="flex-1">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="rounded p-0.5 opacity-70 hover:opacity-100"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
