-- Request 8 (31.10.2026): view counter for the Master sales page (#master-sales).
--
-- Until now an open of the sales page was recorded nowhere, so nobody could say how
-- many people saw it, whether they were registered learners or outside visitors,
-- where they came from, or how many of them went on to the payment button.
--
-- 1. master_sales_events: one row per sales-page view and per click on a buy button.
--    No direct table access for anyone except admins reading. Writes go only through
--    log_master_sales_event().
-- 2. log_master_sales_event(): callable by guests too, because the sales page is public.
--    The server decides who the viewer is (auth.uid()); the client cannot claim to be
--    a member. Event names and sources are whitelisted by shape, text is length-capped,
--    and each browser is rate-limited so a script cannot flood the counter.
-- 3. admin_master_sales_stats(): admin-only summary for 7 and 30 days, by source,
--    with purchases taken from subscriptions (plan = master_course).
--
-- Idempotent. Applied via the Management API query endpoint (see hindsight 2026-07-22).

CREATE TABLE IF NOT EXISTS public.master_sales_events (
    id           bigserial PRIMARY KEY,
    created_at   timestamptz NOT NULL DEFAULT now(),
    event        text NOT NULL CHECK (event IN ('view', 'checkout_click')),
    source       text NOT NULL,
    is_member    boolean NOT NULL,
    user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    visitor_id   text NOT NULL,
    utm_source   text,
    referrer     text
);

CREATE INDEX IF NOT EXISTS master_sales_events_created_idx ON public.master_sales_events (created_at DESC);
CREATE INDEX IF NOT EXISTS master_sales_events_visitor_idx ON public.master_sales_events (visitor_id, created_at DESC);

ALTER TABLE public.master_sales_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.master_sales_events FROM anon, authenticated;
GRANT SELECT ON public.master_sales_events TO authenticated;
REVOKE ALL ON SEQUENCE public.master_sales_events_id_seq FROM anon, authenticated;

DROP POLICY IF EXISTS "admin_select_master_sales_events" ON public.master_sales_events;
CREATE POLICY "admin_select_master_sales_events" ON public.master_sales_events
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE OR REPLACE FUNCTION public.log_master_sales_event(
    p_event text, p_source text, p_visitor text, p_utm text DEFAULT NULL, p_referrer text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid    uuid := auth.uid();
    v_source text := left(coalesce(p_source, ''), 40);
    v_vis    text := left(coalesce(p_visitor, ''), 40);
    v_utm    text := nullif(left(regexp_replace(coalesce(p_utm, ''), '[^a-zA-Z0-9_.-]', '', 'g'), 40), '');
    v_ref    text := nullif(left(regexp_replace(coalesce(p_referrer, ''), '[^a-zA-Z0-9.-]', '', 'g'), 80), '');
BEGIN
    IF p_event NOT IN ('view', 'checkout_click') THEN RETURN; END IF;
    IF v_source !~ '^[a-z0-9_]{1,40}$' THEN v_source := 'other'; END IF;
    IF v_vis !~ '^[A-Za-z0-9-]{8,40}$' THEN RETURN; END IF;

    -- Rate limit per browser: at most 20 events in 10 minutes, and a repeat view
    -- from the same browser within 30 seconds (reload, back/forward) counts once.
    IF (SELECT count(*) FROM master_sales_events
         WHERE visitor_id = v_vis AND created_at > now() - interval '10 minutes') >= 20 THEN
        RETURN;
    END IF;
    IF p_event = 'view' AND EXISTS (
        SELECT 1 FROM master_sales_events
         WHERE visitor_id = v_vis AND event = 'view' AND created_at > now() - interval '30 seconds') THEN
        RETURN;
    END IF;
    -- Global ceiling against a flood that rotates visitor ids.
    IF (SELECT count(*) FROM master_sales_events WHERE created_at > now() - interval '1 minute') >= 300 THEN
        RETURN;
    END IF;

    INSERT INTO master_sales_events (event, source, is_member, user_id, visitor_id, utm_source, referrer)
    VALUES (p_event, v_source, v_uid IS NOT NULL, v_uid, v_vis, v_utm, v_ref);
END;
$$;

REVOKE ALL ON FUNCTION public.log_master_sales_event(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_master_sales_event(text, text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_master_sales_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_out jsonb;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
    END IF;

    WITH win(days) AS (VALUES (7), (30)),
    ev AS (
        SELECT e.*, coalesce(e.user_id::text, e.visitor_id) AS who
        FROM master_sales_events e
        WHERE e.created_at > now() - interval '30 days'
          -- the QA test student and admins are not real traffic
          AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = e.user_id
                          AND (p.role = 'admin' OR p.email ILIKE '%@beit-hametaplim.test'))
    ),
    totals AS (
        SELECT w.days,
            count(*) FILTER (WHERE ev.event = 'view')                                  AS views,
            count(DISTINCT ev.who) FILTER (WHERE ev.event = 'view')                    AS viewers,
            count(DISTINCT ev.who) FILTER (WHERE ev.event = 'view' AND ev.is_member)   AS member_viewers,
            count(DISTINCT ev.who) FILTER (WHERE ev.event = 'view' AND NOT ev.is_member) AS guest_viewers,
            count(*) FILTER (WHERE ev.event = 'checkout_click')                        AS clicks,
            count(DISTINCT ev.who) FILTER (WHERE ev.event = 'checkout_click')          AS clickers
        FROM win w
        LEFT JOIN ev ON ev.created_at > now() - make_interval(days => w.days)
        GROUP BY w.days
    ),
    buys AS (
        SELECT w.days, count(s.id) AS purchases
        FROM win w
        LEFT JOIN subscriptions s ON s.plan = 'master_course'
             AND s.created_at > now() - make_interval(days => w.days)
        GROUP BY w.days
    ),
    by_source AS (
        SELECT ev.source,
            count(*) FILTER (WHERE ev.event = 'view' AND ev.created_at > now() - interval '7 days') AS views_7,
            count(*) FILTER (WHERE ev.event = 'view')                                               AS views_30,
            count(*) FILTER (WHERE ev.event = 'checkout_click')                                     AS clicks_30
        FROM ev GROUP BY ev.source
    )
    SELECT jsonb_build_object(
        'windows', (SELECT jsonb_agg(jsonb_build_object(
                        'days', t.days, 'views', t.views, 'viewers', t.viewers,
                        'member_viewers', t.member_viewers, 'guest_viewers', t.guest_viewers,
                        'clicks', t.clicks, 'clickers', t.clickers, 'purchases', b.purchases)
                        ORDER BY t.days)
                    FROM totals t JOIN buys b USING (days)),
        'sources', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.views_30 DESC) FROM by_source s), '[]'::jsonb),
        'first_event_at', (SELECT min(created_at) FROM master_sales_events)
    ) INTO v_out;
    RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_master_sales_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_master_sales_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';
