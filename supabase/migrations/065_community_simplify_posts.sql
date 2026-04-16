-- 065: Make title and category_id optional on community_posts.
-- The simplified inline community feed uses body-only posts (no title, no categories).
ALTER TABLE community_posts ALTER COLUMN title DROP NOT NULL;
ALTER TABLE community_posts ALTER COLUMN category_id DROP NOT NULL;
