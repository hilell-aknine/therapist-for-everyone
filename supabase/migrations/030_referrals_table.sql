-- ============================================================================
-- Migration 030: Referrals table for Ambassador Program
-- ============================================================================

-- Referrals table: tracks who referred whom
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

    -- Prevent duplicate referral records for the same pair
    CONSTRAINT unique_referral UNIQUE (referrer_id, referred_user_id),
    -- A user cannot refer themselves
    CONSTRAINT no_self_referral CHECK (referrer_id != referred_user_id)
);

-- Index for leaderboard query (count referrals per referrer in last 30 days)
CREATE INDEX idx_referrals_referrer_created ON public.referrals (referrer_id, created_at DESC);

-- Index for looking up who referred a specific user
CREATE INDEX idx_referrals_referred_user ON public.referrals (referred_user_id);

-- Enable RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own referrals (as referrer)
CREATE POLICY "Users can view own referrals"
    ON public.referrals FOR SELECT
    USING (auth.uid() = referrer_id);

-- Policy: Users can see if they were referred (as referred user)
CREATE POLICY "Users can view own referral source"
    ON public.referrals FOR SELECT
    USING (auth.uid() = referred_user_id);

-- Policy: Authenticated users can insert referrals (system creates on signup)
CREATE POLICY "Authenticated users can create referrals"
    ON public.referrals FOR INSERT
    WITH CHECK (auth.uid() = referred_user_id);

-- Policy: Admins can view all referrals (for dashboard/leaderboard)
CREATE POLICY "Admins can view all referrals"
    ON public.referrals FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Policy: All authenticated users can read referrals (for leaderboard aggregation)
-- The leaderboard only shows aggregated counts + names, not sensitive data
CREATE POLICY "Authenticated users can read referrals for leaderboard"
    ON public.referrals FOR SELECT
    USING (auth.role() = 'authenticated');

-- ============================================================================
-- Leaderboard view: Top referrers in the last 30 days
-- ============================================================================
CREATE OR REPLACE VIEW public.referral_leaderboard AS
SELECT
    r.referrer_id,
    p.full_name AS referrer_name,
    COUNT(*) AS referral_count,
    MAX(r.created_at) AS last_referral_at
FROM public.referrals r
JOIN public.profiles p ON p.id = r.referrer_id
WHERE r.created_at >= (now() - INTERVAL '30 days')
GROUP BY r.referrer_id, p.full_name
ORDER BY referral_count DESC, last_referral_at DESC;

-- Grant access to the view for authenticated users
GRANT SELECT ON public.referral_leaderboard TO authenticated;
