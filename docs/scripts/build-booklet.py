"""
Build branded NLP Practitioner booklet HTML from PDF source.
Extracts text from PDF, cleans RTL issues, generates branded HTML.
"""
import fitz  # PyMuPDF
import re
import os

PDF_PATH = r'C:\Users\saraa\Downloads\NLP Practitioner  (1).pdf'
OUTPUT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'booklets', 'nlp-booklet-branded.html')

def extract_pages(pdf_path):
    """Extract text from each page as structured blocks."""
    doc = fitz.open(pdf_path)
    pages = []
    for i in range(len(doc)):
        page = doc[i]
        blocks = page.get_text('dict')['blocks']
        page_text = []
        for b in blocks:
            if 'lines' in b:
                paragraph_parts = []
                for line in b['lines']:
                    line_text = ''
                    for span in line['spans']:
                        line_text += span['text']
                    line_text = line_text.strip()
                    if line_text:
                        paragraph_parts.append(line_text)
                if paragraph_parts:
                    full = ' '.join(paragraph_parts)
                    page_text.append(full)
        pages.append(page_text)
    doc.close()
    return pages

def clean_text(text):
    """Fix RTL extraction issues in text."""
    # Generic: add space between Hebrew char and Latin word (NLP, SMART, Outcome, etc.)
    text = re.sub(r'([\u0590-\u05FF])((?:NLP|SMART|Outcome|VAK))', r'\1 \2', text)
    text = re.sub(r'((?:NLP|SMART|Outcome|VAK))([\u0590-\u05FF])', r'\1 \2', text)

    # Fix prefix-NLP patterns: -הNLP → ה-NLP, -לNLP → ל-NLP, -בNLP → ב-NLP
    text = re.sub(r'-([הלבכמש])\s*NLP', r'\1-NLP', text)

    # Fix )(תכל'ס → (תכל'ס)
    text = re.sub(r'\)\(', '(', text)
    text = text.replace('תכל\'ס NLP', 'NLP (תכל\'ס)')

    # Fix punctuation attached to wrong word (RTL extraction artifact)
    text = re.sub(r'(\S),(\S)', r'\1, \2', text)
    text = re.sub(r'(\S)\.(\S)', r'\1. \2', text)
    text = re.sub(r'!(\S)', r'! \1', text)
    text = re.sub(r'\?(\S)', r'? \1', text)

    # Fix "הבסיסל-NLP" → "הבסיס ל-NLP"
    text = re.sub(r'הבסיס(ל-NLP)', r'הבסיס \1', text)

    # Fix numbered sub-items: .א → א.
    text = re.sub(r'\.\s*([אבגדהוזחט])\s', r'\1. ', text)
    # Fix .א( → א(
    text = re.sub(r'\.\s*([אבגדהוזחט])\(', r'\1(', text)

    # Fix "(ׂ" artifact
    text = text.replace('(ׂ', '(')

    # Clean up multiple spaces
    text = re.sub(r'\s+', ' ', text).strip()

    return text

