// All times come from the worker as UTC ISO strings and are displayed in IST,
// so everyone sees the same clock regardless of their device's timezone.
import { cycleLabel, periodForDate, shiftPeriod } from "../worker/payslip";

const IST = "Asia/Kolkata";
const LOCALE = "en-IN";

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(LOCALE, { timeZone: IST, hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, { timeZone: IST, month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    timeZone: IST,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** IST hours (0–23), minutes and seconds for a given instant — for the live clock. */
export function istClockParts(d: Date): { hours: number; minutes: number; seconds: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  let hours = get("hour");
  if (hours === 24) hours = 0; // en-GB renders midnight as "24"
  return { hours, minutes: get("minute"), seconds: get("second") };
}

/** e.g. "Friday, July 24" in IST. */
export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString(LOCALE, { timeZone: IST, weekday: "long", month: "long", day: "numeric" });
}

export interface MonthOption {
  value: string; // "YYYY-MM"
  label: string; // "July 2026"
}

/**
 * Earliest date the app surfaces in attendance views. Anything before this is
 * pre-launch noise (no real records), so the grids and month picker hide it.
 */
export const EARLIEST_VISIBLE_DATE = "2026-07-19";
const EARLIEST_VISIBLE_MONTH = EARLIEST_VISIBLE_DATE.slice(0, 7); // "2026-07"

/** Company standard: fixed number of working days per month (used in summaries). */
export const WORKING_DAYS_PER_MONTH = 24;

/** Recent months, newest first, for the attendance month picker. */
export function recentMonths(count = 12): MonthOption[] {
  const now = new Date();
  const options: MonthOption[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString([], { month: "long", year: "numeric" });
    options.push({ value, label });
  }
  return options.filter((o) => o.value >= EARLIEST_VISIBLE_MONTH);
}

/**
 * Earliest pay cycle worth offering. Attendance starts EARLIEST_VISIBLE_DATE,
 * and the cycle that date falls in is the first one with any real data behind
 * it — anything older would bill a period the company wasn't using the tool for.
 */
const EARLIEST_VISIBLE_PERIOD = periodForDate(EARLIEST_VISIBLE_DATE);

/**
 * Pay cycles for a period picker, newest first — NOT the same list as
 * recentMonths().
 *
 * Cycles run 11th-to-10th and are named for the month they're paid in, so from
 * the 11th onwards the cycle now accruing is NEXT calendar month's period.
 * recentMonths() counts back from the current calendar month and so never
 * contains it: on the 11th the picker's own default value was absent from its
 * options, which is what left the Reimb. Notes dropdown blank and made the
 * cycle everyone had been logging against unreachable.
 *
 * `include` is the period actually selected. It's forced into the list wherever
 * it sorts, so no matter how far back someone navigates — or how long a cycle
 * is held open for unpaid dues — the picker can always show where it is.
 */
export function recentPeriods(count = 12, include?: string): MonthOption[] {
  const newest = periodForDate(todayISODate());
  const values = new Set<string>();
  for (let i = 0; i < count; i++) {
    const value = shiftPeriod(newest, -i);
    if (value >= EARLIEST_VISIBLE_PERIOD) values.add(value);
  }
  if (include) values.add(include);

  return [...values]
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({ value, label: cycleLabel(value) }));
}

/**
 * Every day-of-month number for a "YYYY-MM" month, oldest→newest, excluding any
 * date before EARLIEST_VISIBLE_DATE. Leave can be marked ahead of time, so
 * future days can carry data too — the grid shows the rest of the month rather
 * than stopping at today.
 */
export function daysForMonth(month: string): number[] {
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => i + 1).filter(
    (day) => dayKey(month, day) >= EARLIEST_VISIBLE_DATE,
  );
}

export function dayKey(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function isToday(month: string, day: number): boolean {
  const now = new Date();
  const value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return month === value && day === now.getDate();
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Short weekday label ("Mon", "Sat", …) for a day in a "YYYY-MM" month. */
export function dayOfWeekLabel(month: string, day: number): string {
  const [year, mon] = month.split("-").map(Number);
  return WEEKDAY_LABELS[new Date(year, mon - 1, day).getDay()];
}

/** True for Saturday/Sunday. */
export function isWeekend(month: string, day: number): boolean {
  const [year, mon] = month.split("-").map(Number);
  const dow = new Date(year, mon - 1, day).getDay();
  return dow === 0 || dow === 6;
}

/** Human-readable tenure from a "YYYY-MM-DD" join date to today, e.g. "2 yrs 5 mos". */
export function tenure(dateOfJoining: string): string {
  const start = new Date(dateOfJoining);
  if (Number.isNaN(start.getTime())) return "—";

  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  months = Math.max(months, 0);

  const years = Math.floor(months / 12);
  const remMonths = months % 12;

  if (years === 0 && remMonths === 0) return "Joined this month";
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr${years === 1 ? "" : "s"}`);
  if (remMonths > 0) parts.push(`${remMonths} mo${remMonths === 1 ? "" : "s"}`);
  return parts.join(" ");
}
