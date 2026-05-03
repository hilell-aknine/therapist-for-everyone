-- Grant admin role explicit SELECT + UPDATE on retention_messages so the
-- admin dashboard (pages/admin.html "Retention" tab) can read drafts and
-- approve/reject them via the anon JWT. INSERT stays restricted to the
-- service-role (used by the Python sync), DELETE is not granted because
-- rejection is a soft state ('rejected') kept for return-rate analytics.

CREATE POLICY "admin_read_messages" ON public.retention_messages
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "admin_update_messages" ON public.retention_messages
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

NOTIFY pgrst, 'reload schema';
