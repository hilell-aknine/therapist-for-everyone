-- 2026-07-22: Leaderboard privacy.
-- The blanket authenticated-SELECT policy on nlp_game_leaderboard let ANY signed-in
-- user enumerate every player's full name, stable auth user_id (UUID) and activity
-- pattern — including paying Master customers. The game now reads the board through
-- a SECURITY DEFINER RPC that returns first name + initial, rank and score only
-- (never user_id), plus the caller's own rank. Own-row SELECT stays for the client's
-- upsert path; the admin policy is untouched.

-- Masked public label: "יעל כהן" -> "יעל כ׳". Own row keeps the full name.
CREATE OR REPLACE FUNCTION public.get_game_leaderboard(p_course text DEFAULT 'practitioner', p_period text DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_rows jsonb;
    v_my_rank int;
BEGIN
    IF v_uid IS NULL THEN
        -- authenticated users only (the game never calls this as a guest)
        RETURN jsonb_build_object('rows', '[]'::jsonb, 'my_rank', NULL);
    END IF;

    -- Single statement: a CTE is only visible within its own statement, so both
    -- the top-20 rows and the caller's own rank are derived here together.
    WITH scoped AS (
        SELECT user_id, display_name, total_xp, level, current_streak,
               ROW_NUMBER() OVER (ORDER BY total_xp DESC, updated_at ASC) AS rnk
        FROM nlp_game_leaderboard
        WHERE course_id = p_course
          AND (p_period IS DISTINCT FROM 'weekly' OR updated_at >= now() - interval '7 days')
    )
    SELECT
        (SELECT jsonb_agg(jsonb_build_object(
                   'rank', rnk,
                   'display_name', CASE
                       WHEN user_id = v_uid THEN coalesce(nullif(display_name, ''), 'שחקן אנונימי')
                       ELSE coalesce(nullif(
                                split_part(display_name, ' ', 1) ||
                                CASE WHEN split_part(display_name, ' ', 2) <> ''
                                     THEN ' ' || left(split_part(display_name, ' ', 2), 1) || '׳'
                                     ELSE '' END,
                            ''), 'שחקן אנונימי') END,
                   'total_xp', total_xp,
                   'level', level,
                   'current_streak', current_streak,
                   'is_me', (user_id = v_uid)
               ) ORDER BY rnk)
         FROM scoped WHERE rnk <= 20),
        (SELECT rnk FROM scoped WHERE user_id = v_uid)
    INTO v_rows, v_my_rank;

    RETURN jsonb_build_object('rows', coalesce(v_rows, '[]'::jsonb), 'my_rank', v_my_rank);
END;
$$;

REVOKE ALL ON FUNCTION public.get_game_leaderboard(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_game_leaderboard(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_game_leaderboard(text, text) TO authenticated;

-- Replace the blanket read with own-row read (client upsert/rank paths).
DROP POLICY IF EXISTS "authenticated_select_leaderboard" ON nlp_game_leaderboard;
DROP POLICY IF EXISTS "users_select_own_leaderboard" ON nlp_game_leaderboard;
CREATE POLICY "users_select_own_leaderboard" ON nlp_game_leaderboard
    FOR SELECT USING (auth.uid() = user_id);
