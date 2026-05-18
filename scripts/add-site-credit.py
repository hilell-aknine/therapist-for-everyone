# -*- coding: utf-8 -*-
"""Inject site credit footer into all public pages. Idempotent."""
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

FOOTER = """    <!-- Site Credit Footer -->
    <style>
      .site-credit { background: #E8F1F2; text-align: center; padding: 14px 16px; font-size: 13px; color: #003B46; border-top: 1px solid rgba(0, 59, 70, 0.08); font-family: 'Heebo', sans-serif; direction: rtl; width: 100%; box-sizing: border-box; margin: 0; }
      .site-credit p { margin: 0; line-height: 1.6; }
      .site-credit a { color: #003B46; text-decoration: none; font-weight: 600; }
      .site-credit a:hover { text-decoration: underline; }
    </style>
    <footer class="site-credit" role="contentinfo">
      <p>נוצר ע\"י הילל אקנין · לפרויקטים: <a href=\"tel:+972549116092\" dir=\"ltr\">054-9116092</a></p>
    </footer>
"""

PAGES = [
    "index.html", "404.html", "thank-you.html", "privacy-policy.html",
    "legal-gate.html", "landing-patient.html", "landing-therapist.html",
    "patient-onboarding.html", "therapist-onboarding.html",
    "pages/about.html", "pages/accessibility.html", "pages/community.html",
    "pages/courses.html", "pages/course-library.html", "pages/master.html",
    "pages/master-practice.html", "pages/training.html",
    "pages/free-portal.html", "pages/join-patient.html", "pages/join-therapist.html",
    "pages/learning-booklets.html", "pages/login.html", "pages/nlp-game.html",
    "pages/patient-intro.html",
    "pages/patient-step1.html", "pages/patient-step2.html",
    "pages/patient-step3.html", "pages/patient-step4.html",
    "pages/therapist-step1.html", "pages/therapist-step2.html",
    "pages/therapist-step3.html", "pages/therapist-step4.html",
    "pages/portal-questionnaire.html", "pages/profile.html",
    "pages/project-lobby.html",
    "pages/questionnaire.html", "pages/questionnaire-form.html",
    "pages/registration.html", "pages/sign-contract.html",
    "pages/summaries/index.html",
    "pages/summaries/lesson-1.html", "pages/summaries/lesson-2.html",
    "pages/summaries/lesson-3.html", "pages/summaries/lesson-4.html",
    "pages/summaries/lesson-5.html", "pages/summaries/lesson-6.html",
    "pages/summaries/lesson-7.html",
    "pages/summaries-master/index.html",
    "pages/summaries-master/master-lesson-1.html",
    "pages/summaries-master/master-lesson-2.html",
    "pages/summaries-master/master-lesson-3.html",
    "pages/summaries-master/master-lesson-4.html",
    "pages/summaries-master/master-lesson-5.html",
    "pages/summaries-master/master-lesson-6.html",
    "pages/summaries-master/master-lesson-7.html",
]

MARKER = "site-credit"

ok, skip, missing, no_body = [], [], [], []

for rel in PAGES:
    fp = BASE / rel
    if not fp.exists():
        missing.append(rel)
        continue
    txt = fp.read_text(encoding="utf-8")
    if MARKER in txt:
        skip.append(rel)
        continue
    if "</body>" not in txt:
        no_body.append(rel)
        continue
    new = txt.replace("</body>", FOOTER + "  </body>", 1)
    fp.write_text(new, encoding="utf-8")
    ok.append(rel)

print(f"\n=== Added: {len(ok)} ===")
for p in ok: print(f"  + {p}")
if skip:
    print(f"\n=== Skipped (already has footer): {len(skip)} ===")
    for p in skip: print(f"  = {p}")
if missing:
    print(f"\n=== MISSING: {len(missing)} ===")
    for p in missing: print(f"  ! {p}")
if no_body:
    print(f"\n=== NO </body> tag: {len(no_body)} ===")
    for p in no_body: print(f"  ? {p}")
