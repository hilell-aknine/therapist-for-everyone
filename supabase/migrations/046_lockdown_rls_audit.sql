-- ============================================================================
-- Migration 046: Security audit fixes — lock down overly permissive RLS
-- ============================================================================

-- Fix 1: sales_leads — remove WITH CHECK (true) that allows unrestricted inserts
DROP POLICY IF EXISTS "service_role_all_sales_leads" ON public.sales_leads;
-- admin_all_sales_leads may already exist from a previous migration
DO $$ BEGIN
    CREATE POLICY "admin_all_sales_leads" ON public.sales_leads
        FOR ALL USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fix 2: questionnaire_submissions — remove WITH CHECK (true) on INSERT
DROP POLICY IF EXISTS "service_role_insert_questionnaire" ON public.questionnaire_submissions;

DO $$ BEGIN
    CREATE POLICY "authenticated_insert_questionnaire" ON public.questionnaire_submissions
        FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "admin_read_questionnaire_submissions" ON public.questionnaire_submissions
        FOR SELECT USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
