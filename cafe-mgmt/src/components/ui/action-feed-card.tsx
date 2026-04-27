"use client";

import { CheckCircle, AlertTriangle, Settings, BarChart3 } from "lucide-react";
import type { FeedCard } from "@/types/feed";

const VARIANT_ICONS = {
  checklist: null, // uses progress bar instead
  alert: AlertTriangle,
  onboarding: Settings,
  completion: CheckCircle,
  summary: BarChart3,
};

interface ActionFeedCardProps {
  card: FeedCard;
  children?: React.ReactNode;
}

export function ActionFeedCard({ card, children }: ActionFeedCardProps) {
  const Icon = VARIANT_ICONS[card.variant];

  return (
    <div
      className="rounded-lg bg-[var(--bg-primary)] overflow-hidden animate-slide-up"
      style={{
        borderLeft: `3px solid ${card.borderColor}`,
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div className="p-[var(--space-4)]">
        <div className="flex items-start gap-[var(--space-3)]">
          {Icon && (
            <div
              className="mt-0.5 shrink-0 rounded-lg p-1.5"
              style={{ color: card.borderColor, backgroundColor: `${card.borderColor}12` }}
            >
              <Icon size={18} strokeWidth={2} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-body font-semibold">{card.title}</h3>
            {card.subtitle && (
              <p className="text-meta text-[var(--text-secondary)] mt-[var(--space-1)]">
                {card.subtitle}
              </p>
            )}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
