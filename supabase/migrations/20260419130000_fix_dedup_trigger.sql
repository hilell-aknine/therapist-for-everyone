-- Fix: EXECUTE without INTO doesn't set FOUND. Use PERFORM or INTO variable instead.

CREATE OR REPLACE FUNCTION prevent_double_submit()
RETURNS TRIGGER AS $$
DECLARE
    existing_id UUID;
BEGIN
  IF NEW.phone IS NOT NULL AND NEW.phone != '' THEN
    EXECUTE format(
      'SELECT id FROM %I.%I WHERE phone = $1 AND created_at > NOW() - INTERVAL ''24 hours'' LIMIT 1',
      TG_TABLE_SCHEMA, TG_TABLE_NAME
    ) INTO existing_id USING NEW.phone;

    IF existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'duplicate_submission: phone % already exists in % within 24 hours (id=%)',
        NEW.phone, TG_TABLE_NAME, existing_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
