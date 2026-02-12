"""
Download YouTube transcriptions for all 51 NLP lessons
"""

import json
import os
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound

# Course structure with all 51 videos
MODULES = [
    {
        "id": 1,
        "title": "מבוא ל-NLP ויסודות",
        "lessons": [
            {"id": "HdJTrqV-8kw", "title": "פתיחה והיכרות", "duration": "12:30"},
            {"id": "I4r3oERlZpc", "title": "עקרונות יסוד", "duration": "15:45"},
            {"id": "zGuxyfbYdUY", "title": "מודל התקשורת", "duration": "18:20"},
            {"id": "fo90wrXPJjQ", "title": "מערכות ייצוג", "duration": "14:10"},
            {"id": "kccllbuObhs", "title": "קריאת שפת גוף", "duration": "16:55"},
            {"id": "ahN0Q2wGVa0", "title": "בניית ראפור", "duration": "13:40"},
            {"id": "Nt8MK8CNvYo", "title": "התאמה והובלה", "duration": "17:25"},
            {"id": "-PMCuz1jiMk", "title": "סיכום המודול", "duration": "10:15"}
        ]
    },
    {
        "id": 2,
        "title": "עמדות תפיסה ומערכות יחסים",
        "lessons": [
            {"id": "3u52ghUdM9E", "title": "שלוש עמדות התפיסה", "duration": "14:20"},
            {"id": "lfDEJFV3EO0", "title": "מבט מעיני האחר", "duration": "16:35"},
            {"id": "ldz6Kb9hqW8", "title": "עמדת הצופה", "duration": "12:50"},
            {"id": "-qk4et9hKCc", "title": "תרגול מעשי", "duration": "18:15"},
            {"id": "ZxpaiqBCN-A", "title": "יישום במערכות יחסים", "duration": "15:40"},
            {"id": "NtzzbQKPfuQ", "title": "סיכום המודול", "duration": "11:25"}
        ]
    },
    {
        "id": 3,
        "title": "שאלות עוצמתיות והצבת מטרות",
        "lessons": [
            {"id": "5EEb8n1rkk8", "title": "כוחה של שאלה טובה", "duration": "13:45"},
            {"id": "JlRGFcHIlaY", "title": "מטא-מודל בשפה", "duration": "17:20"},
            {"id": "9vOt4qMDErY", "title": "שאלות מעמיקות", "duration": "15:10"},
            {"id": "M5WYHElp77Y", "title": "הגדרת מטרות SMART", "duration": "16:35"},
            {"id": "_8wvtMUInNg", "title": "Well-Formed Outcomes", "duration": "14:50"},
            {"id": "HfeTbx94Z_A", "title": "תרגול מעשי", "duration": "18:25"},
            {"id": "wxswFMy0FFs", "title": "סיכום המודול", "duration": "10:40"}
        ]
    },
    {
        "id": 4,
        "title": "השפה של המוח ומערכות ייצוג",
        "lessons": [
            {"id": "bYgv5dLr5DU", "title": "איך המוח מעבד מידע", "duration": "15:30"},
            {"id": "rfeUPA9HcU4", "title": "מערכת ויזואלית", "duration": "13:45"},
            {"id": "deckGQrRYd4", "title": "מערכת אודיטורית", "duration": "14:20"},
            {"id": "cSGrhFYSDmE", "title": "מערכת קינסטטית", "duration": "16:10"},
            {"id": "gG-3I_TcHe4", "title": "זיהוי מערכת מועדפת", "duration": "17:35"},
            {"id": "b_b4hhclmR8", "title": "התאמת תקשורת", "duration": "15:50"},
            {"id": "itbteM8UjBE", "title": "סיכום המודול", "duration": "11:15"}
        ]
    },
    {
        "id": 5,
        "title": "צרכים אנושיים ומבנה האישיות",
        "lessons": [
            {"id": "BNBPxr-Qec0", "title": "ששת הצרכים הבסיסיים", "duration": "16:40"},
            {"id": "h7b8sX0z4nw", "title": "וודאות ומגוון", "duration": "14:25"},
            {"id": "mphxQlNsGYM", "title": "משמעות וחיבור", "duration": "15:50"},
            {"id": "Y8ulYYg5XDk", "title": "צמיחה ותרומה", "duration": "17:15"},
            {"id": "dNKcCwvjVWk", "title": "מבנה האישיות", "duration": "18:30"},
            {"id": "Gp7gT4TC1n8", "title": "עבודה עם חלקים", "duration": "16:45"},
            {"id": "5SDIvzco0K4", "title": "סיכום המודול", "duration": "12:10"}
        ]
    },
    {
        "id": 6,
        "title": "מסגור, שליטה ברגשות ועוגנים",
        "lessons": [
            {"id": "EeGfP30AiLs", "title": "כוח המסגור", "duration": "14:35"},
            {"id": "I_tnGW-RYmE", "title": "ריפריימינג", "duration": "16:20"},
            {"id": "akbG-4zxER4", "title": "ניהול מצבים רגשיים", "duration": "17:45"},
            {"id": "AO6lf_seCqs", "title": "מה הם עוגנים", "duration": "13:50"},
            {"id": "NcSAnR6WWD4", "title": "יצירת עוגנים חיוביים", "duration": "18:15"},
            {"id": "bceR1CAGv34", "title": "קריסת עוגנים שליליים", "duration": "15:30"},
            {"id": "kndSAREj7qQ", "title": "עוגנים בטיפול", "duration": "16:55"},
            {"id": "X9SUBv6maGs", "title": "סיכום המודול", "duration": "11:40"}
        ]
    },
    {
        "id": 7,
        "title": "אמונות וציר הזמן",
        "lessons": [
            {"id": "97cbIvdEz8Q", "title": "כוחן של אמונות", "duration": "15:25"},
            {"id": "ieDGCAvev4w", "title": "זיהוי אמונות מגבילות", "duration": "17:10"},
            {"id": "ySTzDrBml10", "title": "שינוי אמונות", "duration": "18:35"},
            {"id": "zWKwwChuEfs", "title": "מבוא לציר הזמן", "duration": "14:50"},
            {"id": "On9odKKss24", "title": "טיפול בעבר", "duration": "16:20"},
            {"id": "BE5RLAj1Be4", "title": "בניית עתיד", "duration": "17:45"},
            {"id": "K_JGmX8Cq-I", "title": "אינטגרציה", "duration": "15:30"},
            {"id": "EeFCN9Tddh8", "title": "סיכום הקורס", "duration": "12:55"}
        ]
    }
]


