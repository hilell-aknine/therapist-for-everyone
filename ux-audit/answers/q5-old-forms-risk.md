# Q5: Old Onboarding Forms — DUPLICATE DATA RISK

## Verdict: Both old forms write to SAME tables, no duplicate protection

### Patient side:
- Old `patient-onboarding.html` → inserts to `patients` table (minimal fields)
- New `patient-step4.html` → inserts to `patients` table (full fields)
- NO unique constraint on phone or name
- NO duplicate check before insert

### Therapist side:
- Old `therapist-onboarding.html` → inserts to `therapists` (logged-in: upsert by user_id, anon: raw insert)
- New `therapist-step4.html` → raw insert, no duplicate check
- Status naming inconsistent: old writes 'pending'/'screening_submitted', new writes 'new'

### Duplicate scenario:
Same person fills old short form + later completes 4-step flow = 2 rows, no link between them.

## Action:
1. Add unique constraint on `patients.phone` and `therapists.phone`
2. Redirect old forms to new step flows (or delete them)
3. Add pre-insert duplicate check by phone in step4 files
