// Service worker: handles the keyboard shortcuts and talks to the HR tool API.
//
// The HR tool uses header-based identity (x-user-id / x-role), the same as the
// website. We store the employee id + role once (see popup.js) and replay them
// on each clock-in / clock-out request.

const DEFAULT_BASE_URL = "https://hr-tool.tech-441.workers.dev";
const CLOCK_IN_PATH = "/api/attendance/clock-in";
const CLOCK_OUT_PATH = "/api/attendance/clock-out";
const VERSION_PATH = "/api/extension/version";
const UPDATE_ALARM = "hr-update-check";

async function getConfig() {
  const { baseUrl, employeeId, role, name } = await chrome.storage.local.get([
    "baseUrl",
    "employeeId",
    "role",
    "name",
  ]);
  return { baseUrl: baseUrl || DEFAULT_BASE_URL, employeeId, role, name };
}

function notify(title, message) {
  chrome.notifications.create("", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
    priority: 1,
  });
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function punch(action) {
  const { baseUrl, employeeId, role, name } = await getConfig();

  if (!baseUrl || !employeeId) {
    notify("Not connected", "Open the extension and connect with your email first.");
    return;
  }

  const path = action === "clock-in" ? CLOCK_IN_PATH : CLOCK_OUT_PATH;
  const verb = action === "clock-in" ? "Clocked in" : "Clocked out";

  try {
    const res = await fetch(baseUrl.replace(/\/$/, "") + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": String(employeeId),
        "x-role": role || "employee",
      },
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = (data && data.error) || `Request failed (${res.status})`;
      notify("Attendance failed", msg);
      return;
    }

    const stamp = action === "clock-in" ? fmtTime(data && data.clock_in) : fmtTime(data && data.clock_out);
    const who = name ? ` — ${name}` : "";
    notify(`${verb}${who}`, stamp ? `At ${stamp}` : "Done");
  } catch (err) {
    notify("Attendance failed", err && err.message ? err.message : "Network error. Check the HR tool URL.");
  }
}

// --- Update awareness -------------------------------------------------------
// Unpacked (locally loaded) extensions never auto-update, so we can't replace
// ourselves silently. Instead we compare our installed version against the
// latest the server advertises and flag a badge + banner when we're behind, so
// nobody unknowingly runs a stale build.

function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

async function checkForUpdate() {
  const { baseUrl } = await getConfig();
  try {
    const res = await fetch(baseUrl.replace(/\/$/, "") + VERSION_PATH, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    const latest = data && data.version;
    if (!latest) return;

    const current = chrome.runtime.getManifest().version;
    const behind = compareVersions(latest, current) > 0;

    await chrome.storage.local.set({
      update: behind ? { version: latest, notes: data.notes || "", url: data.url || "", current } : null,
    });

    if (behind) {
      chrome.action.setBadgeText({ text: "↑" });
      chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
      chrome.action.setTitle({ title: `HR Tool Attendance — update available (v${latest})` });
    } else {
      chrome.action.setBadgeText({ text: "" });
      chrome.action.setTitle({ title: "HR Tool Attendance" });
    }
  } catch (_) {
    /* offline or blocked — leave the last known state */
  }
}

chrome.runtime.onInstalled.addListener(() => checkForUpdate());
chrome.runtime.onStartup.addListener(() => checkForUpdate());
chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: 360 }); // every 6h
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATE_ALARM) checkForUpdate();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "clock-in" || command === "clock-out") {
    punch(command);
  }
});

// Let the popup trigger a punch too (button clicks).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "punch" && (msg.action === "clock-in" || msg.action === "clock-out")) {
    punch(msg.action).then(() => sendResponse({ ok: true }));
    return true; // async response
  }
  if (msg && msg.type === "check-update") {
    checkForUpdate()
      .then(() => chrome.storage.local.get("update"))
      .then((s) => sendResponse({ update: s.update || null }));
    return true; // async response
  }
});
