# CLAUDE.md - מטפל לכל אחד

## Quick Reference
```
Project: Therapists for Everyone (פורטל מטפלים לכולם)
Stack: HTML, Vanilla JS, Tailwind CDN, Supabase
Live: https://hilell-aknine.github.io/therapist-for-everyone/
Repo: https://github.com/hilell-aknine/therapist-for-everyone
```

---

## 1. Project Vision

**מטרה:** פורטל קהילתי לחיבור מטופלים עם מטפלים איכותיים שמציעים טיפול נפשי מסובסד/חינם.

**קהלי יעד:**
- פוסט-טראומתיים, הלומי קרב, ניצולי נובה
- כל מי שאין לו יכולת כלכלית לטיפול

**בידול:** לא רק ספרייה - קהילה מנוהלת עם סינון AI ובקרת איכות.

---

## 2. Architecture

```
beit-vmetaplim/
├── index.html              # דף הבית + קורסים
├── landing-patient.html    # נחיתה למטופלים
├── landing-therapist.html  # נחיתה למטפלים
├── patient-onboarding.html # הרשמת מטופל
├── therapist-onboarding.html # הרשמת מטפל
├── patient-dashboard.html  # אזור אישי למטופל
├── therapist-dashboard.html # אזור אישי למטפל
├── legal-gate.html         # שער משפטי
├── thank-you.html          # דף תודה
├── privacy-policy.html     # מדיניות פרטיות
├── pages/                  # App pages (admin, steps, learning, etc.)
│   ├── admin.html          # פאנל ניהול
│   ├── patient-step[1-4].html
│   ├── therapist-step[1-4].html
│   └── ...                 # about, courses, login, etc.
├── js/
│   ├── supabase-client.js  # Supabase initialization (SINGLE SOURCE)
│   ├── auth-guard.js       # Role & legal checks
│   ├── patient-flow.js     # Patient logic
│   ├── admin-dashboard.js  # Admin logic
│   ├── fill-patient-form.js # Form auto-fill utility
│   └── marketing-tools.js  # Cookie consent + Analytics
├── supabase/
│   └── migrations/         # Database schema
├── docs/
│   ├── booklets/           # NLP booklet (HTML, PDF)
│   ├── transcripts/        # Course transcripts (JSON, MD, TXT)
│   ├── master-course/      # Master course lessons
│   ├── images/             # Infographic PNGs
│   ├── summaries/          # Lesson summaries (DOCX)
│   ├── legal/              # Legal documents (PDF)
│   ├── specs/              # System specifications
│   └── scripts/            # Utility scripts (Python)
└── DOCUMENTATION.md        # Technical docs (Hebrew)
```

---

## 3. Core Policies

### Lead Capture First
- **Onboarding forms DO NOT require login**
- Anyone can fill patient/therapist questionnaire
- Data saved as "lead" to DB
- Auth is NOT a blocker for lead capture

### Legal Gate
**Required for:**
- Dashboard access
- Matching phase
- Viewing sensitive data

**NOT required for:**
- Filling forms
- Leaving contact details
- Browsing public pages

---

## 4. User Roles (Supabase RLS)

| Role | Permissions |
|------|-------------|
| **Admin** | See all data. Check via `profiles.role = 'admin'` |
| **Therapist** | Own profile + assigned patients only |
| **Patient** | Own profile + assigned therapist only |

---

## 5. Database Schema

### Main Tables
- `profiles` - User profiles (auto-created on signup)
- `therapists` - Therapist applications & data
- `patients` - Patient intake forms
- `appointments` - Sessions (max 10 per patient)
- `legal_consents` - Legal signatures (timestamp + IP)
- `contact_requests` - Lead capture
- `course_progress` - Video course tracking

### Supabase Connection
```javascript
const SUPABASE_URL = 'https://eimcudmlfjlyxjyrdcgc.supabase.co';
// Anon key in supabase-client.js
```

**Dashboard:** https://supabase.com/dashboard/project/eimcudmlfjlyxjyrdcgc

