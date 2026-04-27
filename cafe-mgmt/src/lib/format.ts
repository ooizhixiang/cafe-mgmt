export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

// Parse a user-typed RM amount (string or number) to integer cents.
// Returns null on invalid input. Avoids float drift around 1.005-style values.
export function parseRMToCents(input: string | number): number | null {
  const raw = typeof input === "string" ? input.trim() : String(input);
  if (raw === "") return null;
  if (!/^-?\d*\.?\d*$/.test(raw)) return null;
  const [whole, frac = ""] = raw.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  const wholeDigits = whole.replace("-", "");
  if (wholeDigits === "" && frac === "") return null;
  const fracPadded = (frac + "00").slice(0, 2);
  const wholeNum = wholeDigits === "" ? 0 : parseInt(wholeDigits, 10);
  const fracNum = fracPadded === "" ? 0 : parseInt(fracPadded, 10);
  if (Number.isNaN(wholeNum) || Number.isNaN(fracNum)) return null;
  return sign * (wholeNum * 100 + fracNum);
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
