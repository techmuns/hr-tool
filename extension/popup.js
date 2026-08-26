// Popup: two-step OTP connect, then manual clock in/out buttons.
//
// Step 1: email -> POST /api/auth/request-otp (Muns sends a code)
// Step 2: code  -> POST /api/auth/verify-otp  (returns the employee session)
// The keyboard shortcuts work without opening this once connected.

const BASE_URL = "https://hr-tool.tech-441.workers.dev";
const $ = (id) => document.getElementById(id);

let pendingEmail = "";

function setStatus(msg, kind) {
  const el = $("status");
  el.textContent = msg || "";
  el.className = "status" + (kind ? " " + kind : "");
}

function showStep(step, name) {
  $("step-email").classList.toggle("hidden", step !== "email");
  $("step-code").classList.toggle("hidden", step !== "code");
  $("connected").classList.toggle("hidden", step !== "connected");
  if (step === "connected" && name) $("who-name").textContent = name;
  if (step === "code") $("code-email").textContent = pendingEmail;
}

async function post(path, body) {
  const res = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { res, data };
}

async function load() {
  const cfg = await chrome.storage.local.get(["token", "name"]);
  showStep(cfg.token ? "connected" : "email", cfg.name);
}

async function sendCode() {
  const email = $("email").value.trim();
  if (!email) return setStatus("Enter your work email.", "err");

  $("sendCode").disabled = true;
  setStatus("Sending code…");
  try {
    const { res, data } = await post("/api/auth/request-otp", { email });
    if (!res.ok) return setStatus((data && data.error) || "Could not send code.", "err");
    pendingEmail = email;
    showStep("code");
    setStatus("Code sent. Check your inbox.", "ok");
    $("code").focus();
  } catch (err) {
    setStatus(err && err.message ? err.message : "Network error.", "err");
  } finally {
    $("sendCode").disabled = false;
  }
}

async function verify() {
  const code = $("code").value.trim();
  if (!code) return setStatus("Enter the code from your email.", "err");

  $("verify").disabled = true;
  setStatus("Verifying…");
  try {
    const { res, data } = await post("/api/auth/verify-otp", { email: pendingEmail, code });
    if (!res.ok || !data || !data.employee || !data.token) {
      return setStatus((data && data.error) || "Verification failed.", "err");
    }
    const emp = data.employee;
    // Store only the opaque session token (and a display name) — never the id or
    // role. The server resolves who we are from the token on every request, so
    // there's nothing here to edit into someone else's identity.
    await chrome.storage.local.set({
      baseUrl: BASE_URL,
      token: data.token,
      name: emp.name || pendingEmail,
    });
    // Clear any id/role left by an older build that stored them.
    await chrome.storage.local.remove(["employeeId", "role"]);
    showStep("connected", emp.name || pendingEmail);
    setStatus("Connected. Try the shortcut!", "ok");
  } catch (err) {
    setStatus(err && err.message ? err.message : "Network error.", "err");
  } finally {
    $("verify").disabled = false;
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
  await chrome.storage.local.remove(["token", "employeeId", "role", "name"]);
  pendingEmail = "";
  showStep("email");
  setStatus("Disconnected.");
}

function renderUpdate(update) {
  const banner = $("update-banner");
  if (!update || !update.version) {
    banner.classList.add("hidden");
    return;
  }
  $("update-text").textContent = `Update available — v${update.version} (you have v${update.current || "?"}).`;
  banner.classList.remove("hidden");
  $("update-how").onclick = () => {
    if (update.url) {
      chrome.tabs.create({ url: update.url });
    } else {
      setStatus("Re-run the installer, then reload the extension on the extensions page.", "ok");
    }
  };
}

function checkUpdate() {
  chrome.runtime.sendMessage({ type: "check-update" }, (resp) => {
    if (chrome.runtime.lastError) return;
    renderUpdate(resp && resp.update);
  });
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

$("sendCode").addEventListener("click", sendCode);
$("verify").addEventListener("click", verify);
$("backToEmail").addEventListener("click", () => {
  showStep("email");
  setStatus("");
});
$("clockIn").addEventListener("click", () => punch("clock-in"));
$("clockOut").addEventListener("click", () => punch("clock-out"));
$("disconnect").addEventListener("click", disconnect);
$("code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") verify();
});
$("email").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendCode();
});
$("shortcuts-link").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

load();
initShortcutLabels();
checkUpdate();
