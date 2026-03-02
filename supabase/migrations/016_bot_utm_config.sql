-- Migration 016: Bot UTM Link Generator Configuration
-- Moves hardcoded destination/source maps from links.js to a DB-managed table.
-- Admin can add/remove destinations and sources from the dashboard.

CREATE TABLE IF NOT EXISTS bot_utm_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_type TEXT NOT NULL CHECK (config_type IN ('source', 'destination')),
  value TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  hebrew_aliases TEXT[] NOT NULL DEFAULT '{}',
  url_path TEXT,
  utm_medium TEXT,
  campaign_slug TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (config_type, value)
);

ALTER TABLE bot_utm_configs ENABLE ROW LEVEL SECURITY;

-- Admin: full CRUD from dashboard
CREATE POLICY "admin_all_utm_configs"
  ON bot_utm_configs FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Service role (bot server) can read
CREATE POLICY "service_read_utm_configs"
  ON bot_utm_configs FOR SELECT
  USING (true);

-- ============================================================
-- Seed: Current hardcoded values -> DB rows
-- ============================================================

-- DESTINATIONS
INSERT INTO bot_utm_configs (config_type, value, label, hebrew_aliases, url_path, campaign_slug) VALUES
  ('destination', 'portal',     'ספריית קורסים',  ARRAY['פורטל', 'קורסים'],              '/pages/course-library.html',  'portal'),
  ('destination', 'patient',    'נחיתת מטופלים',  ARRAY['מטופל', 'מטופלים'],              '/landing-patient.html',       'patient-landing'),
  ('destination', 'therapist',  'נחיתת מטפלים',   ARRAY['מטפל', 'מטפלים'],               '/landing-therapist.html',     'therapist-landing'),
  ('destination', 'homepage',   'דף הבית',        ARRAY['בית', 'ראשי'],                   '/',                           'homepage'),
  ('destination', 'about',      'אודות המיזם',    ARRAY['אודות'],                         '/pages/about.html',           'about'),
  ('destination', 'learning',   'פורטל למידה',    ARRAY['למידה'],                         '/pages/learning-master.html', 'learning')
ON CONFLICT (config_type, value) DO NOTHING;

-- SOURCES
INSERT INTO bot_utm_configs (config_type, value, label, hebrew_aliases, utm_medium) VALUES
  ('source', 'whatsapp',  'וואטסאפ',    ARRAY['וואטסאפ'],            'social'),
  ('source', 'instagram', 'אינסטגרם',   ARRAY['אינסטגרם', 'אינסטה'], 'social'),
  ('source', 'facebook',  'פייסבוק',    ARRAY['פייסבוק'],            'social'),
  ('source', 'tiktok',    'טיקטוק',     ARRAY['טיקטוק'],             'social'),
  ('source', 'youtube',   'יוטיוב',     ARRAY['יוטיוב'],             'video'),
  ('source', 'email',     'אימייל',     ARRAY['אימייל', 'מייל'],     'email'),
  ('source', 'sms',       'SMS',        ARRAY['סמס'],                'sms'),
  ('source', 'google',    'גוגל',       ARRAY['גוגל'],               'organic')
ON CONFLICT (config_type, value) DO NOTHING;
