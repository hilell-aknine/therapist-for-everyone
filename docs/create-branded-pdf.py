#!/usr/bin/env python3
"""
Create branded NLP course booklet PDF
"""

import re
from pathlib import Path

# Read the raw content
content_file = Path(__file__).parent / "nlp-content-raw.txt"
raw_content = content_file.read_text(encoding='utf-8')

# Clean up the content - remove numbers at beginning and "ה20 החדש" references
content = raw_content
content = re.sub(r'^\d+\s*', '', content)  # Remove leading numbers
content = re.sub(r'ה20 החדש', '', content)  # Remove "ה20 החדש" logo/text
content = re.sub(r'ה-?20 החדש', '', content)
content = re.sub(r'העשרים החדש', '', content)

# Split content into sections based on common patterns
sections = []
current_section = {"title": "הקדמה", "content": ""}

# Define chapter titles to look for
chapter_titles = [
    "מה זה NLP",
    "3 הרמות",
    "מודל התקשורת",
    "תקשורת לא מילולית",
    "ראפור",
    "הנחות יסוד",
    "ויזואליזציה ודמיון",
    "עמדות תפיסה",
    "מסע בין יועצים",
    "מטה מודל",
    "דיוק OUTCOME",
    "סדר פעולות לכל תהליך",
    "מערכות ייצוג",
    "תתי חושים",
    "אקולוגיה",
    "מסגור וריפריים",
    "פריפריים",
    "מודל הצרכים של טוני רובינס",
    "עוגנים",
    "סטייט",
    "הרגלים",
    "אמונות",
    "מודל רמות לוגיות",
    "סיכום"
]

# Create the HTML template with branding
html_template = '''<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>חוברת קורס NLP Practitioner | מטפל לכל אחד</title>
    <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        @page {
            size: A4;
            margin: 15mm 20mm 20mm 20mm;
        }

        * {
            box-sizing: border-box;
        }

        html, body {
            margin: 0;
            padding: 0;
            font-family: 'Heebo', sans-serif;
            direction: rtl;
            text-align: right;
            font-size: 11pt;
            line-height: 1.7;
            color: #003B46;
            background: #fff;
        }

        /* Branding Colors */
        :root {
            --deep-petrol: #003B46;
            --muted-teal: #00606B;
            --dusty-aqua: #2F8592;
            --frost-white: #E8F1F2;
            --gold: #D4AF37;
        }

        /* Cover Page */
        .cover-page {
            page-break-after: always;
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background: linear-gradient(135deg, var(--deep-petrol) 0%, var(--muted-teal) 100%);
            color: white;
            text-align: center;
            padding: 40px;
        }

        .cover-logo {
            width: 120px;
            height: 120px;
            background: var(--gold);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 40px;
            font-size: 48px;
            font-weight: 900;
            color: var(--deep-petrol);
        }

        .cover-title {
            font-size: 42pt;
            font-weight: 900;
            margin-bottom: 20px;
            color: white;
        }

        .cover-subtitle {
            font-size: 24pt;
            font-weight: 300;
            color: var(--gold);
            margin-bottom: 40px;
        }

        .cover-instructor {
            font-size: 16pt;
            color: var(--frost-white);
            margin-top: 20px;
        }

        .cover-slogan {
            font-size: 14pt;
            color: var(--frost-white);
            opacity: 0.8;
            margin-top: 60px;
            padding-top: 20px;
            border-top: 1px solid rgba(255,255,255,0.3);
        }

        /* Table of Contents */
        .toc-page {
            page-break-after: always;
            padding: 40px 20px;
        }

        .toc-title {
            font-size: 28pt;
            font-weight: 700;
            color: var(--deep-petrol);
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 15px;
            border-bottom: 3px solid var(--gold);
        }

        .toc-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .toc-item {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            padding: 12px 0;
            border-bottom: 1px dotted var(--dusty-aqua);
            font-size: 12pt;
        }

        .toc-item-title {
            font-weight: 600;
            color: var(--deep-petrol);
        }

        .toc-item-page {
            color: var(--gold);
            font-weight: 700;
        }

        /* Chapter Styling */
        .chapter {
            page-break-before: always;
            padding: 20px 0;
        }

        .chapter:first-of-type {
            page-break-before: avoid;
        }

        .chapter-header {
            background: linear-gradient(135deg, var(--deep-petrol) 0%, var(--muted-teal) 100%);
            color: white;
            padding: 30px;
            margin: -15mm -20mm 30px -20mm;
            position: relative;
        }

        .chapter-number {
            font-size: 14pt;
            font-weight: 300;
            color: var(--gold);
            margin-bottom: 10px;
        }

        .chapter-title {
            font-size: 28pt;
            font-weight: 800;
            margin: 0;
        }

        .chapter-content {
            padding: 0 10px;
        }

        /* Content Styling */
        h1 {
            font-size: 24pt;
            font-weight: 800;
            color: var(--deep-petrol);
            margin: 30px 0 20px 0;
            padding-bottom: 10px;
            border-bottom: 2px solid var(--gold);
        }

        h2 {
            font-size: 18pt;
            font-weight: 700;
            color: var(--muted-teal);
            margin: 25px 0 15px 0;
        }

        h3 {
            font-size: 14pt;
            font-weight: 600;
            color: var(--dusty-aqua);
            margin: 20px 0 10px 0;
        }

        p {
            margin: 0 0 15px 0;
            text-align: justify;
        }

        /* Lists */
        ul, ol {
            margin: 15px 0;
            padding-right: 25px;
        }

        li {
            margin-bottom: 8px;
        }

        /* Boxes */
        .highlight-box {
            background: var(--frost-white);
            border-right: 4px solid var(--gold);
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }

        .exercise-box {
            background: linear-gradient(to left, var(--frost-white), white);
            border: 2px solid var(--dusty-aqua);
            border-radius: 12px;
            padding: 25px;
            margin: 25px 0;
        }

        .exercise-box h4 {
            color: var(--muted-teal);
            font-size: 14pt;
            margin: 0 0 15px 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .exercise-box h4::before {
            content: "✏️";
        }

        .tip-box {
            background: linear-gradient(135deg, var(--deep-petrol), var(--muted-teal));
            color: white;
            padding: 20px;
            border-radius: 12px;
            margin: 20px 0;
        }

        .tip-box strong {
            color: var(--gold);
        }

        /* Tables */
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }

        th {
            background: var(--deep-petrol);
            color: white;
            padding: 12px;
            text-align: right;
            font-weight: 600;
        }

        td {
            padding: 10px 12px;
            border-bottom: 1px solid var(--frost-white);
        }

        tr:nth-child(even) {
            background: var(--frost-white);
        }

        /* Footer */
        .page-footer {
            position: fixed;
            bottom: 10mm;
            left: 20mm;
            right: 20mm;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 9pt;
            color: var(--dusty-aqua);
            border-top: 1px solid var(--frost-white);
            padding-top: 10px;
        }

        .page-footer .brand {
            font-weight: 600;
        }

        /* Print styles */
        @media print {
            .chapter {
                page-break-inside: avoid;
            }

            .highlight-box, .exercise-box, .tip-box {
                page-break-inside: avoid;
            }
        }

        /* Decorative elements */
        .decorative-line {
            height: 3px;
            background: linear-gradient(to left, var(--gold), transparent);
            margin: 30px 0;
        }

        .section-divider {
            text-align: center;
            margin: 40px 0;
            color: var(--gold);
            font-size: 24pt;
        }

        .section-divider::before {
            content: "◆ ◆ ◆";
        }
    </style>
</head>
<body>
    <!-- Cover Page -->
    <div class="cover-page">
        <div class="cover-logo">NLP</div>
        <h1 class="cover-title">NLP Practitioner</h1>
        <p class="cover-subtitle">חוברת הקורס המלאה</p>
        <p class="cover-instructor">מרצה: רם אלוס</p>
        <p class="cover-slogan">ריפוי הנפש לכל אדם | מטפל לכל אחד</p>
    </div>

    <!-- Table of Contents -->
    <div class="toc-page">
        <h1 class="toc-title">תוכן עניינים</h1>
        <ul class="toc-list">
            <li class="toc-item"><span class="toc-item-title">הקדמה</span><span class="toc-item-page">3</span></li>
            <li class="toc-item"><span class="toc-item-title">3 הרמות ב-NLP</span><span class="toc-item-page">7</span></li>
            <li class="toc-item"><span class="toc-item-title">מודל התקשורת</span><span class="toc-item-page">12</span></li>
            <li class="toc-item"><span class="toc-item-title">תקשורת לא מילולית</span><span class="toc-item-page">18</span></li>
            <li class="toc-item"><span class="toc-item-title">ראפור</span><span class="toc-item-page">21</span></li>
            <li class="toc-item"><span class="toc-item-title">הנחות יסוד</span><span class="toc-item-page">24</span></li>
            <li class="toc-item"><span class="toc-item-title">ויזואליזציה ודמיון</span><span class="toc-item-page">27</span></li>
            <li class="toc-item"><span class="toc-item-title">עמדות תפיסה</span><span class="toc-item-page">29</span></li>
            <li class="toc-item"><span class="toc-item-title">מסע בין יועצים</span><span class="toc-item-page">35</span></li>
            <li class="toc-item"><span class="toc-item-title">מטה מודל</span><span class="toc-item-page">37</span></li>
            <li class="toc-item"><span class="toc-item-title">דיוק OUTCOME (מטרות)</span><span class="toc-item-page">45</span></li>
            <li class="toc-item"><span class="toc-item-title">סדר פעולות לכל תהליך</span><span class="toc-item-page">49</span></li>
            <li class="toc-item"><span class="toc-item-title">מערכות ייצוג</span><span class="toc-item-page">50</span></li>
            <li class="toc-item"><span class="toc-item-title">תתי חושים</span><span class="toc-item-page">56</span></li>
            <li class="toc-item"><span class="toc-item-title">אקולוגיה</span><span class="toc-item-page">69</span></li>
            <li class="toc-item"><span class="toc-item-title">מסגור וריפריים</span><span class="toc-item-page">71</span></li>
            <li class="toc-item"><span class="toc-item-title">פריפריים</span><span class="toc-item-page">75</span></li>
            <li class="toc-item"><span class="toc-item-title">מודל הצרכים של טוני רובינס</span><span class="toc-item-page">78</span></li>
            <li class="toc-item"><span class="toc-item-title">עוגנים</span><span class="toc-item-page">81</span></li>
            <li class="toc-item"><span class="toc-item-title">סטייט</span><span class="toc-item-page">89</span></li>
            <li class="toc-item"><span class="toc-item-title">הרגלים</span><span class="toc-item-page">91</span></li>
            <li class="toc-item"><span class="toc-item-title">אמונות</span><span class="toc-item-page">98</span></li>
            <li class="toc-item"><span class="toc-item-title">מודל רמות לוגיות</span><span class="toc-item-page">107</span></li>
            <li class="toc-item"><span class="toc-item-title">סיכום</span><span class="toc-item-page">112</span></li>
        </ul>
    </div>

    {CONTENT}

</body>
</html>'''

def format_content_as_html(text):
    """Convert raw text to structured HTML"""

    # Clean up text
    text = text.strip()

    # Remove "ה20 החדש" references
    text = re.sub(r'ה-?20 החדש', '', text)
    text = re.sub(r'העשרים החדש', '', text)

    # Split by main sections
    sections = []
    current = ""

    # Add chapter markers
    chapter_markers = [
        ("מה זה NLP", "מה זה NLP?"),
        ("3 הרמות בNLP", "3 הרמות ב-NLP"),
        ("מודל התקשורת של ה NLP", "מודל התקשורת של ה-NLP"),
        ("תקשורת לא מילולית", "תקשורת לא מילולית"),
        ("ראפור", "ראפור"),
        ("הנחות היסוד של ה nlp", "הנחות היסוד של ה-NLP"),
        ("ויזואליזציה ודמיון", "ויזואליזציה ודמיון"),
        ("עמדות תפיסה", "עמדות תפיסה"),
        ("מסע בין יועצים", "מסע בין יועצים"),
        ("מטה מודל", "מטה מודל"),
        ("דיוק OUTCOME", "דיוק OUTCOME (מטרות)"),
        ("סדר פעולות לכל תהליך", "סדר פעולות לכל תהליך"),
        ("מערכות ייצוג", "מערכות ייצוג"),
        ("תתי חושים", "תתי חושים (Sub-Modalities)"),
        ("אקולוגיה", "אקולוגיה"),
        ("מסגור וריפריים", "מסגור ורי-פריים"),
        ("מודל הצרכים של טוני רובינס", "מודל הצרכים של טוני רובינס"),
        ("עוגנים", "עוגנים"),
        ("סטייט", "סטייט"),
        ("הרגלים", "הרגלים"),
        ("אמונות", "אמונות"),
        ("מודל רמות לוגיות", "מודל רמות לוגיות"),
    ]

    html_content = []
    chapter_num = 1

    # Process the main content
    lines = text.split('\n')
    current_chapter = "הקדמה"
    chapter_content = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Check if this is a chapter header
        is_chapter = False
        for marker, title in chapter_markers:
            if marker.lower() in line.lower() and len(line) < 100:
                if chapter_content:
                    html_content.append(create_chapter_html(chapter_num, current_chapter, chapter_content))
                    chapter_num += 1
                current_chapter = title
                chapter_content = []
                is_chapter = True
                break

        if not is_chapter and line:
            chapter_content.append(line)

    # Add the last chapter
    if chapter_content:
        html_content.append(create_chapter_html(chapter_num, current_chapter, chapter_content))

    return '\n'.join(html_content)

