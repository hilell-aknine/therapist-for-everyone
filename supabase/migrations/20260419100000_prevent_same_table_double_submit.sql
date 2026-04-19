-- ============================================================================
-- Prevent same-table double submissions (same phone within 24h)
-- Cross-table duplicates are LEGITIMATE (patient + learner + lead).
-- This only blocks the SAME phone in the SAME table within 24 hours.
-- ============================================================================

-- Generic trigger function: checks if phone already exists in the same table within 24h
CREATE OR REPLACE FUNCTION prevent_double_submit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.phone IS NOT NULL AND NEW.phone != '' THEN
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = TG_TABLE_SCHEMA AND c.relname = TG_TABLE_NAME
    ) THEN
      EXECUTE format(
        'SELECT 1 FROM %I.%I WHERE phone = $1 AND created_at > NOW() - INTERVAL ''24 hours'' LIMIT 1',
        TG_TABLE_SCHEMA, TG_TABLE_NAME
      ) USING NEW.phone;
      IF FOUND THEN
        RAISE EXCEPTION 'duplicate_submission: phone % already submitted to % within 24 hours',
          NEW.phone, TG_TABLE_NAME;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to each lead table
CREATE TRIGGER trg_prevent_double_patients
  BEFORE INSERT ON patients
  FOR EACH ROW EXECUTE FUNCTION prevent_double_submit();

CREATE TRIGGER trg_prevent_double_therapists
  BEFORE INSERT ON therapists
  FOR EACH ROW EXECUTE FUNCTION prevent_double_submit();

CREATE TRIGGER trg_prevent_double_contact_requests
  BEFORE INSERT ON contact_requests
  FOR EACH ROW EXECUTE FUNCTION prevent_double_submit();

CREATE TRIGGER trg_prevent_double_sales_leads
  BEFORE INSERT ON sales_leads
  FOR EACH ROW EXECUTE FUNCTION prevent_double_submit();

-- Note: questionnaire_submissions is NOT included because repeat questionnaires
-- may be legitimate (user updates answers).
