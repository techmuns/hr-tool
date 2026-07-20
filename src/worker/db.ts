export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

/** The next `count` business days (Mon–Fri) starting today, as ISO dates. */
export function businessDaysFrom(count: number): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${todayISODate()}T00:00:00Z`);
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Inclusive business days (Mon–Fri) between two ISO dates, as ISO dates. */
export function businessDaysInRange(startISO: string, endISO: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
