# generate-lesson-pdf

הפקת PDF ממותג לסיכום שיעור ספציפי.

## Trigger
"צור PDF לשיעור X", "הפק סיכום שיעור", "PDF שיעור 1", "lesson pdf"

## Instructions

### Input
- מספר שיעור (1-4) או "all" לכולם

### Steps

1. **זהה** את קובץ ה-HTML המתאים:
   - שיעור 1: `pages/summaries/lesson-1.html`
   - שיעור 2: `pages/summaries/lesson-2.html`
   - שיעור 3: `pages/summaries/lesson-3.html`
   - שיעור 4: `pages/summaries/lesson-4.html`

2. **המר** ל-PDF באמצעות Skill `html-to-pdf`:
   ```
   /html-to-pdf pages/summaries/lesson-{N}.html docs/summaries-pdf/סיכום-שיעור-{N}.pdf
   ```
   עם הפרמטרים:
   - `--rtl` (עברית)
   - `--margin=15mm`
   - `--wait=2000` (המתנה לטעינת פונטים)
   - `--format=A4`

3. **אם "all"** - בצע את השלבים עבור שיעורים 1 עד 4

4. **וודא** שתיקיית `docs/summaries-pdf/` קיימת, אם לא - צור אותה

5. **אשר** שהקובץ נוצר ודווח:
   - שם הקובץ
   - גודל הקובץ
   - מיקום

## Output
- קובץ בודד: `docs/summaries-pdf/סיכום-שיעור-{N}.pdf`
- כל השיעורים: `docs/summaries-pdf/סיכום-שיעור-1.pdf` עד `סיכום-שיעור-4.pdf`

## Notes
- הדפים כבר ממותגים בצבעי פטרול/זהב עם פונט Heebo
- ה-CSS כולל @media print מוכן
- כשמוסיפים שיעורים חדשים, לעדכן את הטווח (1-4 → 1-N)
