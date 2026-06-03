-- =============================================================================
-- Migration: Make nlp_game_players and nlp_game_leaderboard course-aware
-- Date: 2026-06-02
--
-- Purpose: The NLP game and leaderboard were originally single-course (the free
-- Practitioner course). The paid Master course now exists on the same portal.
-- This migration adds course_id to both tables so each user has independent
-- progress and a separate leaderboard entry per course.
--
-- Strategy: ADDITIVE ONLY. No existing data is dropped or renamed.
--   - course_id defaults to 'practitioner', so all existing rows stay valid.
--   - The PK on nlp_game_players is widened from (user_id) to
--     (user_id, course_id), enabling one save-state per course per user.
--   - The UNIQUE constraint on nlp_game_leaderboard.user_id is widened to
--     UNIQUE (user_id, course_id), one ranking row per course per user.
--   - Indexes are recreated to be course-scoped.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ADD course_id COLUMNS (idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE nlp_game_players
    ADD COLUMN IF NOT EXISTS course_id TEXT NOT NULL DEFAULT 'practitioner';

ALTER TABLE nlp_game_leaderboard
    ADD COLUMN IF NOT EXISTS course_id TEXT NOT NULL DEFAULT 'practitioner';

-- ---------------------------------------------------------------------------
-- 2. nlp_game_players — widen PK from (user_id) to (user_id, course_id)
--
-- The original table was created with:
--   user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
-- so the PK constraint name is nlp_game_players_pkey.
-- All existing rows already have course_id = 'practitioner' (the DEFAULT),
-- so the new composite PK has no collisions.
-- ---------------------------------------------------------------------------
ALTER TABLE nlp_game_players
    DROP CONSTRAINT IF EXISTS nlp_game_players_pkey;

-- Recreate as composite PK. The FK to auth.users is preserved via the column
-- definition; the ON DELETE CASCADE is kept through the separate FK below.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'nlp_game_players'::regclass
          AND contype = 'p'
    ) THEN
        ALTER TABLE nlp_game_players
            ADD PRIMARY KEY (user_id, course_id);
    END IF;
END $$;

-- Re-add the FK if it was lost when the PK was dropped (Postgres keeps the FK
-- separately from the PK, but be safe).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'nlp_game_players'::regclass
          AND contype = 'f'
          AND conname = 'nlp_game_players_user_id_fkey'
    ) THEN
        ALTER TABLE nlp_game_players
            ADD CONSTRAINT nlp_game_players_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. nlp_game_leaderboard — widen UNIQUE from (user_id) to (user_id, course_id)
--
-- The original table was created with:
--   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE
-- The implicit constraint name is nlp_game_leaderboard_user_id_key.
-- ---------------------------------------------------------------------------
ALTER TABLE nlp_game_leaderboard
    DROP CONSTRAINT IF EXISTS nlp_game_leaderboard_user_id_key;

-- Add composite unique constraint (idempotent via name check)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'nlp_game_leaderboard'::regclass
          AND contype = 'u'
          AND conname = 'nlp_game_leaderboard_user_course_key'
    ) THEN
        ALTER TABLE nlp_game_leaderboard
            ADD CONSTRAINT nlp_game_leaderboard_user_course_key
            UNIQUE (user_id, course_id);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. INDEXES — course-scoped replacements
-- ---------------------------------------------------------------------------

-- Drop old course-unaware indexes (IF EXISTS so re-runs are safe)
DROP INDEX IF EXISTS idx_leaderboard_xp;
DROP INDEX IF EXISTS idx_leaderboard_user;
DROP INDEX IF EXISTS idx_nlp_game_players_user;

-- Leaderboard: rank within a course by XP
CREATE INDEX IF NOT EXISTS idx_leaderboard_course_xp
    ON nlp_game_leaderboard (course_id, total_xp DESC);

-- Leaderboard: look up a specific user within a course
CREATE INDEX IF NOT EXISTS idx_leaderboard_course_user
    ON nlp_game_leaderboard (course_id, user_id);

-- Leaderboard: recent activity per course (used by weekly leaderboard queries)
CREATE INDEX IF NOT EXISTS idx_leaderboard_course_updated
    ON nlp_game_leaderboard (course_id, updated_at DESC);

-- Players: look up save-state for a user+course pair
CREATE INDEX IF NOT EXISTS idx_nlp_game_players_course_user
    ON nlp_game_players (course_id, user_id);
