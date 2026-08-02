# -*- coding: utf-8 -*-
"""
study_buddy_seed_invite.py — the one-time WhatsApp that opens the study-buddy pool.

WHY THIS EXISTS
    The matching screen is empty on day one. Nobody can be matched with anyone until
    people have opted in, and the only in-portal prompt (the consent popup) fires after
    a completed lesson — which, with 34 monthly-active learners, reaches almost nobody
    in the first weeks. Every write-up of this problem says the same thing: you seed the
    constrained side by hand before you let the automation take over.

WHO IT WRITES TO
    Learners who are genuinely matchable today: >= 3 distinct completed practitioner
    lessons, a phone on file, active within the last 90 days, not opted out of WhatsApp,
    and not already in study_buddy_prefs (never invite someone who already answered).
    At the time of writing that is ~98 people.

SAFETY
    --dry-run is the DEFAULT. It prints the audience and one sample message and sends
    nothing. Sending requires --send, and even then it refuses to run outside 09:00-20:00
    Israel time, spaces messages 1.5s apart, and writes every send to
    scripts/journey_state/buddy_seed_sent.json so a re-run never messages anyone twice.

USAGE
    py scripts/study_buddy_seed_invite.py                 # dry run, shows audience
    py scripts/study_buddy_seed_invite.py --limit 5 --send   # real send to 5 people
    py scripts/study_buddy_seed_invite.py --send             # the full pool
"""
import argparse
import datetime
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(BASE, '.env.local')
STATE_DIR = os.path.join(BASE, 'scripts', 'journey_state')
STATE_PATH = os.path.join(STATE_DIR, 'buddy_seed_sent.json')

PORTAL_LINK = 'https://www.therapist-home.com/pages/course-library-v2.html#buddy'
MIN_LESSONS = 3
ACTIVE_DAYS = 90
# 4s rather than the ~1.2s the queue drainer uses. This is a bulk send to people who
# have not messaged this number recently, which is the pattern most likely to trip a
# WhatsApp spam flag — and the line being used also runs Hillel's CRM bot, so a ban here
# would take that down too. Slower is cheap: 98 messages still finish in ~7 minutes.
SEND_DELAY_SEC = 4.0
SEND_HOUR_START, SEND_HOUR_END = 9, 20


