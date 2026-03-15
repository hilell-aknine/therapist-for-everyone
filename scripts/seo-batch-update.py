"""
SEO Batch Update Script
Adds canonical tags, Twitter meta tags, JSON-LD schemas, and missing meta descriptions
to all public HTML pages. Only modifies <head> section — zero changes to <body>.
"""

import os
import re
import json

BASE_URL = "https://www.therapist-home.com"
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ============================================================
# PAGE DEFINITIONS — canonical URL, meta desc, OG, schema type
# ============================================================

PAGES = {
    # ── Root pages ──
    "index.html": {
        "canonical": "/",
        "desc": "בית המטפלים הוא המרכז המוביל בישראל להכשרת מטפלים מוסמכים בקורסים מקצועיים ומקיפים. בנוסף, אנו מפעילים מיזם חברתי המנגיש טיפולי נפש לכל אדם.",
        "og_title": "בית המטפלים — ריפוי הנפש לכל אדם",
        "og_desc": "מיזם חברתי — 10 מפגשים טיפוליים בחינם, קורס NLP Practitioner בחינם והכשרת מטפלים מוסמכים",
        "schemas": ["Organization", "WebSite"],
        "breadcrumbs": None,
    },
    "landing-patient.html": {
        "canonical": "/landing-patient.html",
        "desc": "מלאו טופס קצר ונתאים לכם מטפל מקצועי בחינם. עד 10 מפגשי טיפול ללא עלות עם מטפלים מוסמכים.",
        "og_title": "הרשמה לטיפול — בית המטפלים",
        "og_desc": "מלאו טופס קצר ונתאים לכם מטפל מקצועי בחינם",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("הרשמה לטיפול", "/landing-patient.html")],
    },
    "landing-therapist.html": {
        "canonical": "/landing-therapist.html",
        "desc": "הצטרפו לקהילת המטפלים של בית המטפלים. עזרו לאנשים שצריכים טיפול נפשי ותרמו מהניסיון שלכם.",
        "og_title": "הצטרפות כמטפל — בית המטפלים",
        "og_desc": "הצטרפו לקהילת המטפלים שלנו ועזרו לאנשים שצריכים",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("הצטרפות כמטפל", "/landing-therapist.html")],
    },
    "privacy-policy.html": {
        "canonical": "/privacy-policy.html",
        "desc": "מדיניות הפרטיות של בית המטפלים — מידע על איסוף נתונים, שימוש בעוגיות וזכויות המשתמשים.",
        "og_title": "מדיניות פרטיות — בית המטפלים",
        "og_desc": "מדיניות הפרטיות של בית המטפלים",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("מדיניות פרטיות", "/privacy-policy.html")],
    },
    "thank-you.html": {
        "canonical": "/thank-you.html",
        "desc": "תודה שפניתם לבית המטפלים. ניצור אתכם קשר בהקדם.",
        "og_title": "תודה! — בית המטפלים",
        "og_desc": "תודה שפניתם אלינו — ניצור קשר בהקדם",
        "schemas": [],
        "breadcrumbs": None,
    },
    "legal-gate.html": {
        "canonical": "/legal-gate.html",
        "desc": "תקנון ותנאי שימוש של בית המטפלים. קראו ואשרו את התנאים לפני כניסה למערכת.",
        "og_title": "תקנון ותנאי שימוש — בית המטפלים",
        "og_desc": "תנאי שימוש ותקנון השירות של בית המטפלים",
        "schemas": [],
        "breadcrumbs": None,
    },
    "patient-dashboard.html": {
        "canonical": "/patient-dashboard.html",
        "desc": "האזור האישי שלך בבית המטפלים — מעקב טיפולים, מסמכים ותקשורת עם המטפל.",
        "og_title": "האזור האישי — בית המטפלים",
        "og_desc": "האזור האישי שלך בבית המטפלים",
        "schemas": [],
        "breadcrumbs": None,
    },
    "therapist-dashboard.html": {
        "canonical": "/therapist-dashboard.html",
        "desc": "המשרד שלך בבית המטפלים — ניהול מטופלים, תיעוד מפגשים וכלים מקצועיים.",
        "og_title": "המשרד שלי — בית המטפלים",
        "og_desc": "המשרד שלך בבית המטפלים — ניהול מטופלים",
        "schemas": [],
        "breadcrumbs": None,
    },

    # ── Pages directory ──
    "pages/about.html": {
        "canonical": "/pages/about.html",
        "desc": "הסיפור האישי מאחורי בית המטפלים — רם והילל מספרים איך הכל התחיל",
        "og_title": "עלינו — בית המטפלים",
        "og_desc": "הכירו את הצוות מאחורי בית המטפלים — קהילה שמנגישה ריפוי לכל אדם",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("עלינו", "/pages/about.html")],
    },
    "pages/courses.html": {
        "canonical": "/pages/courses.html",
        "desc": "קורס NLP Practitioner מלא בחינם — 51 שיעורים ב-7 מודולים. תוכניות הכשרה מתקדמות לבוגרים.",
        "og_title": "הכשרות — בית המטפלים",
        "og_desc": "קורס NLP Practitioner מלא בחינם — 51 שיעורים ב-7 מודולים",
        "schemas": ["Course"],
        "breadcrumbs": [("דף הבית", "/"), ("הכשרות", "/pages/courses.html")],
    },
    "pages/training.html": {
        "canonical": "/pages/training.html",
        "desc": "הכשרה מקצועית מלאה ל-NLP Practitioner ו-NLP Master עם הסמכה בינלאומית",
        "og_title": "הכשרת מטפלים — בית המטפלים",
        "og_desc": "הכשרה מקצועית ב-NLP עם הסמכה בינלאומית, ליווי אישי וקהילה תומכת",
        "schemas": ["Course"],
        "breadcrumbs": [("דף הבית", "/"), ("הכשרת מטפלים", "/pages/training.html")],
    },
    "pages/course-library.html": {
        "canonical": "/pages/course-library.html",
        "desc": "ספריית הקורסים של בית המטפלים — צפו בשיעורים, עקבו אחרי ההתקדמות ולמדו NLP בחינם.",
        "og_title": "ספריית הקורסים — בית המטפלים",
        "og_desc": "ספריית הקורסים של בית המטפלים — למדו NLP בחינם",
        "schemas": ["Course"],
        "breadcrumbs": [("דף הבית", "/"), ("ספריית הקורסים", "/pages/course-library.html")],
    },
    "pages/learning-booklets.html": {
        "canonical": "/pages/learning-booklets.html",
        "desc": "חוברות הקורס NLP Practitioner — חומרי לימוד, סיכומים ואינפוגרפיקות מלוות לקורס.",
        "og_title": "חוברות הקורס — בית המטפלים",
        "og_desc": "חוברות הקורס NLP Practitioner — חומרי לימוד וסיכומים",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("ספריית הקורסים", "/pages/course-library.html"), ("חוברות הקורס", "/pages/learning-booklets.html")],
    },
    "pages/learning-master.html": {
        "canonical": "/pages/learning-master.html",
        "desc": "תמלולי קורס NLP Master — חומרי לימוד מתקדמים לתוכנית ההכשרה המקצועית.",
        "og_title": "תמלולי קורס מאסטר — בית המטפלים",
        "og_desc": "תמלולי קורס NLP Master — תוכנית הכשרה מתקדמת",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("ספריית הקורסים", "/pages/course-library.html"), ("קורס מאסטר", "/pages/learning-master.html")],
    },
    "pages/free-portal.html": {
        "canonical": "/pages/free-portal.html",
        "desc": "פורטל הלמידה של בית המטפלים — שילוב עוצמתי של ידע מקצועי, טכנולוגיית AI מתקדמת וחוויית למידה משחקית.",
        "og_title": "פורטל הלמידה של בית המטפלים — הכשרת NLP Practitioner",
        "og_desc": "שילוב עוצמתי של ידע מקצועי, טכנולוגיית AI מתקדמת וחוויית למידה משחקית. הירשמו עכשיו — בחינם",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("פורטל הלמידה", "/pages/free-portal.html")],
    },
    "pages/accessibility.html": {
        "canonical": "/pages/accessibility.html",
        "desc": "הצהרת הנגישות של בית המטפלים — מחויבותנו להנגשת השירות לכל אדם.",
        "og_title": "הצהרת נגישות — בית המטפלים",
        "og_desc": "הצהרת הנגישות של בית המטפלים",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("הצהרת נגישות", "/pages/accessibility.html")],
    },
    "pages/login.html": {
        "canonical": "/pages/login.html",
        "desc": "התחברות למערכת בית המטפלים — כניסה לאזור האישי.",
        "og_title": "התחברות — בית המטפלים",
        "og_desc": "התחברות למערכת בית המטפלים",
        "schemas": [],
        "breadcrumbs": None,
    },
    "pages/profile.html": {
        "canonical": "/pages/profile.html",
        "desc": "האזור האישי שלך בבית המטפלים — סטטיסטיקות, מחברת אישית והתקדמות בקורס.",
        "og_title": "האזור האישי — בית המטפלים",
        "og_desc": "האזור האישי שלך בבית המטפלים",
        "schemas": [],
        "breadcrumbs": None,
    },
    "pages/admin.html": {
        "canonical": "/pages/admin.html",
        "desc": "פאנל ניהול בית המטפלים — ניהול מטופלים, מטפלים ושיבוצים.",
        "og_title": "פאנל ניהול — בית המטפלים",
        "og_desc": "פאנל ניהול בית המטפלים",
        "schemas": [],
        "breadcrumbs": None,
    },
    "pages/registration.html": {
        "canonical": "/pages/registration.html",
        "desc": "השאירו פרטים ונחזור אליכם — הרשמה לטיפול נפשי בחינם בבית המטפלים.",
        "og_title": "השאירו פרטים — בית המטפלים",
        "og_desc": "השאירו פרטים ונחזור אליכם — טיפול נפשי בחינם",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("השאירו פרטים", "/pages/registration.html")],
    },
    "pages/questionnaire.html": {
        "canonical": "/pages/questionnaire.html",
        "desc": "שאלון התאמה אישית — עזרו לנו להתאים לכם את המטפל המושלם.",
        "og_title": "שאלון התאמה — בית המטפלים",
        "og_desc": "שאלון התאמה אישית למציאת מטפל מתאים",
        "schemas": [],
        "breadcrumbs": None,
    },
    "pages/questionnaire-form.html": {
        "canonical": "/pages/questionnaire-form.html",
        "desc": "שאלון אבחון ראשוני — עזרו לנו להבין את הצרכים שלכם.",
        "og_title": "שאלון אבחון — בית המטפלים",
        "og_desc": "שאלון אבחון ראשוני לבית המטפלים",
        "schemas": [],
        "breadcrumbs": None,
    },
    "pages/nlp-game.html": {
        "canonical": "/pages/nlp-game.html",
        "desc": "משחק NLP אינטראקטיבי — בחנו את הידע שלכם בתכנות עצבי-לשוני בדרך כיפית.",
        "og_title": "משחק NLP — בית המטפלים",
        "og_desc": "משחק NLP אינטראקטיבי — בחנו את הידע שלכם",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("ספריית הקורסים", "/pages/course-library.html"), ("משחק NLP", "/pages/nlp-game.html")],
    },
    "pages/master-practice.html": {
        "canonical": "/pages/master-practice.html",
        "desc": "תרגול מתקדם — כלי תרגול NLP Master עם תרחישים אינטראקטיביים.",
        "og_title": "תרגול מאסטר — בית המטפלים",
        "og_desc": "תרגול NLP Master מתקדם עם תרחישים אינטראקטיביים",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("קורס מאסטר", "/pages/learning-master.html"), ("תרגול", "/pages/master-practice.html")],
    },
    "pages/project-lobby.html": {
        "canonical": "/pages/project-lobby.html",
        "desc": "לובי הפרויקטים של בית המטפלים — כל השירותים במקום אחד.",
        "og_title": "לובי הפרויקטים — בית המטפלים",
        "og_desc": "לובי הפרויקטים של בית המטפלים",
        "schemas": [],
        "breadcrumbs": None,
    },
    "pages/patient-intro.html": {
        "canonical": "/pages/patient-intro.html",
        "desc": "מידע למטופלים על תהליך ההרשמה לטיפול בחינם בבית המטפלים.",
        "og_title": "מידע למטופלים — בית המטפלים",
        "og_desc": "מידע למטופלים על תהליך ההרשמה לטיפול",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("מידע למטופלים", "/pages/patient-intro.html")],
    },
    "pages/join-therapist.html": {
        "canonical": "/pages/join-therapist.html",
        "desc": "הצטרפו כמטפלים לבית המטפלים — עזרו לאנשים שזקוקים לטיפול נפשי.",
        "og_title": "הצטרפות כמטפל — בית המטפלים",
        "og_desc": "הצטרפו כמטפלים וסייעו לאנשים שצריכים",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("הצטרפות כמטפל", "/pages/join-therapist.html")],
    },

    # ── Patient/Therapist Steps ──
    "pages/patient-step1.html": {
        "canonical": "/pages/patient-step1.html",
        "desc": "שלב 1 — סינון והיכרות ראשונית בתהליך ההרשמה לטיפול בבית המטפלים.",
        "og_title": "שלב 1 — סינון והיכרות | בית המטפלים",
        "og_desc": "שלב 1 בתהליך ההרשמה לטיפול",
        "schemas": [],
        "breadcrumbs": None,
    },
    "pages/patient-step2.html": {
        "canonical": "/pages/patient-step2.html",
        "desc": "שלב 2 — פרטים אישיים בתהליך ההרשמה לטיפול בבית המטפלים.",
        "og_title": "שלב 2 — פרטים אישיים | בית המטפלים",
        "og_desc": "שלב 2 בתהליך ההרשמה לטיפול",
        "schemas": [],
        "breadcrumbs": None,
    },
    "pages/patient-step3.html": {
        "canonical": "/pages/patient-step3.html",
        "desc": "שלב 3 — העדפות טיפול בתהליך ההרשמה לטיפול בבית המטפלים.",
        "og_title": "שלב 3 — העדפות טיפול | בית המטפלים",
        "og_desc": "שלב 3 בתהליך ההרשמה לטיפול",
        "schemas": [],
        "breadcrumbs": None,
    },
    "pages/patient-step4.html": {
        "canonical": "/pages/patient-step4.html",
        "desc": "שלב 4 — אישור תנאים וסיום ההרשמה לטיפול בבית המטפלים.",
        "og_title": "שלב 4 — אישור ושליחה | בית המטפלים",
        "og_desc": "שלב 4 — סיום ההרשמה לטיפול",
        "schemas": [],
        "breadcrumbs": None,
    },
    "pages/therapist-step1.html": {
        "canonical": "/pages/therapist-step1.html",
        "desc": "שלב 1 — פרטים אישיים בתהליך הצטרפות כמטפל לבית המטפלים.",
        "og_title": "שלב 1 — פרטים אישיים | בית המטפלים",
        "og_desc": "שלב 1 בתהליך ההצטרפות כמטפל",
        "schemas": [],
        "breadcrumbs": None,
    },
    "pages/therapist-step2.html": {
        "canonical": "/pages/therapist-step2.html",
        "desc": "שלב 2 — ניסיון מקצועי בתהליך הצטרפות כמטפל לבית המטפלים.",
        "og_title": "שלב 2 — ניסיון מקצועי | בית המטפלים",
        "og_desc": "שלב 2 בתהליך ההצטרפות כמטפל",
        "schemas": [],
        "breadcrumbs": None,
    },
    "pages/therapist-step3.html": {
        "canonical": "/pages/therapist-step3.html",
        "desc": "שלב 3 — תעודות והסמכות בתהליך הצטרפות כמטפל לבית המטפלים.",
        "og_title": "שלב 3 — תעודות והסמכות | בית המטפלים",
        "og_desc": "שלב 3 בתהליך ההצטרפות כמטפל",
        "schemas": [],
        "breadcrumbs": None,
    },
    "pages/therapist-step4.html": {
        "canonical": "/pages/therapist-step4.html",
        "desc": "שלב 4 — אישור ושליחת טופס ההצטרפות כמטפל בבית המטפלים.",
        "og_title": "שלב 4 — אישור ושליחה | בית המטפלים",
        "og_desc": "שלב 4 — סיום ההצטרפות כמטפל",
        "schemas": [],
        "breadcrumbs": None,
    },

    # ── Summaries (NLP Practitioner) ──
    "pages/summaries/index.html": {
        "canonical": "/pages/summaries/index.html",
        "desc": "סיכומי שיעורים של קורס NLP Practitioner — כל השיעורים עם נקודות מפתח וסיכומים מקצועיים.",
        "og_title": "סיכומי שיעורים — NLP Practitioner | בית המטפלים",
        "og_desc": "סיכומי שיעורים של קורס NLP Practitioner",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("ספריית הקורסים", "/pages/course-library.html"), ("סיכומי שיעורים", "/pages/summaries/index.html")],
    },
}

# Add lesson summaries 1-7
LESSON_TITLES = {
    1: "מבוא ל-NLP ויסודות",
    2: "עוגנים ומצבי משאב",
    3: "מערכות ייצוג ו-VAK",
    4: "מטא-מודל ודיוק שפתי",
    5: "ריפריימינג — מיסגור מחדש",
    6: "אסטרטגיות וסאב-מודאליטיס",
    7: "קווי זמן ושינוי היסטוריה אישית",
}
for i, title in LESSON_TITLES.items():
    PAGES[f"pages/summaries/lesson-{i}.html"] = {
        "canonical": f"/pages/summaries/lesson-{i}.html",
        "desc": f"סיכום שיעור {i} — {title}. קורס NLP Practitioner בבית המטפלים.",
        "og_title": f"סיכום שיעור {i} — {title} | בית המטפלים",
        "og_desc": f"סיכום שיעור {i} בקורס NLP Practitioner — {title}",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("סיכומי שיעורים", "/pages/summaries/index.html"), (f"שיעור {i}", f"/pages/summaries/lesson-{i}.html")],
    }

# Add master lesson summaries 1-7
MASTER_TITLES = {
    1: "מבוא למאסטר ורמות לוגיות",
    2: "דפוסי שפה מתקדמים",
    3: "סליגמן ושינוי אמונות",
    4: "מודלים טיפוליים מתקדמים",
    5: "עבודה עם חלקים",
    6: "אסטרטגיות שינוי מתקדמות",
    7: "אינטגרציה וסיום",
}

PAGES["pages/summaries-master/index.html"] = {
    "canonical": "/pages/summaries-master/index.html",
    "desc": "סיכומי שיעורים של קורס NLP Master — תוכנית הכשרה מתקדמת בבית המטפלים.",
    "og_title": "סיכומי שיעורים — NLP Master | בית המטפלים",
    "og_desc": "סיכומי שיעורים של קורס NLP Master",
    "schemas": [],
    "breadcrumbs": [("דף הבית", "/"), ("קורס מאסטר", "/pages/learning-master.html"), ("סיכומי שיעורים", "/pages/summaries-master/index.html")],
}

for i, title in MASTER_TITLES.items():
    PAGES[f"pages/summaries-master/master-lesson-{i}.html"] = {
        "canonical": f"/pages/summaries-master/master-lesson-{i}.html",
        "desc": f"סיכום מפגש {i} — {title}. קורס NLP Master בבית המטפלים.",
        "og_title": f"מפגש {i} — {title} | בית המטפלים",
        "og_desc": f"סיכום מפגש {i} בקורס NLP Master — {title}",
        "schemas": [],
        "breadcrumbs": [("דף הבית", "/"), ("סיכומי מאסטר", "/pages/summaries-master/index.html"), (f"מפגש {i}", f"/pages/summaries-master/master-lesson-{i}.html")],
    }


# ============================================================
# JSON-LD SCHEMA GENERATORS
# ============================================================

def make_organization_schema():
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "בית המטפלים",
        "alternateName": "Therapist Home",
        "url": BASE_URL,
        "logo": f"{BASE_URL}/assets/logo.png",
        "description": "מיזם חברתי להנגשת טיפול נפשי לכל אדם בישראל. הכשרת מטפלים מוסמכים בקורסי NLP Practitioner ו-Master.",
        "foundingDate": "2025",
        "areaServed": {
            "@type": "Country",
            "name": "Israel"
        },
        "knowsLanguage": "he",
        "sameAs": [],
        "contactPoint": {
            "@type": "ContactPoint",
            "contactType": "customer service",
            "availableLanguage": "Hebrew",
            "url": f"{BASE_URL}/pages/registration.html"
        }
    }


def make_website_schema():
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "בית המטפלים",
        "alternateName": "Therapist Home",
        "url": BASE_URL,
        "inLanguage": "he",
        "description": "המרכז המוביל בישראל להכשרת מטפלים מוסמכים ולהנגשת טיפול נפשי לכל אדם",
        "publisher": {
            "@type": "Organization",
            "name": "בית המטפלים",
            "logo": {
                "@type": "ImageObject",
                "url": f"{BASE_URL}/assets/logo.png"
            }
        }
    }


def make_course_schema(page_key):
    if page_key == "pages/training.html":
        return {
            "@context": "https://schema.org",
            "@type": "Course",
            "name": "הכשרת NLP Practitioner & Master",
            "description": "הכשרה מקצועית מלאה ל-NLP Practitioner ו-NLP Master עם הסמכה בינלאומית, ליווי אישי וקהילה תומכת",
            "provider": {
                "@type": "Organization",
                "name": "בית המטפלים",
                "url": BASE_URL
            },
            "inLanguage": "he",
            "isAccessibleForFree": True,
            "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "ILS",
                "availability": "https://schema.org/InStock",
                "url": f"{BASE_URL}/pages/training.html"
            },
            "hasCourseInstance": {
                "@type": "CourseInstance",
                "courseMode": "online",
                "courseWorkload": "PT70H"
            }
        }
    elif page_key == "pages/courses.html":
        return {
            "@context": "https://schema.org",
            "@type": "Course",
            "name": "קורס NLP Practitioner",
            "description": "קורס NLP Practitioner מלא בחינם — 51 שיעורים ב-7 מודולים",
            "provider": {
                "@type": "Organization",
                "name": "בית המטפלים",
                "url": BASE_URL
            },
            "inLanguage": "he",
            "isAccessibleForFree": True,
            "numberOfCredits": "51",
            "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "ILS",
                "availability": "https://schema.org/InStock"
            }
        }
    elif page_key == "pages/course-library.html":
        return {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "name": "ספריית הקורסים — בית המטפלים",
            "description": "ספריית הקורסים של בית המטפלים — צפו בשיעורים ולמדו NLP בחינם",
            "numberOfItems": 51,
            "itemListElement": [
                {
                    "@type": "Course",
                    "name": "NLP Practitioner",
                    "description": "קורס NLP Practitioner מלא — 51 שיעורים ב-7 מודולים",
                    "provider": {"@type": "Organization", "name": "בית המטפלים"},
                    "isAccessibleForFree": True,
                    "inLanguage": "he"
                }
            ]
        }


def make_breadcrumb_schema(breadcrumbs):
    items = []
    for i, (name, url) in enumerate(breadcrumbs, 1):
        items.append({
            "@type": "ListItem",
            "position": i,
            "name": name,
            "item": f"{BASE_URL}{url}"
        })
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": items
    }


# ============================================================
# HTML INJECTION LOGIC
# ============================================================

def build_seo_block(page_key, page_info):
    """Build the SEO HTML block to inject before </head>"""
    lines = []
    lines.append("")
    lines.append("    <!-- === SEO Tags (auto-generated) === -->")

    # 1. Canonical
    canonical_url = BASE_URL + page_info["canonical"]
    lines.append(f'    <link rel="canonical" href="{canonical_url}">')

    # 2. Twitter meta tags
    lines.append(f'    <meta name="twitter:card" content="summary_large_image">')
    lines.append(f'    <meta name="twitter:title" content="{page_info["og_title"]}">')
    lines.append(f'    <meta name="twitter:description" content="{page_info["og_desc"]}">')
    lines.append(f'    <meta name="twitter:image" content="{BASE_URL}/assets/logo.png">')

    # 3. JSON-LD schemas
    schemas_to_add = []

    # Schema types based on page definition
    for schema_type in page_info.get("schemas", []):
        if schema_type == "Organization":
            schemas_to_add.append(make_organization_schema())
        elif schema_type == "WebSite":
            schemas_to_add.append(make_website_schema())
        elif schema_type == "Course":
            schemas_to_add.append(make_course_schema(page_key))

    # Breadcrumbs
    if page_info.get("breadcrumbs"):
        schemas_to_add.append(make_breadcrumb_schema(page_info["breadcrumbs"]))

    for schema in schemas_to_add:
        json_str = json.dumps(schema, ensure_ascii=False, indent=4)
        lines.append(f'    <script type="application/ld+json">')
        # Indent the JSON properly
        for json_line in json_str.split("\n"):
            lines.append(f"    {json_line}")
        lines.append(f'    </script>')

    lines.append("    <!-- === /SEO Tags === -->")

    return "\n".join(lines)


def has_existing_seo(content):
    """Check if SEO tags were already injected"""
    return "<!-- === SEO Tags (auto-generated) === -->" in content


def has_existing_tag(content, tag_pattern):
    """Check if a specific tag already exists"""
    return bool(re.search(tag_pattern, content, re.IGNORECASE))


def add_missing_meta(content, page_info):
    """Add missing meta description and OG tags if not present (in <head> only)"""
    head_match = re.search(r'(<head[^>]*>)(.*?)(</head>)', content, re.DOTALL | re.IGNORECASE)
    if not head_match:
        return content

    head_content = head_match.group(2)
    insertions = []

    # Add meta description if missing
    if not re.search(r'<meta\s+name=["\']description["\']', head_content, re.IGNORECASE):
        insertions.append(f'    <meta name="description" content="{page_info["desc"]}">')

    # Add OG tags if missing
    if not re.search(r'<meta\s+property=["\']og:title["\']', head_content, re.IGNORECASE):
        insertions.append(f'    <meta property="og:title" content="{page_info["og_title"]}">')
    if not re.search(r'<meta\s+property=["\']og:description["\']', head_content, re.IGNORECASE):
        insertions.append(f'    <meta property="og:description" content="{page_info["og_desc"]}">')
    if not re.search(r'<meta\s+property=["\']og:type["\']', head_content, re.IGNORECASE):
        insertions.append(f'    <meta property="og:type" content="website">')
    if not re.search(r'<meta\s+property=["\']og:url["\']', head_content, re.IGNORECASE):
        canonical_url = BASE_URL + page_info["canonical"]
        insertions.append(f'    <meta property="og:url" content="{canonical_url}">')
    if not re.search(r'<meta\s+property=["\']og:image["\']', head_content, re.IGNORECASE):
        insertions.append(f'    <meta property="og:image" content="{BASE_URL}/assets/logo.png">')
    if not re.search(r'<meta\s+property=["\']og:locale["\']', head_content, re.IGNORECASE):
        insertions.append(f'    <meta property="og:locale" content="he_IL">')

    if insertions:
        # Insert after the <title> tag
        title_match = re.search(r'(</title>)', content, re.IGNORECASE)
        if title_match:
            insert_pos = title_match.end()
            insertion_text = "\n" + "\n".join(insertions)
            content = content[:insert_pos] + insertion_text + content[insert_pos:]

    return content


def process_file(page_key, page_info):
    """Process a single HTML file"""
    filepath = os.path.join(PROJECT_DIR, page_key)

    if not os.path.exists(filepath):
        print(f"  SKIP (not found): {page_key}")
        return False

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Skip redirects (meta refresh or JS redirect only pages)
    if '<meta http-equiv="refresh"' in content and len(content) < 500:
        print(f"  SKIP (redirect): {page_key}")
        return False
    if 'window.location.href' in content and len(content) < 500:
        print(f"  SKIP (redirect): {page_key}")
        return False

    # Skip if already processed
    if has_existing_seo(content):
        print(f"  SKIP (already done): {page_key}")
        return False

    # Step 1: Add missing meta/OG tags
    content = add_missing_meta(content, page_info)

    # Step 2: Build SEO block (canonical + twitter + schemas)
    seo_block = build_seo_block(page_key, page_info)

    # Step 3: Insert before </head>
    head_close = content.find("</head>")
    if head_close == -1:
        print(f"  ERROR (no </head>): {page_key}")
        return False

    content = content[:head_close] + seo_block + "\n" + content[head_close:]

    # Write back
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"  OK: {page_key}")
    return True


# ============================================================
# MAIN
# ============================================================

def main():
    print(f"SEO Batch Update — {len(PAGES)} pages")
    print(f"Project: {PROJECT_DIR}")
    print("=" * 50)

    updated = 0
    skipped = 0
    errors = 0

    for page_key, page_info in sorted(PAGES.items()):
        try:
            if process_file(page_key, page_info):
                updated += 1
            else:
                skipped += 1
        except Exception as e:
            print(f"  ERROR: {page_key} — {e}")
            errors += 1

    print("=" * 50)
    print(f"Done: {updated} updated, {skipped} skipped, {errors} errors")


if __name__ == "__main__":
    main()
