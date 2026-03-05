-- ============================================================================
-- Migration 025: Sales Pipeline (sales_leads)
-- CRM sales pipeline for NLP training program conversions.
-- Source: questionnaire_submissions → sales_leads → closed_won/closed_lost
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Link to questionnaire
    questionnaire_id UUID REFERENCES questionnaire_submissions(id) ON DELETE SET NULL,

    -- Contact info (copied from questionnaire for quick access)
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    occupation TEXT,

    -- Pipeline stage
    stage TEXT NOT NULL DEFAULT 'new_lead'
        CHECK (stage IN ('new_lead', 'call_attempts', 'no_answer_callback', 'answered', 'presentation', 'closed_won', 'closed_lost')),

    -- Call tracking
    call_attempts INT NOT NULL DEFAULT 0 CHECK (call_attempts >= 0 AND call_attempts <= 6),
    last_call_at TIMESTAMPTZ,
    callback_at TIMESTAMPTZ,

    -- Outcome
    is_bought BOOLEAN,
    won_reason TEXT,
    lost_reason TEXT CHECK (lost_reason IS NULL OR lost_reason IN ('money', 'unsupportive_env', 'fear', 'other_college', 'other')),

    -- Deal details
    contract_signed BOOLEAN DEFAULT false,
    contract_signed_at TIMESTAMPTZ,
    deal_amount NUMERIC(10,2),
    payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('bank_transfer', 'bank_transfer_and_credit', 'credit_card')),

    -- Management
    admin_notes TEXT,
    assigned_to TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE sales_leads ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin_full_access_sales_leads" ON sales_leads
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- Service role access (for CRM bot)
CREATE POLICY "service_role_all_sales_leads" ON sales_leads
    FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_sales_leads_stage ON sales_leads(stage);
CREATE INDEX idx_sales_leads_created_at ON sales_leads(created_at DESC);
CREATE INDEX idx_sales_leads_questionnaire ON sales_leads(questionnaire_id);
CREATE INDEX idx_sales_leads_callback ON sales_leads(callback_at) WHERE callback_at IS NOT NULL;
CREATE INDEX idx_sales_leads_assigned ON sales_leads(assigned_to) WHERE assigned_to IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_sales_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sales_leads_updated_at
    BEFORE UPDATE ON sales_leads
    FOR EACH ROW
    EXECUTE FUNCTION update_sales_leads_updated_at();
