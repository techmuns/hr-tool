-- Fixed-window rate-limit counters. One row per (scope, key), updated in place.
-- Used to throttle OTP request/verify per IP and per email (see ratelimit.ts).
CREATE TABLE rate_limits (
  scope        TEXT NOT NULL,
  rl_key       TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, rl_key)
);
