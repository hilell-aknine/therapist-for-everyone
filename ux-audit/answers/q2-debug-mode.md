# Q2: Debug Mode in Production — CONFIRMED VULNERABILITY

## Verdict: YES — empty records can be submitted

Patient steps 2, 3, 4 all have step-guard redirects commented out with `// DEBUG MODE - disabled validation`.

### Attack path:
1. Open `patient-step4.html` directly
2. Check 2 checkboxes + draw scribble on canvas
3. Submit → empty record inserted to `patients` table

### Step4 submit validation only checks:
- `terms_confirmed` checkbox
- `age_confirmed` checkbox
- `hasSignature` (canvas drawn)

Does NOT check: full_name, phone, email, therapy_type, or any step 1-3 data.

## Action: Re-enable step guards immediately (uncomment the validation blocks)
