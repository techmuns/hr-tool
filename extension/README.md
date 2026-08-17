# HR Tool Attendance — Chrome Extension

Clock in and out of the HR tool with a keyboard shortcut, from any device with
Chrome — without opening the website every time.

This is **additive**: it calls the same `/api/attendance/clock-in` and
`/api/attendance/clock-out` endpoints the website uses, so employees can still
clock in from the web UI as well. No backend changes are required.

## Quick install (for teammates — no git needed)

Share one file with your teammate and have them run it. It writes the extension
to their machine, copies the path to their clipboard, and prints the three
clicks to finish.

- **Windows:** right-click `install-hr-attendance.ps1` → *Run with PowerShell*
  (or run `powershell -ExecutionPolicy Bypass -File install-hr-attendance.ps1`).
- **macOS / Linux:** run `bash install-hr-attendance.sh`.

Then open your browser's extensions page → **Developer mode** on →
**Load unpacked** → paste the copied path → pick the folder. Click the pinned
**HR Tool Attendance**, sign in with your work email + the emailed code.

It's a standard Chromium extension, so the **same folder works in every
Chromium browser** — only the extensions-page URL differs:

| Browser | Extensions page |
| ------- | --------------- |
| Chrome  | `chrome://extensions` |
| Edge    | `edge://extensions` (Developer mode toggle is bottom-left) |
| Brave   | `brave://extensions` |
| Opera   | `opera://extensions` |
| Vivaldi | `vivaldi://extensions` |

> **Firefox** uses a different add-on model — this build isn't packaged for it.
> Ask if you need a Firefox version.

> The installers are generated from this folder by
> `scripts/build-installers.py`; re-run it after changing any extension file.

## How it works

The HR tool identifies devices with a server-issued session token, sent as an
`Authorization: Bearer` header. The extension:

1. **Connect once (email OTP)** — you enter your work email; the backend emails
   you a 6-digit code via the Muns email API (`POST /api/auth/request-otp`). You
   enter the code (`POST /api/auth/verify-otp`), which proves you own the
   address and returns your employee id/role plus a session token, stored
   locally in `chrome.storage`. The token is checked against a database row on
   every request — it can't be edited into a *different* identity the way a
   plain user-id header could, only invalidated.
2. **Punch anytime** — a keyboard shortcut (or the popup buttons) sends a
   `POST` to the clock-in / clock-out endpoint with `Authorization: Bearer
   <token>`. You get a desktop notification with the result. If the token has
   expired or been revoked, the extension clears its local state and asks you
   to reconnect.

The Worker URL (`https://hr-tool.tech-441.workers.dev`) is baked in, so there's
nothing to configure beyond the one-time email verification.

## Install (load unpacked)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Click the puzzle-piece toolbar icon → pin **HR Tool Attendance**.

## Connect

1. Click the extension icon.
2. Enter your **work email** → **Send verification code**.
3. Check your inbox, enter the **6-digit code** → **Verify & connect**.

Once connected you'll see "Signed in as …".

> Requires the `MUNS_TOKEN` secret to be set on the Worker
> (`wrangler secret put MUNS_TOKEN`) so it can send the code email.

## Use

| Action    | Shortcut        |
| --------- | --------------- |
| Clock in  | `Alt+Shift+I`   |
| Clock out | `Alt+Shift+O`   |

Change the shortcuts at `chrome://extensions/shortcuts`. You can also use the
**Clock in / Clock out** buttons in the popup.

> Clock-out requires you to have clocked in first that day — the backend returns
> "Clock in before clocking out" otherwise, and the extension shows it.

## Updates

Locally-loaded (unpacked) extensions **do not auto-update** — that's a browser
restriction, not a bug. To avoid people silently running stale builds, the
extension checks `GET /api/extension/version` on the Worker (on install, on
browser start, and every 6 hours) and compares it against its own version. When
a newer version is published it shows an amber **↑** badge and an "Update
available" banner in the popup.

To publish an update:

1. Change the extension files and bump `"version"` in `manifest.json`.
2. Set `EXTENSION_LATEST` in `src/worker/routes/extension.ts` to the same value
   and deploy the Worker.
3. Re-run `python3 scripts/build-installers.py` and share the new installer.
   Teammates re-run it, then click **Reload** on their extensions page (or
   restart the browser) to pick up the new files.

For real *silent* auto-update, publish to the Chrome Web Store / Edge Add-ons
(an unlisted listing works) or force-install via an enterprise (MDM) policy —
both handle updates natively. Ask if you want either set up.

## Security note

Connecting requires an email OTP, so a device can only act as an employee who
can read that employee's inbox. After verification the extension is fully
device-bound: `/api/auth/verify-otp` issues a random, unguessable session
token (hashed and stored server-side, never in plaintext), and every
subsequent request carries it as `Authorization: Bearer <token>` instead of
any client-editable identity. Sessions expire after 14 days, and
**Disconnect** in the popup revokes the token server-side immediately (not
just locally), so a copied/leaked token doesn't stay valid after you think
you've disconnected.

> If you're updating from an older build (pre-1.1.0): it used bare
> `x-user-id` / `x-role` headers, which the backend no longer accepts. Existing
> connections will start failing with "Not authenticated" — open the popup and
> reconnect with your email once to get a real session token.

## Icons

Icons are generated by `scripts/gen-extension-icons.py` (no dependencies). Run
`python3 scripts/gen-extension-icons.py` to regenerate them.
