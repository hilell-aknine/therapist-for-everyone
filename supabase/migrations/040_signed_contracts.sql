-- Signed contracts — stores digital signatures from contract page
CREATE TABLE IF NOT EXISTS signed_contracts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    signer_name TEXT NOT NULL,
    signer_id_number TEXT NOT NULL,
    signer_phone TEXT,
    signature_data TEXT NOT NULL,
    contract_version TEXT DEFAULT '1.0',
    ip_address TEXT,
    signed_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE signed_contracts ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin_all_signed_contracts" ON signed_contracts
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- Anyone can insert (contract page is public with token)
CREATE POLICY "anon_insert_signed_contracts" ON signed_contracts
    FOR INSERT TO anon WITH CHECK (true);

CREATE INDEX idx_signed_contracts_sub ON signed_contracts(subscription_id);
CREATE INDEX idx_signed_contracts_phone ON signed_contracts(signer_phone);