---

## 6. Coding Standards

| Rule | Details |
|------|---------|
| **Secrets** | Never hardcode (except Supabase Anon Key) |
| **Language** | UI in Hebrew (RTL), Code in English |
| **Errors** | Always try/catch Supabase calls, show friendly errors |
| **Style** | Descriptive names (`isTherapistApproved` not `approved`) |
| **JS Location** | Complex logic goes to `/js` modules |

---

## 7. User Flows

### Patient Flow
1. Landing page -> Fill questionnaire (no login)
2. Data saved to `patients` + `contact_requests`
3. Admin reviews & assigns therapist
4. Patient gets legal gate -> Dashboard access

### Therapist Flow
1. Landing page -> Fill application + upload certificates
2. AI screening + Admin approval
3. Receive email with password creation link
4. Legal gate -> Access "המשרד" (personal dashboard)
5. Receive patient assignments, initiate contact

### Admin Flow
1. Login -> Dashboard
2. Review new applications (email alerts)
3. Approve/reject therapists
4. Match patients to therapists
5. Handle alerts (red flag: therapist inactive 30 days)

---

## 8. Current Status

### Done
- [x] Landing pages (patient/therapist)
- [x] Onboarding forms
- [x] Legal gate page
- [x] Admin dashboard UI
- [x] Patient dashboard (basic)
- [x] Therapist dashboard (basic)
- [x] Supabase integration
- [x] Cookie consent banner
- [x] Privacy policy page
- [x] Legal documents in registration (PDF + scroll-lock)

### In Progress
- [ ] AI screening integration
- [ ] Email notifications
- [ ] Session counter (10 max)

### Planned
- [ ] WhatsApp/SMS reminders
- [ ] Automatic matching algorithm
- [ ] Video chat integration

---

## 9. Branding

```css
/* Colors */
--deep-petrol: #003B46;
--muted-teal: #00606B;
--dusty-aqua: #2F8592;
--frost-white: #E8F1F2;
--gold: #D4AF37;

/* Font */
font-family: 'Heebo', sans-serif;
```

**Slogan:** "ריפוי הנפש לכל אדם"

---

## 10. Commands

```bash
# Local development
# Just open HTML files in browser (static site)

# Deploy
git push origin master  # GitHub Pages auto-deploys
```

---

## 11. Video Marketing (Remotion)

### Location
```
videos-remotion/
├── src/
│   └── videos/
│       ├── Video1-PlatformIntro.tsx  # Main promotional video
│       ├── Video2-PatientJourney.tsx
│       └── Video3-TherapistJourney.tsx
├── public/
│   └── narration/                     # Hebrew voice narration files
│       └── scene1-8.mp3
└── scripts/
    └── generate-narration.py          # Narration generation system
```

### Video Specs
- Format: Instagram Reel (1080x1920, 9:16 vertical)
- Duration: 47 seconds
- FPS: 30

### Narration System
**Generate Hebrew narration:**
```bash
cd videos-remotion
py scripts/generate-narration.py
```

**Key rules:**
- Text must be SHORT to fit scene duration
- Validation checks audio length vs scene length
- Uses edge-tts with `he-IL-HilaNeural` voice
- Results saved to `public/narration/validation_results.json`

### Scene Timing (Video1)
| Scene | Duration | Content |
|-------|----------|---------|
| 1 | 3s | Hook - "40%" |
| 2 | 5s | Problem |
| 3 | 4s | Solution |
| 4 | 5s | Features |
| 5 | 7s | Research |
| 6 | 7s | Benefits |
| 7 | 6s | Impact |
| 8 | 10s | CTA |

### Commands
```bash
# Start Remotion Studio
cd videos-remotion && npm start

# Generate narration (validates automatically)
py scripts/generate-narration.py

# Render video (only when requested!)
npx remotion render Video1-PlatformIntro output.mp4

# Render single frame for preview
npx remotion still Video1-PlatformIntro --frame=180 --output=preview.png
```

