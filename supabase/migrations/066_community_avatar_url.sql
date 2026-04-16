-- 066: Add avatar_url to community_members so we can cache profile photos.
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS avatar_url TEXT;
