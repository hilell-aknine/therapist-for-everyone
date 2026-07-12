-- ============================================================================
-- DRAFT — NOT FOR EXECUTION YET
-- File: docs/specs/lead-intake-v1/01-schema.sql
-- Created: 2026-05-17 — beit-vmetaplim Supabase unification
-- ============================================================================
-- New table `lead_intake` replaces 5 fragmented tables:
--   portal_questionnaires (30 cols, 456 rows, ACTIVE)
--   contact_requests       (22 cols, 179 rows, ACTIVE)
--   _archive_patients      (41 cols,   2 rows, archived 2026-05-17)
--   _archive_therapists    (37 cols,   1 row,  archived 2026-05-17)
--   _archive_sales_leads   (27 cols,   2 rows, archived 2026-05-17)
--
-- Design pattern: lean-core columns (queryable/indexable) + JSONB payload
-- for type-specific fields. JSONB avoids the "50 NULL cols per row" trap.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Table definition
-- ----------------------------------------------------------------------------
CREATE TABLE public.lead_intake (
    -- Identity --------------------------------------------------------------
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ  NOT NULL    DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL    DEFAULT NOW(),

    -- Classification (drives all branching logic) ---------------------------
    intake_type     TEXT         NOT NULL,
    intake_source   TEXT,        -- 'website' | 'whatsapp' | 'manual' | ...

    -- Core identity (denormalized from profiles for fast filter/dedup) -----
    user_id         UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name       TEXT,
    phone           TEXT,        -- normalized digits, optional + prefix
    email           TEXT,
    city            TEXT,

    -- Form payload (everything type-specific lives here) -------------------
    payload         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    payload_version SMALLINT     NOT NULL DEFAULT 1,

    -- Pipeline / CRM state (uniform across types) --------------------------
    status              TEXT     NOT NULL DEFAULT 'new',
    pipeline_stage      TEXT,    -- free-form per intake_type
    heat_level          SMALLINT,-- 1-5
    call_count          INT      NOT NULL DEFAULT 0,
    last_contacted_at   TIMESTAMPTZ,
    callback_at         TIMESTAMPTZ,
    assigned_to         UUID     REFERENCES auth.users(id) ON DELETE SET NULL,
    caller_notes        TEXT,
    admin_notes         TEXT,

    -- Outcome (for sales-style intakes; NULL means still open) -------------
    outcome             TEXT,
    outcome_reason      TEXT,
    contract_signed     BOOLEAN  NOT NULL DEFAULT FALSE,
    contract_signed_at  TIMESTAMPTZ,
    deal_amount         NUMERIC(10, 2),

    -- Marketing attribution (kept here for fast queries; lead_attribution
    -- table keeps the FULL history including first-touch + device + geo) ---
    utm_source       TEXT,
    utm_medium       TEXT,
    utm_campaign     TEXT,
    utm_term         TEXT,
    utm_content      TEXT,
    referrer_domain  TEXT,
    landing_url      TEXT,

    -- Consent flags --------------------------------------------------------
    whatsapp_reminders_consent  BOOLEAN,
    whatsapp_welcome_sent_at    TIMESTAMPTZ,

    -- Constraints ----------------------------------------------------------
    CONSTRAINT lead_intake_type_check CHECK (intake_type IN (
        'portal_signup',         -- replaces portal_questionnaires
        'contact_form',          -- replaces contact_requests
        'patient_application',   -- replaces patients (legacy marketplace)
        'therapist_application', -- replaces therapists (legacy marketplace)
        'sales_inquiry'          -- replaces sales_leads (paid course)
    )),
    CONSTRAINT lead_intake_status_check CHECK (status IN (
        'new', 'contacted', 'qualified', 'in_progress',
        'won', 'lost', 'archived', 'unresponsive'
    )),
    CONSTRAINT lead_intake_outcome_check CHECK (
        outcome IS NULL OR outcome IN ('won', 'lost')
    ),
    CONSTRAINT lead_intake_heat_range CHECK (
        heat_level IS NULL OR heat_level BETWEEN 1 AND 5
    )
);

COMMENT ON TABLE public.lead_intake IS
    'Unified intake table. One row per form submission across all entry points. '
    'Replaces portal_questionnaires + contact_requests + 3 archived legacy tables.';

COMMENT ON COLUMN public.lead_intake.payload IS
    'Form-specific fields as JSONB. Shape varies by intake_type — see '
    'docs/specs/lead-intake-v1/00-overview.md for the per-type schema contract.';

