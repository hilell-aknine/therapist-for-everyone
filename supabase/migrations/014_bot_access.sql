-- Migration 014: CRM Bot Phones + Access Control
-- Replaces .env ALLOWED_PHONES with DB-managed phones
-- Adds role-based access for dashboard bot tab

-- ============================================================
-- 1. crm_bot_phones — authorized WhatsApp numbers
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_bot_phones (
  phone TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  added_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE crm_bot_phones ENABLE ROW LEVEL SECURITY;

-- Admin-only: full CRUD
CREATE POLICY "admin_all_bot_phones"
  ON crm_bot_phones FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Service role (bot server) can read
CREATE POLICY "service_read_bot_phones"
  ON crm_bot_phones FOR SELECT
  USING (true);

-- Seed: current authorized phones
INSERT INTO crm_bot_phones (phone, label) VALUES
  ('972549116092', 'הלל'),
  ('972527892299', 'שותף'),
  ('972515687449', 'נוסף')
ON CONFLICT (phone) DO NOTHING;

-- ============================================================
-- 2. crm_bot_access — dashboard bot-tab roles
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_bot_access (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE crm_bot_access ENABLE ROW LEVEL SECURITY;

-- Users can read their own access level
CREATE POLICY "users_read_own_access"
  ON crm_bot_access FOR SELECT
  USING (user_id = auth.uid());

-- Admin can manage all access
CREATE POLICY "admin_all_bot_access"
  ON crm_bot_access FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Service role can read all
CREATE POLICY "service_read_bot_access"
  ON crm_bot_access FOR SELECT
  USING (true);
