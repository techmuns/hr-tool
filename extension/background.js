// Service worker: handles the keyboard shortcuts and talks to the HR tool API.
//
// Identity is a signed app-session token obtained via the email-OTP connect
// flow (see popup.js) and sent as a Bearer token on each request. The token is
// the only credential — no user id or role is trusted client-side.

const DEFAULT_BASE_URL = "https://hr-tool.tech-441.workers.dev";
const CLOCK_IN_PATH = "/api/attendance/clock-in";
const CLOCK_OUT_PATH = "/api/attendance/clock-out";

async function getConfig() {
  const { baseUrl, token, name } = await chrome.storage.local.get(["baseUrl", "token", "name"]);
  return { baseUrl: baseUrl || DEFAULT_BASE_URL, token, name };
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
  const { baseUrl, token, name } = await getConfig();

  if (!baseUrl || !token) {
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
        Authorization: `Bearer ${token}`,
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
});
