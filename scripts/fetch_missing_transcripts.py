"""
Step 1: Try YouTube captions for all missing lessons.
Step 2: For any still missing, use Whisper small model.
Updates nlp-course-transcripts.json and .md in place.
"""

import json
import os
import sys
import io
import tempfile

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'docs')
JSON_FILE = os.path.join(DOCS_DIR, 'nlp-course-transcripts.json')
MD_FILE = os.path.join(DOCS_DIR, 'nlp-course-transcripts.md')


def load_transcripts():
    with open(JSON_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_transcripts(data):
    with open(JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


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


def find_missing(data):
    """Return list of (module_idx, lesson_idx, video_id, title) for missing transcripts."""
    missing = []
    for mi, module in enumerate(data):
        for li, lesson in enumerate(module['lessons']):
            if not lesson.get('transcript'):
                missing.append((mi, li, lesson['id'], lesson['title']))
    return missing


def try_youtube_captions(video_id):
    """Try to get YouTube captions (Hebrew or auto-generated)."""
    from youtube_transcript_api import YouTubeTranscriptApi
    api = YouTubeTranscriptApi()

    # Try Hebrew captions
    for langs in [['iw', 'he'], ['iw'], ['he']]:
        try:
            transcript = api.fetch(video_id, languages=langs)
            text = " ".join([s.text for s in transcript])
            if text.strip():
                return text
        except:
            pass

    # Try any available transcript
    try:
        transcript = api.fetch(video_id)
        text = " ".join([s.text for s in transcript])
        if text.strip():
            return text
    except:
        pass

    return None


def transcribe_with_whisper(video_id, model):
    """Download audio and transcribe with Whisper."""
    import yt_dlp

    temp_dir = tempfile.mkdtemp()
    audio_path = os.path.join(temp_dir, f"{video_id}.mp3")

    url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '128',
        }],
        'outtmpl': audio_path.replace('.mp3', ''),
        'quiet': True,
        'no_warnings': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
    except Exception as e:
        print(f"    Download failed: {e}")
        return None

    try:
        result = model.transcribe(audio_path, language="he")
        text = result["text"]
        os.remove(audio_path)
        try:
            os.rmdir(temp_dir)
        except:
            pass
        return text
    except Exception as e:
        print(f"    Transcription failed: {e}")
        return None


def main():
    data = load_transcripts()
    missing = find_missing(data)
    print(f"Found {len(missing)} lessons with missing transcripts.\n")

    if not missing:
        print("All lessons already have transcripts!")
        return

    # --- Step 1: Try YouTube captions ---
    print("=" * 50)
    print("STEP 1: Trying YouTube captions...")
    print("=" * 50)

    yt_success = 0
    still_missing = []

    for mi, li, vid, title in missing:
        mod_id = data[mi]['id']
        les_num = li + 1
        print(f"  {mod_id}.{les_num}: {title} ({vid})...", end=" ")

        text = try_youtube_captions(vid)
        if text:
            data[mi]['lessons'][li]['transcript'] = text
            yt_success += 1
            print(f"OK ({len(text)} chars)")
        else:
            still_missing.append((mi, li, vid, title))
            print("NO CAPTIONS")

    print(f"\nYouTube captions: {yt_success}/{len(missing)} successful")
    save_transcripts(data)
    save_markdown(data)
    print("Saved progress.\n")

    if not still_missing:
        print("All done! No Whisper needed.")
        return

    # --- Step 2: Whisper for remaining ---
    print("=" * 50)
    print(f"STEP 2: Whisper transcription for {len(still_missing)} remaining videos...")
    print("=" * 50)

    import whisper
    print("Loading Whisper model (small)...")
    model = whisper.load_model("small")
    print("Model loaded!\n")

    wh_success = 0
    wh_failed = 0

    for mi, li, vid, title in still_missing:
        mod_id = data[mi]['id']
        les_num = li + 1
        print(f"  {mod_id}.{les_num}: {title} ({vid})...")
        print(f"    Downloading & transcribing...", end=" ")

        text = transcribe_with_whisper(vid, model)
        if text:
            data[mi]['lessons'][li]['transcript'] = text
            wh_success += 1
            print(f"OK ({len(text)} chars)")
            # Save after each successful transcription
            save_transcripts(data)
        else:
            wh_failed += 1
            print("FAILED")

    save_markdown(data)

    # --- Summary ---
    total_filled = yt_success + wh_success
    print(f"\n{'=' * 50}")
    print(f"SUMMARY:")
    print(f"  YouTube captions: {yt_success}")
    print(f"  Whisper transcriptions: {wh_success}")
    print(f"  Failed: {wh_failed}")
    print(f"  Total filled: {total_filled}/{len(missing)}")
    print(f"\nFiles updated:")
    print(f"  {JSON_FILE}")
    print(f"  {MD_FILE}")


if __name__ == "__main__":
    main()
