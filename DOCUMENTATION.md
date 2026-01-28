# תיעוד טכני - מטפל לכל אחד
> גרסה: 1.0 | תאריך עדכון: ינואר 2026

---

## תוכן עניינים
1. [סקירת הפרויקט](#סקירת-הפרויקט)
2. [מבנה הפרויקט](#מבנה-הפרויקט)
3. [טכנולוגיות](#טכנולוגיות)
4. [הגדרות Supabase](#הגדרות-supabase)
5. [סכמת מסד הנתונים](#סכמת-מסד-הנתונים)
6. [מערכת האימות](#מערכת-האימות)
7. [פיצ'רים מיושמים](#פיצרים-מיושמים)
8. [מדריך פתרון בעיות](#מדריך-פתרון-בעיות)
9. [משימות עתידיות](#משימות-עתידיות)

---

## סקירת הפרויקט

### מטרה
פרויקט חברתי להנגשת טיפול נפשי לכל אדם, במיוחד:
- פוסט טראומתיים
- הלומי קרב
- ניצולי נובה
- כל מי שאין לו יכולת כלכלית לטיפול

### חזון
להיות המרכז הגדול בישראל לטיפול וריפוי אנשים

### קהלי יעד
1. **מטופלים** - אנשים שמחפשים מטפל
2. **מטפלים/לומדים** - אנשים שרוצים ללמוד טיפול ולהתנדב

### כתובות
- **אתר**: https://hilell-aknine.github.io/therapist-for-everyone/
- **GitHub**: https://github.com/hilell-aknine/therapist-for-everyone
- **דומיין עתידי**: therapistforeveryone.com

---

## מבנה הפרויקט

```
מטפל-לכל-אחד/
├── .claude/
│   └── skills/
│       ├── branding/
│       │   └── README.md          # הנחיות מיתוג
│       └── youtube-playlist-to-website/
│           ├── README.md          # הוראות שימוש
│           └── scripts/
│               └── extract-playlist.js
├── database/
│   └── schema.sql                 # סכמת מסד הנתונים
├── scripts/
│   └── get-playlist.js
├── website/
│   ├── index.html                 # האתר הראשי
│   └── js/
│       └── supabase-client.js     # ספריית API ל-Supabase
├── חזון-הפרויקט.txt
├── מיתוג-הפרויקט.txt
├── ספר-מותג.txt
└── DOCUMENTATION.md               # קובץ זה
```

---

## טכנולוגיות

### Frontend
| טכנולוגיה | שימוש |
|-----------|-------|
| HTML5 | מבנה האתר |
| CSS3 | עיצוב (כולל CSS Variables, Flexbox, Grid) |
| JavaScript (Vanilla) | לוגיקה ואינטראקציות |
| Font Awesome 6.5.1 | אייקונים |
| Google Fonts (Heebo) | פונטים |

### Backend
| טכנולוגיה | שימוש |
|-----------|-------|
| Supabase | מסד נתונים + אימות |
| PostgreSQL | מסד הנתונים (דרך Supabase) |
| GitHub Pages | אחסון ו-Deploy |

### ספריות חיצוניות (CDN)
```html
<!-- Supabase JS Client -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- Font Awesome -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

<!-- Google Fonts -->
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
```

---

## הגדרות Supabase

### פרטי החיבור
```javascript
const SUPABASE_URL = 'https://eimcudmlfjlyxjyrdcgc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpbWN1ZG1sZmpseXhqeXJkY2djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTA5MDYsImV4cCI6MjA4NDk4NjkwNn0.ESXViZ0DZxopHxHNuC6vRn3iIZz1KZkQcXwgLhK_nQw';
```

### Dashboard
- **URL**: https://supabase.com/dashboard/project/eimcudmlfjlyxjyrdcgc
- **SQL Editor**: https://supabase.com/dashboard/project/eimcudmlfjlyxjyrdcgc/sql/new
- **Authentication**: https://supabase.com/dashboard/project/eimcudmlfjlyxjyrdcgc/auth/users
- **Table Editor**: https://supabase.com/dashboard/project/eimcudmlfjlyxjyrdcgc/editor

### איפוס מסד נתונים (במקרה חירום)
אם צריך ליצור מחדש את הטבלאות, הרץ את הקובץ:
```
database/schema.sql
```

---

## סכמת מסד הנתונים

### טבלת profiles
פרופילי משתמשים (נוצר אוטומטית בהרשמה)
```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY,           -- מקושר ל-auth.users
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    phone TEXT,
    role TEXT DEFAULT 'student',   -- admin/therapist/patient/student
    avatar_url TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

### טבלת therapists
מטפלים רשומים
```sql
CREATE TABLE therapists (
    id UUID PRIMARY KEY,
    user_id UUID,                  -- מקושר ל-profiles
    bio TEXT,
    specializations TEXT[],        -- מערך התמחויות
    experience_years INTEGER,
    is_active BOOLEAN,             -- מאושר לטפל
    is_verified BOOLEAN,
    rating DECIMAL(2,1),           -- דירוג 0-5
    total_reviews INTEGER,
    total_sessions INTEGER,
    monthly_hours_commitment INTEGER,
    available_days TEXT[],
    location TEXT,
    agreement_signed BOOLEAN,
    created_at TIMESTAMPTZ
);
```

### טבלת patients
מטופלים (שאלון התאמה)
```sql
CREATE TABLE patients (
    id UUID PRIMARY KEY,
    user_id UUID,                  -- מקושר ל-profiles
    age INTEGER,
    gender TEXT,
    occupation TEXT,               -- משמש גם לעיר מגורים
    main_concern TEXT,             -- סיבת הפנייה
    previous_therapy BOOLEAN,
    trauma_type TEXT[],
    preferred_therapist_gender TEXT,
    availability TEXT[],
    status TEXT,                   -- pending/matched/in_treatment/completed/cancelled
    assigned_therapist_id UUID,
    agreement_signed BOOLEAN,
    intake_completed BOOLEAN,
    created_at TIMESTAMPTZ
);
```

### טבלת appointments
פגישות
```sql
CREATE TABLE appointments (
    id UUID PRIMARY KEY,
    therapist_id UUID,
    patient_id UUID,
    scheduled_at TIMESTAMPTZ,
    duration_minutes INTEGER DEFAULT 50,
    status TEXT,                   -- scheduled/completed/cancelled/no_show
    location TEXT,
    notes TEXT,
    session_number INTEGER
);
```

### טבלת reviews
ביקורות ודירוגים
```sql
CREATE TABLE reviews (
    id UUID PRIMARY KEY,
    therapist_id UUID,
    patient_id UUID,
    appointment_id UUID,
    rating INTEGER,                -- 1-5
    feedback TEXT,
    is_anonymous BOOLEAN DEFAULT true
);
```

### טבלת course_progress
מעקב התקדמות בקורסים
```sql
CREATE TABLE course_progress (
    id UUID PRIMARY KEY,
    user_id UUID,
    course_type TEXT,              -- practitioner/master
    video_id TEXT,                 -- YouTube video ID
    lesson_number INTEGER,
    completed BOOLEAN,
    watched_seconds INTEGER,
    completed_at TIMESTAMPTZ,
    UNIQUE(user_id, video_id)
);
```

### טבלת contact_requests
בקשות יצירת קשר
```sql
CREATE TABLE contact_requests (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL,
    request_type TEXT,             -- patient/therapist/general
    message TEXT,
    status TEXT DEFAULT 'new',     -- new/contacted/resolved
    created_at TIMESTAMPTZ
);
```

### טבלת certifications
תעודות והסמכות
```sql
CREATE TABLE certifications (
    id UUID PRIMARY KEY,
    user_id UUID,
    certification_type TEXT,       -- practitioner/master
    exam_score INTEGER,
    passed BOOLEAN,
    issued_at TIMESTAMPTZ,
    certificate_url TEXT
);
```

### דיאגרמת קשרים
```
auth.users (Supabase)
    │
    ▼
profiles ─────────┬─────────────┬──────────────┬─────────────┐
    │             │             │              │             │
    ▼             ▼             ▼              ▼             ▼
therapists    patients    course_progress  certifications  contact_requests
    │             │
    └──────┬──────┘
           ▼
      appointments
           │
           ▼
        reviews
```

---

## מערכת האימות

### תהליך הרשמה
1. משתמש ממלא טופס (שם, אימייל, טלפון, סיסמה)
2. Supabase יוצר רשומה ב-`auth.users`
3. טריגר אוטומטי יוצר רשומה ב-`profiles`
4. משתמש מקבל אימייל אימות (אם מופעל)

### תהליך התחברות
1. משתמש מזין אימייל וסיסמה
2. Supabase מאמת ומחזיר session
3. UI מתעדכן להציג תפריט משתמש

### אפשרויות אימות
- **Email + Password** - פעיל
- **Google OAuth** - צריך להפעיל ב-Supabase

### פונקציות אימות עיקריות
```javascript
// התחברות
supabaseClient.auth.signInWithPassword({ email, password })

// הרשמה
supabaseClient.auth.signUp({ email, password, options: { data: { full_name } } })

// התנתקות
supabaseClient.auth.signOut()

// קבלת משתמש נוכחי
supabaseClient.auth.getUser()

// מעקב שינויי אימות
supabaseClient.auth.onAuthStateChange((event, session) => { })
```

---

## פיצ'רים מיושמים

### 1. מערכת הרשמה והתחברות
- **קבצים**: `website/index.html` (שורות 1892-1961, 2339-2475)
- **UI**: מודל עם טפסי Login/Signup
- **תכונות**:
  - הרשמה עם שם, אימייל, טלפון, סיסמה
  - התחברות עם אימייל וסיסמה
  - כפתור Google (דורש הגדרה נוספת)
  - תפריט משתמש לאחר התחברות

### 2. שאלון התאמה למטופלים
- **קבצים**: `website/index.html` (שורות 1963-2050, 3166-3312)
- **שדות**:
  - עיר מגורים (Dropdown + אפשרות "אחר")
  - מספר טלפון (חובה)
  - סיבת הפנייה (חובה)
  - העדפת מגדר מטפל (אופציונלי)
- **לוגיקה**:
  - רק למשתמשים מחוברים
  - בדיקה אם כבר שלח בקשה
  - שמירה ל-patients + contact_requests

### 3. מעקב התקדמות קורסים
- **קבצים**: `website/index.html` (שורות 2932-3020)
- **תכונות**:
  - סימון V על סרטונים שנצפו
  - Progress bar להתקדמות
  - שמירה אוטומטית ל-Supabase

### 4. קורסי וידאו
- **NLP Practitioner**: 51 סרטונים ב-10 שיעורים
- **NLP Master**: בקרוב
- **מודל וידאו**: פופאפ עם iframe של YouTube

---

## מדריך פתרון בעיות

### בעיה: משתמשים לא יכולים להירשם
**פתרון:**
1. בדוק ב-Supabase Dashboard > Authentication > Settings
2. ודא ש-"Enable Email Signup" מופעל
3. בדוק את RLS policies על טבלת profiles

### בעיה: שגיאת "new row violates row-level security"
**פתרון:**
הרץ את ה-SQL הבא:
```sql
-- אפשר למשתמשים ליצור רשומות patients
CREATE POLICY "Users can insert own patient data" ON patients
    FOR INSERT WITH CHECK (user_id = auth.uid());
```

### בעיה: שאלון לא נשמר
**פתרון:**
1. בדוק ש-user_id לא null
2. בדוק שהטבלה patients קיימת
3. בדוק את הקונסול לשגיאות

### בעיה: התקדמות קורסים לא נשמרת
**פתרון:**
הרץ:
```sql
CREATE POLICY "Users can manage own progress" ON course_progress
    FOR ALL USING (user_id = auth.uid());
```

### בעיה: Google Login לא עובד
**פתרון:**
1. לך ל-Supabase > Authentication > Providers
2. הפעל Google
3. הגדר Client ID ו-Secret מ-Google Cloud Console
4. הוסף את ה-Redirect URL מ-Supabase ל-Google

### איפוס מלא (אחרון!)
אם שום דבר לא עובד:
```sql
-- מחק את כל הטבלאות
DROP TABLE IF EXISTS certifications CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS course_progress CASCADE;
DROP TABLE IF EXISTS contact_requests CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS therapists CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- הרץ מחדש את schema.sql
```

---

## משימות עתידיות

### בתכנון קרוב
- [ ] אזור אישי למשתמש (Dashboard)
- [ ] פאנל ניהול למנהלים
- [ ] מערכת התאמה אוטומטית מטפל-מטופל
- [ ] תזכורות WhatsApp/SMS
- [ ] מערכת קביעת פגישות

### לטווח ארוך
- [ ] אפליקציית מובייל
- [ ] מערכת תשלומים (לסדנאות)
- [ ] וידאו צ'אט מובנה
- [ ] AI לניתוח שאלונים

---

## יצירת קשר טכני

לשאלות או בעיות טכניות:
- **וואטסאפ**: 054-911-6092
- **GitHub Issues**: https://github.com/hilell-aknine/therapist-for-everyone/issues

---

## מיתוג מהיר

### צבעים
```css
--deep-petrol: #003B46;
--muted-teal: #00606B;
--dusty-aqua: #2F8592;
--frost-white: #E8F1F2;
--gold: #D4AF37;
```

### פונט
```css
font-family: 'Heebo', sans-serif;
```

### סלוגן
> "ריפוי הנפש לכל אדם"

---

*מסמך זה נוצר כחלק מפרויקט "מטפל לכל אחד" ומיועד לשימוש פנימי של צוות הפיתוח.*
