"use client";

import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    setIsOffline(!navigator.onLine);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="bg-[var(--bg-secondary)] border-b border-[var(--border-default)] px-[var(--space-4)] py-[var(--space-2)] flex items-center gap-[var(--space-2)]">
      <WifiOff size={14} className="text-[var(--text-secondary)]" />
      <span className="text-meta text-[var(--text-secondary)]">
        Offline — showing last synced data
      </span>
    </div>
  );
}
