-- Study-buddy notifications (2026-08-02).
--
-- WHY: without this the feature is dead on arrival. A request that lands while the
-- learner is away only surfaces as a sidebar badge on their next visit, and only 34
-- learners touched the course in the last 30 days. The person being asked is the one
-- side that must be reached off-portal.
--
-- SCOPE — exactly two messages, deliberately:
--   'request'  → someone asked to study with you        (the only genuinely time-sensitive one)
--   'accepted' → they said yes, here are the details    (sent to BOTH sides)
-- Nothing else. No "you have new suggestions", no weekly digest, no re-engagement
-- nudge. Fewer, substantive messages is what keeps open rates up and opt-outs down;
-- a matching feature that pings you for things you did not ask for gets muted.
--
-- SAFETY: this ships OFF. study_buddy_settings.notifications_enabled starts false, so
-- rows queue up and nothing is delivered until Hillel flips it. The queue/drainer shape
-- mirrors welcome_queue + welcome-queue-processor, which is already proven against
-- Green API's ~1 msg/sec ceiling.

-- ============================================================================
-- 1. KILL SWITCH
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.study_buddy_settings (
    id                     boolean PRIMARY KEY DEFAULT true CHECK (id),  -- single row
    notifications_enabled  boolean NOT NULL DEFAULT false,
    send_hour_start        int     NOT NULL DEFAULT 9,   -- Asia/Jerusalem
    send_hour_end          int     NOT NULL DEFAULT 20,  -- matches retention-run's window
    max_per_user_per_day   int     NOT NULL DEFAULT 1,
    updated_at             timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.study_buddy_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.study_buddy_settings IS
    'Single-row kill switch for study-buddy WhatsApp. notifications_enabled=false means the queue fills but nothing is delivered.';

-- ============================================================================
-- 2. QUEUE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.study_buddy_notifications (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- recipient
    request_id  uuid NOT NULL REFERENCES public.study_buddy_requests(id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN ('request','accepted')),
    status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sent','skipped','failed')),
    attempts    int  NOT NULL DEFAULT 0,
    last_error  text,
    skip_reason text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    sent_at     timestamptz
);

-- One message per (request, recipient, kind), forever. Re-running a trigger, a retry
-- storm or a manual re-queue can never produce a second WhatsApp for the same event.
CREATE UNIQUE INDEX IF NOT EXISTS study_buddy_notifications_uniq
    ON public.study_buddy_notifications (request_id, user_id, kind);
CREATE INDEX IF NOT EXISTS study_buddy_notifications_pending_idx
    ON public.study_buddy_notifications (status, created_at)
    WHERE status = 'pending';

ALTER TABLE public.study_buddy_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_buddy_notifications ENABLE ROW LEVEL SECURITY;

-- Same rule as the rest of the feature: no policy for `authenticated`. The queue is
-- written by triggers and read by the service-role drainer only. Admin reads for the
-- dashboard.
DROP POLICY IF EXISTS "Admins read buddy settings" ON public.study_buddy_settings;
CREATE POLICY "Admins read buddy settings" ON public.study_buddy_settings
    FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins read buddy notifications" ON public.study_buddy_notifications;
CREATE POLICY "Admins read buddy notifications" ON public.study_buddy_notifications
    FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON public.study_buddy_settings      FROM anon;
REVOKE ALL ON public.study_buddy_notifications FROM anon;

-- ============================================================================
-- 3. ENQUEUE TRIGGERS
-- ============================================================================
-- Triggers rather than enqueueing inside buddy_request()/buddy_respond(): the row in
-- study_buddy_requests IS the event, so anything that creates one (including a future
-- admin/concierge path) notifies automatically and cannot forget to.

CREATE OR REPLACE FUNCTION public.study_buddy_enqueue_request()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status = 'pending' THEN
        INSERT INTO study_buddy_notifications (user_id, request_id, kind)
        VALUES (NEW.target_id, NEW.id, 'request')
        ON CONFLICT (request_id, user_id, kind) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.study_buddy_enqueue_accepted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Only on the pending → accepted transition. Both sides get told, because both
    -- sides only now receive the other's contact details.
    IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
        INSERT INTO study_buddy_notifications (user_id, request_id, kind)
        VALUES (NEW.requester_id, NEW.id, 'accepted'),
               (NEW.target_id,    NEW.id, 'accepted')
        ON CONFLICT (request_id, user_id, kind) DO NOTHING;

        -- A 'request' message that has not gone out yet is now pointless: the person
        -- already answered it. Cancel it rather than deliver a stale ping.
        UPDATE study_buddy_notifications
           SET status = 'skipped', skip_reason = 'answered_before_send'
         WHERE request_id = NEW.id AND kind = 'request' AND status = 'pending';
    END IF;

    -- Declined / cancelled: kill the unsent request ping for the same reason.
    IF NEW.status IN ('declined','cancelled') AND OLD.status = 'pending' THEN
        UPDATE study_buddy_notifications
           SET status = 'skipped', skip_reason = 'answered_before_send'
         WHERE request_id = NEW.id AND kind = 'request' AND status = 'pending';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_study_buddy_enqueue_request ON public.study_buddy_requests;
CREATE TRIGGER trg_study_buddy_enqueue_request
    AFTER INSERT ON public.study_buddy_requests
    FOR EACH ROW EXECUTE FUNCTION public.study_buddy_enqueue_request();

DROP TRIGGER IF EXISTS trg_study_buddy_enqueue_accepted ON public.study_buddy_requests;
CREATE TRIGGER trg_study_buddy_enqueue_accepted
    AFTER UPDATE OF status ON public.study_buddy_requests
    FOR EACH ROW EXECUTE FUNCTION public.study_buddy_enqueue_accepted();

-- ============================================================================
-- 4. WHAT THE DRAINER READS
-- ============================================================================
-- One call returning everything needed to compose a message, so the Edge Function does
-- not need table-by-table reads (and cannot accidentally select a column it shouldn't).
-- `other_first_name` is the OTHER party's first name — the recipient already earned the
-- right to see it: for 'request' they are being asked by that person, for 'accepted'
-- the connection exists. Phone numbers are NOT returned here; the message links into
-- the portal instead of carrying contact details through WhatsApp.
CREATE OR REPLACE FUNCTION public.buddy_notify_batch(p_limit int DEFAULT 20)
-- Returns the recipient's EMAIL, not their phone: study-buddy notifications go out by
-- email (2026-08-02 — both Green API lines are unusable for learners). The phone is
-- deliberately absent so this payload cannot leak a number into a log or an error body.
RETURNS TABLE (
    id uuid, kind text, recipient_id uuid, recipient_name text,
    recipient_email text, opted_out boolean, other_first_name text, attempts int
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT n.id, n.kind, n.user_id,
           split_part(trim(coalesce(pr.full_name,'')), ' ', 1),
           nullif(trim(coalesce(pr.email,'')), ''),
           coalesce(pr.whatsapp_opt_out, false),
           split_part(trim(coalesce(op.full_name,'')), ' ', 1),
           n.attempts
      FROM study_buddy_notifications n
      JOIN study_buddy_requests r ON r.id = n.request_id
      JOIN profiles pr ON pr.id = n.user_id
      JOIN profiles op ON op.id = CASE WHEN r.requester_id = n.user_id
                                       THEN r.target_id ELSE r.requester_id END
     WHERE n.status = 'pending'
       -- Per-recipient daily cap: if this person already received a buddy message in
       -- the last 24h, their next one waits. Nobody gets two pings in a day from this.
       AND NOT EXISTS (
             SELECT 1 FROM study_buddy_notifications prev
              WHERE prev.user_id = n.user_id
                AND prev.status = 'sent'
                AND prev.sent_at > now() - interval '24 hours')
     ORDER BY n.created_at ASC
     LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.buddy_notify_batch(int) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. ADMIN VIEW — what actually went out
-- ============================================================================
CREATE OR REPLACE VIEW public.study_buddy_notification_health AS
SELECT status, kind, count(*) AS rows, max(created_at) AS newest,
       max(sent_at) AS last_sent
  FROM study_buddy_notifications
 GROUP BY status, kind;

REVOKE ALL ON public.study_buddy_notification_health FROM anon;
