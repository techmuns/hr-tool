/**
 * Temporary diagnostic for the "Page Unresponsive" reports.
 *
 * The browser flags a page unresponsive when a single task hogs the main thread
 * for several seconds. This logs any main-thread task over 200ms to the console,
 * tagged with the tab the user was on and the URL — turning "it froze" into
 * "a 4200ms task blocked while on Payroll", which is what we need to pinpoint
 * the cause in the live Munshot host (which can't be reproduced locally).
 *
 * No-op where PerformanceObserver / the 'longtask' entry type is unsupported.
 * Remove once the freeze is understood.
 */
export function installPerfLogger(): void {
  if (typeof PerformanceObserver === "undefined") return;

  const activeTab = () =>
    document.querySelector(".nav button.active")?.textContent?.trim() ||
    document.querySelector(".topbar h1")?.textContent?.trim() ||
    "?";

  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= 200) {
          console.warn(
            `[hr-perf] main thread blocked ${Math.round(entry.duration)}ms — tab: ${activeTab()} — ${location.pathname}${location.search}`,
          );
        }
      }
    });
    obs.observe({ entryTypes: ["longtask"] });
  } catch {
    /* 'longtask' not supported in this browser — nothing to observe */
  }
}
