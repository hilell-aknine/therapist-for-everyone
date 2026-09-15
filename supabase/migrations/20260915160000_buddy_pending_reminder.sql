-- Study-buddy 3-day reminder for an unanswered request (2026-09-15)
--
-- WHY: measured live today — of 7 requests ever sent, 3 sat unanswered for 22, 34 and 44
-- days, and one ACCEPTED request took 32 days to get its answer. People do not come back
-- to the portal to notice a badge. The original 'request' email goes out once, within
-- minutes, and if it is missed there is nothing behind it.
--
-- ⚠️ THIS DELIBERATELY REVERSES A DOCUMENTED DECISION. 20260802130000 states: "exactly two
-- messages ... No 'you have new suggestions', no weekly digest, no re-engagement nudge."
-- That rule is still right for the things it names. This is not a nudge about nothing: a
-- real person is waiting on a yes/no, the recipient is the only one who can give it, and
-- the message dies the moment they answer. Requested by Hillel 2026-09-15.
--
-- THE GUARANTEE THAT KEEPS IT FROM BECOMING NAGGING:
--   ONE reminder per (request, recipient), forever. The existing unique index
--   (request_id, user_id, kind) enforces it at the storage layer, not in logic that can
--   be re-run. There is no second reminder, ever, for the same request.
--
-- TIMELINE: request lands (email, minutes) -> +3 days reminder (this) -> +14 days the
-- request expires and frees the pair (20260915140000). The reminder is the last chance
-- before expiry, which is what makes it worth sending at all.
--
-- CHANNEL = EMAIL, on the existing `buddy-notify` chain, which is enabled and last
-- delivered 2026-09-06. It is NOT on Hillel's personal WhatsApp line: he restricted that
-- line to sharp, manual, watched sends, and a daily cron is the exact opposite. It is also
-- the shape of the 2026-09-10 incident, where a scheduled task mailed paying customers
-- from his personal secondary number. Nothing here touches Green API.
--
-- "CONFIRM YOU SAW IT": the reminder links into the buddy screen rather than asking for a
-- reply, because `buddy_incoming()` now logs `incoming_viewed` (20260915120000). Opening
-- the screen IS the acknowledgement, and it proves they saw the actual request rather than
-- that they clicked a button. `buddy_usage_report() -> pending_seen_unanswered` is the
-- readout. No new endpoint, no frontend change, no deploy.

-- ============================================================================
-- 1. ALLOW THE NEW KIND
-- ============================================================================
DO $$
DECLARE c text;
BEGIN
    SELECT conname INTO c
      FROM pg_constraint
     WHERE conrelid = 'public.study_buddy_notifications'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%kind%'
     LIMIT 1;
    IF c IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.study_buddy_notifications DROP CONSTRAINT %I', c);
    END IF;
END $$;

ALTER TABLE public.study_buddy_notifications
    ADD CONSTRAINT study_buddy_notifications_kind_check
    CHECK (kind IN ('request', 'accepted', 'reminder'));

-- ============================================================================
-- 2. ENQUEUE — one pass, idempotent
-- ============================================================================
-- Safe to run any number of times a day: the unique index turns every repeat into a
-- no-op. p_days is a parameter so the window can be tuned without another migration.
CREATE OR REPLACE FUNCTION public.buddy_enqueue_pending_reminders(p_days int DEFAULT 3)
RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_n int;
BEGIN
    INSERT INTO study_buddy_notifications (user_id, request_id, kind)
    SELECT r.target_id, r.id, 'reminder'
      FROM study_buddy_requests r
      JOIN profiles pr ON pr.id = r.target_id
     WHERE r.status = 'pending'
       AND r.responded_at IS NULL
       AND r.created_at < now() - make_interval(days => p_days)
       -- No email, no message. The drainer would skip it anyway; not queueing keeps the
       -- queue honest about what is actually deliverable.
       AND nullif(trim(coalesce(pr.email, '')), '') IS NOT NULL
       AND NOT coalesce(pr.whatsapp_opt_out, false)
       -- Someone who opted out of the pool entirely is not chased for an answer.
       AND EXISTS (SELECT 1 FROM study_buddy_prefs p
                    WHERE p.user_id = r.target_id AND p.opted_in)
    ON CONFLICT (request_id, user_id, kind) DO NOTHING;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.buddy_enqueue_pending_reminders(int) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. CANCEL AN UNSENT REMINDER THE MOMENT THEY ANSWER