def parse_structure(pages):
    """Parse pages into lessons and chapters."""
    # Lesson definitions from TOC (page ranges are PDF page indices, 0-based)
    # first_chapter: title of chapter 1 for lessons where it's not explicit
    lesson_defs = [
        {'number': 1, 'title': 'מבוא ל-NLP ותקשורת פנימית', 'start_page': 5, 'end_page': 27,
         'first_chapter': 'מה שלא ידעתם על NLP'},
        {'number': 2, 'title': 'לוגיקה ותפיסה', 'start_page': 28, 'end_page': 45},
        {'number': 3, 'title': 'מסננים, מטרות ויעדים', 'start_page': 46, 'end_page': 63},
        {'number': 4, 'title': 'השפה של המוח', 'start_page': 64, 'end_page': 80},
        {'number': 5, 'title': 'צרכים ומחשבות', 'start_page': 81, 'end_page': 95},
        {'number': 6, 'title': 'מסגור, סטייטים ועוגנים', 'start_page': 96, 'end_page': 113},
        {'number': 7, 'title': 'כשלונות ואמונות', 'start_page': 114, 'end_page': 129},
    ]

    lessons = []
    for ld in lesson_defs:
        lesson = {
            'number': ld['number'],
            'title': ld['title'],
            'chapters': [],
            'start_page': ld['start_page'],
            'end_page': ld['end_page']
        }
        # Pre-create chapter 1 if it won't have an explicit header
        if 'first_chapter' in ld:
            lesson['chapters'].append({
                'number': 1,
                'title': ld['first_chapter'],
                'content': []
            })
        lessons.append(lesson)

    current_lesson = None
    current_chapter = None
    intro_letter = []

    copyright_pattern = re.compile(r'©.*שמורות\d*')
    chapter_pattern = re.compile(r'פרק\s*(\d+)\s*[-–]\s*(.*)')
    numbered_section = re.compile(r'^(\d+)\s*\.\s*(.*)')
    toc_dots = re.compile(r'\.{5,}')
    toc_header = re.compile(r'תוכן עניינים')
    lesson_in_toc = re.compile(r'שיעור\s*\d+\s*[-–]')

    for page_idx, page_blocks in enumerate(pages):
        if page_idx == 0:  # Cover page (blank or image)
            continue

        # Determine which lesson this page belongs to
        page_lesson = None
        for lesson in lessons:
            if lesson['start_page'] <= page_idx <= lesson['end_page']:
                page_lesson = lesson
                break

        for block in page_blocks:
            # Skip copyright lines
            if copyright_pattern.search(block):
                continue
            # Skip TOC pages (contain dotted lines or TOC header)
            if toc_dots.search(block) or toc_header.search(block):
                continue
            # Skip lesson headers from TOC
            if lesson_in_toc.search(block):
                continue
            # Skip just page numbers
            if block.strip().isdigit():
                continue
            # Skip blank
            if not block.strip():
                continue

            text = clean_text(block)

            # Check for letter from Ram (page 2, index 1)
            if page_idx == 1:
                intro_letter.append(text)
                continue

            # Skip TOC pages (indices 2-4)
            if page_idx in [2, 3, 4]:
                continue

            # Update current lesson based on page
            if page_lesson and page_lesson != current_lesson:
                current_lesson = page_lesson
                # If lesson has a pre-created chapter 1, use it
                if current_lesson['chapters']:
                    current_chapter = current_lesson['chapters'][0]
                else:
                    current_chapter = None

            # Check for chapter header
            chapter_match = chapter_pattern.search(text)
            if chapter_match and current_lesson:
                num = chapter_match.group(1)
                title = chapter_match.group(2).strip()
                current_chapter = {
                    'number': int(num),
                    'title': title,
                    'content': []
                }
                current_lesson['chapters'].append(current_chapter)
                continue

            # Regular content
            if current_chapter:
                # Check if it's a numbered section header
                section_match = numbered_section.match(text)
                if section_match:
                    current_chapter['content'].append({
                        'type': 'section',
                        'number': section_match.group(1),
                        'title': section_match.group(2)
                    })
                else:
                    current_chapter['content'].append({
                        'type': 'paragraph',
                        'text': text
                    })

    return intro_letter, lessons

