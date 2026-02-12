# create-infographic

יצירת אינפוגרפיקה SVG ממותגת לפרק בחוברת NLP.

## Trigger
"צור אינפוגרפיקה לפרק X", "create infographic for chapter X", "אינפוגרפיקה"

## Instructions

1. **קרא את הפרק** מתוך `docs/nlp-booklet-clean.html` — אתר את הפרק לפי מספר או כותרת.
2. **זהה את המודל המרכזי** — כל פרק מכיל מודל NLP (למשל: מודל התקשורת, עמדות תפיסה, VAKOG). חלץ את המרכיבים העיקריים.
3. **צור SVG ממותג** בסגנון הבא:
   - צבעים: deep-petrol (#003B46), muted-teal (#00606B), dusty-aqua (#2F8592), frost-white (#E8F1F2), gold (#D4AF37)
   - פונט: Heebo (Hebrew)
   - כיוון: RTL
   - גודל: רוחב 700px, גובה דינמי
   - סגנון: מודרני, נקי, עם אייקונים או צורות גיאומטריות
   - כותרת: שם המודל בעברית
   - תוכן: המרכיבים העיקריים של המודל בצורה ויזואלית
4. **שלב בחוברת** — הכנס את ה-SVG inline לתוך `docs/nlp-booklet-clean.html` אחרי הפסקה הראשונה של הפרק.
5. **עדכן מעקב** — אם קיים קובץ `data/infographic-status.json`, עדכן את הסטטוס של הפרק ל-"done".

## Brand Colors
```css
--deep-petrol: #003B46;
--muted-teal: #00606B;
--dusty-aqua: #2F8592;
--frost-white: #E8F1F2;
--gold: #D4AF37;
```

## Chapters Pending Infographics
| Chapter | Topic | Line in HTML |
|---------|-------|-------------|
| 4 | מודל התקשורת | ~877 |
| 9 | עמדות תפיסה | ~1301 |
| 11 | מטה מודל | ~1409 |
| 13 | מערכות ייצוג (VAKOG) | ~1586 |
| 14 | תתי חושים | ~1686 |
| 15 | אקולוגיה | ~1804 |
| 16 | מסגור ורי-פריים | ~1844 |
| 17 | מודל 6 הצרכים | ~1931 |
| 18 | עוגנים | ~1991 |

## Example
User: "צור אינפוגרפיקה לפרק 13 - VAKOG"
→ Read chapter 13 → Identify 5 representation systems → Create circular SVG diagram → Insert into HTML
