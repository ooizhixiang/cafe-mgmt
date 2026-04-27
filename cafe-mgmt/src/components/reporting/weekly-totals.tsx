"use client";

import { useState, useEffect } from "react";
import { getWeeklyTotals, getCurrentWeekTotals } from "@/actions/reporting.actions";
import { formatCents } from "@/lib/format";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface WeekData {
  weekStart: string;
  weekEnd: string;
  wastageTotalInCents: number;
  compTotalInCents: number;
}

function TrendBar({
  weeks,
  field,
  color,
}: {
  weeks: WeekData[];
  field: "wastageTotalInCents" | "compTotalInCents";
  color: string;
}) {
  const values = weeks.map((w) => w[field]);
  const max = Math.max(...values, 1); // avoid divide-by-zero

  return (
    <div className="flex items-end gap-[2px] h-[40px]">
      {/* Show oldest to newest (reverse since weeks[0] is current) */}
      {[...weeks].reverse().map((week, i) => {
        const pct = (week[field] / max) * 100;
        return (
          <div
            key={i}
            className="flex-1 rounded-t-sm transition-all"
            style={{
              height: `${Math.max(pct, 4)}%`,
              backgroundColor: color,
              opacity: i === weeks.length - 1 ? 1 : 0.4 + (i / weeks.length) * 0.4,
            }}
          />
        );
      })}
    </div>
  );
}

function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) {
    return <Minus size={14} className="text-[var(--text-secondary)]" />;
  }
  if (current > previous) {
    const pct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 100;
    return (
      <span className="flex items-center gap-1 text-meta text-[var(--color-urgent)]">
        <TrendingUp size={14} /> +{pct}%
      </span>
    );
  }
  if (current < previous) {
    const pct = previous > 0 ? Math.round(((previous - current) / previous) * 100) : 0;
    return (
      <span className="flex items-center gap-1 text-meta text-[var(--color-success)]">
        <TrendingDown size={14} /> -{pct}%
      </span>
    );
  }
  return <Minus size={14} className="text-[var(--text-secondary)]" />;
}

export function WeeklyTotals({ isManager }: { isManager: boolean }) {
  const [weeks, setWeeks] = useState<WeekData[]>([]);
  const [currentWeek, setCurrentWeek] = useState<{
    wastageTotalInCents: number;
    compTotalInCents: number;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (isManager) {
        const result = await getWeeklyTotals();
        if (result.success && result.data) {
          setWeeks(result.data);
          if (result.data.length > 0) {
            setCurrentWeek({
              wastageTotalInCents: result.data[0].wastageTotalInCents,
              compTotalInCents: result.data[0].compTotalInCents,
            });
          }
        }
      } else {
        const result = await getCurrentWeekTotals();
        if (result.success && result.data) {
          setCurrentWeek(result.data);
        }
      }
      setLoading(false);
    }
    load();
  }, [isManager]);

  if (loading) {
    return (
      <div className="rounded-lg p-[var(--space-4)]" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="h-4 rounded-lg animate-shimmer" />
        <div className="h-3 w-2/3 rounded-lg animate-shimmer mt-[var(--space-2)]" />
      </div>
    );
  }

  if (!currentWeek) return null;

  const previousWeek = weeks.length > 1 ? weeks[1] : null;

  return (
    <div className="rounded-lg p-[var(--space-4)]" style={{ boxShadow: "var(--shadow-card)" }}>
      <h3 className="text-body font-semibold mb-[var(--space-2)]">This Week</h3>
      <div className="flex justify-between">
        <div>
          <p className="text-meta text-[var(--text-secondary)]">Wastage</p>
          <div className="flex items-center gap-[var(--space-2)]">
            <p className="text-value font-semibold text-[var(--color-urgent,#dc2626)] tabular-nums">
              {formatCents(currentWeek.wastageTotalInCents)}
            </p>
            {previousWeek && (
              <TrendIndicator
                current={currentWeek.wastageTotalInCents}
                previous={previousWeek.wastageTotalInCents}
              />
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-meta text-[var(--text-secondary)]">Complimentary</p>
          <div className="flex items-center gap-[var(--space-2)] justify-end">
            <p className="text-value font-semibold text-[var(--color-info)] tabular-nums">
              {formatCents(currentWeek.compTotalInCents)}
            </p>
            {previousWeek && (
              <TrendIndicator
                current={currentWeek.compTotalInCents}
                previous={previousWeek.compTotalInCents}
              />
            )}
          </div>
        </div>
      </div>

      {/* Manager: 5-week visual trends */}
      {isManager && weeks.length > 1 && (
        <div className="mt-[var(--space-3)]">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-meta text-[var(--color-info)] font-medium"
          >
            {expanded ? "Hide" : "Show"} 5-week trends
          </button>

          {expanded && (
            <div className="mt-[var(--space-3)] space-y-[var(--space-3)]">
              {/* Visual bar charts */}
              <div className="grid grid-cols-2 gap-[var(--space-4)]">
                <div>
                  <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-1)]">
                    Wastage Trend
                  </p>
                  <TrendBar
                    weeks={weeks}
                    field="wastageTotalInCents"
                    color="var(--color-urgent)"
                  />
                </div>
                <div>
                  <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-1)]">
                    Complimentary Trend
                  </p>
                  <TrendBar
                    weeks={weeks}
                    field="compTotalInCents"
                    color="var(--color-info)"
                  />
                </div>
              </div>

              {/* Week-by-week table */}
              <div className="space-y-[var(--space-1)]">
                {weeks.map((week, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between text-meta ${
                      i === 0
                        ? "text-[var(--text-primary)] font-medium"
                        : "text-[var(--text-secondary)]"
                    }`}
                  >
                    <span>
                      {i === 0 ? "This wk" : ""}
                      {i > 0 &&
                        `${new Date(week.weekStart).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })} – ${new Date(week.weekEnd).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}`}
                    </span>
                    <span className="tabular-nums">
                      W: {formatCents(week.wastageTotalInCents)} · C:{" "}
                      {formatCents(week.compTotalInCents)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
