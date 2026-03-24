-- Migration 043: Community feature tables (Skool-style social network)
-- Tables: community_categories, community_posts, community_comments, community_likes, community_members

-- ============================================================
-- 1. CATEGORIES (predefined topic spaces)
-- ============================================================
CREATE TABLE IF NOT EXISTS community_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE community_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_categories" ON community_categories
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admin_manage_categories" ON community_categories
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- Seed categories
INSERT INTO community_categories (slug, name, description, icon, color, sort_order) VALUES
    ('nlp-techniques', 'NLP טכניקות', 'שיתוף טכניקות, תרגילים ושיטות NLP', '🧠', '#2F8592', 1),
    ('success-stories', 'שיתוף הצלחות', 'סיפורי הצלחה ותוצאות מהשטח', '🏆', '#D4AF37', 2),
    ('qa', 'שאלות ותשובות', 'שאלו שאלות וקבלו תשובות מהקהילה', '❓', '#00606B', 3),
    ('resources', 'משאבים וכלים', 'המלצות על ספרים, סרטונים וכלים', '📚', '#003B46', 4);

-- ============================================================
-- 2. COMMUNITY MEMBERS (leaderboard + profile data)
-- ============================================================
CREATE TABLE IF NOT EXISTS community_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    display_name TEXT DEFAULT 'חבר קהילה',
    bio TEXT,
    total_points INTEGER DEFAULT 0,
    posts_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    likes_received INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    last_active TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_members" ON community_members
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "users_insert_own_member" ON community_members
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_member" ON community_members
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "admin_manage_members" ON community_members
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE INDEX idx_community_members_points ON community_members(total_points DESC);
CREATE INDEX idx_community_members_user ON community_members(user_id);

-- ============================================================
-- 3. POSTS (main content feed)
-- ============================================================
CREATE TABLE IF NOT EXISTS community_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES community_categories(id) NOT NULL,
    title TEXT NOT NULL CHECK (char_length(title) <= 300),
    body TEXT NOT NULL,
    image_url TEXT,
    link_url TEXT,
    is_pinned BOOLEAN DEFAULT false,
    is_locked BOOLEAN DEFAULT false,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_posts" ON community_posts
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "users_insert_own_posts" ON community_posts
    FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "users_update_own_posts" ON community_posts
    FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "users_delete_own_posts" ON community_posts
    FOR DELETE USING (auth.uid() = author_id);

CREATE POLICY "admin_manage_posts" ON community_posts
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE INDEX idx_community_posts_feed ON community_posts(is_pinned DESC, created_at DESC);
CREATE INDEX idx_community_posts_category ON community_posts(category_id, created_at DESC);
CREATE INDEX idx_community_posts_author ON community_posts(author_id);

-- ============================================================
-- 4. COMMENTS (one level of nesting)
-- ============================================================
CREATE TABLE IF NOT EXISTS community_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE NOT NULL,
    author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    parent_id UUID REFERENCES community_comments(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    likes_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_comments" ON community_comments
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "users_insert_own_comments" ON community_comments
    FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "users_update_own_comments" ON community_comments
    FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "users_delete_own_comments" ON community_comments
    FOR DELETE USING (auth.uid() = author_id);

CREATE POLICY "admin_manage_comments" ON community_comments
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE INDEX idx_community_comments_post ON community_comments(post_id, created_at ASC);
CREATE INDEX idx_community_comments_author ON community_comments(author_id);

-- ============================================================
-- 5. LIKES (unified for posts + comments)
-- ============================================================
CREATE TABLE IF NOT EXISTS community_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES community_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    CHECK (post_id IS NOT NULL OR comment_id IS NOT NULL)
);

ALTER TABLE community_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_likes" ON community_likes
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "users_insert_own_likes" ON community_likes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_delete_own_likes" ON community_likes
    FOR DELETE USING (auth.uid() = user_id);

