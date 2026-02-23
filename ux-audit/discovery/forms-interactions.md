# Discovery: Forms, Interactions & Error Handling

## CRITICAL FINDINGS

### C1: Debug Mode Left Active — Step Guards Disabled
- patient-step2/3/4: step-guard redirects commented out with `// DEBUG MODE`
- Users can navigate directly to step 4 and submit empty records
- Therapist flow has guards active — patient flow does not

### C2: Supabase Anon Key Hardcoded in step4 Files
- Both patient-step4 and therapist-step4 have inline keys
- Inconsistent with `supabase-client.js` as single source

### C3: Therapist WhatsApp Placeholder Number
- Success screen links to `+972501234567` (non-existent)
- Patient flow correctly uses `972549116092`

### C4: Email Validation Weak
- All forms: `v.includes('@') && v.includes('.')`
- Submit-time in patient-step1 only checks `!email.includes('@')` — missing dot
- `test@invalid` would pass

### C5: Signature Canvas Clears on Rotation
- `resizeCanvas()` clears canvas content (canvas.width = rect.width triggers clear)
- `hasSignature` stays true → blank image submitted
- Critical on mobile rotation

## HIGH FINDINGS

### H1: No `autocomplete` Attributes on Any Input
- Browser cannot offer autofill for name, phone, email, city, birthdate
- Painful on mobile

### H2: Progress Indicator is Cosmetic Only
- Step 1 always shows as "completed" on step 2 regardless of actual completion
- With debug mode active, step 3 shows all prior steps complete even if empty

### H3: Toast-Only Error Feedback
- No field-level inline errors on submit
- Mobile users must scroll up to find failed field
- Inline `.error-msg` divs exist but only shown on blur, not submit

### H4: Therapy Type Has No Validation
- patient-step3: zero inline validation rules
- Only toast at submit time

### H5: Therapist Checkboxes Not Validated
- `target_population` and `specialization` marked required but not validated
- Can submit with zero selections

### H6: Sibling Inputs Missing `name` Attribute
- Dynamic sibling inputs use `id` only
- Fragile and inconsistent with form pattern

### H7: Generic Error on Network Failure
- "שגיאה בשליחת הטופס. נסה שוב." with no detail
- User doesn't know if data was partially saved
- No retry guidance

### H8: `legal-gate.html` No Fallback if AuthGuard Fails
- If `auth-guard.js` 404s, promise never resolves
- User sees blank page with no feedback

### H9: Sibling Count Buttons Not Accessible
- No `for` attribute on label, +/- buttons have no ARIA labels

### H10: `practice_start_year` Max Hardcoded to 2026
- Will become incorrect over time

## MEDIUM FINDINGS

### M1: Toast Missing `role="alert"`
- Screen readers won't announce error/success messages

### M2: Progress Circles Not Screen-Reader Friendly
- No `aria-current="step"`, no `role="list"`, no `aria-label`

### M3: Signature Canvas Has No Alternative
- No typed-name option for motor disabilities
- WCAG 2.5.1 requires alternatives for path-based gestures

### M4: No Age Validation on `birth_date`
- Accepts future dates and under-18 dates
- Legal agreement says "18+ only" but form doesn't enforce

### M5: RTL Progress Connector Direction Inconsistent
- Patient: `left: -50%`, Therapist: `right: -50%`

### M6: Phone Regex Bug — Commas Valid
- `[2-4,8-9]` includes literal comma as valid digit

### M7: Dual Storage Keys May Conflict
- `patientForm` (manual) vs `autosave_/pages/patient-step1.html` (auto)
- Order of script execution matters

### M8: Autosave Overwrite Bug for Radio Buttons
- therapist-step3: autosave always saves "no" for health questions
- Overwrites "yes" selections

### M9: Portal Auth Loading State Missing
- Header appears empty during async auth check (1-3 seconds)

### M10: Landing Patient CTA May Point to Non-Existent Page
- `pages/join-patient.html` is a redirect page, not direct content

## LOW FINDINGS
- L1: Visual design difference between patient/therapist progress indicators
- L2: `emergency_confirmed` checkbox removed but documented
- L3: Founder's personal WhatsApp exposed in success screen
- L4: No `<noscript>` fallback on any form
- L5: `textarea resize: vertical` on mobile
- L6: CSS variable double-declaration pattern

## QUESTIONS
1. Debug mode — intentional or deployment oversight?
2. WhatsApp placeholder — correct number?
3. Signature legal weight under Israeli law?
4. Emergency checkbox removal — intentional?
5. CTA dead link — `join-patient.html` removed?
6. Accessibility for signature — alternatives planned?
7. Multi-tenant storage keys — cross-pollination risk?
8. Birth date minor validation — should block?
9. Server-side validation — any Supabase constraints?
10. Form abandonment tracking — partial save strategy?
