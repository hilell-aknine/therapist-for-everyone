-- Migration 013: Enable RLS on CRM tables + admin read access
-- CRM bot uses service-role key (bypasses RLS) — no impact on bot operations.
-- Dashboard uses anon key with authenticated session — needs explicit policies.

-- ============================================================
-- 1. Enable RLS on CRM tables
-- ============================================================

ALTER TABLE crm_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_payments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. SELECT policies — admin only (role check via profiles)
-- ============================================================

CREATE POLICY "Admins can view activity log"
  ON crm_activity_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can view CRM notes"
  ON crm_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can view CRM payments"
  ON crm_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ============================================================
-- 3. INSERT policy on crm_notes — admin can add notes from dashboard
-- ============================================================

CREATE POLICY "Admins can insert CRM notes"
  ON crm_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ============================================================
-- 4. GRANT table access to authenticated role
-- ============================================================

GRANT SELECT ON crm_activity_log TO authenticated;
GRANT SELECT, INSERT ON crm_notes TO authenticated;
GRANT SELECT ON crm_payments TO authenticated;
