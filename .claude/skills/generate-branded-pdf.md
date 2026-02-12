# generate-branded-pdf

הפקת PDF ממותג מחוברת NLP.

## Trigger
"צור PDF", "generate pdf", "הפק חוברת", "המר לPDF"

## Instructions

1. **קרא** את `docs/nlp-booklet-clean.html`
2. **וודא** שכל האינפוגרפיקות משולבות (בדוק SVG inline)
3. **הוסף CSS** להדפסה:
   - page-break-before: always לכל פרק חדש
   - page-break-inside: avoid לאינפוגרפיקות
   - @page { size: A4; margin: 20mm; }
4. **המר** ל-PDF באמצעות Skill `html-to-pdf`:
   ```bash
   node ~/.claude/skills/html-to-pdf/scripts/html-to-pdf.js docs/nlp-booklet-clean.html docs/חוברת-NLP-עם-אינפוגרפיקות.pdf --rtl --margin=15mm --wait=3000
   ```
5. **אשר** שהקובץ נוצר ודווח את גודלו.

## Output
- `docs/חוברת-NLP-עם-אינפוגרפיקות.pdf`
