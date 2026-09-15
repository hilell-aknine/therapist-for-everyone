/*
 * clips-catalog.js — the catalog behind the "בשתי דקות" feed.
 *
 * A clip is NOT a video file. It is a start and an end inside a lesson video that is
 * already published on the channel. Nothing is re-cut, nothing is re-uploaded.
 *
 * That is a deliberate reaction to what happened here before: pages/master-practice.html
 * shipped 49 "clips" as freshly uploaded YouTube ids, 44 of them pointed at the wrong
 * video, and a paying customer who clicked a two-minute drill got a thirty-minute
 * lecture. The page was deleted on 2026-07-19. When a clip is a time range inside a
 * lesson we already serve, that class of failure cannot happen: the id is the lesson's
 * own id, and a wrong boundary is a wrong number, fixable in one line.
 *
 * GENERATED FILE — produced by scripts/clips/build_catalog.py from the approved
 * candidate set. Edit the pipeline, not this file, or the next run will overwrite you.
 *
 * `id` is the progress key. Once a clip has shipped, never renumber or rename it —
 * course_progress rows are stored as clip:<videoId>:<start> and an id change orphans
 * every learner's progress on that clip.
 */
(function () {
  'use strict';

  // Topic keys are stable; the labels are what the filter chips show.
  var TOPICS = {
    foundations: 'יסודות',
    presuppositions: 'הנחות יסוד',
    rapport: 'ראפור ותקשורת',
    language: 'שפה ושאלות',
    goals: 'הצבת מטרות',
    beliefs: 'אמונות',
    emotions: 'רגשות ומצבים',
    habits: 'הרגלים ושינוי'
  };

      /* CLIPS:BEGIN — everything between these markers is rewritten by build_catalog.py */
  /* ⚠️ PREVIEW BUILD — contains clips Hillel has NOT approved. Rebuild without
     --preview before this ships. */
  var CLIPS = [
    { id: "c-m1l4-0000", videoId: "fo90wrXPJjQ",
      start: 0.0, end: 125.2,
      title: "איך נולדה שיטת ה-NLP",
      hook: "שני חוקרים שאלו מה הופך מטפל למצוין, ומהתשובה נולדה שיטה שלמה",
      topic: "foundations", module: 1, lessonIdx: 3, order: 1 },
    { id: "c-m1l4-0206", videoId: "fo90wrXPJjQ",
      start: 206.0, end: 297.4,
      title: "מסימן קריאה לסימן שאלה",
      hook: "הדברים שאתה הכי בטוח בהם לגבי עצמך הם בדיוק אלה ששווה לפתוח מחדש",
      topic: "foundations", module: 1, lessonIdx: 3, order: 2 },
    { id: "c-m1l4-0320", videoId: "fo90wrXPJjQ",
      start: 319.5, end: 417.6,
      title: "המחיר של לגלות שהאמנת בשקר",
      hook: "עשרים שנה האמנת במשהו, ואז מתברר שזה לא נכון. זה לא חינם",
      topic: "beliefs", module: 1, lessonIdx: 3, order: 3 },
    { id: "c-m1l4-0625", videoId: "fo90wrXPJjQ",
      start: 625.1, end: 722.7,
      title: "המפה היא לא השטח",
      hook: "ההורים שלו לא התנגדו לעסק, הם ניסו להגן עליו. אותה התנהגות, שתי מפות",
      topic: "presuppositions", module: 1, lessonIdx: 3, order: 4 },
    { id: "c-m1l4-0733", videoId: "fo90wrXPJjQ",
      start: 733.2, end: 866.2,
      title: "ניסוי הלימון",
      hook: "דמיינת לימון וחשת טעם חמוץ. המוח לא הבדיל בין דמיון למציאות",
      topic: "presuppositions", module: 1, lessonIdx: 3, order: 5 },
    { id: "c-m1l4-1232", videoId: "fo90wrXPJjQ",
      start: 1232.0, end: 1356.0,
      title: "חזרתיות היא אם כל המיומנויות",
      hook: "ללמוד אופנוע הילוכים נראה בלתי אפשרי, עד שכל חלק נהיה אוטומטי בנפרד",
      topic: "habits", module: 1, lessonIdx: 3, order: 6 },
    { id: "c-m3l5-0168", videoId: "_8wvtMUInNg",
      start: 168.2, end: 271.8,
      title: "מטרה שאי אפשר למדוד היא משאלה",
      hook: "\"אני רוצה להיות יותר עשיר\" זו לא מטרה. בלי ספציפיות אין דרך לדעת שהגעת",
      topic: "goals", module: 3, lessonIdx: 4, order: 7 },
    { id: "c-m3l5-0615", videoId: "_8wvtMUInNg",
      start: 614.6, end: 680.8,
      title: "מיקוד שליטה פנימי",
      hook: "כל מטרה שמתחילה ב\"ברגע שהוא ישתנה\" כבר יצאה מהידיים שלך",
      topic: "goals", module: 3, lessonIdx: 4, order: 8 },
    { id: "c-m3l5-0772", videoId: "_8wvtMUInNg",
      start: 772.3, end: 891.5,
      title: "כשההרס העצמי משרת משהו",
      hook: "שאלה אחת חשפה מה היא באמת מפסידה אם תחלים, והתשובה הייתה אמא שלה",
      topic: "beliefs", module: 3, lessonIdx: 4, order: 9 },
    { id: "c-m3l5-0925", videoId: "_8wvtMUInNg",
      start: 924.7, end: 1014.3,
      title: "למה קשה להפסיק לעשן דווקא בצבא",
      hook: "הוא לא מכור לניקוטין, הוא מפחד להישאר לבד כששאר החבר'ה יוצאים לעשן",
      topic: "beliefs", module: 3, lessonIdx: 4, order: 10 }
  ];
  /* CLIPS:END */

  var MIN_SEC = 45, MAX_SEC = 185;

  function duration(c) { return c.end - c.start; }
  function thumb(c) { return c.poster || 'https://i.ytimg.com/vi/' + c.videoId + '/mqdefault.jpg'; }
  function progressKey(c) { return 'clip:' + c.videoId + ':' + Math.round(c.start); }

  function sorted() {
    return CLIPS.slice().sort(function (a, b) {
      return (a.module - b.module) || (a.lessonIdx - b.lessonIdx) || (a.start - b.start);
    });
  }

  /*
   * Self-check. A bad `end` is invisible to a reader and costs a learner two minutes of
   * the wrong lesson, which is exactly how the old page failed. Runs only with ?dev=1 so
   * it never adds work to a learner's page load.
   */
  function validate() {
    var seen = Object.create(null), problems = [];
    CLIPS.forEach(function (c, i) {
      var at = 'clip[' + i + '] ' + (c.id || '(no id)');
      if (!c.id) problems.push(at + ': חסר מזהה');
      else if (seen[c.id]) problems.push(at + ': מזהה כפול');
      seen[c.id] = true;
      if (!/^[A-Za-z0-9_-]{11}$/.test(c.videoId || '')) problems.push(at + ': videoId לא תקין');
      if (!(c.end > c.start)) problems.push(at + ': סיום לפני התחלה');
      else if (duration(c) < MIN_SEC || duration(c) > MAX_SEC) {
        problems.push(at + ': אורך חריג (' + Math.round(duration(c)) + ' שניות)');
      }
      if (!TOPICS[c.topic]) problems.push(at + ': נושא לא מוכר "' + c.topic + '"');
      if (!c.title) problems.push(at + ': חסרה כותרת');
    });
    if (problems.length) console.error('[clips-catalog] ' + problems.length + ' בעיות:\n' + problems.join('\n'));
    else console.info('[clips-catalog] ' + CLIPS.length + ' קטעים תקינים');
    return problems;
  }

  window.ClipsCatalog = {
    TOPICS: TOPICS,
    all: sorted,
    byTopic: function (topic) {
      if (!topic || topic === 'all') return sorted();
      return sorted().filter(function (c) { return c.topic === topic; });
    },
    byId: function (id) {
      for (var i = 0; i < CLIPS.length; i++) if (CLIPS[i].id === id) return CLIPS[i];
      return null;
    },
    // Which topics actually have clips — the filter must never offer an empty chip.
    activeTopics: function () {
      var counts = {};
      CLIPS.forEach(function (c) { counts[c.topic] = (counts[c.topic] || 0) + 1; });
      return Object.keys(TOPICS)
        .filter(function (k) { return counts[k]; })
        .map(function (k) { return { key: k, label: TOPICS[k], count: counts[k] }; });
    },
    duration: duration,
    thumb: thumb,
    progressKey: progressKey,
    validate: validate
  };

  try {
    if (/[?&]dev=1/.test(location.search)) validate();
  } catch (_) { /* never let the catalog break the portal */ }
})();
