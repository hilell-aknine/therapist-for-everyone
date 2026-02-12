# deploy-site

פריסת האתר ל-GitHub Pages.

## Trigger
"פרסם", "deploy", "העלה לאוויר", "push"

## Instructions

1. **בדוק סטטוס** — `git status` (אל תשתמש ב-flag -uall)
2. **הצג שינויים** — `git diff` (staged + unstaged)
3. **שאל** את המשתמש: "רוצה שאעלה את כל השינויים?"
4. **Stage** — `git add` (קבצים ספציפיים, לא git add -A)
5. **Commit** — עם הודעה תיאורית בעברית/אנגלית
6. **Push** — `git push origin master`
7. **וודא** — GitHub Actions deploy.yml ירוץ אוטומטית
8. **דווח** — "האתר עודכן: https://hilell-aknine.github.io/therapist-for-everyone/"

## Rules
- NEVER force push
- NEVER commit .env or credentials
- Always ask before pushing
- Check git log for commit message style
