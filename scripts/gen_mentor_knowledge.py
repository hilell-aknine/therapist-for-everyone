# -*- coding: utf-8 -*-
"""Generate supabase/functions/gemini-mentor/knowledge.ts from the two client KB files.
Extracts the template-literal body assigned to window.NLP_COURSE_KNOWLEDGE in each file.
"""
import io, sys

ROOT = r"C:\Users\saraa\OneDrive\שולחן העבודה\beit-vmetaplim"

def extract(path):
    with io.open(path, encoding="utf-8") as f:
        src = f.read()
    start = src.index("`") + 1
    end = src.rindex("`")
    body = src[start:end]
    if "${" in body or "`" in body:
        raise SystemExit(f"unexpected template interpolation/backtick inside {path}")
    return body

prac = extract(ROOT + r"\js\nlp-game-knowledge.js")
# master KB source moved out of the public repo with the rest of the paid content (2026-07-22)
mast = extract(ROOT + r"\content-private\master-game\src\nlp-game-knowledge-master.js")

out = (
    "// AUTO-EXTRACTED from js/nlp-game-knowledge.js + js/nlp-game-knowledge-master.js\n"
    "// so the mentor system prompt is chosen SERVER-SIDE (clients can no longer\n"
    "// supply an arbitrary systemPrompt and use the function as a generic AI proxy).\n"
    "// Regenerate with scripts/gen_mentor_knowledge.py after editing the client KB files.\n\n"
    "export const PRACTITIONER_KB = `" + prac + "`\n\n"
    "export const MASTER_KB = `" + mast + "`\n"
)

dest = ROOT + r"\supabase\functions\gemini-mentor\knowledge.ts"
with io.open(dest, "w", encoding="utf-8", newline="\n") as f:
    f.write(out)
print("written", dest, "prac", len(prac), "chars; master", len(mast), "chars")
