-- Create private workbooks bucket for paid customer content
INSERT INTO storage.buckets (id, name, public)
VALUES ('workbooks', 'workbooks', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: only paid_customer and admin can read
CREATE POLICY "paid_customer_read_workbooks" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'workbooks'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('paid_customer', 'admin')
        )
    );

-- RLS: only admin can upload
CREATE POLICY "admin_upload_workbooks" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'workbooks'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );
