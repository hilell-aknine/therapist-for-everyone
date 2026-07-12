-- ============================================================================
-- referral_leaderboard — exclude staff/admin accounts from the public board
-- ============================================================================
-- The ambassador leaderboard is a competition between real participants.
-- A staff member (role = 'admin') referring people from their own account
-- dominates the board (e.g. 9 referrals vs 1-2 for everyone else), which makes
-- other ambassadors feel they have no chance and stop participating.
--
-- Fix: add `p.role IS DISTINCT FROM 'admin'` so admin/staff accounts never
-- appear on the leaderboard. NULL roles (normal users) are kept — IS DISTINCT
-- FROM treats NULL <> 'admin' as TRUE.
--
-- No data is deleted. The underlying `referrals` rows are untouched; admins are
-- simply not shown on the competition board.
--
-- CREATE OR REPLACE keeps the existing GRANT and security_invoker setting; the
-- column list is identical to the previous definition (migration 049).
-- ============================================================================

CREATE OR REPLACE VIEW public.referral_leaderboard
    WITH (security_invoker = true)
AS
SELECT
    r.referrer_id,
    p.full_name AS referrer_name,
    COUNT(*) AS referral_count,
    MAX(r.created_at) AS last_referral_at
FROM public.referrals r
JOIN public.profiles p ON p.id = r.referrer_id
WHERE r.created_at >= (now() - INTERVAL '30 days')
  AND p.role IS DISTINCT FROM 'admin'
GROUP BY r.referrer_id, p.full_name
ORDER BY referral_count DESC, last_referral_at DESC;

GRANT SELECT ON public.referral_leaderboard TO authenticated;
