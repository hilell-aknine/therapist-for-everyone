"""
Download and transcribe missing NLP lessons using Whisper
"""

import json
import os
import sys
import io
import tempfile
import subprocess

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Videos that are missing transcripts (from modules 4-7)
MISSING_VIDEOS = [
    # Module 4 (remaining)
    {"module": 4, "lesson": 3, "id": "deckGQrRYd4", "title": "מערכת אודיטורית", "duration": "14:20"},
    {"module": 4, "lesson": 4, "id": "cSGrhFYSDmE", "title": "מערכת קינסטטית", "duration": "16:10"},
    {"module": 4, "lesson": 5, "id": "gG-3I_TcHe4", "title": "זיהוי מערכת מועדפת", "duration": "17:35"},
    {"module": 4, "lesson": 6, "id": "b_b4hhclmR8", "title": "התאמת תקשורת", "duration": "15:50"},
    {"module": 4, "lesson": 7, "id": "itbteM8UjBE", "title": "סיכום המודול", "duration": "11:15"},
    # Module 5
    {"module": 5, "lesson": 1, "id": "BNBPxr-Qec0", "title": "ששת הצרכים הבסיסיים", "duration": "16:40"},
    {"module": 5, "lesson": 2, "id": "h7b8sX0z4nw", "title": "וודאות ומגוון", "duration": "14:25"},
    {"module": 5, "lesson": 3, "id": "mphxQlNsGYM", "title": "משמעות וחיבור", "duration": "15:50"},
    {"module": 5, "lesson": 4, "id": "Y8ulYYg5XDk", "title": "צמיחה ותרומה", "duration": "17:15"},
    {"module": 5, "lesson": 5, "id": "dNKcCwvjVWk", "title": "מבנה האישיות", "duration": "18:30"},
    {"module": 5, "lesson": 6, "id": "Gp7gT4TC1n8", "title": "עבודה עם חלקים", "duration": "16:45"},
    {"module": 5, "lesson": 7, "id": "5SDIvzco0K4", "title": "סיכום המודול", "duration": "12:10"},
    # Module 6
    {"module": 6, "lesson": 1, "id": "EeGfP30AiLs", "title": "כוח המסגור", "duration": "14:35"},
    {"module": 6, "lesson": 2, "id": "I_tnGW-RYmE", "title": "ריפריימינג", "duration": "16:20"},
    {"module": 6, "lesson": 3, "id": "akbG-4zxER4", "title": "ניהול מצבים רגשיים", "duration": "17:45"},
    {"module": 6, "lesson": 4, "id": "AO6lf_seCqs", "title": "מה הם עוגנים", "duration": "13:50"},
    {"module": 6, "lesson": 5, "id": "NcSAnR6WWD4", "title": "יצירת עוגנים חיוביים", "duration": "18:15"},
    {"module": 6, "lesson": 6, "id": "bceR1CAGv34", "title": "קריסת עוגנים שליליים", "duration": "15:30"},
    {"module": 6, "lesson": 7, "id": "kndSAREj7qQ", "title": "עוגנים בטיפול", "duration": "16:55"},
    {"module": 6, "lesson": 8, "id": "X9SUBv6maGs", "title": "סיכום המודול", "duration": "11:40"},
    # Module 7
    {"module": 7, "lesson": 1, "id": "97cbIvdEz8Q", "title": "כוחן של אמונות", "duration": "15:25"},
    {"module": 7, "lesson": 2, "id": "ieDGCAvev4w", "title": "זיהוי אמונות מגבילות", "duration": "17:10"},
    {"module": 7, "lesson": 3, "id": "ySTzDrBml10", "title": "שינוי אמונות", "duration": "18:35"},
    {"module": 7, "lesson": 4, "id": "zWKwwChuEfs", "title": "מבוא לציר הזמן", "duration": "14:50"},
    {"module": 7, "lesson": 5, "id": "On9odKKss24", "title": "טיפול בעבר", "duration": "16:20"},
    {"module": 7, "lesson": 6, "id": "BE5RLAj1Be4", "title": "בניית עתיד", "duration": "17:45"},
    {"module": 7, "lesson": 7, "id": "K_JGmX8Cq-I", "title": "אינטגרציה", "duration": "15:30"},
    {"module": 7, "lesson": 8, "id": "EeFCN9Tddh8", "title": "סיכום הקורס", "duration": "12:55"},
]