def load_env():
    cfg = {}
    with open(ENV_PATH, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                cfg[k.strip()] = v.strip().strip('"').strip("'")
    return cfg


CFG = load_env()
SB_URL = CFG['SUPABASE_URL'].rstrip('/')
SB_KEY = CFG['SUPABASE_SERVICE_KEY']
HEADERS = {'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY,
           'Accept-Profile': 'public', 'Content-Profile': 'public'}


def rest(path, params=None):
    q = ('?' + urllib.parse.urlencode(params)) if params else ''
    req = urllib.request.Request(SB_URL + '/rest/v1/' + path + q, headers=dict(HEADERS))
    with urllib.request.urlopen(req, timeout=90) as r:
        body = r.read().decode('utf-8')
        return json.loads(body) if body.strip() else []


def normalize_phone(raw):
    d = ''.join(ch for ch in str(raw or '') if ch.isdigit())
    if not d:
        return ''
    if d.startswith('972'):
        pass
    elif d.startswith('0'):
        d = '972' + d[1:]
    elif len(d) == 9 and d.startswith('5'):
        d = '972' + d
    else:
        return ''
    return d if 11 <= len(d) <= 13 else ''


def message_for(first_name, lessons):
    name = first_name or 'חבר/ה'
    return f"""היי {name},

סיימת כבר {lessons} שיעורים בקורס, וזה יותר ממה שרוב האנשים שנרשמים מגיעים אליו.

פתחנו בפורטל משהו חדש: אפשר למצוא לומד אחר שנמצא בערך באותו מקום כמוך בקורס, וללמוד איתו. מי שלומד עם עוד מישהו פשוט מגיע רחוק יותר.

איך זה עובד: נראה לך שם פרטי ואיפה הוא בקורס, בלי שום פרט אישי. אם תרצה ללמוד עם מישהו, הוא יקבל בקשה, ורק אם הוא מאשר תקבלו אחד את הפרטים של השני. הפרטים שלך לא נחשפים לאף אחד לפני שאישרת.

זה נמצא כאן, תחת "ללמוד עם חבר":
{PORTAL_LINK}

לא רוצה לקבל הודעות כאלה? השב/י "הסר" ונפסיק."""


def load_state():
    try:
        with open(STATE_PATH, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(state):
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(STATE_PATH, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=1)


def build_audience():
    """Everyone matchable who has never answered the consent question."""
    now = datetime.datetime.now(datetime.timezone.utc)
    cutoff = now - datetime.timedelta(days=ACTIVE_DAYS)

    # completed practitioner lessons per user (excluding last_watched bookkeeping rows)
    per_user, last_at = {}, {}
    offset, step = 0, 1000
    while True:
        page = rest('course_progress', {
            'select': 'user_id,video_id,completed_at',
            'completed': 'eq.true', 'course_type': 'eq.nlp-practitioner',
            'limit': str(step), 'offset': str(offset)})
        for row in page:
            vid = str(row.get('video_id') or '')
            if vid.startswith('last_watched'):
                continue
            per_user.setdefault(row['user_id'], set()).add(vid)
            ts = row.get('completed_at')
            if ts:
                last_at[row['user_id']] = max(last_at.get(row['user_id'], ''), ts)
        if len(page) < step:
            break
        offset += step

    eligible = []
    for uid, vids in per_user.items():
        if len(vids) < MIN_LESSONS:
            continue
        ts = last_at.get(uid)
        if not ts:
            continue
        try:
            when = datetime.datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except Exception:
            continue
        if when < cutoff:
            continue
        eligible.append((uid, len(vids)))

    # never invite someone who already answered the consent question
    already = set()
    ids = [u for u, _ in eligible]
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        for row in rest('study_buddy_prefs',
                        {'select': 'user_id', 'user_id': 'in.(' + ','.join(chunk) + ')'}):
            already.add(row['user_id'])

    audience = []
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        profiles = {p['id']: p for p in rest('profiles', {
            'select': 'id,full_name,phone,whatsapp_opt_out',
            'id': 'in.(' + ','.join(chunk) + ')'})}
        for uid, n in eligible:
            if uid not in profiles or uid in already:
                continue
            p = profiles[uid]
            if p.get('whatsapp_opt_out') is True:
                continue
            phone = normalize_phone(p.get('phone'))
            name = (p.get('full_name') or '').strip().split(' ')[0]
            if not phone or not name:
                continue
            audience.append({'user_id': uid, 'name': name, 'phone': phone, 'lessons': n})
    audience.sort(key=lambda a: -a['lessons'])
    return audience


def send_whatsapp(phone, text):
    url = f"{CFG['GREEN_API_URL']}/waInstance{CFG['GREEN_API_INSTANCE']}/sendMessage/{CFG['GREEN_API_TOKEN']}"
    payload = json.dumps({'chatId': phone + '@c.us', 'message': text, 'linkPreview': False})
    req = urllib.request.Request(url, data=payload.encode('utf-8'), method='POST',
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return True, r.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        return False, f'{e.code}: {e.read().decode("utf-8")}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--send', action='store_true', help='actually send (default is dry run)')
    ap.add_argument('--limit', type=int, default=0, help='cap the number of recipients')
    args = ap.parse_args()

    audience = build_audience()
    state = load_state()
    audience = [a for a in audience if a['user_id'] not in state]
    if args.limit:
        audience = audience[:args.limit]

    print(f'audience: {len(audience)} learners (>= {MIN_LESSONS} lessons, active {ACTIVE_DAYS}d, '
          f'phone on file, not yet asked, not opted out)')
    if not audience:
        print('nothing to do.')
        return

    if not args.send:
        print('\n--- DRY RUN, nothing sent. Sample message: ---\n')
        print(message_for(audience[0]['name'], audience[0]['lessons']))
        print('\n--- first 10 recipients ---')
        for a in audience[:10]:
            print(f"  {a['name']:12s} {a['phone']}  {a['lessons']} lessons")
        print('\nRe-run with --send to actually send.')
        return

    hour = int(datetime.datetime.now(datetime.timezone.utc).astimezone(
        datetime.timezone(datetime.timedelta(hours=3))).strftime('%H'))
    if hour < SEND_HOUR_START or hour >= SEND_HOUR_END:
        print(f'refusing to send at {hour}:00 Israel time (window {SEND_HOUR_START}-{SEND_HOUR_END}).')
        return

    sent = failed = 0
    consecutive_failures = 0
    for a in audience:
        ok, info = send_whatsapp(a['phone'], message_for(a['name'], a['lessons']))
        if ok:
            state[a['user_id']] = {'phone': a['phone'], 'at': datetime.datetime.now(
                datetime.timezone.utc).isoformat()}
            save_state(state)          # persist per message, so a crash cannot re-send
            sent += 1
            consecutive_failures = 0
        else:
            failed += 1
            consecutive_failures += 1
            print(f"  FAILED {a['name']} {a['phone']}: {info}")

            # 466 = monthly send quota exhausted on the Green API plan (it does NOT mean
            # the number is invalid — that misreading once blacklisted 69 good numbers).
            # Once the quota is gone every further send fails, so stop immediately rather
            # than burning through the list and marking the rest as failures.
            if '466' in str(info):
                print('\n⛔ Green API 466 — monthly quota exhausted. Stopping.')
                print(f'   {sent} sent, {len(audience) - sent} not attempted.')
                print('   Re-run after the quota resets; already-sent people are skipped.')
                break

            # Any other run of failures means something systemic (auth, instance state,
            # network). Better to stop and look than to spray the whole list.
            if consecutive_failures >= 3:
                print('\n⛔ 3 failures in a row — stopping to avoid burning the list.')
                print(f'   {sent} sent, {len(audience) - sent} not attempted.')
                break
        time.sleep(SEND_DELAY_SEC)
    print(f'\ndone. sent={sent} failed={failed}')


if __name__ == '__main__':
    sys.stdout = __import__('io').TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    main()
