-- ============================================
-- Migration 009: Create contact_requests table
-- The table was missing — form submissions were silently failing
-- ============================================

CREATE TABLE IF NOT EXISTS public.contact_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT,
    full_name TEXT,
    phone TEXT,
    email TEXT,
    message TEXT,
    request_type TEXT DEFAULT 'general',
    status TEXT DEFAULT 'new',
    last_contacted_at TIMESTAMPTZ,
    contacted_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can INSERT (lead capture from website — no login required)
DROP POLICY IF EXISTS "Anyone can submit contact request" ON public.contact_requests;
CREATE POLICY "Anyone can submit contact request"
    ON public.contact_requests FOR INSERT
    WITH CHECK (true);

-- Service role (CRM bot) bypasses RLS automatically
-- But add admin SELECT/UPDATE for dashboard access
DROP POLICY IF EXISTS "Admins can view all contact requests" ON public.contact_requests;
CREATE POLICY "Admins can view all contact requests"
    ON public.contact_requests FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "Admins can update contact requests" ON public.contact_requests;
CREATE POLICY "Admins can update contact requests"
    ON public.contact_requests FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_contact_requests_status ON public.contact_requests(status);
CREATE INDEX IF NOT EXISTS idx_contact_requests_created ON public.contact_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_requests_type ON public.contact_requests(request_type);

-- Grant access to PostgREST roles
GRANT ALL ON public.contact_requests TO anon;
GRANT ALL ON public.contact_requests TO authenticated;
GRANT ALL ON public.contact_requests TO service_role;
