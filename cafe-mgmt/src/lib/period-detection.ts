import type { Period } from "@/generated/prisma/enums";
import { getCafeNow, DEFAULT_TIME_BOUNDARIES } from "@/lib/format";

export interface TimeBoundaries {
  openingStart: string | null;
  openingEnd: string | null;
  midDayStart: string | null;
  midDayEnd: string | null;
  closingStart: string | null;
  closingEnd: string | null;
}

export interface PeriodInfo {
  period: Period;
  label: string;
  startTime: string;
  endTime: string;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function formatTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${hour}${ampm}` : `${hour}:${m.toString().padStart(2, "0")}${ampm}`;
}

function getBoundaries(tb: TimeBoundaries) {
  return {
    openingStart: tb.openingStart ?? DEFAULT_TIME_BOUNDARIES.openingStart,
    openingEnd: tb.openingEnd ?? DEFAULT_TIME_BOUNDARIES.openingEnd,
    midDayStart: tb.midDayStart ?? DEFAULT_TIME_BOUNDARIES.midDayStart,
    midDayEnd: tb.midDayEnd ?? DEFAULT_TIME_BOUNDARIES.midDayEnd,
    closingStart: tb.closingStart ?? DEFAULT_TIME_BOUNDARIES.closingStart,
    closingEnd: tb.closingEnd ?? DEFAULT_TIME_BOUNDARIES.closingEnd,
  };
}

export function getAllPeriods(tb: TimeBoundaries): PeriodInfo[] {
  const b = getBoundaries(tb);
  return [
    {
      period: "OPENING" as Period,
      label: `Opening ${formatTimeLabel(b.openingStart)} – ${formatTimeLabel(b.openingEnd)}`,
      startTime: b.openingStart,
      endTime: b.openingEnd,
    },
    {
      period: "MID_DAY" as Period,
      label: `Mid-Day ${formatTimeLabel(b.midDayStart)} – ${formatTimeLabel(b.midDayEnd)}`,
      startTime: b.midDayStart,
      endTime: b.midDayEnd,
    },
    {
      period: "CLOSING" as Period,
      label: `Closing ${formatTimeLabel(b.closingStart)} – ${formatTimeLabel(b.closingEnd)}`,
      startTime: b.closingStart,
      endTime: b.closingEnd,
    },
  ];
}

export function getCurrentPeriod(
  tb: TimeBoundaries
): PeriodInfo | null {
  const now = getCafeNow();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const periods = getAllPeriods(tb);

  for (const p of periods) {
    const start = timeToMinutes(p.startTime);
    const end = timeToMinutes(p.endTime);
    if (currentMinutes >= start && currentMinutes < end) {
      return p;
    }
  }

  return null;
}

export function getNextPeriod(
  tb: TimeBoundaries
): PeriodInfo | null {
  const now = getCafeNow();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const periods = getAllPeriods(tb);

  for (const p of periods) {
    const start = timeToMinutes(p.startTime);
    if (start > currentMinutes) {
      return p;
    }
  }

  return null;
}
