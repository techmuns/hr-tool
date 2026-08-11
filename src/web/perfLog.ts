/**
 * On-screen diagnostic for the "Page Unresponsive" reports.
 *
 * A freeze can't be reproduced outside the live Munshot host, so this makes it
 * announce itself: when the UI locks up, a bar appears at the top naming how
 * long and which tab was open. Two detectors:
 *
 *  - a PerformanceObserver for 'longtask' — the authoritative signal. A single
 *    task that hogs the thread for seconds shows up here and CANNOT be faked by
 *    timer throttling, so a longtask alarm means a genuine CPU freeze.
 *  - a 1s heartbeat — catches a freeze even where the longtask API is absent.
 *    But a heartbeat can also fire late for a harmless reason: browsers pause
 *    timers in a panel that's scrolled off-screen or in a background tab. So a
 *    late heartbeat is cross-checked against how much real task time actually
 *    ran in the gap: lots of task time = a real freeze (red bar); little or
 *    none = the panel was merely backgrounded (muted bar, not a real freeze).
 *
 * That distinction is the point — it tells us whether the 29s reports are an
 * actual hang or just the browser pausing an off-screen panel. Remove once the
 * cause is settled.
 */
export function installPerfLogger(): void {
  const REAL_TASK_MS = 2000; // a single task this long = a genuine freeze
  const GAP_MS = 3000; // heartbeat gap over the 1s tick worth examining

  const activeTab = () =>
    document.querySelector(".nav button.active")?.textContent?.trim() ||
    document.querySelector(".topbar h1")?.textContent?.trim() ||
    "?";

  let bannerEl: HTMLDivElement | null = null;
  let bannerText: HTMLSpanElement | null = null;

  function showBanner(message: string, real: boolean): void {
    if (!bannerEl) {
      bannerEl = document.createElement("div");
      bannerText = document.createElement("span");
      bannerEl.appendChild(bannerText);
      const close = document.createElement("button");
      close.textContent = "✕";
      close.setAttribute("aria-label", "Dismiss");
      close.style.cssText =
        "position:absolute;right:12px;top:7px;background:transparent;border:0;color:#fff;font-size:15px;line-height:1;cursor:pointer;";
      close.onclick = () => {
        if (bannerEl) bannerEl.style.display = "none";
      };
      bannerEl.appendChild(close);
      document.body.appendChild(bannerEl);
    }
    bannerEl.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:2147483647;color:#fff;" +
      "font:600 13px/1.45 Arial,Helvetica,sans-serif;padding:9px 42px 9px 14px;" +
      `box-shadow:0 2px 10px rgba(0,0,0,.35);background:${real ? "#b00020" : "#5b6470"};`;
    bannerEl.style.display = "block";
    if (bannerText) {
      bannerText.textContent = real
        ? `⚠ ${message} — please screenshot this and send it.`
        : `ℹ ${message}`;
    }
  }

  function report(ms: number, cause: string, real: boolean): void {
    const head = real ? "UI froze" : "Panel paused";
    const message = `${head} ${Math.round(ms)}ms — ${cause} — tab: ${activeTab()} — ${location.pathname}`;
    console.warn(`[hr-perf] ${message}`);
    showBanner(message, real);
  }

  // Running total of real main-thread task time, for the heartbeat cross-check.
  let longTaskTotal = 0;
  if (typeof PerformanceObserver !== "undefined") {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTaskTotal += entry.duration;
          if (entry.duration >= REAL_TASK_MS) report(entry.duration, "one blocking task", true);
        }
      });
      obs.observe({ entryTypes: ["longtask"] });
    } catch {
      /* 'longtask' unsupported — the heartbeat still covers freezes */
    }
  }

  let last = Date.now();
  let lastTaskTotal = 0;
  document.addEventListener("visibilitychange", () => {
    last = Date.now();
    lastTaskTotal = longTaskTotal;
  });
  setInterval(() => {
    const now = Date.now();
    const gap = now - last;
    const taskInGap = longTaskTotal - lastTaskTotal;
    last = now;
    lastTaskTotal = longTaskTotal;
    if (gap <= GAP_MS) return;
    // Real freeze only if the thread was actually busy for most of the gap;
    // otherwise the panel was just paused off-screen / in the background.
    if (taskInGap >= gap * 0.5) report(gap, "the main thread stayed busy", true);
    else report(gap, "the panel was paused in the background — not a real freeze", false);
  }, 1000);
}
