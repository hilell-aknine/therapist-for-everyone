UPDATE public.courses SET
    title = 'יסודות ה-NLP',
    description = 'למדו את עולם ה-NLP מאפס — מהי תכנות עצבי-לשוני, איך המוח עובד, ואיך אפשר להשתמש בזה בחיים. קורס חינמי ומלא, פתוח לכולם.'
WHERE slug = 'nlp-practitioner';

UPDATE public.courses SET
    title = 'NLP מתקדם — מאסטר',
    description = 'העמקה ברמה אחרת: עבודה עם טראומה, שינוי אמונות מגבילות ודפוסים עמוקים. קורס בלעדי לתלמידי ההכשרה.',
    status = 'locked',
    duration_text = 'לתלמידי ההכשרה בלבד'
WHERE slug = 'nlp-master';

UPDATE public.courses SET
    title = 'תקשורת רגשית ושכנוע',
    description = 'איך ליצור מסרים שנוגעים באנשים ומניעים לפעולה — בטיפול, בשיווק ובחיים. קורס בלעדי לתלמידי ההכשרה.',
    status = 'locked',
    duration_text = 'לתלמידי ההכשרה בלבד'
WHERE slug = 'emotional-messaging';
