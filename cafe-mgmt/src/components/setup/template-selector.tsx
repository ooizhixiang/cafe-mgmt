"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TEMPLATES } from "@/lib/template-data";
import { selectTemplate, skipTemplate } from "@/actions/setup.actions";
import { useToast } from "@/components/ui/toast";

export function TemplateSelector() {
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function handleSelect() {
    if (!selected) return;

    startTransition(async () => {
      const result = await selectTemplate(selected);
      if (result.success) {
        router.push("/setup/ingredients");
        router.refresh();
      } else {
        toast(result.error);
      }
    });
  }

  function handleSkip() {
    startTransition(async () => {
      const result = await skipTemplate();
      if (result.success) {
        router.push("/setup/ingredients");
        router.refresh();
      } else {
        toast(result.error);
      }
    });
  }

  return (
    <div className="space-y-[var(--space-4)]">
      {TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          onClick={() => setSelected(template.id)}
          className={`w-full text-left rounded-lg border-2 p-[var(--space-4)] transition-colors ${
            selected === template.id
              ? "border-[var(--color-info)] bg-[var(--color-info)]/5"
              : "border-[var(--border-default)] bg-[var(--bg-primary)]"
          }`}
        >
          <h3 className="text-value">{template.name}</h3>
          <p className="text-meta text-[var(--text-secondary)] mt-[var(--space-1)]">
            {template.description}
          </p>
          <div className="flex gap-[var(--space-4)] mt-[var(--space-3)]">
            <span className="text-meta text-[var(--text-secondary)]">
              {template.ingredients.length} ingredients
            </span>
            <span className="text-meta text-[var(--text-secondary)]">
              {template.checklists.length} checklists
            </span>
          </div>
        </button>
      ))}

      <button
        type="button"
        onClick={handleSelect}
        disabled={!selected || isPending}
        className="w-full touch-target rounded-lg bg-[var(--color-info)] text-white text-body font-medium py-3 disabled:opacity-50"
      >
        {isPending ? "Setting up..." : "Set up my cafe"}
      </button>

      <div className="relative flex items-center gap-[var(--space-3)]">
        <div className="flex-1 border-t border-[var(--border-default)]" />
        <span className="text-meta text-[var(--text-secondary)]">or</span>
        <div className="flex-1 border-t border-[var(--border-default)]" />
      </div>

      <button
        type="button"
        onClick={handleSkip}
        disabled={isPending}
        className="w-full touch-target rounded-lg border border-[var(--border-default)] text-body font-medium py-3 disabled:opacity-50"
      >
        {isPending ? "Setting up..." : "Start from scratch"}
      </button>
    </div>
  );
}
