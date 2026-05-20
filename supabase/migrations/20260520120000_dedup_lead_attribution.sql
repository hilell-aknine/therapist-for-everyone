-- ============================================================================
-- Migration: dedup lead_attribution + enforce one row per (linked_table, linked_id)
-- Created: 2026-05-20
--
-- BUG (root cause confirmed):
--   js/marketing-tools.js saveFullAttribution() runs PATCH-then-INSERT. The
--   table has NO SELECT policy for the `authenticated` role (see
--   20260419170000_fix_timezone_and_rls.sql line 22), so the PATCH's
--   `Prefer: return=representation` always returns []. The client reads [] as
--   "no row exists" and fires the INSERT fallback -- on EVERY page load.
--   Result: a logged-in user gets one duplicate lead_attribution row per page
--   view. 6,946 rows in the table represent only 1,128 real records; one
--   profile alone has 313 duplicate rows. This inflates every number in the
--   admin "מקור הלקוחות" dashboard by ~6x.
--
-- THIS MIGRATION:
--   1. Snapshots the table into lead_attribution_dedup_backup_20260520.
--   2. Collapses each (linked_table, linked_id) group to its earliest row,
--      back-filling that row's NULL columns from its siblings (no data loss).
--   3. Deletes the ~5,818 duplicate rows.
--   4. Adds a UNIQUE index so duplicates become structurally impossible.
--      The client fix (marketing-tools.js) switches its INSERT to
--      ON CONFLICT DO NOTHING against this index.
--
-- Reversible: the full pre-migration table is kept in the backup table; drop it
-- after a week of healthy dashboards:  DROP TABLE lead_attribution_dedup_backup_20260520;
-- ============================================================================

BEGIN;

-- 1. Safety snapshot ---------------------------------------------------------
DROP TABLE IF EXISTS public.lead_attribution_dedup_backup_20260520;
CREATE TABLE public.lead_attribution_dedup_backup_20260520 AS
    SELECT * FROM public.lead_attribution;
-- Lock the snapshot: RLS on + zero policies = no anon/authenticated access
-- (it holds IPs + user agents). service_role / migrations bypass RLS.
ALTER TABLE public.lead_attribution_dedup_backup_20260520 ENABLE ROW LEVEL SECURITY;

-- 2. Keepers: earliest row per group ----------------------------------------
CREATE TEMP TABLE _la_keepers ON COMMIT DROP AS
    SELECT linked_table, linked_id,
           (array_agg(id ORDER BY created_at ASC, id ASC))[1] AS keep_id
    FROM public.lead_attribution
    GROUP BY linked_table, linked_id;

