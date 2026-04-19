-- ============================================================================
-- Migration: Popup system fixes
-- 1. Allow anon users to read active popup_configs (was blocking guest targeting)
-- 2. Insert auth_wall config (registered in code but missing from DB)
-- 3. Fix auth_wall priority (was conflicting with auth_modal at priority 2)
-- ============================================================================

-- 1. Anon users need to read popup configs for audience/scheduling to work
DROP POLICY IF EXISTS "Anon can read active popup configs" ON public.popup_configs;
CREATE POLICY "Anon can read active popup configs"
    ON public.popup_configs FOR SELECT
    USING (is_active = true);

-- 2. Insert auth_wall (registered in JS but missing from DB seed)
INSERT INTO public.popup_configs (popup_id, title, message, category, priority, is_active, max_per_day, cooldown_minutes, target_audience)
VALUES ('auth_wall', 'חסימת גישה', 'הירשמו לצפייה בתכנים נוספים', 'critical', 1, true, 99, 0, 'unauthenticated')
ON CONFLICT (popup_id) DO UPDATE SET priority = 1;

-- 3. Fix auth_wall priority to 1 (was 2, conflicting with auth_modal)
UPDATE public.popup_configs SET priority = 1 WHERE popup_id = 'auth_wall';

-- 4. Update ai_questionnaire audience to free_user (may have been missed)
UPDATE public.popup_configs SET target_audience = 'free_user' WHERE popup_id = 'ai_questionnaire';
