-- Normalize UTM sources: fb→facebook, ig→instagram, meta→facebook
-- One-time cleanup of existing data

UPDATE lead_attribution SET first_utm_source = 'facebook'  WHERE first_utm_source IN ('fb', 'meta');
UPDATE lead_attribution SET first_utm_source = 'instagram' WHERE first_utm_source = 'ig';
UPDATE lead_attribution SET last_utm_source  = 'facebook'  WHERE last_utm_source  IN ('fb', 'meta');
UPDATE lead_attribution SET last_utm_source  = 'instagram' WHERE last_utm_source  = 'ig';

-- Also normalize in the original tables for consistency
UPDATE patients          SET utm_source = 'facebook'  WHERE utm_source IN ('fb', 'meta');
UPDATE patients          SET utm_source = 'instagram' WHERE utm_source = 'ig';
UPDATE therapists        SET utm_source = 'facebook'  WHERE utm_source IN ('fb', 'meta');
UPDATE therapists        SET utm_source = 'instagram' WHERE utm_source = 'ig';
UPDATE contact_requests  SET utm_source = 'facebook'  WHERE utm_source IN ('fb', 'meta');
UPDATE contact_requests  SET utm_source = 'instagram' WHERE utm_source = 'ig';
UPDATE profiles          SET utm_source = 'facebook'  WHERE utm_source IN ('fb', 'meta');
UPDATE profiles          SET utm_source = 'instagram' WHERE utm_source = 'ig';
UPDATE portal_questionnaires SET utm_source = 'facebook'  WHERE utm_source IN ('fb', 'meta');
UPDATE portal_questionnaires SET utm_source = 'instagram' WHERE utm_source = 'ig';
