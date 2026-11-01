/* ============================================================================
 * study-day.js: "יום הלמידה שלך" (01.11.2026, הלל)
 *
 * One weekly study slot, built by habit stacking: the learner picks a moment that
 * already happens in their week ("אחרי שהילדים נרדמים"), one weekday and a time.
 * The result is a recurring event in the learner's OWN calendar (Google template URL,
 * or an .ics for iPhone/Outlook). No server automation and no WhatsApp: the reminder
 * comes from their calendar.
 *
 * The event links to course-library-v2.html#continue, which opens the portal's existing
 * "המשך ללמוד" target: the unfinished lesson at the saved second, or the next lesson.
 *
 * Used in two places:
 *   - portal-questionnaire.html: end of signup
 *   - course-library-v2.html: after lessons 1 to 3, until the learner adds it
 *
 * StudyDay.mount(container, { source, onRecord(patch) }) renders the picker.
 * onRecord receives the patch for profiles.reminder_prefs.calendar.
 * ========================================================================== */
(function () {
    'use strict';

    const CONTINUE_URL = 'https://www.therapist-home.com/pages/course-library-v2.html#continue';
    const MINUTES = 20;
    const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
    const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    // Existing moments in an ordinary week. Phrased without a gendered verb.
    const ANCHORS = [
        { id: 'dinner', label: 'אחרי ארוחת הערב', time: '20:30' },
        { id: 'kids', label: 'אחרי שהילדים נרדמים', time: '21:00' },
        { id: 'coffee', label: 'עם הקפה של הבוקר', time: '07:30' },
        { id: 'work', label: 'בדרך הביתה מהעבודה', time: '18:00' },
        { id: 'other', label: 'רגע אחר', time: '20:00' }
    ];

    const CSS = `
.sd{ display:flex; flex-direction:column; gap:.75rem; text-align:right; direction:rtl; }
.sd-lead{ margin:0; font-size:.95rem; line-height:1.6; color:var(--sd-soft,#4a5d63); }
.sd-lead b{ color:var(--sd-text,#0c2a30); }
.sd-label{ font-size:.9rem; font-weight:700; color:var(--sd-accent,#00606B); margin-top:.15rem; }
.sd-chips{ display:flex; flex-wrap:wrap; gap:.4rem; }
.sd-chip{ font:inherit; font-size:.88rem; padding:.5rem .8rem; border-radius:999px; cursor:pointer;
  border:1.5px solid var(--sd-line,rgba(0,96,107,.3)); background:transparent; color:var(--sd-text,#0c2a30); min-height:40px; }
.sd-chip.on{ background:var(--sd-accent,#00606B); border-color:var(--sd-accent,#00606B); color:var(--sd-on,#fff); }
.sd-chips[data-k=day]{ display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:.35rem; }
.sd-day{ min-width:0; padding:.5rem 0; text-align:center; }
.sd-other{ font:inherit; font-size:.95rem; padding:.6rem .8rem; border-radius:12px; width:100%; box-sizing:border-box;
  border:1.5px solid var(--sd-line,rgba(0,96,107,.3)); background:var(--sd-field,#fff); color:var(--sd-text,#0c2a30); }
.sd-other[hidden]{ display:none; }
.sd-time{ font:inherit; font-size:1rem; padding:.5rem .7rem; border-radius:12px; width:9rem; max-width:100%;
  border:1.5px solid var(--sd-line,rgba(0,96,107,.3)); background:var(--sd-field,#fff); color:var(--sd-text,#0c2a30); }
.sd-sentence{ margin:.2rem 0 0; padding:.8rem 1rem; border-radius:14px; font-size:1rem; line-height:1.55; font-weight:600;
  background:var(--sd-note,rgba(212,175,55,.12)); border-inline-start:3px solid var(--sd-gold,#D4AF37); color:var(--sd-text,#0c2a30); }
.sd-sentence.is-empty{ opacity:.55; font-weight:400; }
.sd-sub{ font-size:.82rem; color:var(--sd-soft,#4a5d63); margin:0; }
.sd-btn{ display:flex; align-items:center; justify-content:center; gap:.5rem; text-decoration:none; font:inherit; font-weight:700;
  font-size:1rem; padding:.85rem 1rem; border-radius:14px; border:0; cursor:pointer; min-height:48px;
  background:var(--sd-accent,#00606B); color:var(--sd-on,#fff); }
.sd-alt{ text-align:center; font-size:.88rem; color:var(--sd-accent,#00606B); text-decoration:underline; }
.sd-btn.is-disabled, .sd-alt.is-disabled{ opacity:.45; pointer-events:none; }
.sd-done{ margin:0; font-size:.9rem; font-weight:600; color:var(--sd-ok,#1d7a46); }
.sd-done[hidden]{ display:none; }
`;

    function injectCss() {
        if (document.getElementById('sd-css')) return;
        const s = document.createElement('style');
        s.id = 'sd-css';
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    const pad = n => String(n).padStart(2, '0');
    const stamp = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';

    // First occurrence of the weekday at that time, from now on.
    function firstDate(day, h, m) {
        const now = new Date();
        for (let i = 0; i < 8; i++) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, h, m);
            if (d.getDay() === day && d > now) return d;
        }
    }

    function icsEscape(s) {
        return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    }

    function mount(container, opts) {
        opts = opts || {};
        injectCss();
        const onRecord = typeof opts.onRecord === 'function' ? opts.onRecord : function () {};
        const source = opts.source || 'unknown';

        container.innerHTML = `
<div class="sd">
  ${opts.lead === false ? '' : `<p class="sd-lead">הרגל חדש נדבק הכי טוב להרגל שכבר קיים.<br>
  לא צריך למצוא זמן חדש. <b>בוחרים רגע שכבר קורה כל שבוע</b>, ומצמידים אליו 20 דקות של שיעור.</p>`}
  <div class="sd-label">מתי?</div>
  <div class="sd-chips" data-k="anchor">${ANCHORS.map(a =>
      `<button type="button" class="sd-chip" data-id="${a.id}" aria-pressed="false">${a.label}</button>`).join('')}</div>
  <input class="sd-other" type="text" maxlength="40" placeholder="למשל: אחרי האימון בחדר כושר" hidden>
  <div class="sd-label">באיזה יום בשבוע?</div>
  <div class="sd-chips" data-k="day">${DAY_SHORT.slice(0, 6).map((d, i) =>
      `<button type="button" class="sd-chip sd-day" data-d="${i}" aria-pressed="false" aria-label="יום ${DAY_NAMES[i]}">${d}</button>`).join('')}</div>
  <label class="sd-label" for="sdTime">בערך באיזו שעה?</label>
  <input class="sd-time" id="sdTime" type="time" value="20:00" step="900">
  <p class="sd-sentence is-empty">בוחרים רגע ויום, וכאן יופיע המשפט שלך.</p>
  <p class="sd-sub">יום אחד בשבוע מספיק. התזכורת מגיעה מהיומן שלך, 10 דקות לפני, עם קישור שממשיך בדיוק מאיפה שעצרת.</p>
  <a class="sd-btn is-disabled" data-k="google" href="#" target="_blank" rel="noopener" aria-disabled="true">
    <i class="fa-brands fa-google" aria-hidden="true"></i> הוספה ליומן גוגל</a>
  <a class="sd-alt is-disabled" data-k="ics" href="#" download="yom-limud-beit-hametaplim.ics" aria-disabled="true">יש לי יומן אחר (אייפון, אאוטלוק)</a>
  <p class="sd-done" hidden>נוסף ליומן. נתראה ביום שבחרת.</p>
</div>`;

        const root = container.querySelector('.sd');
        const otherEl = root.querySelector('.sd-other');
        const timeEl = root.querySelector('.sd-time');
        const sentEl = root.querySelector('.sd-sentence');
        const gBtn = root.querySelector('[data-k="google"]');
        const icsBtn = root.querySelector('[data-k="ics"]');
        const doneEl = root.querySelector('.sd-done');
        let anchorId = null, day = null, timeTouched = false, icsUrl = null;

        function anchorText() {
            if (!anchorId) return '';
            if (anchorId === 'other') return (otherEl.value || '').trim();
            return ANCHORS.find(a => a.id === anchorId).label;
        }

        function state() {
            const [h, m] = (timeEl.value || '20:00').split(':').map(Number);
            const anchor = anchorText();
            const ready = !!anchor && day !== null;
            const sentence = ready ? `בכל יום ${DAY_NAMES[day]}, ${anchor}, 20 דקות של שיעור.` : '';
            return { h, m, anchor, ready, sentence };
        }

        function render() {
            const s = state();
            sentEl.textContent = s.ready ? '✍️ ' + s.sentence : 'בוחרים רגע ויום, וכאן יופיע המשפט שלך.';
            sentEl.classList.toggle('is-empty', !s.ready);
            [gBtn, icsBtn].forEach(a => {
                a.classList.toggle('is-disabled', !s.ready);
                a.setAttribute('aria-disabled', String(!s.ready));
            });
            if (!s.ready) { gBtn.href = icsBtn.href = '#'; return; }

            const start = firstDate(day, s.h, s.m);
            const end = new Date(start.getTime() + MINUTES * 60000);
            const rrule = 'RRULE:FREQ=WEEKLY;BYDAY=' + BYDAY[day];
            const title = `${s.anchor}: 20 דקות NLP · בית המטפלים`;
            const details = `זה הרגע שבחרת לעצמך: ${s.sentence}\n\nלחיצה כאן ממשיכה בדיוק מאיפה שעצרת:\n${CONTINUE_URL}`;

            // Local wall-clock time + ctz keeps the slot at the same hour across DST.
            gBtn.href = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
                + '&text=' + encodeURIComponent(title)
                + '&details=' + encodeURIComponent(details)
                + '&dates=' + stamp(start) + '/' + stamp(end)
                + '&ctz=Asia/Jerusalem'
                + '&recur=' + encodeURIComponent(rrule);

            const ics = [
                'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//therapist-home//study-day//HE', 'CALSCALE:GREGORIAN',
                'BEGIN:VTIMEZONE', 'TZID:Asia/Jerusalem',
                'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0300', 'TZNAME:IDT', 'DTSTART:19700327T020000',
                'RRULE:FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=23,24,25,26,27,28,29;BYDAY=FR', 'END:DAYLIGHT',
                'BEGIN:STANDARD', 'TZOFFSETFROM:+0300', 'TZOFFSETTO:+0200', 'TZNAME:IST', 'DTSTART:19701025T020000',
                'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
                'END:VTIMEZONE',
                'BEGIN:VEVENT',
                'UID:' + Date.now() + '-' + Math.random().toString(36).slice(2) + '@therapist-home.com',
                'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
                'DTSTART;TZID=Asia/Jerusalem:' + stamp(start),
                'DTEND;TZID=Asia/Jerusalem:' + stamp(end),
                rrule,
                'SUMMARY:' + icsEscape(title),
                'DESCRIPTION:' + icsEscape(details),
                'URL:' + CONTINUE_URL,
                'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(title), 'TRIGGER:-PT10M', 'END:VALARM',
                'END:VEVENT', 'END:VCALENDAR'
            ].join('\r\n');
            if (icsUrl) URL.revokeObjectURL(icsUrl);
            icsUrl = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
            icsBtn.href = icsUrl;
        }

        function pick(group, btn) {
            group.querySelectorAll('.sd-chip').forEach(b => {
                const on = b === btn;
                b.classList.toggle('on', on);
                b.setAttribute('aria-pressed', String(on));
            });
        }

        root.querySelector('[data-k="anchor"]').addEventListener('click', ev => {
            const b = ev.target.closest('.sd-chip'); if (!b) return;
            pick(ev.currentTarget, b);
            anchorId = b.dataset.id;
            otherEl.hidden = anchorId !== 'other';
            if (anchorId === 'other') otherEl.focus();
            // Suggest the usual hour for that moment, unless the learner already set one.
            if (!timeTouched) timeEl.value = ANCHORS.find(a => a.id === anchorId).time;
            render();
        });
        root.querySelector('[data-k="day"]').addEventListener('click', ev => {
            const b = ev.target.closest('.sd-chip'); if (!b) return;
            pick(ev.currentTarget, b);
            day = +b.dataset.d;
            render();
        });
        otherEl.addEventListener('input', render);
        timeEl.addEventListener('change', () => { timeTouched = true; render(); });

        function added(kind) {
            const s = state();
            if (!s.ready) return;
            onRecord({
                added_via: kind, added_at: new Date().toISOString(), source,
                day, days: [day], time: pad(s.h) + ':' + pad(s.m),
                anchor: anchorId, anchor_text: s.anchor
            });
            doneEl.hidden = false;
            if (typeof opts.onAdded === 'function') { try { opts.onAdded(kind); } catch (_) {} }
        }
        gBtn.addEventListener('click', () => added('google'));
        icsBtn.addEventListener('click', () => added('ics'));
        render();
    }

    // Shared writer for profiles.reminder_prefs.calendar (merge, never overwrite other keys).
    async function record(client, patch) {
        try {
            if (!client) return;
            const { data: { user } } = await client.auth.getUser();
            if (!user) return;
            const { data } = await client.from('profiles').select('reminder_prefs').eq('id', user.id).maybeSingle();
            const prefs = (data && data.reminder_prefs) || { on: false };
            prefs.calendar = Object.assign({}, prefs.calendar, patch);
            const { error } = await client.from('profiles').update({ reminder_prefs: prefs }).eq('id', user.id);
            if (error) console.error('Study day not saved:', error);
        } catch (e) {
            console.error('Study day not saved:', e); // never block the learner
        }
    }

    window.StudyDay = { mount, record, CONTINUE_URL };
})();