### Style Guidelines
- Fonts: Bold (900) for headlines
- No blur effects (causes "cloud" appearance)
- Gold borders on cards
- Background music at 15% volume (allow narration)
- Professional SVG icons (no emojis)

---

## 12. Marketing & Legal Compliance

### Cookie Consent (`js/marketing-tools.js`)
- Minimalist sticky footer banner on all pages
- Text: "אנחנו משתמשים בעוגיות כדי לשפר את החוויה שלך באתר"
- Button: "הבנתי, תודה"
- Link to privacy policy page
- Saves consent to `localStorage` (key: `cookie_consent_approved`)
- Tracking loads ONLY after user consent

### Analytics (Placeholder IDs - Replace!)
```javascript
// In js/marketing-tools.js - UPDATE THESE:
GA4_ID: 'G-XXXXXXXXXX',      // Google Analytics 4
META_PIXEL_ID: '123456789',  // Meta (Facebook) Pixel
```

### Privacy Policy
- Page: `privacy-policy.html`
- Includes: data collection, cookies, user rights
- Last updated: January 2026

### Legal Documents in Registration
- **Patient**: `docs/תקנון-שירות-למטופלים.pdf`
- **Therapist**: `docs/תקנון-שירות-למטפלים.pdf`
- Displayed at step 4 of registration (before submit)
- Users must scroll to bottom to unlock checkboxes
- 3 required checkboxes for patients:
  - `terms_confirmed` - תנאי שימוש
  - `age_confirmed` - מעל גיל 18
  - `emergency_confirmed` - לא במצב חירום

---

## 13. Important Notes

- Max 10 sessions per patient (business rule)
- Therapist initiates first contact (not patient)
- Inactive therapist > 30 days = red flag alert
- Location is flexible (Zoom default, physical optional)

### NOT Currently Offered (Don't Add to Site!)
- ❌ סופרוויז'ן (Supervision) - removed from all pages
- ❌ מחירי מבחנים (Exam prices) - removed from courses section

---

## 14. Skills (מיומנויות אוטונומיות)

### Project-Level Skills (`.claude/skills/`)
מיומנויות מותאמות לפרויקט — פקודות חוזרות שהפכו לאוטומציה:

| Skill | Trigger | Description |
|-------|---------|-------------|
| **create-infographic** | "צור אינפוגרפיקה לפרק X" | יצירת SVG ממותג לפרק בחוברת NLP, שילוב ב-HTML |
| **generate-branded-pdf** | "צור PDF" / "הפק חוברת" | המרת חוברת NLP ל-PDF ממותג עם אינפוגרפיקות |
| **mobile-audit** | "בדוק מובייל" / "mobile audit" | סריקת responsive על כל 24 דפי ה-HTML |
| **deploy-site** | "פרסם" / "deploy" | git add → commit → push → GitHub Pages |

### User-Level Skills (Available via Claude Code)
כלים כלליים שזמינים בכל פרויקט:

| Skill | Use Case |
|-------|----------|
| `html-to-pdf` | המרת HTML ל-PDF (Puppeteer) |
| `gh-pages-deploy` | פריסה ל-GitHub Pages |
| `whatsapp` | שליחת הודעות WhatsApp |
| `nano-banana-poster` | יצירת תמונות עם Gemini AI |
| `speech-generator` | הפקת דיבור TTS |
| `social-content` | יצירת תוכן לרשתות חברתיות |
| `presentation-architect` | בניית מצגות |

### Spaceship Mode Example
```
טרמינל: "הרץ create-infographic על פרקים 4, 9, 11, 13, 14, 15, 16, 17, 18"
→ Claude עובד לבד 20 דקות, יוצר 9 אינפוגרפיקות

טרמינל: "הרץ generate-branded-pdf"
→ Claude ממיר את החוברת ל-PDF ממותג

טרמינל: "הרץ deploy-site"
→ Claude מעלה את הכל ל-GitHub Pages
```
