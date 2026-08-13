-- ============================================================================
-- Practitioner paywall — the switch, built OFF.
--
-- Plan (Hillel, 2026-08-13): keep selling nothing for now, give people a few
-- days' notice that the course is about to become paid, then flip ONE switch
-- and have the content lock the same minute. Until that moment nobody may
-- notice any change at all.
--
-- Therefore every object here is additive and inert:
--   * product_settings starts with practitioner_paywall.enabled = FALSE,
--     and FALSE reproduces exactly today's behaviour (everything free, open
--     to anonymous visitors).
--   * the storage policies apply to a NEW bucket only. No existing bucket,
--     table or policy is touched.
--
-- Flip day is a one-line UPDATE. Rolling back is the same line.
-- ============================================================================

-- 1) The settings table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_settings (
    key         TEXT PRIMARY KEY,
    enabled     BOOLEAN NOT NULL DEFAULT false,
    value       JSONB,          -- per-product extras (see grandfather_before below)
    notes       TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- grandfather_before is the OPEN QUESTION Hillel is taking to Ram: what happens
-- to the ~340 people already learning for free when the switch flips.
--   NULL                  -> nobody is grandfathered; everyone must buy.
--   an ISO timestamp      -> every profile created BEFORE it keeps free access.
-- Deciding it later is an UPDATE of this JSON, not a code change. That is the
-- whole point of putting it here instead of in an if-statement.
INSERT INTO public.product_settings (key, enabled, value, notes)
VALUES (
    'practitioner_paywall',
    false,
    '{"grandfather_before": null}'::jsonb,
    'כבוי = הקורס והחוברות פתוחים וחינמיים, בדיוק כמו היום. הדלקה = נדרשת רכישה. grandfather_before: תאריך שלפניו לומדים קיימים ממשיכים חינם, או null אם אף אחד לא ממשיך.'
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.product_settings ENABLE ROW LEVEL SECURITY;

-- Everyone may READ the flag — the pages need to know which mode they are in,
-- and an anonymous visitor is exactly who we are gating. It is not a secret.
DROP POLICY IF EXISTS "product_settings_read_all" ON public.product_settings;
CREATE POLICY "product_settings_read_all" ON public.product_settings
    FOR SELECT TO anon, authenticated
    USING (true);

-- Only an admin may flip it. Without this, any logged-in learner could turn the
-- paywall off for the whole site.
DROP POLICY IF EXISTS "product_settings_admin_write" ON public.product_settings;
CREATE POLICY "product_settings_admin_write" ON public.product_settings
    FOR ALL TO authenticated
    USING      (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 2) The single entitlement question ------------------------------------------
-- Every gate in the product asks this one function, so the rules live in one
-- place and the pages cannot drift apart from the storage policy.
--
-- SECURITY DEFINER because an anonymous visitor must be able to evaluate it
-- while having no read access to profiles or subscriptions themselves.
CREATE OR REPLACE FUNCTION public.has_practitioner_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        -- (a) paywall off -> everyone, signed in or not. This is today.
        NOT COALESCE((SELECT enabled FROM public.product_settings
                      WHERE key = 'practitioner_paywall'), false)

        -- (b) admin, and Master/bundle customers — the higher tier includes
        --     the lower one, so a 1,900 buyer is never asked to pay 197.
        OR EXISTS (SELECT 1 FROM public.profiles
                   WHERE id = auth.uid() AND role IN ('admin', 'paid_customer'))

        -- (c) an active Practitioner (or bundle) purchase
        OR EXISTS (SELECT 1 FROM public.subscriptions
                   WHERE user_id = auth.uid()
                     AND status = 'active'
                     AND plan IN ('practitioner_course', 'bundle')
                     AND end_date > now())

        -- (d) grandfathered learner, if and only if a cutoff was set
        OR EXISTS (
            SELECT 1
            FROM public.profiles p
            JOIN public.product_settings s ON s.key = 'practitioner_paywall'
            WHERE p.id = auth.uid()
              AND (s.value ->> 'grandfather_before') IS NOT NULL
              AND p.created_at < (s.value ->> 'grandfather_before')::timestamptz
        );
$$;

REVOKE ALL ON FUNCTION public.has_practitioner_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_practitioner_access() TO anon, authenticated;

-- 3) The booklets bucket ------------------------------------------------------
-- The two PDFs are half of what the 197 actually buys, and today they sit at a
-- fixed public URL on the CDN (verified 2026-08-13: HTTP 200, no auth). A file
-- served that way can never be taken back — anyone who saved the address keeps
-- it after the flip. So they move behind signed URLs now, while the switch is
-- still off and the move is invisible.
INSERT INTO storage.buckets (id, name, public)
VALUES ('booklets', 'booklets', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "booklets_read_by_entitlement" ON storage.objects;
CREATE POLICY "booklets_read_by_entitlement" ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'booklets' AND public.has_practitioner_access());

DROP POLICY IF EXISTS "booklets_admin_write" ON storage.objects;
CREATE POLICY "booklets_admin_write" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'booklets'
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "booklets_admin_update" ON storage.objects;
CREATE POLICY "booklets_admin_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'booklets'
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

COMMENT ON TABLE public.product_settings IS
    'מתגי מוצר. practitioner_paywall כבוי = המצב של היום (הכל חינם). הדלקה נועלת את הקורס והחוברות.';
COMMENT ON FUNCTION public.has_practitioner_access() IS
    'השאלה היחידה ששואלים לפני שמציגים תוכן פרקטישנר. כל שער במוצר קורא לה.';
