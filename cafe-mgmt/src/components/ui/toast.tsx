"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface Toast {
  id: string;
  message: string;
}

interface ToastContextValue {
  toast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext value={{ toast }}>
      {children}
      <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom,0px)+8px)] left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[calc(100%-32px)] max-w-[448px] lg:bottom-8 lg:left-auto lg:right-8 lg:translate-x-0 lg:w-auto lg:min-w-[320px]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-[var(--text-primary)] text-[var(--bg-primary)] text-body rounded-lg px-4 py-3 animate-slide-up"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
