-- Fix: course_progress RLS policies — ensure all CRUD policies exist
-- Some policies may already exist from dashboard creation, so DROP IF EXISTS first

-- Users can read their own progress
DROP POLICY IF EXISTS "Users can read own progress" ON course_progress;
CREATE POLICY "Users can read own progress"
    ON course_progress FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own progress
DROP POLICY IF EXISTS "Users can insert own progress" ON course_progress;
CREATE POLICY "Users can insert own progress"
    ON course_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own progress
DROP POLICY IF EXISTS "Users can update own progress" ON course_progress;
CREATE POLICY "Users can update own progress"
    ON course_progress FOR UPDATE
    USING (auth.uid() = user_id);

-- Admins can read all progress (for admin dashboard learners tab)
DROP POLICY IF EXISTS "Admins can read all progress" ON course_progress;
CREATE POLICY "Admins can read all progress"
    ON course_progress FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
