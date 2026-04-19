-- Fix ai_questionnaire popup audience: should be free_user (not authenticated)
-- This way admin and paid_customer won't see it
UPDATE public.popup_configs
SET target_audience = 'free_user'
WHERE popup_id = 'ai_questionnaire';
