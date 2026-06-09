-- ============================================================================
-- welcome_queue — תור הודעות פתיחה (Welcome WhatsApp) עם הגבלת קצב
--
-- ⚠️ הרצה ידנית בלבד דרך עורך ה-SQL של Supabase.
-- אסור להכניס לקובץ הזה תחת supabase/migrations — קיים DB freeze בפרויקט.
-- מדביקים את הקובץ הזה כמו שהוא בעורך ה-SQL ומריצים פעם אחת.
--
-- מטרה: כשמגיע גל הרשמות בו זמנית (למשל 1000 בבת אחת), במקום להפגיז את
-- Green API (תקרה ~1 הודעה לשנייה → סכנת חסימת ספאם), כל הרשמה רק נכנסת
-- לתור הזה. ה-cron מנקז את התור בקצב בטוח (~הודעה כל 1.2 שניות) דרך
-- הפונקציה הקיימת send-welcome-whatsapp.
--
-- מבנה זהה בדיוק לתבנית המוכחת capi_event_queue (RLS service-role בלבד,
-- אינדקס חלקי על pending, NOTIFY לרענון סכמה).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.welcome_queue (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id       UUID,
    questionnaire_id UUID,
    status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
    attempts         INT NOT NULL DEFAULT 0,
    last_error       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at          TIMESTAMPTZ
);

-- Partial index — the drainer only ever scans pending rows, ordered by age.
CREATE INDEX IF NOT EXISTS idx_welcome_queue_pending
    ON public.welcome_queue(created_at) WHERE status = 'pending';

-- RLS: service role only (Edge Functions use service_role key, which bypasses RLS).
ALTER TABLE public.welcome_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role only" ON public.welcome_queue;
CREATE POLICY "service role only" ON public.welcome_queue FOR ALL USING (false) WITH CHECK (false);

-- Reload PostgREST schema cache so the new table is visible to the REST API.
NOTIFY pgrst, 'reload schema';
