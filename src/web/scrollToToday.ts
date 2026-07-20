/**
 * Scrolls a horizontally-scrollable heatmap container so today's column
 * (marked with the "today-col" class) sits near the right edge. Falls back
 * to the far right (e.g. viewing a past month) when there's no today column.
 */
export function scrollToToday(container: HTMLElement | null): void {
  if (!container) return;
  const todayEl = container.querySelector<HTMLElement>(".today-col");
  if (todayEl) {
    const target = todayEl.offsetLeft + todayEl.offsetWidth - container.clientWidth + 24;
    container.scrollLeft = Math.max(0, target);
  } else {
    container.scrollLeft = container.scrollWidth;
  }
}
