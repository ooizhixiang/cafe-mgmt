import { CheckCircle, Inbox } from "lucide-react";

interface EmptyStateProps {
  variant: "no-tasks" | "all-caught-up";
  title?: string;
  description?: string;
}

const DEFAULTS = {
  "no-tasks": {
    icon: Inbox,
    title: "Nothing here yet",
    description: "Tasks and updates will appear here once your cafe is set up.",
  },
  "all-caught-up": {
    icon: CheckCircle,
    title: "All caught up!",
    description: "No pending tasks right now. Check back later.",
  },
};

export function EmptyState({ variant, title, description }: EmptyStateProps) {
  const config = DEFAULTS[variant];
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center animate-slide-up">
      <div className="text-[var(--text-disabled)] mb-[var(--space-4)] rounded-full bg-[var(--bg-secondary)] p-5">
        <Icon size={40} strokeWidth={1.5} />
      </div>
      <h3 className="text-value mb-[var(--space-2)]">
        {title ?? config.title}
      </h3>
      <p className="text-meta text-[var(--text-secondary)] max-w-[280px]">
        {description ?? config.description}
      </p>
    </div>
  );
}
