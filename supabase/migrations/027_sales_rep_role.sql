-- ============================================================================
-- Migration 027: Sales Rep Role
-- Adds sales_rep role support:
-- 1. Convert assigned_to from TEXT to UUID with FK to profiles
-- 2. RLS policies: sales_rep sees only own assigned leads
-- 3. Add role + profile_id columns to crm_bot_phones
-- ============================================================================

-- === 1. Fix assigned_to column type (TEXT → UUID + FK) ===

-- Clear any non-UUID values first (safety)
UPDATE sales_leads SET assigned_to = NULL WHERE assigned_to IS NOT NULL AND assigned_to !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Convert column type
ALTER TABLE sales_leads ALTER COLUMN assigned_to TYPE UUID USING assigned_to::UUID;

-- Add FK constraint
ALTER TABLE sales_leads ADD CONSTRAINT fk_sales_leads_assigned_to
    FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

-- Index for assigned_to queries (drop old text-based index, recreate)
DROP INDEX IF EXISTS idx_sales_leads_assigned;
CREATE INDEX idx_sales_leads_assigned ON sales_leads(assigned_to) WHERE assigned_to IS NOT NULL;


-- === 2. Fix RLS policies on sales_leads ===

-- Drop the overly permissive service_role policy (service_role bypasses RLS anyway)
DROP POLICY IF EXISTS "service_role_all_sales_leads" ON sales_leads;

-- Drop old admin policy (will be replaced by a new combined one)
DROP POLICY IF EXISTS "admin_full_access_sales_leads" ON sales_leads;

-- Admin: full CRUD access
CREATE POLICY "admin_all_sales_leads" ON sales_leads
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- Sales rep: SELECT only own assigned leads
CREATE POLICY "sales_rep_select_own_leads" ON sales_leads
    FOR SELECT TO authenticated
    USING (
        assigned_to = auth.uid()
        AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'sales_rep')
    );

-- Sales rep: UPDATE only own assigned leads (can update stage, call_attempts, notes etc.)
CREATE POLICY "sales_rep_update_own_leads" ON sales_leads
    FOR UPDATE TO authenticated
    USING (
        assigned_to = auth.uid()
        AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'sales_rep')
    )
    WITH CHECK (
        assigned_to = auth.uid()
        AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'sales_rep')
    );

-- Note: sales_rep has NO INSERT or DELETE on sales_leads (admin only)


-- === 3. Add role + profile_id to crm_bot_phones ===

ALTER TABLE crm_bot_phones ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin';
ALTER TABLE crm_bot_phones ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Index for role lookups
CREATE INDEX IF NOT EXISTS idx_crm_bot_phones_role ON crm_bot_phones(role);