COMMENT ON COLUMN public.lead_intake.payload_version IS
    'Bump when payload shape changes for a given intake_type. Older rows keep '
    'their version so backward-compat queries can branch on it.';

-- ----------------------------------------------------------------------------
-- 2. Indexes (covers all current query patterns + new dashboard reads)
-- ----------------------------------------------------------------------------
CREATE INDEX idx_lead_intake_type_created    ON public.lead_intake (intake_type, created_at DESC);
CREATE INDEX idx_lead_intake_status          ON public.lead_intake (status) WHERE status != 'archived';
CREATE INDEX idx_lead_intake_phone           ON public.lead_intake (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_lead_intake_email           ON public.lead_intake (email) WHERE email IS NOT NULL;
CREATE INDEX idx_lead_intake_user_id         ON public.lead_intake (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_lead_intake_assigned        ON public.lead_intake (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_lead_intake_callback        ON public.lead_intake (callback_at) WHERE callback_at IS NOT NULL;
CREATE INDEX idx_lead_intake_utm_campaign    ON public.lead_intake (utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX idx_lead_intake_payload_gin     ON public.lead_intake USING GIN (payload);

-- Dedup helper: same person + same intake_type within 24h = no duplicate row
-- (the Edge Function enforces this in app code, but a partial unique constraint
-- gives a DB-level safety net for any direct service-role insert.)
-- Note: `created_at::date` on TIMESTAMPTZ is STABLE not IMMUTABLE — Postgres
-- rejects it in an index. `AT TIME ZONE 'UTC'` first converts to TIMESTAMP
-- (without tz), and `::date` on that IS immutable. Dates are bucketed by UTC.
CREATE UNIQUE INDEX idx_lead_intake_dedup_day
    ON public.lead_intake (intake_type, phone, ((created_at AT TIME ZONE 'UTC')::date))
    WHERE phone IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._lead_intake_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lead_intake_updated_at
    BEFORE UPDATE ON public.lead_intake
    FOR EACH ROW EXECUTE FUNCTION public._lead_intake_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Row-Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.lead_intake ENABLE ROW LEVEL SECURITY;

-- 4a. Admins can do anything
CREATE POLICY "Admins full access"
    ON public.lead_intake
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 4b. Authenticated users can SELECT their own intake records
CREATE POLICY "Users read own intakes"
    ON public.lead_intake
    FOR SELECT
    USING (user_id = auth.uid());

-- 4c. NO anon INSERT policy — all inserts must route through the
-- submit-lead Edge Function which uses the service-role key.
-- Same pattern as today (per .vercelignore + Edge Function design).

-- 4d. Authenticated users can update their own LIMITED fields (consent flags)
-- via a SECURITY DEFINER function (not direct UPDATE).
-- Done in a follow-up migration; not part of v1.

COMMIT;

-- ============================================================================
-- POST-CREATE: backward-compat VIEWs (created in a separate transaction
-- so any failure here doesn't block the table from being created)
-- ============================================================================
-- These views let legacy admin pages keep working WITHOUT changing their code
-- while we migrate the dashboards. They expose lead_intake rows as if they
-- were the old tables. Read-only.
-- ----------------------------------------------------------------------------

-- BEGIN;
--
-- CREATE OR REPLACE VIEW public.portal_questionnaires_v AS
--   SELECT id, user_id, full_name, phone, email, city,
--          (payload->>'gender')          AS gender,
--          (payload->>'birth_date')::date AS birth_date,
--          (payload->>'occupation')      AS occupation,
--          (payload->>'why_nlp')         AS why_nlp,
--          (payload->>'study_time')      AS study_time,
--          (payload->>'digital_challenge') AS digital_challenge,
--          (payload->>'knew_ram')        AS knew_ram,
--          (payload->>'motivation_tip')  AS motivation_tip,
--          (payload->>'main_challenge')  AS main_challenge,
--          (payload->>'vision_one_year') AS vision_one_year,
--          (payload->>'how_found')       AS how_found,
--          intake_source                 AS source,
--          status, heat_level, caller_notes, last_contacted_at AS last_called_at,
--          call_count, assigned_to AS assigned_caller, created_at,
--          utm_source, utm_medium, utm_campaign, utm_content, utm_term,
--          whatsapp_reminders_consent, whatsapp_welcome_sent_at AS welcome_sent_at
--   FROM public.lead_intake
--   WHERE intake_type = 'portal_signup';
--
-- (similar VIEW for contact_requests_v, deferred until migration phase 3)
--
-- COMMIT;