def get_transcript(video_id):
    """Get transcript for a YouTube video, trying Hebrew first then auto-generated."""
    api = YouTubeTranscriptApi()

    try:
        # Try Hebrew (iw is the old code for Hebrew on YouTube)
        transcript = api.fetch(video_id, languages=['iw', 'he'])
        return transcript
    except:
        pass

    try:
        # Try any available transcript
        transcript = api.fetch(video_id)
        return transcript
    except TranscriptsDisabled:
        return None
    except NoTranscriptFound:
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None


def transcript_to_text(transcript_data):
    """Convert transcript data to plain text."""
    if not transcript_data:
        return None
    # Handle new API format (FetchedTranscript with FetchedTranscriptSnippet objects)
    try:
        return " ".join([snippet.text for snippet in transcript_data])
    except:
        # Fallback for dict format
        return " ".join([entry['text'] for entry in transcript_data])


def main():
    import sys
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

    output_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    docs_dir = os.path.join(output_dir, 'docs')
    os.makedirs(docs_dir, exist_ok=True)

    output_file = os.path.join(docs_dir, 'nlp-course-transcripts.md')
    json_file = os.path.join(docs_dir, 'nlp-course-transcripts.json')

    all_transcripts = []
    markdown_content = []

    markdown_content.append("# תמלולי קורס NLP - יסודות ומעשה\n")
    markdown_content.append("## 51 שיעורים | 7 מודולים\n\n")
    markdown_content.append("---\n\n")

    total_lessons = 0
    successful = 0
    failed = 0

    for module in MODULES:
        print(f"\nModule {module['id']}: {module['title']}")
        markdown_content.append(f"# מודול {module['id']}: {module['title']}\n\n")

        module_data = {
            "id": module['id'],
            "title": module['title'],
            "lessons": []
        }

        for i, lesson in enumerate(module['lessons'], 1):
            total_lessons += 1
            video_id = lesson['id']
            print(f"  Lesson {i}: {lesson['title']} ({video_id})...", end=" ")

            transcript_data = get_transcript(video_id)
            transcript_text = transcript_to_text(transcript_data)

            lesson_data = {
                "id": video_id,
                "title": lesson['title'],
                "duration": lesson['duration'],
                "transcript": transcript_text,
                "youtube_url": f"https://www.youtube.com/watch?v={video_id}"
            }
            module_data['lessons'].append(lesson_data)

            markdown_content.append(f"## שיעור {module['id']}.{i}: {lesson['title']}\n")
            markdown_content.append(f"**משך:** {lesson['duration']} | ")
            markdown_content.append(f"**קישור:** [צפה ביוטיוב](https://www.youtube.com/watch?v={video_id})\n\n")

            if transcript_text:
                successful += 1
                print("OK")
                markdown_content.append(f"### תמלול:\n{transcript_text}\n\n")
            else:
                failed += 1
                print("NO TRANSCRIPT")
                markdown_content.append("### תמלול:\n*תמלול אינו זמין לסרטון זה*\n\n")

            markdown_content.append("---\n\n")

        all_transcripts.append(module_data)

    # Write markdown file
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(markdown_content))

    # Write JSON file
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(all_transcripts, f, ensure_ascii=False, indent=2)

    print(f"\n\n{'='*50}")
    print(f"Summary:")
    print(f"  Total lessons: {total_lessons}")
    print(f"  Transcripts downloaded: {successful}")
    print(f"  No transcript: {failed}")
    print(f"\nFiles created:")
    print(f"  {output_file}")
    print(f"  {json_file}")


if __name__ == "__main__":
    main()
