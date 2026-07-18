export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export interface MonthOption {
  value: string; // "YYYY-MM"
  label: string; // "July 2026"
}

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
  return options;
}

/**
 * The day-of-month numbers to render for a "YYYY-MM" month, oldest→newest.
 * For the current month we stop at today (days "generate" up to now); for a
 * past month we show every day.
 */
export function daysForMonth(month: string): number[] {
  const [year, mon] = month.split("-").map(Number);
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && mon === now.getMonth() + 1;
  const daysInMonth = new Date(year, mon, 0).getDate();
  const last = isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth;
  return Array.from({ length: last }, (_, i) => i + 1);
}

export function dayKey(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function isToday(month: string, day: number): boolean {
  const now = new Date();
  const value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return month === value && day === now.getDate();
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
