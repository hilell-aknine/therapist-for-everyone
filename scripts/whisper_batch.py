"""
Batch transcribe downloaded MP3 files with Whisper (tiny model for speed on CPU).
Updates nlp-course-transcripts.json with the results.
"""
import json
import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'docs')
AUDIO_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'temp_audio')
JSON_FILE = os.path.join(DOCS_DIR, 'nlp-course-transcripts.json')
MD_FILE = os.path.join(DOCS_DIR, 'nlp-course-transcripts.md')

# Map: (module_idx, lesson_idx) -> audio filename
FILE_MAP = {
    (5, 6): '6_7_NLP.mp3',    # Module 6, Lesson 7
    (5, 7): '6_8_NLP.mp3',    # Module 6, Lesson 8
    (6, 0): '7_1_-_NLP.mp3',  # Module 7, Lesson 1
    (6, 1): '7_2_NLP.mp3',    # Module 7, Lesson 2
    (6, 2): '7_3_NLP.mp3',    # Module 7, Lesson 3
    (6, 3): '7_4_NLP.mp3',    # Module 7, Lesson 4
    (6, 4): '7_5_NLP.mp3',    # Module 7, Lesson 5
    (6, 5): '7_6_NLP.mp3',    # Module 7, Lesson 6
    (6, 6): '7_7_NLP.mp3',    # Module 7, Lesson 7
    (6, 7): '7_8_NLP.mp3',    # Module 7, Lesson 8
}


def save_markdown(data):
    md = []
    md.append("# תמלולי קורס NLP - יסודות ומעשה\n")
    md.append("## 51 שיעורים | 7 מודולים\n\n")
    md.append("---\n\n")
    for module in data:
        md.append(f"# מודול {module['id']}: {module['title']}\n\n")
        for i, lesson in enumerate(module['lessons'], 1):
            md.append(f"## שיעור {module['id']}.{i}: {lesson['title']}\n")
            md.append(f"**משך:** {lesson['duration']} | ")
            md.append(f"**קישור:** [צפה ביוטיוב]({lesson['youtube_url']})\n\n")
            if lesson.get('transcript'):
                md.append(f"### תמלול:\n{lesson['transcript']}\n\n")
            else:
                md.append("### תמלול:\n*תמלול אינו זמין לסרטון זה*\n\n")
            md.append("---\n\n")
    with open(MD_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(md))


def main():
    import whisper

    with open(JSON_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print("Loading Whisper model (base)...")
    model = whisper.load_model("base")
    print("Model loaded!\n")

    successful = 0
    failed = 0

    for (mi, li), filename in sorted(FILE_MAP.items()):
        audio_path = os.path.join(AUDIO_DIR, filename)
        title = data[mi]['lessons'][li]['title']
        mod_id = data[mi]['id']
        les_num = li + 1

        # Skip if already has transcript
        if data[mi]['lessons'][li].get('transcript'):
            print(f"  {mod_id}.{les_num}: {title} - ALREADY HAS TRANSCRIPT, skipping")
            continue

        print(f"  {mod_id}.{les_num}: {title} ({filename})...", end=" ", flush=True)

        if not os.path.exists(audio_path):
            print("FILE NOT FOUND")
            failed += 1
            continue

        try:
            result = model.transcribe(audio_path, language="he")
            text = result["text"]
            data[mi]['lessons'][li]['transcript'] = text
            successful += 1
            print(f"OK ({len(text)} chars)")

            # Save after each successful transcription
            with open(JSON_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

        except Exception as e:
            print(f"FAILED: {e}")
            failed += 1

    # Final save of markdown
    save_markdown(data)

    print(f"\n{'=' * 50}")
    print(f"SUMMARY:")
    print(f"  Successfully transcribed: {successful}")
    print(f"  Failed: {failed}")

    # Count total
    total = 0
    filled = 0
    for m in data:
        for l in m['lessons']:
            total += 1
            if l.get('transcript'):
                filled += 1
    print(f"  Total transcripts: {filled}/{total}")


if __name__ == "__main__":
    main()
