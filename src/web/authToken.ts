// Client-side bearer-token source for API requests.
//
// Two credentials can drive the API, matching the two server-verified paths:
//   - hostToken:  the Munshot host JWT, received via the SDK context and held
//                 only in memory (never persisted).
//   - appToken:   the app-session token minted after an email-OTP login,
//                 persisted so the OTP fallback survives reloads.
//
// The host token takes precedence when present.

let hostToken: string | null = null;
const APP_TOKEN_KEY = "hr.appToken";

export function setHostToken(token: string | null): void {
  hostToken = token;
}

export function getBearer(): string | null {
  if (hostToken) return hostToken;
  try {
    return localStorage.getItem(APP_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAppToken(token: string): void {
  try {
    localStorage.setItem(APP_TOKEN_KEY, token);
  } catch {
    /* storage unavailable */
  }
}

export function clearAppToken(): void {
  try {
    localStorage.removeItem(APP_TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}
