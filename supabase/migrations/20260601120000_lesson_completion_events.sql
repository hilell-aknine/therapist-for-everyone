-- Migration: lesson_completion_events — append-only completion event log
-- Date: 2026-06-01
--
-- Context (audit-2026-06-01.md, P0 #3): completion data lives in two disjoint,
-- latest-state-only universes — course_progress (keyed by bare YouTube video_id)
-- and nlp_game_players.completed_lessons (keyed "module-lesson", a JSONB blob).
-- Neither keeps a timeline, so "when was this completed", "how many attempts",
-- and cohort progression are unanswerable.
--
-- This table is a single append-only event log that BOTH the video player and the
-- practice game write to on each completion. `lesson_identifier` holds whichever
-- key the source uses (YouTube ID for source='video', "module-lesson" for
-- source='game'); `source` disambiguates. It is the unified feed for real-time
-- Completion-Rate analytics.
--
-- Append-only is enforced via RLS: only INSERT (own row) and SELECT (own row /
-- admin) policies exist — no UPDATE or DELETE policy, so under RLS those ops are
-- denied for every non-service role.
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS + DROP POLICY IF EXISTS, safe to re-run.

CREATE TABLE IF NOT EXISTS lesson_completion_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lesson_identifier TEXT NOT NULL,  -- YouTube ID (source='video') OR "module-lesson" (source='game')
    source TEXT NOT NULL CHECK (source IN ('video', 'game')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Composite index for high-performance real-time daily queries
-- (per-user, time-ordered: "events for user X today", "daily completions feed").
CREATE INDEX IF NOT EXISTS idx_lesson_completion_events_user_created
    ON lesson_completion_events (user_id, created_at DESC);

-- RLS — same own-row pattern as nlp_game_players (20260503140000) and
-- nlp_game_leaderboard (042). Append-only: NO update/delete policy by design.
ALTER TABLE lesson_completion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_insert_own_completion_event" ON lesson_completion_events;
CREATE POLICY "users_insert_own_completion_event" ON lesson_completion_events
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_select_own_completion_events" ON lesson_completion_events;
CREATE POLICY "users_select_own_completion_events" ON lesson_completion_events
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_select_all_completion_events" ON lesson_completion_events;
CREATE POLICY "admin_select_all_completion_events" ON lesson_completion_events
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );
