# mobile-audit

סריקת responsive על כל דפי ה-HTML בפרויקט.

## Trigger
"בדוק מובייל", "mobile audit", "בדיקת responsive", "תתקן מובייל"

## Instructions

1. **סרוק** את כל קבצי ה-HTML בתיקיה הראשית ובתיקיית pages/:
   - index.html, landing-*.html, *-onboarding.html, *-dashboard.html
   - pages/*.html
2. **בדוק** בכל קובץ:
   - [ ] meta viewport tag קיים
   - [ ] אין inline width/height קבועים שעוברים את 100vw
   - [ ] תפריט המבורגר עובד (בדוק hamburger/mobile-menu classes)
   - [ ] אין overflow-x על body/html
   - [ ] popup/overlay לא מכסים את כל המסך (בדוק z-index, position:fixed)
   - [ ] טפסים responsive (max-width: 100%)
   - [ ] תמונות עם max-width: 100%
3. **דווח** טבלת ממצאים: קובץ | בעיה | שורה | תיקון מוצע
4. **תקן** את כל הבעיות שנמצאו (אם המשתמש אישר)
5. **Git commit** עם הודעה: "Fix mobile responsiveness across all pages"

## Known Issues (from git history)
- Ghost overlays covering mobile screen
- Hamburger menu z-index conflicts
- Signup popup blocking interaction
