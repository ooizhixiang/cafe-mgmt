"use client";

import { useEffect } from "react";
import { syncDarkModeCookie } from "@/actions/user-prefs.actions";

/**
 * Syncs the darkMode DB preference to a cookie (for SSR in root layout)
 * and applies the `dark` class to <html> on mount.
 * Runs once when the app layout mounts.
 */
export function DarkModeSync() {
  useEffect(() => {
    syncDarkModeCookie().then((result) => {
      if (result.success) {
        const isDark = result.data.darkMode;
        document.documentElement.classList.toggle("dark", isDark);
        // Set cookie so server matches on next load
        document.cookie = `darkMode=${isDark ? "1" : "0"};path=/;max-age=${60 * 60 * 24 * 365}`;
      }
    });
  }, []);

  return null;
}