def download_audio(video_id, output_path):
    """Download audio from YouTube video using yt-dlp as Python module."""
    import yt_dlp

    url = f"https://www.youtube.com/watch?v={video_id}"

    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': output_path.replace('.mp3', ''),
        'quiet': True,
        'no_warnings': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return True
    except Exception as e:
        print(f"Error downloading: {e}")
        return False


def transcribe_audio(audio_path, model):
    """Transcribe audio file using Whisper."""
    result = model.transcribe(audio_path, language="he")
    return result["text"]


def main():
    import whisper

    print("Loading Whisper model (medium)...")
    model = whisper.load_model("medium")
    print("Model loaded!\n")

    output_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    docs_dir = os.path.join(output_dir, 'docs')

    # Load existing transcripts
    json_file = os.path.join(docs_dir, 'nlp-course-transcripts.json')
    with open(json_file, 'r', encoding='utf-8') as f:
        all_transcripts = json.load(f)

    # Create temp directory for audio files
    temp_dir = tempfile.mkdtemp()

    successful = 0
    failed = 0

    for video in MISSING_VIDEOS:
        video_id = video['id']
        title = video['title']
        module_idx = video['module'] - 1
        lesson_idx = video['lesson'] - 1

        print(f"Processing {video['module']}.{video['lesson']}: {title} ({video_id})...")

        # Download audio
        audio_path = os.path.join(temp_dir, f"{video_id}.mp3")
        print(f"  Downloading audio...", end=" ")

        if not download_audio(video_id, audio_path):
            print("FAILED")
            failed += 1
            continue
        print("OK")

        # Transcribe
        print(f"  Transcribing with Whisper...", end=" ")
        try:
            transcript = transcribe_audio(audio_path, model)
            print("OK")
            successful += 1

            # Update the transcript in the data structure
            all_transcripts[module_idx]['lessons'][lesson_idx]['transcript'] = transcript

            # Clean up audio file
            os.remove(audio_path)

        except Exception as e:
            print(f"FAILED: {e}")
            failed += 1

    # Save updated JSON
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(all_transcripts, f, ensure_ascii=False, indent=2)

    # Regenerate markdown file
    md_file = os.path.join(docs_dir, 'nlp-course-transcripts.md')
    markdown_content = []
    markdown_content.append("# תמלולי קורס NLP - יסודות ומעשה\n")
    markdown_content.append("## 51 שיעורים | 7 מודולים\n\n")
    markdown_content.append("---\n\n")

    for module in all_transcripts:
        markdown_content.append(f"# מודול {module['id']}: {module['title']}\n\n")

        for i, lesson in enumerate(module['lessons'], 1):
            markdown_content.append(f"## שיעור {module['id']}.{i}: {lesson['title']}\n")
            markdown_content.append(f"**משך:** {lesson['duration']} | ")
            markdown_content.append(f"**קישור:** [צפה ביוטיוב]({lesson['youtube_url']})\n\n")

            if lesson['transcript']:
                markdown_content.append(f"### תמלול:\n{lesson['transcript']}\n\n")
            else:
                markdown_content.append("### תמלול:\n*תמלול אינו זמין לסרטון זה*\n\n")

            markdown_content.append("---\n\n")

    with open(md_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(markdown_content))

    print(f"\n{'='*50}")
    print(f"Summary:")
    print(f"  Successfully transcribed: {successful}")
    print(f"  Failed: {failed}")
    print(f"\nFiles updated:")
    print(f"  {json_file}")
    print(f"  {md_file}")

    # Cleanup temp dir
    try:
        os.rmdir(temp_dir)
    except:
        pass


if __name__ == "__main__":
    main()
