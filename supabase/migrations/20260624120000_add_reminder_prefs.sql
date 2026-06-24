-- Per-user reminder schedule (consent + days + hours). Applied live via Management API.
-- Shape: { "on": true, "days": [0,2,4], "hours": [8,20] }  (days 0=Sun..6=Sat, Israel time)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reminder_prefs JSONB DEFAULT NULL;
COMMENT ON COLUMN profiles.reminder_prefs IS '{on:bool, days:[0-6 Sun-Sat], hours:[int]} per-user reminder schedule';