-- Unique partial indexes (one like per user per target)
CREATE UNIQUE INDEX idx_community_likes_post ON community_likes(user_id, post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX idx_community_likes_comment ON community_likes(user_id, comment_id) WHERE comment_id IS NOT NULL;

-- ============================================================
-- 6. HELPER: compute level from points
-- ============================================================
CREATE OR REPLACE FUNCTION compute_community_level(points INTEGER)
RETURNS INTEGER AS $$
BEGIN
    RETURN GREATEST(1, FLOOR(LOG(2, GREATEST(points, 0)::numeric / 50 + 1)) + 1)::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- 7. TRIGGERS: post insert/delete → update counters
-- ============================================================
CREATE OR REPLACE FUNCTION on_community_post_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_name TEXT;
BEGIN
    -- Ensure member row exists
    SELECT full_name INTO v_name FROM profiles WHERE id = NEW.author_id;
    INSERT INTO community_members (user_id, display_name)
    VALUES (NEW.author_id, COALESCE(v_name, 'חבר קהילה'))
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE community_members
    SET posts_count = posts_count + 1,
        total_points = total_points + 10,
        level = compute_community_level(total_points + 10),
        last_active = now()
    WHERE user_id = NEW.author_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION on_community_post_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE community_members
    SET posts_count = GREATEST(0, posts_count - 1),
        total_points = GREATEST(0, total_points - 10),
        level = compute_community_level(GREATEST(0, total_points - 10))
    WHERE user_id = OLD.author_id;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_community_post_insert
    AFTER INSERT ON community_posts
    FOR EACH ROW EXECUTE FUNCTION on_community_post_insert();

CREATE TRIGGER trg_community_post_delete
    AFTER DELETE ON community_posts
    FOR EACH ROW EXECUTE FUNCTION on_community_post_delete();

-- ============================================================
-- 9. TRIGGERS: comment insert/delete → update counters
-- ============================================================
CREATE OR REPLACE FUNCTION on_community_comment_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_name TEXT;
BEGIN
    -- Ensure member row exists
    SELECT full_name INTO v_name FROM profiles WHERE id = NEW.author_id;
    INSERT INTO community_members (user_id, display_name)
    VALUES (NEW.author_id, COALESCE(v_name, 'חבר קהילה'))
    ON CONFLICT (user_id) DO NOTHING;

    -- Update post comment count
    UPDATE community_posts
    SET comments_count = comments_count + 1
    WHERE id = NEW.post_id;

    -- Update member stats
    UPDATE community_members
    SET comments_count = comments_count + 1,
        total_points = total_points + 5,
        level = compute_community_level(total_points + 5),
        last_active = now()
    WHERE user_id = NEW.author_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION on_community_comment_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Update post comment count
    UPDATE community_posts
    SET comments_count = GREATEST(0, comments_count - 1)
    WHERE id = OLD.post_id;

    -- Update member stats
    UPDATE community_members
    SET comments_count = GREATEST(0, comments_count - 1),
        total_points = GREATEST(0, total_points - 5),
        level = compute_community_level(GREATEST(0, total_points - 5))
    WHERE user_id = OLD.author_id;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_community_comment_insert
    AFTER INSERT ON community_comments
    FOR EACH ROW EXECUTE FUNCTION on_community_comment_insert();

CREATE TRIGGER trg_community_comment_delete
    AFTER DELETE ON community_comments
    FOR EACH ROW EXECUTE FUNCTION on_community_comment_delete();

-- ============================================================
-- 10. TRIGGERS: like insert/delete → update counters + points
-- ============================================================
CREATE OR REPLACE FUNCTION on_community_like_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_author UUID;
    v_points INTEGER;
BEGIN
    IF NEW.post_id IS NOT NULL THEN
        -- Like on a post
        UPDATE community_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
        SELECT author_id INTO v_author FROM community_posts WHERE id = NEW.post_id;
        v_points := 3;
    ELSIF NEW.comment_id IS NOT NULL THEN
        -- Like on a comment
        UPDATE community_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
        SELECT author_id INTO v_author FROM community_comments WHERE id = NEW.comment_id;
        v_points := 1;
    END IF;

    -- Award points to content author (not the liker)
    IF v_author IS NOT NULL AND v_author != NEW.user_id THEN
        UPDATE community_members
        SET likes_received = likes_received + 1,
            total_points = total_points + v_points,
            level = compute_community_level(total_points + v_points)
        WHERE user_id = v_author;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION on_community_like_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_author UUID;
    v_points INTEGER;
BEGIN
    IF OLD.post_id IS NOT NULL THEN
        UPDATE community_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
        SELECT author_id INTO v_author FROM community_posts WHERE id = OLD.post_id;
        v_points := 3;
    ELSIF OLD.comment_id IS NOT NULL THEN
        UPDATE community_comments SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.comment_id;
        SELECT author_id INTO v_author FROM community_comments WHERE id = OLD.comment_id;
        v_points := 1;
    END IF;

    IF v_author IS NOT NULL AND v_author != OLD.user_id THEN
        UPDATE community_members
        SET likes_received = GREATEST(0, likes_received - 1),
            total_points = GREATEST(0, total_points - v_points),
            level = compute_community_level(GREATEST(0, total_points - v_points))
        WHERE user_id = v_author;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_community_like_insert
    AFTER INSERT ON community_likes
    FOR EACH ROW EXECUTE FUNCTION on_community_like_insert();

CREATE TRIGGER trg_community_like_delete
    AFTER DELETE ON community_likes
    FOR EACH ROW EXECUTE FUNCTION on_community_like_delete();

-- ============================================================
-- 11. TRIGGER: auto-update updated_at on posts
-- ============================================================
CREATE OR REPLACE FUNCTION update_community_post_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_community_post_updated
    BEFORE UPDATE ON community_posts
    FOR EACH ROW EXECUTE FUNCTION update_community_post_timestamp();

-- ============================================================
-- 12. STORAGE: community images bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-images', 'community-images', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload to their own folder
CREATE POLICY "auth_upload_community_images" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'community-images' AND
        auth.role() = 'authenticated' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- Anyone can read community images (public bucket)
CREATE POLICY "public_read_community_images" ON storage.objects
    FOR SELECT USING (bucket_id = 'community-images');

-- Users can delete their own images
CREATE POLICY "auth_delete_own_community_images" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'community-images' AND
        auth.role() = 'authenticated' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );
