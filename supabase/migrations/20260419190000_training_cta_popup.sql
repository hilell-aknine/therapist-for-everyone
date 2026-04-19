-- Training CTA popup: shows after 5 completed lessons for free users
INSERT INTO public.popup_configs (popup_id, title, message, category, priority, is_active,
    max_per_day, cooldown_minutes, target_audience, trigger_event, trigger_min_lessons)
VALUES ('training_cta', 'הנעה לתוכנית הכשרה', 'פופאפ עדין אחרי 5 שיעורים — מעודד להעמיק', 'engagement', 3, true,
    1, 1440, 'free_user', 'lesson_complete', 5)
ON CONFLICT (popup_id) DO NOTHING;
