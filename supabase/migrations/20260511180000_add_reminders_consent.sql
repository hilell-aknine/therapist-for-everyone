-- Add WhatsApp reminder consent to portal questionnaire
-- NULL = old records (not asked), TRUE = opted in, FALSE = opted out
ALTER TABLE portal_questionnaires
  ADD COLUMN IF NOT EXISTS whatsapp_reminders_consent BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN portal_questionnaires.whatsapp_reminders_consent IS
  'NULL = pre-feature record, TRUE = opted in to weekly reminders, FALSE = declined';

-- Add opt-out flag to profiles (set when user replies "הסר" to a WhatsApp reminder)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN profiles.whatsapp_opt_out IS
  'TRUE = user actively opted out via WhatsApp reply "הסר". Reset to FALSE on "חזרה".';
