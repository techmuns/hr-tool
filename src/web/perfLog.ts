/**
 * Temporary on-screen diagnostic for the "Page Unresponsive" reports.
 *
 * We can't reproduce the freeze outside the live Munshot host, so instead of
 * asking anyone to open DevTools, this makes the freeze announce itself: the
 * moment the main thread is blocked for a noticeable stretch, a red bar appears
 * at the top of the dashboard naming how long it froze and which tab was open.
 * Screenshot that and we know exactly where to look.
 *
 * Two detectors, since a freeze can present either way:
 *  - a 1s heartbeat that notices when its own timer ran late (works even where
 *    the longtask API is unavailable, and catches a freeze that then recovers);
 *  - a PerformanceObserver for 'longtask' (finer, names sub-second jank).
 * Background-tab timer throttling is filtered out so it doesn't false-alarm.
 *
 * Remove once the cause is found.
 */
export function installPerfLogger(): void {
  const FREEZE_MS = 3000; // heartbeat: report a gap this much over the 1s tick
  const LONGTASK_MS = 1000; // longtask: report a single blocking task this long

  const activeTab = () =>
    document.querySelector(".nav button.active")?.textContent?.trim() ||
    document.querySelector(".topbar h1")?.textContent?.trim() ||
    "?";

  let bannerEl: HTMLDivElement | null = null;
  let bannerText: HTMLSpanElement | null = null;

  function showBanner(message: string): void {
    if (!bannerEl) {
      bannerEl = document.createElement("div");
      bannerEl.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#b00020;color:#fff;" +
        "font:600 13px/1.45 Arial,Helvetica,sans-serif;padding:9px 42px 9px 14px;" +
        "box-shadow:0 2px 10px rgba(0,0,0,.35);";
      bannerText = document.createElement("span");
      bannerEl.appendChild(bannerText);
      const close = document.createElement("button");
      close.textContent = "✕";
      close.setAttribute("aria-label", "Dismiss");
      close.style.cssText =
        "position:absolute;right:12px;top:7px;background:transparent;border:0;color:#fff;" +
        "font-size:15px;line-height:1;cursor:pointer;";
      close.onclick = () => {
        if (bannerEl) bannerEl.style.display = "none";
      };
      bannerEl.appendChild(close);
      document.body.appendChild(bannerEl);
    }
    bannerEl.style.display = "block";
    if (bannerText) bannerText.textContent = `⚠ ${message} — please screenshot this and send it.`;
  }

  function report(ms: number, source: string): void {
    const message = `UI froze ${Math.round(ms)}ms — tab: ${activeTab()} — ${location.pathname}${location.search}`;
    console.warn(`[hr-perf] ${message} (${source})`);
    showBanner(message);
  }

  // Heartbeat: a healthy tick lands ~1000ms apart; a much larger gap means the
  // thread was blocked in between. Reset on tab re-focus so returning from a
  // throttled background tab isn't mistaken for a freeze.
  let last = Date.now();
  document.addEventListener("visibilitychange", () => {
    last = Date.now();
  });
  setInterval(() => {
    const now = Date.now();
    const gap = now - last;
    last = now;
    if (gap > FREEZE_MS && !document.hidden) report(gap, "heartbeat");
  }, 1000);

  if (typeof PerformanceObserver !== "undefined") {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= LONGTASK_MS) report(entry.duration, "longtask");
        }
      });
      obs.observe({ entryTypes: ["longtask"] });
    } catch {
      /* 'longtask' unsupported — the heartbeat still covers freezes */
    }
  }
}
