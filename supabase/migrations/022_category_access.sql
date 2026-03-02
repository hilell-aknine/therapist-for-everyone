-- Migration 022: Add category-level permissions to crm_bot_access
-- Allows SuperAdmin to control which automation categories each user can see/manage.
-- Default: all 9 categories (backwards compatible — existing users keep full access).

-- Step 1: Add category_access column
ALTER TABLE crm_bot_access
  ADD COLUMN IF NOT EXISTS category_access JSONB
  NOT NULL DEFAULT '["reports","pipelines","followups","monitoring","export","lead_lifecycle","safety","operations","retention"]'::jsonb;

-- Step 2: Ensure existing rows get all categories
UPDATE crm_bot_access
SET category_access = '["reports","pipelines","followups","monitoring","export","lead_lifecycle","safety","operations","retention"]'::jsonb
WHERE category_access IS NULL;

-- Step 3: Add updated_at trigger (if not already existing)
CREATE OR REPLACE FUNCTION update_crm_bot_access_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_crm_bot_access_updated_at ON crm_bot_access;
CREATE TRIGGER set_crm_bot_access_updated_at
  BEFORE UPDATE ON crm_bot_access
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_bot_access_updated_at();

-- Notify PostgREST to reload schema
SELECT public.reload_pgrst();