def create_chapter_html(num, title, content_lines):
    """Create HTML for a single chapter"""
    content_html = []

    for line in content_lines:
        # Skip empty lines
        if not line.strip():
            continue

        # Check if it's a sub-heading (short lines that end with :)
        if len(line) < 60 and (line.endswith(':') or line.endswith('?')):
            content_html.append(f'<h2>{line}</h2>')
        # Check for exercise markers
        elif 'תרגיל' in line.lower():
            content_html.append(f'<div class="exercise-box"><h4>{line}</h4>')
        # Check for bullet points
        elif line.startswith('-') or line.startswith('•'):
            content_html.append(f'<li>{line[1:].strip()}</li>')
        else:
            content_html.append(f'<p>{line}</p>')

    return f'''
    <div class="chapter">
        <div class="chapter-header">
            <div class="chapter-number">פרק {num}</div>
            <h1 class="chapter-title">{title}</h1>
        </div>
        <div class="chapter-content">
            {''.join(content_html)}
        </div>
    </div>
    '''

# Main execution
if __name__ == "__main__":
    # Read raw content
    with open(content_file, 'r', encoding='utf-8') as f:
        raw = f.read()

    # Clean and process
    cleaned = raw
    cleaned = re.sub(r'ה-?20 החדש', '', cleaned)
    cleaned = re.sub(r'העשרים החדש', '', cleaned)
    cleaned = re.sub(r'^\d+\s*', '', cleaned)

    # Generate HTML content
    content_html = format_content_as_html(cleaned)

    # Create final HTML
    final_html = html_template.replace('{CONTENT}', content_html)

    # Write output
    output_file = Path(__file__).parent / "nlp-booklet-branded.html"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(final_html)

    print(f"Created: {output_file}")
