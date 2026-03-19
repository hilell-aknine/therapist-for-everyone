-- Sales pipeline fields on profiles — track sales journey for every registered user
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sales_stage TEXT DEFAULT 'new'
    CHECK (sales_stage IN ('new','contacted','follow_up','presentation','negotiation','won','lost','not_relevant'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sales_contact_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sales_notes TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sales_last_contact TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sales_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_sales_stage ON profiles(sales_stage) WHERE role IN ('student_lead','student','paid_customer');
