export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDateTime(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function getCafeNow(timezone: string): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  return new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`
  );
}

export const DEFAULT_TIME_BOUNDARIES = {
  openingStart: "05:00",
  openingEnd: "09:00",
  midDayStart: "09:00",
  midDayEnd: "15:00",
  closingStart: "15:00",
  closingEnd: "21:00",
} as const;

export function getDefaultTimeBoundaries() {
  return { ...DEFAULT_TIME_BOUNDARIES };
}