-- 3. Merge sibling data into the keeper (back-fill NULLs only; no overwrite) -
WITH merged AS (
    SELECT k.keep_id,
           max(la.phone) AS phone,
           max(la.email) AS email,
           max(la.session_id) AS session_id,
           max(la.first_utm_source) AS first_utm_source,
           max(la.first_utm_medium) AS first_utm_medium,
           max(la.first_utm_campaign) AS first_utm_campaign,
           max(la.first_utm_term) AS first_utm_term,
           max(la.first_utm_content) AS first_utm_content,
           max(la.first_gclid) AS first_gclid,
           max(la.first_fbclid) AS first_fbclid,
           max(la.first_ttclid) AS first_ttclid,
           max(la.first_msclkid) AS first_msclkid,
           max(la.first_referrer_domain) AS first_referrer_domain,
           max(la.first_landing_url) AS first_landing_url,
           max(la.first_at) AS first_at,
           max(la.last_utm_source) AS last_utm_source,
           max(la.last_utm_medium) AS last_utm_medium,
           max(la.last_utm_campaign) AS last_utm_campaign,
           max(la.last_utm_term) AS last_utm_term,
           max(la.last_utm_content) AS last_utm_content,
           max(la.last_gclid) AS last_gclid,
           max(la.last_fbclid) AS last_fbclid,
           max(la.last_ttclid) AS last_ttclid,
           max(la.last_msclkid) AS last_msclkid,
           max(la.last_referrer_domain) AS last_referrer_domain,
           max(la.last_landing_url) AS last_landing_url,
           max(la.last_at) AS last_at,
           max(la.device_type) AS device_type,
           max(la.os_name) AS os_name,
           max(la.browser_name) AS browser_name,
           max(la.viewport_w) AS viewport_w,
           max(la.viewport_h) AS viewport_h,
           max(la.language) AS language,
           max(la.timezone) AS timezone,
           max(la.country_code) AS country_code,
           max(la.country_name) AS country_name,
           max(la.region) AS region,
           max(la.city) AS city,
           max(la.raw_ua) AS raw_ua,
           max(la.meta_fbc) AS meta_fbc,
           max(la.meta_fbp) AS meta_fbp,
           max(la.client_ip) AS client_ip,
           max(la.capi_event_id) AS capi_event_id,
           max(la.self_reported_source) AS self_reported_source
    FROM _la_keepers k
    JOIN public.lead_attribution la
      ON la.linked_table = k.linked_table AND la.linked_id = k.linked_id
    GROUP BY k.keep_id
)
UPDATE public.lead_attribution k
SET
    phone = COALESCE(k.phone, m.phone),
    email = COALESCE(k.email, m.email),
    session_id = COALESCE(k.session_id, m.session_id),
    first_utm_source = COALESCE(k.first_utm_source, m.first_utm_source),
    first_utm_medium = COALESCE(k.first_utm_medium, m.first_utm_medium),
    first_utm_campaign = COALESCE(k.first_utm_campaign, m.first_utm_campaign),
    first_utm_term = COALESCE(k.first_utm_term, m.first_utm_term),
    first_utm_content = COALESCE(k.first_utm_content, m.first_utm_content),
    first_gclid = COALESCE(k.first_gclid, m.first_gclid),
    first_fbclid = COALESCE(k.first_fbclid, m.first_fbclid),
    first_ttclid = COALESCE(k.first_ttclid, m.first_ttclid),
    first_msclkid = COALESCE(k.first_msclkid, m.first_msclkid),
    first_referrer_domain = COALESCE(k.first_referrer_domain, m.first_referrer_domain),
    first_landing_url = COALESCE(k.first_landing_url, m.first_landing_url),
    first_at = COALESCE(k.first_at, m.first_at),
    last_utm_source = COALESCE(k.last_utm_source, m.last_utm_source),
    last_utm_medium = COALESCE(k.last_utm_medium, m.last_utm_medium),
    last_utm_campaign = COALESCE(k.last_utm_campaign, m.last_utm_campaign),
    last_utm_term = COALESCE(k.last_utm_term, m.last_utm_term),
    last_utm_content = COALESCE(k.last_utm_content, m.last_utm_content),
    last_gclid = COALESCE(k.last_gclid, m.last_gclid),
    last_fbclid = COALESCE(k.last_fbclid, m.last_fbclid),
    last_ttclid = COALESCE(k.last_ttclid, m.last_ttclid),
    last_msclkid = COALESCE(k.last_msclkid, m.last_msclkid),
    last_referrer_domain = COALESCE(k.last_referrer_domain, m.last_referrer_domain),
    last_landing_url = COALESCE(k.last_landing_url, m.last_landing_url),
    last_at = COALESCE(k.last_at, m.last_at),
    device_type = COALESCE(k.device_type, m.device_type),
    os_name = COALESCE(k.os_name, m.os_name),
    browser_name = COALESCE(k.browser_name, m.browser_name),
    viewport_w = COALESCE(k.viewport_w, m.viewport_w),
    viewport_h = COALESCE(k.viewport_h, m.viewport_h),
    language = COALESCE(k.language, m.language),
    timezone = COALESCE(k.timezone, m.timezone),
    country_code = COALESCE(k.country_code, m.country_code),
    country_name = COALESCE(k.country_name, m.country_name),
    region = COALESCE(k.region, m.region),
    city = COALESCE(k.city, m.city),
    raw_ua = COALESCE(k.raw_ua, m.raw_ua),
    meta_fbc = COALESCE(k.meta_fbc, m.meta_fbc),
    meta_fbp = COALESCE(k.meta_fbp, m.meta_fbp),
    client_ip = COALESCE(k.client_ip, m.client_ip),
    capi_event_id = COALESCE(k.capi_event_id, m.capi_event_id),
    self_reported_source = COALESCE(k.self_reported_source, m.self_reported_source)
FROM merged m
WHERE k.id = m.keep_id;

-- 4. Delete the duplicate rows ----------------------------------------------
DELETE FROM public.lead_attribution
WHERE id NOT IN (SELECT keep_id FROM _la_keepers);

-- 5. Enforce one row per (linked_table, linked_id) --------------------------
-- No NULL linked_id rows exist (verified), so a plain unique index is safe and
-- lets PostgREST use `?on_conflict=linked_table,linked_id` for clean upserts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_attribution_linked
    ON public.lead_attribution (linked_table, linked_id);

COMMIT;
