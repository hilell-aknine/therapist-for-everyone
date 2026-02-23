# Q3: Dead Links — join-patient.html EXISTS as redirect

## Verdict: NOT a dead link

Both redirect pages exist and work:
- `pages/join-patient.html` → redirects to `patient-intro.html`
- `pages/join-therapist.html` → redirects to `therapist-step1.html`

Full patient chain: `landing-patient.html` → `join-patient.html` → `patient-intro.html` → step1-4

## Note: These redirect pages add unnecessary latency (extra HTTP round-trip). Could link directly.
