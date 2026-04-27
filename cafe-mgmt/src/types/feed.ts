export type CardVariant =
  | "checklist"
  | "alert"
  | "onboarding"
  | "completion"
  | "summary";

export type CardPriority = 1 | 2 | 3 | 4; // overdue=1, time-sensitive=2, alert=3, informational=4

export interface FeedCard {
  id: string;
  variant: CardVariant;
  priority: CardPriority;
  title: string;
  subtitle?: string;
  borderColor: string; // CSS var
  data: Record<string, unknown>;
  createdAt: string; // ISO
}

export interface ChecklistCardData {
  period: string;
  periodLabel: string;
  dailyChecklistId: string;
  items: ChecklistItemData[];
  completed: number;
  total: number;
  isAutoSelected: boolean;
}

export interface ChecklistItemData {
  id: string;
  text: string;
  notes?: string | null;
  role?: string | null;
  linkRoute?: string | null;
  completedAt: string | null;
  completedByName?: string | null;
}

export interface FeedSummary {
  checklistProgress?: {
    period: string;
    completed: number;
    total: number;
  };
  compBudgetRemaining?: number; // cents, Epic 3
}

export interface FeedBadges {
  feed: boolean;
  inventory: boolean;
  wastageComp: boolean;
}

export interface FeedResponse {
  cards: FeedCard[];
  summary: FeedSummary;
  badges: FeedBadges;
}
