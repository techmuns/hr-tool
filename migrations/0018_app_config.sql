-- Generic key/value store for small runtime-tweakable settings that HR can
-- change without a code deploy. First (and currently only) key is
-- `munshot_app_version`: the version string the Munshot Attendance Android app
-- checks on startup. A mismatch against the app's bundled version blocks the
-- app, so this row is effectively a kill switch — see routes/appVersion.ts.
CREATE TABLE app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed with '1.0', the version of the APK already in employees' hands, so
-- shipping this migration does not immediately lock anyone out.
INSERT INTO app_config (key, value) VALUES ('munshot_app_version', '1.0');
