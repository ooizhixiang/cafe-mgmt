"use client";

import { useState, useTransition, useEffect } from "react";
import { toggleDarkMode } from "@/actions/user-prefs.actions";
import { Moon, Sun } from "lucide-react";

export function DarkModeToggle({ initialDarkMode }: { initialDarkMode: boolean }) {
  const [isDark, setIsDark] = useState(initialDarkMode);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleDarkMode();
      if (result.success) {
        setIsDark(result.data.darkMode);
      }
    });
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className="flex items-center justify-between w-full rounded-lg border border-[var(--border-default)] p-[var(--space-3)]"
    >
      <div className="flex items-center gap-[var(--space-2)]">
        {isDark ? <Moon size={20} /> : <Sun size={20} />}
        <span className="text-body">Dark Mode</span>
      </div>
      <div
        className={`relative w-[44px] h-[24px] rounded-full transition-colors ${
          isDark ? "bg-[var(--color-info)]" : "bg-[var(--border-default)]"
        }`}
      >
        <div
          className={`absolute top-[2px] h-[20px] w-[20px] rounded-full bg-white transition-transform ${
            isDark ? "translate-x-[22px]" : "translate-x-[2px]"
          }`}
        />
      </div>
    </button>
  );
}
