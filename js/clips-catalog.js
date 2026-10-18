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
  var CLIPS = [
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
