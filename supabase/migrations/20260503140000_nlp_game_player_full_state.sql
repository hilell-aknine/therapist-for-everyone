-- Migration: NLP Game player save table — create + full state schema
-- Date: 2026-05-03
--
-- Discovery: The table `nlp_game_players` was referenced by js/nlp-game.js
-- since the game shipped, but no migration ever created it. Every logged-in
-- save/load against Supabase was silently failing inside try/catch +
-- console.warn, with the code falling back to localStorage. Result: cross-device
-- sync never worked for any logged-in user — opening the game on a second
-- device showed an empty profile, which is the customer-reported "game stops
-- working at a certain stage" symptom (it was actually losing all progress on
-- device switch).
--
-- This migration creates the table with the full schema the JS engine expects,
-- including the 5 columns added in the same code update (migration_version,
-- perfect_lessons_list, weekly_activity, module_accuracy, longest_streak).
-- Idempotent: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS, so it is
-- safe to re-run.

CREATE TABLE IF NOT EXISTS nlp_game_players (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    hearts INTEGER DEFAULT 5,
    max_hearts INTEGER DEFAULT 5,
    streak INTEGER DEFAULT 0,
    last_play_date TEXT,
    last_heart_lost TIMESTAMPTZ,
    completed_lessons JSONB DEFAULT '{}'::jsonb,
    achievements JSONB DEFAULT '[]'::jsonb,
    total_correct INTEGER DEFAULT 0,
    total_wrong INTEGER DEFAULT 0,
    stories_created INTEGER DEFAULT 0,
    perfect_lessons INTEGER DEFAULT 0,
    daily_challenge_completed TEXT,
    migration_version INTEGER DEFAULT 2,
    perfect_lessons_list JSONB DEFAULT '[]'::jsonb,
    weekly_activity JSONB DEFAULT '{}'::jsonb,
    module_accuracy JSONB DEFAULT '{}'::jsonb,
    longest_streak INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- If the table already existed from a manual creation outside version control,
-- ensure all expected columns are present.
ALTER TABLE nlp_game_players
    ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS hearts INTEGER DEFAULT 5,
    ADD COLUMN IF NOT EXISTS max_hearts INTEGER DEFAULT 5,
    ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_play_date TEXT,
    ADD COLUMN IF NOT EXISTS last_heart_lost TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_lessons JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS achievements JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS total_correct INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_wrong INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stories_created INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS perfect_lessons INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS daily_challenge_completed TEXT,
    ADD COLUMN IF NOT EXISTS migration_version INTEGER DEFAULT 2,
    ADD COLUMN IF NOT EXISTS perfect_lessons_list JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS weekly_activity JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS module_accuracy JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Backfill migration_version=2 on any pre-existing rows so that migrateProgress()
-- in the JS engine treats them as already-migrated and never wipes their progress.
UPDATE nlp_game_players
SET migration_version = 2
WHERE migration_version IS NULL;

-- RLS — same pattern as nlp_game_leaderboard (migration 042). Each user
-- reads/writes only their own row; admin can do anything.
ALTER TABLE nlp_game_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_player" ON nlp_game_players;
CREATE POLICY "users_select_own_player" ON nlp_game_players
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_player" ON nlp_game_players;
CREATE POLICY "users_insert_own_player" ON nlp_game_players
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_player" ON nlp_game_players;
CREATE POLICY "users_update_own_player" ON nlp_game_players
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_full_player" ON nlp_game_players;
CREATE POLICY "admin_full_player" ON nlp_game_players
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- Index for the common SELECT-by-user_id (already covered by PK, but keep it
-- explicit for the case where user_id might not be the PK in a manually-created
-- pre-existing version of the table).
CREATE INDEX IF NOT EXISTS idx_nlp_game_players_user ON nlp_game_players(user_id);