def generate_html(intro_letter, lessons):
    """Generate branded HTML booklet."""

    # Build TOC
    toc_html = ''
    for lesson in lessons:
        toc_html += f'''
        <div class="toc-lesson">
            <div class="toc-lesson-title">שיעור {lesson['number']} - {lesson['title']}</div>
            <ul class="toc-chapters">'''
        for ch in lesson['chapters']:
            toc_html += f'''
                <li class="toc-chapter">פרק {ch['number']} - {ch['title']}</li>'''
        toc_html += '''
            </ul>
        </div>'''

    # Build content
    content_html = ''
    for lesson in lessons:
        content_html += f'''
    <div class="lesson-divider">
        <div class="lesson-divider-inner">
            <span class="lesson-divider-num">שיעור {lesson['number']}</span>
            <h2 class="lesson-divider-title">{lesson['title']}</h2>
        </div>
    </div>'''

        for ch in lesson['chapters']:
            content_html += f'''
    <div class="chapter">
        <h3 class="chapter-title">
            <span class="chapter-num">פרק {ch['number']}</span>
            {ch['title']}
        </h3>
        <div class="chapter-content">'''

            for item in ch['content']:
                if item['type'] == 'section':
                    content_html += f'''
            <h4 class="section-title"><span class="section-num">{item['number']}.</span> {item['title']}</h4>'''
                else:
                    text = item['text']
                    # Convert sub-items (א. ב. ג.) to list
                    if re.match(r'^\.\s*[אבגדהוזחט]\s', text) or re.match(r'^\.\s*[אבגדהוזחט]\(', text):
                        content_html += f'''
            <div class="sub-item">{text}</div>'''
                    else:
                        content_html += f'''
            <p>{text}</p>'''

            content_html += '''
        </div>
    </div>'''

    # Build intro letter
    intro_html = ''
    if intro_letter:
        intro_html = '<div class="intro-letter"><div class="intro-letter-inner">'
        for p in intro_letter:
            if 'מכתב' in p or 'מרם' in p:
                intro_html += f'<h3 class="intro-title">{p}</h3>'
            elif 'רם אלוס' in p:
                intro_html += f'<p class="intro-signature">{p}</p>'
            else:
                intro_html += f'<p>{p}</p>'
        intro_html += '</div></div>'

    html = f'''<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>חוברת קורס NLP Practitioner | בית המטפלים</title>
    <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        @page {{
            size: A4;
            margin: 15mm 20mm 20mm 20mm;
        }}

        * {{ box-sizing: border-box; }}

        html, body {{
            margin: 0;
            padding: 0;
            font-family: 'Heebo', sans-serif;
            direction: rtl;
            text-align: right;
            font-size: 11pt;
            line-height: 1.8;
            color: #003B46;
            background: #f5f5f5;
        }}

        /* ===== CONTENT WRAPPER ===== */
        .content-wrapper {{
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 50px;
            background: #fff;
            box-shadow: 0 0 20px rgba(0,0,0,0.08);
        }}

        :root {{
            --deep-petrol: #003B46;
            --muted-teal: #00606B;
            --dusty-aqua: #2F8592;
            --frost-white: #E8F1F2;
            --gold: #D4AF37;
            --light-gold: #f5e6b8;
        }}

        /* ===== COVER PAGE ===== */
        .cover-page {{
            page-break-after: always;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background: linear-gradient(160deg, var(--deep-petrol) 0%, var(--muted-teal) 50%, var(--dusty-aqua) 100%);
            color: white;
            text-align: center;
            padding: 60px 40px;
        }}

        .cover-logo {{
            width: 140px;
            height: 140px;
            background: var(--gold);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 50px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        }}

        .cover-logo svg {{
            width: 70px;
            height: 70px;
        }}

        .cover-title {{
            font-size: 48pt;
            font-weight: 800;
            margin-bottom: 15px;
            letter-spacing: -1px;
        }}

        .cover-subtitle {{
            font-size: 22pt;
            font-weight: 300;
            color: var(--gold);
            margin-bottom: 30px;
        }}

        .cover-instructor {{
            font-size: 16pt;
            color: rgba(255,255,255,0.9);
            margin-top: 30px;
        }}

        .cover-brand {{
            margin-top: 80px;
            padding-top: 30px;
            border-top: 1px solid rgba(255,255,255,0.2);
        }}

        .cover-slogan {{
            font-size: 14pt;
            color: var(--gold);
            font-weight: 500;
        }}

        .cover-org {{
            font-size: 12pt;
            color: rgba(255,255,255,0.7);
            margin-top: 10px;
        }}

        /* ===== TABLE OF CONTENTS ===== */
        .toc-page {{
            page-break-after: always;
            padding: 50px 30px;
        }}

        .toc-title {{
            font-size: 26pt;
            font-weight: 700;
            color: var(--deep-petrol);
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 15px;
            border-bottom: 3px solid var(--gold);
        }}

        .toc-lesson {{
            margin-bottom: 25px;
        }}

        .toc-lesson-title {{
            font-size: 14pt;
            font-weight: 700;
            color: var(--deep-petrol);
            padding: 8px 12px;
            background: var(--frost-white);
            border-right: 4px solid var(--gold);
            margin-bottom: 8px;
        }}

        .toc-chapters {{
            list-style: none;
            padding: 0 15px;
            margin: 0;
        }}

        .toc-chapter {{
            font-size: 11pt;
            padding: 4px 10px;
            color: var(--muted-teal);
            border-bottom: 1px dotted #ddd;
        }}

        /* ===== INTRO LETTER ===== */
        .intro-letter {{
            page-break-after: always;
            padding: 60px 40px;
            display: flex;
            justify-content: center;
        }}

        .intro-letter-inner {{
            max-width: 600px;
            background: var(--frost-white);
            padding: 40px;
            border-radius: 16px;
            border-top: 4px solid var(--gold);
        }}

        .intro-title {{
            font-size: 18pt;
            color: var(--deep-petrol);
            margin-bottom: 20px;
        }}

        .intro-letter p {{
            margin-bottom: 12px;
            line-height: 1.9;
        }}

        .intro-signature {{
            margin-top: 25px;
            font-weight: 700;
            color: var(--gold);
            font-size: 13pt;
        }}

        /* ===== LESSON DIVIDERS ===== */
        .lesson-divider {{
            page-break-before: always;
            min-height: 40vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, var(--deep-petrol) 0%, var(--muted-teal) 100%);
            margin: 40px -50px;
            border-radius: 12px;
            padding: 60px 40px;
            text-align: center;
        }}

        .lesson-divider-num {{
            display: inline-block;
            background: var(--gold);
            color: var(--deep-petrol);
            font-size: 14pt;
            font-weight: 800;
            padding: 8px 24px;
            border-radius: 30px;
            margin-bottom: 20px;
        }}

        .lesson-divider-title {{
            font-size: 32pt;
            font-weight: 800;
            color: white;
            margin: 0;
        }}

        /* ===== CHAPTERS ===== */
        .chapter {{
            page-break-inside: avoid;
            margin-bottom: 35px;
            padding-top: 20px;
        }}

        .chapter-title {{
            font-size: 18pt;
            font-weight: 700;
            color: var(--deep-petrol);
            padding-bottom: 10px;
            border-bottom: 2px solid var(--gold);
            margin-bottom: 20px;
        }}

        .chapter-num {{
            display: inline-block;
            background: var(--gold);
            color: white;
            font-size: 11pt;
            font-weight: 700;
            padding: 2px 12px;
            border-radius: 12px;
            margin-left: 10px;
        }}

        .chapter-content p {{
            margin-bottom: 10px;
            text-align: justify;
        }}

        /* ===== SECTIONS ===== */
        .section-title {{
            font-size: 13pt;
            font-weight: 600;
            color: var(--muted-teal);
            margin: 20px 0 10px 0;
        }}

        .section-num {{
            color: var(--gold);
            font-weight: 800;
        }}

        .sub-item {{
            padding-right: 20px;
            margin-bottom: 6px;
            position: relative;
        }}

        .sub-item::before {{
            content: '';
            position: absolute;
            right: 5px;
            top: 10px;
            width: 6px;
            height: 6px;
            background: var(--gold);
            border-radius: 50%;
        }}

        /* ===== FOOTER ===== */
        .page-footer {{
            text-align: center;
            padding: 30px;
            margin-top: 50px;
            border-top: 2px solid var(--gold);
            color: var(--muted-teal);
            font-size: 10pt;
        }}

        .page-footer .brand {{
            font-weight: 700;
            color: var(--deep-petrol);
        }}

        /* ===== BACK COVER ===== */
        .back-cover {{
            page-break-before: always;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background: linear-gradient(160deg, var(--deep-petrol) 0%, var(--muted-teal) 50%, var(--dusty-aqua) 100%);
            color: white;
            text-align: center;
            padding: 60px 40px;
        }}

        .back-cover h2 {{
            font-size: 28pt;
            font-weight: 800;
            margin-bottom: 20px;
        }}

        .back-cover p {{
            font-size: 14pt;
            color: var(--gold);
            margin-bottom: 10px;
        }}

        .back-cover .copyright {{
            margin-top: 60px;
            font-size: 10pt;
            color: rgba(255,255,255,0.5);
        }}

        /* ===== PRINT ===== */
        @media print {{
            body {{ background: #fff; }}
            .content-wrapper {{
                max-width: 100%;
                padding: 0;
                box-shadow: none;
            }}
            .lesson-divider {{
                margin: 0;
                border-radius: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }}
            .cover-page, .back-cover {{
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }}
        }}
    </style>
</head>
<body>

    <!-- COVER PAGE -->
    <div class="cover-page">
        <div class="cover-logo">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M50 15 C25 15, 10 35, 10 55 C10 75, 25 90, 50 90 C75 90, 90 75, 90 55 C90 35, 75 15, 50 15Z" stroke="#003B46" stroke-width="4" fill="none"/>
                <path d="M35 45 C35 35, 65 35, 65 45" stroke="#003B46" stroke-width="3" fill="none"/>
                <circle cx="38" cy="50" r="4" fill="#003B46"/>
                <circle cx="62" cy="50" r="4" fill="#003B46"/>
                <path d="M38 65 C43 72, 57 72, 62 65" stroke="#003B46" stroke-width="3" fill="none"/>
                <path d="M30 30 C35 20, 50 15, 50 15 C50 15, 65 20, 70 30" stroke="#003B46" stroke-width="2" fill="none"/>
            </svg>
        </div>
        <div class="cover-title">NLP Practitioner</div>
        <div class="cover-subtitle">חוברת לימוד מקיפה</div>
        <div class="cover-instructor">מרצה: רם אלוס</div>
        <div class="cover-brand">
            <div class="cover-slogan">ריפוי הנפש לכל אדם</div>
            <div class="cover-org">בית המטפלים | www.therapist-home.com</div>
        </div>
    </div>

    <!-- CONTENT WRAPPER START -->
    <div class="content-wrapper">

    <!-- TABLE OF CONTENTS -->
    <div class="toc-page">
        <h1 class="toc-title">תוכן עניינים</h1>
        {toc_html}
    </div>

    <!-- INTRO LETTER -->
    {intro_html}

    <!-- CONTENT -->
    {content_html}

    <!-- FOOTER -->
    <div class="page-footer">
        <span class="brand">בית המטפלים</span> | כל הזכויות שמורות &copy; 2026 | www.therapist-home.com
        <br>חוברת זו מיועדת ללמידה אישית בלבד. אין להפיץ, להעתיק או לעשות שימוש מסחרי ללא אישור בכתב.
    </div>

    </div><!-- END CONTENT WRAPPER -->

    <!-- BACK COVER -->
    <div class="back-cover">
        <h2>בית המטפלים</h2>
        <p>ריפוי הנפש לכל אדם</p>
        <p style="font-size: 12pt; color: rgba(255,255,255,0.8); margin-top: 20px;">
            קורסים מקצועיים | הכשרות מטפלים | קהילה תומכת
        </p>
        <p style="font-size: 12pt; color: rgba(255,255,255,0.6);">
            www.therapist-home.com
        </p>
        <div class="copyright">
            &copy; 2026 בית המטפלים - כל הזכויות שמורות.<br>
            אין להעתיק, לשכפל, לצלם, להקליט, לתרגם, לאחסן במאגר מידע,<br>
            לשדר או לקלוט בכל דרך או בכל אמצעי אלקטרוני, אופטי, מכני או אחר<br>
            כל חלק שהוא מחוברת זו ללא קבלת רשות בכתב מבית המטפלים.
        </div>
    </div>

</body>
</html>'''

    return html

def main():
    print('Extracting PDF...')
    pages = extract_pages(PDF_PATH)
    print(f'Extracted {len(pages)} pages')

    print('Parsing structure...')
    intro_letter, lessons = parse_structure(pages)
    print(f'Found {len(lessons)} lessons:')
    for l in lessons:
        print(f'  שיעור {l["number"]}: {l["title"]} ({len(l["chapters"])} פרקים)')

    print('Generating HTML...')
    html = generate_html(intro_letter, lessons)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f'Done! Output: {OUTPUT_PATH}')
    print(f'File size: {len(html):,} chars')

if __name__ == '__main__':
    main()
