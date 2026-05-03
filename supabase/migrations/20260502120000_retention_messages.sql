-- NLP Retention System — drafts table + opt-out registry.
--
-- The Python pipeline (nlp-retention/) generates personalized WhatsApp drafts
-- for inactive students and writes them here as status='draft'. The admin
-- dashboard (beit-vmetaplim admin.html "Retention" tab) lets Hillel approve.
-- The crm-bot sender cron picks up status='approved' rows and sends.
-- The returns tracker cron correlates course_progress.completed_at with
-- sent retention messages within a 14-day window.

CREATE TABLE IF NOT EXISTS public.retention_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,                             -- 972... normalized
    full_name TEXT,
    why_category TEXT,                               -- career / relationships / confidence
    next_lesson_index INT NOT NULL,
    next_lesson_video_id TEXT NOT NULL,
    next_lesson_title TEXT NOT NULL,
    message_text TEXT NOT NULL,
    recommended_send_hour INT NOT NULL CHECK (recommended_send_hour BETWEEN 9 AND 20),
    activity_samples INT DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','approved','rejected','sent','opted_out','failed')),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    sent_at TIMESTAMPTZ,
    send_error TEXT,
    opt_out_at TIMESTAMPTZ,

    -- Populated by retention_returns cron once the recipient completes any
    -- lesson within 14 days of sent_at.
    returned_to_learning_at TIMESTAMPTZ,
    returned_lesson_id TEXT,

    -- Snapshot of student state at draft time, kept for analytics so we can
    -- segment return rate by category / vision text without re-querying.
    why_nlp TEXT,
    vision_one_year TEXT,
    days_inactive_at_send INT
);

CREATE INDEX IF NOT EXISTS idx_rm_status ON public.retention_messages(status);
CREATE INDEX IF NOT EXISTS idx_rm_phone ON public.retention_messages(phone);
CREATE INDEX IF NOT EXISTS idx_rm_user ON public.retention_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_rm_send_queue
    ON public.retention_messages(status, recommended_send_hour)
    WHERE status = 'approved' AND sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rm_return_window
    ON public.retention_messages(phone, sent_at)
    WHERE sent_at IS NOT NULL AND returned_to_learning_at IS NULL;

CREATE TABLE IF NOT EXISTS public.retention_optouts (
    phone TEXT PRIMARY KEY,
    opted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason TEXT
);

ALTER TABLE public.retention_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_optouts  ENABLE ROW LEVEL SECURITY;

-- Closed by default. Service-role bypasses RLS, which is how both the Python
-- sync, the admin dashboard (via service-role through admin-state.js), and the
-- crm-bot cron handlers all read/write. No anon access — there is no public
-- consumption path for these tables.
CREATE POLICY "service_role_only_messages" ON public.retention_messages
    FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "service_role_only_optouts" ON public.retention_optouts
    FOR ALL TO authenticated USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';
