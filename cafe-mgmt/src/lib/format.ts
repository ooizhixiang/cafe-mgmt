export function formatCents(cents: number | string | null | undefined): string {
  if (cents === null || cents === undefined) return "$0.00";
  const n = typeof cents === "number" ? cents : Number(cents);
  const truncated = Math.trunc(n);
  return `$${(truncated / 100).toFixed(2)}`;
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

/**
 * Parse a money input string into cents with up to 4 decimal places of sub-cent
 * precision. Uses string arithmetic to avoid IEEE-754 float noise (e.g.
 * "12.30" yields exactly 1230, not 1229.9999...).
 *
 * Returns null for empty / invalid / negative inputs.
 *
 * Examples:
 *   "12.30"   → 1230       (1230 cents = $12.30)
 *   "0.005"   → 0.5        (half a cent)
 *   "12.305"  → 1230.5     (1230.5 cents)
 *   "12"      → 1200
 *   ".50"     → 50
 *   ""        → null
 *   "abc"     → null
 *   "-5"      → null
 *   "."       → null
 */
export function parseRMToCentsPrecise(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "" || trimmed === "." || trimmed === "-") return null;
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(trimmed)) return null;

  const [dollarsPart = "0", fracPart = ""] = trimmed.split(".");
  const dollars = parseInt(dollarsPart || "0", 10);
  if (!Number.isFinite(dollars)) return null;

  // Pad/truncate fractional part to 6 digits (= 4 decimal places of cent precision)
  const fracPadded = fracPart.padEnd(6, "0").slice(0, 6);
  const fracInt = parseInt(fracPadded || "0", 10);
  if (!Number.isFinite(fracInt)) return null;

  // Total cents = dollars * 100 + fracInt / 10000
  // Combined: (dollars * 1_000_000 + fracInt) / 10_000
  return (dollars * 1_000_000 + fracInt) / 10_000;
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

/**
 * The single source of truth for the app's operating timezone. The product
 * targets Malaysia only, so all period boundaries, daily-report dates, FIFO
 * timestamps, and "today" calculations resolve against this constant.
 */
export const CAFE_TIMEZONE = "Asia/Kuala_Lumpur";

export function getCafeNow(): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CAFE_TIMEZONE,
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

/**
 * Returns UTC midnight of today's KL calendar date — the canonical
 * `@db.Date`-shaped value for "today" in the cafe's timezone.
 *
 * Why not `getCafeNow()` followed by zeroing out hours/minutes/seconds/ms?
 * That produces server-local
 * midnight, not UTC midnight. On a KL (+8) server it is 16h behind today's
 * UTC date, so Prisma stores `@db.Date` writes one day earlier than intended.
 * Use this helper for every date-only write or comparison.
 */
export function getCafeToday(): Date {
  const now = getCafeNow();
  return new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  );
}

/**
 * Returns the start of the current week (UTC midnight) given a reference
 * date and the configured reset day (0 = Sunday … 6 = Saturday).
 *
 * Caller passes a UTC-midnight date (typically `getCafeToday()`); the
 * returned date is also UTC-midnight, suitable for comparison against
 * `@db.Date` columns.
 */
export function getWeekStart(today: Date, resetDay: number): Date {
  const d = new Date(today);
  const currentDay = d.getUTCDay();
  const diff = (currentDay - resetDay + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
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
