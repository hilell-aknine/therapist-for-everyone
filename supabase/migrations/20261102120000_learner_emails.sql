-- ============================================================================
-- Learner emails (built 2026-11-02)
--
-- Two automatic SERVICE emails, nothing else:
--   'welcome'   → once, ~20 min after signup (so the questionnaire's gender is known)
--   'inactive'  → once ever, to a learner who finished ≥1 lesson and then went quiet
--                 for 5-10 days. The window is deliberately narrow: it catches fresh
--                 drop-offs and does NOT backfill the hundreds of long-dormant users.
--
-- These are service messages about a course the learner signed up for, not
-- advertising. Advertising (Master offers, newsletters) needs a documented opt-in
-- under the Israeli anti-spam law, and that record starts here too: marketing_consents.
--
-- Ships OFF. learner_email_settings.enabled = false, and enqueueing only happens while
-- it is on, so no backlog builds up while it is off. Turning it on also stamps
-- welcome_since, so the first run never mails the 886 existing accounts.
--
-- This repo is PUBLIC. No keys here. The cron reads its token from Vault.
-- ============================================================================

-- ─── settings (single row) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.learner_email_settings (
  id                boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled           boolean NOT NULL DEFAULT false,
  welcome_since     timestamptz,
  send_hour_start   int NOT NULL DEFAULT 9,
  send_hour_end     int NOT NULL DEFAULT 20,
  daily_cap         int NOT NULL DEFAULT 40,   -- project Gmail ≈100/day; leave room
  inactive_min_days int NOT NULL DEFAULT 5,
  inactive_max_days int NOT NULL DEFAULT 10,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.learner_email_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Stamp welcome_since the first time the switch is turned on.
CREATE OR REPLACE FUNCTION public.learner_email_settings_stamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.enabled AND NEW.welcome_since IS NULL THEN
    NEW.welcome_since := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_learner_email_settings_stamp ON public.learner_email_settings;
CREATE TRIGGER trg_learner_email_settings_stamp
  BEFORE UPDATE ON public.learner_email_settings
  FOR EACH ROW EXECUTE FUNCTION public.learner_email_settings_stamp();

-- ─── queue / log ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.learner_emails (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('welcome','inactive')),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','skipped','failed')),
  attempts    int  NOT NULL DEFAULT 0,
  provider    text,
  last_error  text,
  skip_reason text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz,
  UNIQUE (user_id, kind)          -- a retry can never double-send
);
CREATE INDEX IF NOT EXISTS learner_emails_pending_idx ON public.learner_emails (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS learner_emails_sent_idx    ON public.learner_emails (sent_at)    WHERE status = 'sent';

-- ─── opt-out from these emails (one click in every email) ────────────────────
CREATE TABLE IF NOT EXISTS public.learner_email_optouts (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  source     text NOT NULL DEFAULT 'unsubscribe_link',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── marketing consent (legal record, append-only) ───────────────────────────
-- Latest row per user = current state. `wording` keeps the exact text the person
-- agreed to, because that is what a consent claim is judged against.
CREATE TABLE IF NOT EXISTS public.marketing_consents (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted    boolean NOT NULL,
  source     text NOT NULL,
  wording    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_consents_user_idx ON public.marketing_consents (user_id, created_at DESC);

ALTER TABLE public.learner_email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_emails         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_email_optouts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_consents     ENABLE ROW LEVEL SECURITY;

-- Admin read on all four; learners read only their own consent rows. No client writes:
-- every write goes through the SECURITY DEFINER functions below.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['learner_email_settings','learner_emails','learner_email_optouts','marketing_consents'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_read', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                     USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))$p$,
                   t || '_admin_read', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS marketing_consents_own_read ON public.marketing_consents;
CREATE POLICY marketing_consents_own_read ON public.marketing_consents
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ─── consent captured at signup (from auth metadata) ─────────────────────────
-- The signup form passes marketing_consent + consent_wording in options.data.
-- A separate trigger so handle_new_user() stays untouched.
CREATE OR REPLACE FUNCTION public.capture_signup_marketing_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.raw_user_meta_data ? 'marketing_consent' THEN
    INSERT INTO public.marketing_consents (user_id, granted, source, wording)
    VALUES (
      NEW.id,
      COALESCE((NEW.raw_user_meta_data->>'marketing_consent')::boolean, false),
      'signup_form',
      left(COALESCE(NEW.raw_user_meta_data->>'consent_wording', ''), 500)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;   -- a consent-record failure must never block a signup
END $$;
DROP TRIGGER IF EXISTS on_auth_user_marketing_consent ON auth.users;
CREATE TRIGGER on_auth_user_marketing_consent
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.capture_signup_marketing_consent();

-- In-portal consent / withdrawal for existing learners (used by a later prompt).
CREATE OR REPLACE FUNCTION public.set_my_marketing_consent(p_granted boolean, p_source text, p_wording text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.marketing_consents (user_id, granted, source, wording)
  VALUES (auth.uid(), p_granted, left(COALESCE(p_source,'portal'), 60), left(COALESCE(p_wording,''), 500));
END $$;
REVOKE ALL ON FUNCTION public.set_my_marketing_consent(boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_marketing_consent(boolean, text, text) TO authenticated;

-- ─── who is excluded from every learner email ────────────────────────────────
CREATE OR REPLACE FUNCTION public.learner_email_excluded(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
           SELECT 1 FROM public.profiles p
            WHERE p.id = p_user
              AND p.role IN ('student_lead','student','paid_customer')
              AND p.email IS NOT NULL
              AND p.email !~* '(@example\.com|\.test)$'
              AND COALESCE(p.whatsapp_opt_out, false) = false)
      OR EXISTS (SELECT 1 FROM public.learner_email_optouts o WHERE o.user_id = p_user)
$$;

-- ─── enqueue ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.learner_emails_enqueue()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.learner_email_settings;
  n_welcome int := 0;
  n_inactive int := 0;
BEGIN
  SELECT * INTO s FROM public.learner_email_settings WHERE id;
  IF NOT s.enabled OR s.welcome_since IS NULL THEN
    RETURN jsonb_build_object('enqueued', 0, 'reason', 'disabled');
  END IF;

  INSERT INTO public.learner_emails (user_id, kind)
  SELECT p.id, 'welcome'
    FROM public.profiles p
   WHERE p.created_at >= s.welcome_since
     AND p.created_at <= now() - interval '20 minutes'
     AND p.created_at >= now() - interval '3 days'
     AND NOT public.learner_email_excluded(p.id)
  ON CONFLICT (user_id, kind) DO NOTHING;
  GET DIAGNOSTICS n_welcome = ROW_COUNT;

  INSERT INTO public.learner_emails (user_id, kind)
  SELECT a.id, 'inactive'
    FROM (
      SELECT p.id,
             (SELECT count(*) FROM public.course_progress c WHERE c.user_id = p.id AND c.completed) AS done,
             GREATEST(
               (SELECT max(c.updated_at) FROM public.course_progress c WHERE c.user_id = p.id),
               (SELECT max(v.last_at)    FROM public.portal_visits  v WHERE v.user_id = p.id)
             ) AS last_act
        FROM public.profiles p
       WHERE p.role IN ('student_lead','student','paid_customer')
    ) a
   WHERE a.done >= 1
     AND a.last_act <= now() - make_interval(days => s.inactive_min_days)
     AND a.last_act >= now() - make_interval(days => s.inactive_max_days)
     AND NOT public.learner_email_excluded(a.id)
  ON CONFLICT (user_id, kind) DO NOTHING;
  GET DIAGNOSTICS n_inactive = ROW_COUNT;

  RETURN jsonb_build_object('welcome', n_welcome, 'inactive', n_inactive);
END $$;

-- ─── batch for the sender ────────────────────────────────────────────────────
-- Returns pending rows with what the email needs. Enforces the daily cap (Israel day).
-- `still_relevant` = false when the learner came back before we sent the nudge, or
-- opted out in the meantime → the sender marks the row skipped.
CREATE OR REPLACE FUNCTION public.learner_emails_batch(p_limit int)
RETURNS TABLE (id uuid, user_id uuid, kind text, attempts int, email text,
               full_name text, gender text, lessons_done int, still_relevant boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.learner_email_settings;
  sent_today int;
  room int;
BEGIN
  SELECT * INTO s FROM public.learner_email_settings WHERE learner_email_settings.id;
  SELECT count(*) INTO sent_today FROM public.learner_emails e
   WHERE e.status = 'sent'
     AND (e.sent_at AT TIME ZONE 'Asia/Jerusalem')::date = (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  room := GREATEST(0, LEAST(p_limit, s.daily_cap - sent_today));
  IF room = 0 THEN RETURN; END IF;

  RETURN QUERY
  SELECT e.id, e.user_id, e.kind, e.attempts, p.email, p.full_name,
         (SELECT q.gender FROM public.portal_questionnaires q
           WHERE q.user_id = e.user_id ORDER BY q.created_at DESC NULLS LAST LIMIT 1)::text,
         (SELECT count(*) FROM public.course_progress c WHERE c.user_id = e.user_id AND c.completed)::int,
         CASE
           WHEN public.learner_email_excluded(e.user_id) THEN false
           WHEN e.kind = 'inactive' THEN GREATEST(
                  (SELECT max(c.updated_at) FROM public.course_progress c WHERE c.user_id = e.user_id),
                  (SELECT max(v.last_at)    FROM public.portal_visits  v WHERE v.user_id = e.user_id)
                ) <= now() - make_interval(days => s.inactive_min_days)
           ELSE true
         END
    FROM public.learner_emails e
    JOIN public.profiles p ON p.id = e.user_id
   WHERE e.status = 'pending'
   ORDER BY e.created_at
   LIMIT room;
END $$;

-- ─── unsubscribe (called by the email-unsubscribe function after HMAC check) ─
CREATE OR REPLACE FUNCTION public.learner_email_optout(p_user uuid, p_source text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.learner_email_optouts (user_id, source)
  VALUES (p_user, left(COALESCE(p_source,'unsubscribe_link'), 60))
  ON CONFLICT (user_id) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.learner_email_excluded(uuid)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.learner_emails_enqueue()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.learner_emails_batch(int)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.learner_email_optout(uuid, text)    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.learner_email_excluded(uuid)     TO service_role;
GRANT EXECUTE ON FUNCTION public.learner_emails_enqueue()         TO service_role;
GRANT EXECUTE ON FUNCTION public.learner_emails_batch(int)        TO service_role;
GRANT EXECUTE ON FUNCTION public.learner_email_optout(uuid, text) TO service_role;

-- ─── cron: every 10 minutes. Vault secret, created once outside git: ─────────
--   SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'learner_email_service_key', '...');
-- (Reuses nothing from buddy-notify on purpose: rotating one must not break the other.)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
DO $$ BEGIN PERFORM cron.unschedule('learner-email'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'learner-email',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1/learner-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets
                                      WHERE name = 'learner_email_service_key' LIMIT 1)),
    body := '{}'::jsonb
  );
  $$
);
