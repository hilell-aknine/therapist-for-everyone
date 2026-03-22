-- Migration 042: NLP Game Leaderboard table
-- Stores player scores for the NLP learning game leaderboard

CREATE TABLE IF NOT EXISTS nlp_game_leaderboard (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    display_name TEXT DEFAULT 'שחקן אנונימי',
    total_xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    lessons_completed INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    last_active TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE nlp_game_leaderboard ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can see the leaderboard
CREATE POLICY "authenticated_select_leaderboard" ON nlp_game_leaderboard
    FOR SELECT USING (auth.role() = 'authenticated');

-- Users can insert/update their own row only
CREATE POLICY "users_insert_own_leaderboard" ON nlp_game_leaderboard
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_leaderboard" ON nlp_game_leaderboard
    FOR UPDATE USING (auth.uid() = user_id);

-- Admin full access
CREATE POLICY "admin_full_leaderboard" ON nlp_game_leaderboard
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- Indexes
CREATE INDEX idx_leaderboard_xp ON nlp_game_leaderboard(total_xp DESC);
CREATE INDEX idx_leaderboard_user ON nlp_game_leaderboard(user_id);
CREATE INDEX idx_leaderboard_weekly ON nlp_game_leaderboard(updated_at DESC);