-- ============================================================================
-- The v1 trigger only cancelled unsent 'request' pings. Without widening it, answering a
-- request could still be followed by a reminder asking for the answer you just gave.
CREATE OR REPLACE FUNCTION public.study_buddy_enqueue_accepted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
        INSERT INTO study_buddy_notifications (user_id, request_id, kind)
        VALUES (NEW.requester_id, NEW.id, 'accepted'),
               (NEW.target_id,    NEW.id, 'accepted')
        ON CONFLICT (request_id, user_id, kind) DO NOTHING;

        UPDATE study_buddy_notifications
           SET status = 'skipped', skip_reason = 'answered_before_send'
         WHERE request_id = NEW.id AND kind IN ('request','reminder') AND status = 'pending';
    END IF;

    IF NEW.status IN ('declined','cancelled') AND OLD.status = 'pending' THEN
        UPDATE study_buddy_notifications
           SET status = 'skipped', skip_reason = 'answered_before_send'
         WHERE request_id = NEW.id AND kind IN ('request','reminder') AND status = 'pending';
    END IF;

    RETURN NEW;
END;
$$;

-- Opting out mid-flight cancels pending requests in both directions (buddy_set_opt_in),
-- which fires the trigger above, so an unsent reminder dies with them. Nothing to add.

-- ============================================================================
-- 4. DRAINER GUARD
-- ============================================================================
-- Identical return shape; the WHERE is tightened. A reminder is only handed to the
-- drainer while its request is STILL pending. The trigger already covers the normal
-- paths, but a reminder is the one message that becomes actively wrong if it races an
-- answer, so it is checked again at the moment of sending.
CREATE OR REPLACE FUNCTION public.buddy_notify_batch(p_limit int DEFAULT 20)
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
       AND (n.kind <> 'reminder' OR r.status = 'pending')
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
-- 5. CRON — queue only. Delivery stays with the existing buddy-notify schedule.
-- ============================================================================
-- 08:40 Asia/Jerusalem-ish, ahead of the 09:00 send window so a reminder queued today
-- goes out today rather than waiting a full extra day.
DO $$
BEGIN
    PERFORM cron.unschedule('buddy_pending_reminders');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

DO $$
BEGIN
    PERFORM cron.schedule('buddy_pending_reminders', '40 5 * * *',
                          'SELECT public.buddy_enqueue_pending_reminders(3)');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron unavailable — buddy_pending_reminders needs scheduling elsewhere';
END $$;

-- ============================================================================
-- 6. ADMIN — see it before it goes, and see whether it worked
-- ============================================================================
CREATE OR REPLACE FUNCTION public.buddy_reminders_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_out jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'notifications_enabled', (SELECT notifications_enabled FROM study_buddy_settings),
        'send_window',           (SELECT send_hour_start || ':00-' || send_hour_end || ':00'
                                    FROM study_buddy_settings),
        -- Requests that will earn a reminder on the next cron pass.
        'due_now',               (SELECT count(*) FROM study_buddy_requests r
                                   WHERE r.status = 'pending' AND r.responded_at IS NULL
                                     AND r.created_at < now() - interval '3 days'),
        'queued_unsent',         (SELECT count(*) FROM study_buddy_notifications
                                   WHERE kind = 'reminder' AND status = 'pending'),
        'sent',                  (SELECT count(*) FROM study_buddy_notifications
                                   WHERE kind = 'reminder' AND status = 'sent'),
        'skipped_answered_first',(SELECT count(*) FROM study_buddy_notifications
                                   WHERE kind = 'reminder' AND status = 'skipped'),
        'last_sent',             (SELECT max(sent_at) FROM study_buddy_notifications
                                   WHERE kind = 'reminder'),
        -- Did it work? These two are the whole point: after a reminder went out, did the
        -- person open the screen, and did the request stop being pending.
        'reminded_then_viewed',  (SELECT count(DISTINCT n.user_id)
                                    FROM study_buddy_notifications n
                                    JOIN buddy_event_log e
                                      ON e.user_id = n.user_id
                                     AND e.event = 'incoming_viewed'
                                     AND e.last_at > n.sent_at
                                   WHERE n.kind = 'reminder' AND n.status = 'sent'),
        'reminded_then_answered',(SELECT count(*)
                                    FROM study_buddy_notifications n
                                    JOIN study_buddy_requests r ON r.id = n.request_id
                                   WHERE n.kind = 'reminder' AND n.status = 'sent'
                                     AND r.responded_at > n.sent_at)
    ) INTO v_out;

    RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.buddy_reminders_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buddy_reminders_status() TO authenticated;
