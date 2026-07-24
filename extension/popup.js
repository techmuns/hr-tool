// Popup: one-time connect (email -> /api/login, same as the website), then
// manual clock in/out buttons. The keyboard shortcuts work without opening this.

const $ = (id) => document.getElementById(id);

function setStatus(msg, kind) {
  const el = $("status");
  el.textContent = msg || "";
  el.className = "status" + (kind ? " " + kind : "");
}

function show(connected, name) {
  $("setup").classList.toggle("hidden", connected);
  $("connected").classList.toggle("hidden", !connected);
  if (connected && name) $("who-name").textContent = name;
}

async function load() {
  const cfg = await chrome.storage.local.get(["baseUrl", "employeeId", "role", "name"]);
  if (cfg.baseUrl) $("baseUrl").value = cfg.baseUrl;
  show(Boolean(cfg.employeeId), cfg.name);
}

async function connect() {
  const baseUrl = $("baseUrl").value.trim().replace(/\/$/, "");
  const email = $("email").value.trim();
  if (!baseUrl) return setStatus("Enter the HR tool URL.", "err");
  if (!email) return setStatus("Enter your work email.", "err");

  setStatus("Connecting…");
  try {
    const res = await fetch(baseUrl + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: email }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.employee) {
      return setStatus((data && data.error) || "Login failed.", "err");
    }
    const emp = data.employee;
    await chrome.storage.local.set({
      baseUrl,
      employeeId: emp.id,
      role: data.role || emp.role || "employee",
      name: emp.name || email,
    });
    show(true, emp.name || email);
    setStatus("Connected. Try the shortcut!", "ok");
  } catch (err) {
    setStatus(err && err.message ? err.message : "Network error.", "err");
  }
}

function punch(action) {
  setStatus(action === "clock-in" ? "Clocking in…" : "Clocking out…");
  chrome.runtime.sendMessage({ type: "punch", action }, () => {
    // Result is shown via a system notification from the service worker.
    setStatus(action === "clock-in" ? "Clock-in sent." : "Clock-out sent.", "ok");
  });
}

async function disconnect() {
  await chrome.storage.local.remove(["employeeId", "role", "name"]);
  show(false);
  setStatus("Disconnected.");
}

async function initShortcutLabels() {
  try {
    const cmds = await chrome.commands.getAll();
    for (const c of cmds) {
      if (c.name === "clock-in" && c.shortcut) $("kb-in").textContent = c.shortcut;
      if (c.name === "clock-out" && c.shortcut) $("kb-out").textContent = c.shortcut;
    }
  } catch (_) {
    /* keep defaults */
  }
}

$("connect").addEventListener("click", connect);
$("clockIn").addEventListener("click", () => punch("clock-in"));
$("clockOut").addEventListener("click", () => punch("clock-out"));
$("disconnect").addEventListener("click", disconnect);
$("shortcuts-link").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

load();
initShortcutLabels();
