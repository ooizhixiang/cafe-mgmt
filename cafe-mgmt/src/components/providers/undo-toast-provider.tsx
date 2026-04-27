"use client";

import { createContext, useCallback, useContext, useReducer, useEffect, useRef } from "react";
import { undoWastage } from "@/actions/wastage.actions";
import { undoComp } from "@/actions/comp.actions";
import { UNDO_TIMEOUT_MS } from "@/lib/constants";

interface UndoToast {
  id: string;
  message: string;
  type: "wastage" | "comp";
  createdAt: number;
}

type Action =
  | { type: "ADD"; toast: UndoToast }
  | { type: "REMOVE"; id: string };

function reducer(state: UndoToast[], action: Action): UndoToast[] {
  switch (action.type) {
    case "ADD":
      return [...state, action.toast];
    case "REMOVE":
      return state.filter((t) => t.id !== action.id);
  }
}

interface UndoToastContextValue {
  addUndoToast: (toast: { id: string; message: string; type: "wastage" | "comp" }) => void;
}

const UndoToastContext = createContext<UndoToastContextValue | null>(null);

export function useUndoToast() {
  const ctx = useContext(UndoToastContext);
  if (!ctx) throw new Error("useUndoToast must be used within UndoToastProvider");
  return ctx;
}

export function UndoToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, dispatch] = useReducer(reducer, []);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const addUndoToast = useCallback(
    (toast: { id: string; message: string; type: "wastage" | "comp" }) => {
      const undoToast: UndoToast = { ...toast, createdAt: Date.now() };
      dispatch({ type: "ADD", toast: undoToast });

      const timer = setTimeout(() => {
        dispatch({ type: "REMOVE", id: toast.id });
        timersRef.current.delete(toast.id);
      }, UNDO_TIMEOUT_MS);

      timersRef.current.set(toast.id, timer);
    },
    []
  );

  async function handleUndo(toast: UndoToast) {
    // Clear the auto-remove timer
    const timer = timersRef.current.get(toast.id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(toast.id);
    }

    dispatch({ type: "REMOVE", id: toast.id });

    if (toast.type === "wastage") {
      await undoWastage(toast.id);
    } else {
      await undoComp(toast.id);
    }
  }

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <UndoToastContext value={{ addUndoToast }}>
      {children}

      {/* Undo toast stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom,0px)+8px)] left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-2 w-[calc(100%-32px)] max-w-[448px]">
          {toasts.map((t) => (
            <UndoToastItem key={t.id} toast={t} onUndo={() => handleUndo(t)} />
          ))}
        </div>
      )}
    </UndoToastContext>
  );
}

function UndoToastItem({
  toast,
  onUndo,
}: {
  toast: UndoToast;
  onUndo: () => void;
}) {
  const elapsed = Date.now() - toast.createdAt;
  const remaining = Math.max(0, UNDO_TIMEOUT_MS - elapsed);
  const progress = remaining / UNDO_TIMEOUT_MS;

  return (
    <div className="bg-gray-900 text-white rounded-lg px-4 py-3 shadow-lg animate-[fadeIn_0.2s_ease-out]">
      <div className="flex items-center justify-between gap-[var(--space-2)]">
        <p className="text-meta flex-1">{toast.message}</p>
        <button
          onClick={onUndo}
          className="touch-target shrink-0 rounded-md bg-white/20 px-3 py-1 text-meta font-semibold"
        >
          Undo
        </button>
      </div>
      {/* Countdown bar */}
      <div className="mt-1 h-0.5 bg-white/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-white/60 transition-all duration-1000 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
