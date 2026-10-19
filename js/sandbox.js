/* =============================================================================
   sandbox.js — client for the clinical practice lab (patient simulator).
   Spec: docs/specs/sandbox-patient-simulator.md

   The client is deliberately thin. It holds no scoring rules, no unlock
   conditions and no success criteria — all of that lives in the Edge Function,
   because anything shipped to the browser is the answer key.

   It never shows the raw move classification. In exam mode nothing is shown
   until the debrief (the original design: a learner who sees "give_advice" live
   learns to game the classifier instead of reading the patient). In training
   mode the server sends one coaching sentence per turn, and only that.

   Everything about the patient (name, gender, metric labels, score labels) comes
   from the server, so one page serves every lesson's scenario.
   ============================================================================= */
(function () {
    'use strict';

    var FN = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.functionsUrl)
        || 'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1';
    var MAX_CHARS = 600;
    var METRIC_KEYS = ['rapport', 'resistance', 'emotional_depth', 'specificity'];
    var DEFAULT_LABELS = { rapport: 'ראפור', resistance: 'התנגדות', emotional_depth: 'עומק רגשי', specificity: 'התקדמות' };

    var state = {
        sessionId: null,
        scenarioSlug: null,
        row: null,
        mode: 'train',
        title: '',
        turnBudget: 12,
        turnsLeft: 12,
        totalFacts: 0,
        labels: DEFAULT_LABELS,
        patient: { name: 'המטופל', gender: 'f' },
        passingScore: 75,
        busy: false
    };

    function $(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Gendered Hebrew for the patient.
    function female() { return state.patient.gender !== 'm'; }
    function g(fem, masc) { return female() ? fem : masc; }

    function show(screen) {
        ['catalog', 'briefing', 'session', 'debrief'].forEach(function (s) {
            var n = $('sbx-' + s);
            if (n) n.classList.toggle('active', s === screen);
        });
        var inSession = screen === 'session';
        $('sbx-turns').hidden = !inSession;
        $('sbx-exit').hidden = !inSession;
        window.scrollTo({ top: 0, behavior: 'auto' });
    }

    // ── auth + transport ────────────────────────────────────────────────────

    async function token() {
        try {
            var s = await window.Auth.getSession();
            return (s && s.access_token) || '';
        } catch (e) { return ''; }
    }

    function toLogin() {
        location.href = 'login.html?next=' + encodeURIComponent(location.pathname + location.search);
    }

    async function api(path, body) {
        var t = await token();
        if (!t) { toLogin(); return null; }
        var res;
        try {
            res = await fetch(FN + '/' + path, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey) || '',
                    'Authorization': 'Bearer ' + t
                },
                body: JSON.stringify(body)
            });
        } catch (e) {
            return { error: 'אין חיבור כרגע. בדקו את האינטרנט ונסו שוב.', __status: 0 };
        }
        var data = null;
        try { data = await res.json(); } catch (e) { data = {}; }
        data.__status = res.status;
        return data;
    }

    function fail(msg, where) {
        var host = $(where || 'sbx-briefing-err');
        if (!host) { alert(msg); return; }
        host.innerHTML = '<div class="sbx-err">' + esc(msg) + '</div>';
        host.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    // ── catalog ─────────────────────────────────────────────────────────────

    var catalog = null;

    async function fetchCatalog() {
        var db = window.supabaseClient || (window.Auth && window.Auth.client);
        if (!db) return { error: 'לא הצלחנו להתחבר. רעננו את הדף.' };

        // Gate BEFORE the RPC. sim_catalog is revoked from anon, so a logged-out
        // visitor used to land on the raw Postgres string "permission denied".
        var t = await token();
        if (!t) { toLogin(); return null; }

        var r = await db.rpc('sim_catalog');
        if (r.error) {
            // Never surface a database message to a learner.
            console.error('[sandbox] sim_catalog failed:', r.error);
            return { error: 'לא הצלחנו לטעון את התרגולים כרגע. נסו לרענן, ואם זה חוזר כתבו לנו.' };
        }
        catalog = r.data || [];
        return { rows: catalog };
    }

    function groupLabel(row) {
        var course = row.course_type === 'master' ? 'מאסטר' : 'פרקטישנר';
        if (row.module_id == null) return course + ' · תרגולים נוספים';
        return course + ' · ' + (row.course_type === 'master' ? 'מפגש ' : 'מודול ') + row.module_id;
    }

    async function loadCatalog() {
        var host = $('sbx-list');
        host.innerHTML = '<div class="sbx-empty">טוען…</div>';
        $('sbx-bar-title').textContent = 'תרגול חי';
        show('catalog');

        var res = await fetchCatalog();
        if (!res) return;
        if (res.error) { host.innerHTML = '<div class="sbx-empty">' + esc(res.error) + '</div>'; return; }
        renderCatalog(res.rows);
    }

    function renderCatalog(rows) {
        var host = $('sbx-list');
        if (!rows.length) {
            host.innerHTML = '<div class="sbx-empty">עוד אין כאן תרגולים פתוחים עבורך.</div>';
            return;
        }
        host.innerHTML = '';
        var lastGroup = null;
        rows.forEach(function (row) {
            var grp = groupLabel(row);
            if (grp !== lastGroup) {
                var h = document.createElement('p');
                h.className = 'sbx-modhead';
                h.textContent = grp;
                host.appendChild(h);
                lastGroup = grp;
            }
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'sbx-scenario';
            var bits = [];
            if (row.lesson_id != null) bits.push('שיעור ' + row.lesson_id);
            if (row.patient_name) bits.push(row.patient_name);
            bits.push(row.turn_budget + ' מהלכים');
            if (row.best_score != null) bits.push('ציון הכי טוב: ' + row.best_score);
            var badge = row.passed
                ? '<span class="sbx-badge done">תורגל ✓</span>'
                : (row.attempts ? '<span class="sbx-badge">' + row.attempts + ' ניסיונות</span>' : '<span class="sbx-badge">חדש</span>');
            b.innerHTML = '<div class="sbx-scenario-main">'
                + '<p class="sbx-scenario-t">' + esc(row.title) + '</p>'
                + '<p class="sbx-scenario-s">' + esc(bits.join(' · ')) + '</p></div>' + badge;
            b.addEventListener('click', function () { openBriefing(row); });
            host.appendChild(b);
        });
    }

    // ── briefing (case dossier) ─────────────────────────────────────────────

    function openBriefing(row) {
        state.scenarioSlug = row.slug;
        state.row = row;
        state.patient = { name: row.patient_name || 'המטופל', gender: row.patient_gender === 'm' ? 'm' : 'f' };
        state.passingScore = row.passing_score || 75;

        var br = row.briefing || {};
        $('sbx-briefing-err').innerHTML = '';
        $('sbx-bar-title').textContent = row.title || 'תרגול חי';
        $('sbx-b-title').textContent = state.patient.name;
        $('sbx-b-avatar').textContent = (state.patient.name || '?').trim().charAt(0);
        $('sbx-b-skill').textContent = 'מי מגיע לפגישה';
        $('sbx-b-ramline').textContent = 'היי, אני רם. עכשיו נתרגל את מה שלמדת בשיעור. '
            + 'אני אהיה פה לידך כל הפגישה, ואגיד לך מה עבד ומה לא.';
        $('sbx-b-step1').textContent = g('מה ' + state.patient.name + ' אומרת בפתיחה.', 'מה ' + state.patient.name + ' אומר בפתיחה.');

        var who = [];
        if (br.patient_age) who.push(g('בת ', 'בן ') + br.patient_age);
        if (br.patient_occupation) who.push(br.patient_occupation);
        $('sbx-b-who').textContent = who.join(' · ');
        $('sbx-b-who').hidden = !who.length;

        $('sbx-b-intro').textContent = br.patient_intro || '';
        $('sbx-b-mission').textContent = br.mission || '';

        // One short line instead of a list. The rules are kept verbatim: stripping
        // "אין ל..." mechanically leaves broken Hebrew ("במונחים מקצועיים").
        var short = (br.rules || []).map(function (r) { return String(r).replace(/[.]\s*$/, ''); }).filter(Boolean);
        $('sbx-b-rules').textContent = short.join(' · ');
        $('sbx-b-rules-wrap').hidden = !short.length;

        // "נמדד" chips removed by Hillel's call: too much for a first screen.


        // The lesson this practice belongs to, in one line, before the task.
        $('sbx-b-learned').textContent = row.lesson_reference || '';
        $('sbx-b-learned-wrap').hidden = !row.lesson_reference;
        state.mode = 'train';
        show('briefing');
    }

    function setMode(mode) {
        state.mode = mode === 'exam' ? 'exam' : 'train';
        document.querySelectorAll('.sbx-mode').forEach(function (b) {
            var on = b.getAttribute('data-mode') === state.mode;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        try { localStorage.setItem('sbx-mode', state.mode); } catch (e) { /* private mode */ }
    }

    async function startSession() {
        if (state.busy) return;
        state.busy = true;
        var btn = $('sbx-start');
        btn.disabled = true;
        btn.textContent = 'פותח את החדר…';

        var d = await api('sim-turn', { action: 'start', scenario_slug: state.scenarioSlug, mode: 'train' });
        state.busy = false;
        btn.disabled = false;
        btn.textContent = 'להתחיל את הפגישה';
        if (!d) return;
        if (d.error) { fail(d.error); return; }

        state.sessionId = d.session_id;
        state.title = d.title || '';
        state.turnBudget = d.turn_budget || 12;
        state.turnsLeft = d.turns_left;
        state.totalFacts = d.total_facts || 0;
        state.labels = Object.assign({}, DEFAULT_LABELS, d.labels || {});
        if (d.patient) state.patient = { name: d.patient.name || state.patient.name, gender: d.patient.gender === 'm' ? 'm' : 'f' };
        if (d.passing_score) state.passingScore = d.passing_score;
        if (d.mode) state.mode = d.mode;

        $('sbx-bar-title').textContent = state.title;
        $('sbx-chat').innerHTML = '';
        $('sbx-input').placeholder = g('מה אתה אומר לה?', 'מה אתה אומר לו?');
        $('sbx-input').setAttribute('aria-label', g('ההודעה שלך למטופלת', 'ההודעה שלך למטופל'));
        buildRail();
        renderMetrics(d.metrics);
        renderProgress(0);
        addMsg('pt', state.patient.name, d.opening);
        addRam(g('קרא מה היא אמרה, וכתוב לה משפט אחד. אני פה איתך.', 'קרא מה הוא אמר, וכתוב לו משפט אחד. אני פה איתך.'), 'neutral');
        setTurns(0);
        enableComposer(true);
        show('session');
        $('sbx-input').focus();
    }

    // ── session ─────────────────────────────────────────────────────────────

    function buildRail() {
        var rail = $('sbx-rail');
        rail.innerHTML = '';
        METRIC_KEYS.forEach(function (k) {
            var d = document.createElement('div');
            d.className = 'sbx-metric';
            d.setAttribute('data-k', k);
            d.innerHTML = '<div class="sbx-metric-top"><span>' + esc(state.labels[k]) + '</span>'
                + '<span class="sbx-metric-val" data-v="' + k + '">0</span></div>'
                + '<div class="sbx-track"><div class="sbx-fill" data-f="' + k + '"></div></div>';
            rail.appendChild(d);
        });
        var p = document.createElement('div');
        p.className = 'sbx-progress';
        p.id = 'sbx-pips';
        rail.appendChild(p);
    }

    function renderMetrics(m) {
        if (!m) return;
        METRIC_KEYS.forEach(function (k) {
            var v = Math.max(0, Math.min(100, Number(m[k]) || 0));
            var val = document.querySelector('[data-v="' + k + '"]');
            var fill = document.querySelector('[data-f="' + k + '"]');
            if (val) val.textContent = v;
            if (fill) fill.style.width = v + '%';
        });
    }

    function renderProgress(unlocked) {
        var host = $('sbx-pips');
        if (!host) return;
        if (!state.totalFacts) { host.hidden = true; return; }
        var pips = '';
        for (var i = 0; i < state.totalFacts; i++) {
            pips += '<span class="sbx-pip' + (i < unlocked ? ' on' : '') + '"></span>';
        }
        host.innerHTML = '<span>' + g('מה היא מסרה', 'מה הוא מסר') + '</span>' + pips;
    }

    // "מהלך X מתוך Y": the move the learner is about to make.
    function setTurns(used) {
        var left = Math.max(0, state.turnBudget - used);
        state.turnsLeft = left;
        var t = $('sbx-turns');
        var next = Math.min(state.turnBudget, used + 1);
        t.textContent = 'מהלך ' + next + ' מתוך ' + state.turnBudget;
        t.classList.toggle('low', left <= 2);
    }

    function addMsg(kind, who, text) {
        var chat = $('sbx-chat');
        var wrap = document.createElement('div');
        wrap.className = 'sbx-msg ' + kind;
        var w = who ? '<div class="sbx-who">' + esc(who) + '</div>' : '';
        wrap.innerHTML = w + '<div class="sbx-bubble">' + esc(text) + '</div>';
        chat.appendChild(wrap);
        wrap.scrollIntoView({ block: 'end', behavior: 'smooth' });
        return wrap;
    }

    // Virtual Ram: every coaching line and every tip comes from him, with his
    // face, so the learner hears one familiar mentor and not a system message.
    function addRam(note, tone) {
        if (!note) return;
        var chat = $('sbx-chat');
        var d = document.createElement('div');
        var cls = tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : tone === 'tip' ? 'tip' : '';
        d.className = 'sbx-coach sbx-ram ' + cls;
        var mark = tone === 'good' ? ' ✓' : tone === 'bad' ? ' ·  שים לב' : tone === 'tip' ? ' ·  טיפ' : '';
        d.innerHTML = '<img class="sbx-ram-mini" src="../assets/mentor-ram.webp" alt="" width="32" height="32">'
            + '<div class="sbx-ram-body"><span class="sbx-ram-name">רם' + esc(mark) + '</span>'
            + '<span><span class="sr-only">רם אומר: </span>' + esc(note) + '</span></div>';
        chat.appendChild(d);
        d.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
    function addCoach(note, tone) { addRam(note, tone); }

    function addReveal() {
        var chat = $('sbx-chat');
        var d = document.createElement('div');
        d.className = 'sbx-reveal';
        d.innerHTML = '🔓 <span>' + esc(g('היא מסרה פרט חדש', 'הוא מסר פרט חדש')) + '</span>';
        chat.appendChild(d);
    }

    function typing(on) {
        var existing = $('sbx-typing');
        if (existing) existing.remove();
        if (!on) return;
        var chat = $('sbx-chat');
        var d = document.createElement('div');
        d.id = 'sbx-typing';
        d.className = 'sbx-msg pt';
        d.innerHTML = '<div class="sbx-typing" aria-label="' + esc(g('היא כותבת', 'הוא כותב')) + '"><span></span><span></span><span></span></div>';
        chat.appendChild(d);
        d.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }

    function enableComposer(on) {
        $('sbx-input').disabled = !on;
        $('sbx-hint').disabled = !on;
        $('sbx-send').disabled = !on || !$('sbx-input').value.trim();
    }

    async function sendTurn() {
        if (state.busy) return;
        var input = $('sbx-input');
        var text = input.value.trim();
        if (!text || text.length > MAX_CHARS) return;

        state.busy = true;
        enableComposer(false);
        addMsg('me', 'אני', text);
        input.value = '';
        updateCount();
        typing(true);

        var d = await api('sim-turn', { action: 'turn', session_id: state.sessionId, text: text });
        typing(false);
        state.busy = false;
        if (!d) return;

        if (d.safety_stop) {
            addMsg('sys', '', d.message);
            enableComposer(false);
            return;
        }
        if (d.rejected) {
            addMsg('sys', '', d.reply);
            enableComposer(true);
            input.focus();
            return;
        }
        if (d.error) {
            // A 503 means the turn was NOT consumed — the message says so.
            addMsg('sys', '', d.error);
            enableComposer(true);
            input.focus();
            return;
        }

        if (d.revealed) addReveal();
        addMsg('pt', state.patient.name, d.reply);
        if (d.coach_note) addCoach(d.coach_note, d.coach_tone);
        renderMetrics(d.metrics);
        renderProgress(d.unlocked_count || 0);
        setTurns(d.turns_used || (state.turnBudget - (d.turns_left || 0)));

        if (d.status === 'ended') {
            enableComposer(false);
            await endSession(d.outcome);
        } else {
            enableComposer(true);
            input.focus();
        }
    }

    async function askHint() {
        if (state.busy) return;
        state.busy = true;
        var d = await api('sim-turn', { action: 'hint', session_id: state.sessionId });
        state.busy = false;
        if (!d) return;
        if (d.error) { addMsg('sys', '', d.error); return; }
        addRam(d.hint, 'tip');
    }

    // ── debrief ─────────────────────────────────────────────────────────────

    var OUTCOME = {
        success: 'הגעת ליעד של התרגיל',
        budget: 'המהלכים נגמרו',
        collapse: 'הקשר נקטע',
        abandoned: 'הסשן נסגר'
    };

    var METRIC_LABEL = {
        rapport_calibration: 'ראפור וכיול',
        linguistic_precision: 'דיוק לשוני',
        technique_application: 'יישום הטכניקה'
    };

    // Older debriefs (before score_labels existed) still render.
    var LEGACY_SCORE_LABEL = {
        rapport_building: 'בניית ראפור',
        chunk_down: 'פירוק הכללה',
        language_discipline: 'משמעת שפה',
        pacing: 'קצב'
    };

    async function endSession(outcome) {
        $('sbx-verdict').className = 'sbx-card sbx-verdict';
        $('sbx-ring').innerHTML = '';
        $('sbx-v-outcome').textContent = OUTCOME[outcome] || OUTCOME.abandoned;
        $('sbx-v-title').textContent = 'מכין את התחקיר…';
        $('sbx-v-sub').textContent = '';
        $('sbx-d-body').innerHTML = '';
        show('debrief');

        var d = await api('sim-debrief', { session_id: state.sessionId });
        if (!d) return;
        if (d.error) {
            $('sbx-v-title').textContent = 'התחקיר לא נוצר';
            $('sbx-d-body').innerHTML = '<div class="sbx-err">' + esc(d.error) + '</div>';
            return;
        }
        renderDebrief(d.debrief || {}, outcome);
    }

    function ring(score) {
        var r = 52, c = 2 * Math.PI * r;
        var v = Math.max(0, Math.min(100, Number(score) || 0));
        return '<svg viewBox="0 0 120 120" role="img" aria-label="ציון ' + v + ' מתוך 100">'
            + '<circle class="sbx-ring-bg" cx="60" cy="60" r="' + r + '" fill="none" stroke-width="10"/>'
            + '<circle class="sbx-ring-fg" cx="60" cy="60" r="' + r + '" fill="none" stroke-width="10" stroke-linecap="round"'
            + ' stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + c.toFixed(1) + '" data-target="' + (c * (1 - v / 100)).toFixed(1) + '"/>'
            + '</svg><div class="sbx-ring-num">' + v + '<small>מתוך 100</small></div>';
    }

    function barRow(label, value) {
        var v = Math.max(0, Math.min(100, Number(value) || 0));
        return '<div class="sbx-bar-row"><div class="sbx-bar-top"><span>' + esc(label) + '</span><b>' + v + '</b></div>'
            + '<div class="sbx-track"><div class="sbx-fill" style="width:' + v + '%"></div></div></div>';
    }

    function renderDebrief(db, outcome) {
        var scores = db.scores || null;
        var overall = db.overall_score != null ? db.overall_score : (scores && scores.overall);
        var passing = db.passing_score || state.passingScore;
        var hasScore = overall != null && !db.budget_blocked;
        var passed = !!db.passed;

        $('sbx-verdict').className = 'sbx-card sbx-verdict ' + (passed ? 'pass' : 'fail');
        $('sbx-v-outcome').textContent = OUTCOME[db.outcome || outcome] || '';
        if (hasScore) {
            $('sbx-ring').innerHTML = ring(overall);
            requestAnimationFrame(function () {
                var fg = document.querySelector('.sbx-ring-fg');
                if (fg) fg.style.strokeDashoffset = fg.getAttribute('data-target');
            });
            $('sbx-v-title').textContent = passed ? 'עברת. המיומנות תורגלה ✓' : 'עוד לא. ציון המעבר הוא ' + passing;
        } else {
            $('sbx-ring').innerHTML = '';
            $('sbx-v-title').textContent = 'התחקיר';
        }
        $('sbx-v-sub').textContent = db.headline || '';

        var html = '';

        if (db.actionable_takeaway) {
            html += '<div class="sbx-takeaway"><strong>הדבר האחד לפעם הבאה</strong><p>' + esc(db.actionable_takeaway) + '</p></div>';
        }

        // Sub-metrics: the three shared ones, then the skill's own score keys.
        var bars = '';
        if (db.metrics) {
            Object.keys(METRIC_LABEL).forEach(function (k) {
                if (db.metrics[k] != null) bars += barRow(METRIC_LABEL[k], db.metrics[k]);
            });
        }
        if (scores) {
            var labels = Array.isArray(db.score_labels) && db.score_labels.length
                ? db.score_labels
                : Object.keys(LEGACY_SCORE_LABEL).map(function (k) { return { key: k, label: LEGACY_SCORE_LABEL[k] }; });
            labels.forEach(function (x) {
                if (scores[x.key] != null) bars += barRow(x.label, scores[x.key]);
            });
        }
        if (bars) html += '<div class="sbx-card" style="margin-top:1rem"><p class="sbx-eyebrow">פירוט הציון</p><div class="sbx-bars">' + bars + '</div>'
            + statsLine(db) + '</div>';
        else html += statsLine(db);

        if ((db.strengths || []).length) {
            html += '<h2 class="sbx-h2">מה עבד</h2><ul class="sbx-points good">';
            db.strengths.forEach(function (s) { html += '<li>' + esc(s) + '</li>'; });
            html += '</ul>';
        }

        if ((db.missed_opportunities || []).length) {
            html += '<h2 class="sbx-h2">הזדמנויות שהוחמצו</h2><ul class="sbx-points miss">';
            db.missed_opportunities.forEach(function (s) { html += '<li>' + esc(s) + '</li>'; });
            html += '</ul>';
        }

        if ((db.growth_edges || []).length) {
            html += '<h2 class="sbx-h2">איפה זה נפל, ומה היה עובד</h2>';
            db.growth_edges.forEach(function (e) {
                html += '<div class="sbx-edge">'
                    + (e.turn ? '<div class="sbx-edge-turn">מהלך ' + esc(e.turn) + '</div>' : '')
                    + (e.student_said ? '<p class="sbx-said">' + esc(e.student_said) + '</p>' : '')
                    + (e.what_happened ? '<p class="sbx-happened">' + esc(e.what_happened) + '</p>' : '')
                    + (e.golden_line ? '<div class="sbx-golden"><strong>המשפט שהיה עובד</strong>' + esc(e.golden_line) + '</div>' : '')
                    + (e.why ? '<p class="sbx-why">' + esc(e.why) + '</p>' : '')
                    + '</div>';
            });
        }

        $('sbx-d-body').innerHTML = html;
        $('sbx-again').textContent = passed ? 'לתרגל שוב' : 'נסה שוב לחידוד המיומנות';
    }

    function statsLine(db) {
        // Countable facts come from the engine, not from the model's prose.
        var parts = [];
        if (db.turns_used != null) parts.push('מהלכים: ' + db.turns_used + ' מתוך ' + (db.turn_budget || state.turnBudget));
        if (state.totalFacts) parts.push('פרטים שנחשפו: ' + (db.facts_unlocked || []).length + ' מתוך ' + state.totalFacts);
        if (db.hint_count) parts.push('רמזים: ' + db.hint_count);
        return parts.length ? '<p class="sbx-stats">' + esc(parts.join(' · ')) + '</p>' : '';
    }

    // ── composer plumbing ───────────────────────────────────────────────────

    function updateCount() {
        var input = $('sbx-input');
        var n = input.value.length;
        var c = $('sbx-count');
        c.textContent = n > MAX_CHARS - 120 ? (MAX_CHARS - n) : '';
        c.classList.toggle('over', n > MAX_CHARS);
        $('sbx-send').disabled = state.busy || input.disabled || !input.value.trim() || n > MAX_CHARS;
        input.style.height = 'auto';
        input.style.height = Math.min(140, input.scrollHeight) + 'px';
    }

    // ── theme toggle (same localStorage key as the rest of the portal) ──────

    function toggleTheme() {
        var dark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (dark) document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', 'dark');
        try { localStorage.setItem('beit-theme', dark ? 'light' : 'dark'); } catch (e) { /* private mode */ }
    }

    // ── boot ────────────────────────────────────────────────────────────────

    function backToLessonHref() {
        var ref = document.referrer || '';
        try {
            var u = new URL(ref);
            if (u.origin === location.origin && /course-library/.test(u.pathname)) return ref;
        } catch (e) { /* no referrer */ }
        return 'course-library-v2.html';
    }

    async function boot() {
        state.mode = 'train';   // training only (Hillel, 19.10.2026)
        $('sbx-back-lesson').href = backToLessonHref();
        $('sbx-back-top').href = backToLessonHref();

        var slug = new URLSearchParams(location.search).get('scenario');
        if (!slug) { loadCatalog(); return; }

        // Deep link from a lesson: straight to that patient's dossier.
        $('sbx-list').innerHTML = '<div class="sbx-empty">טוען…</div>';
        show('catalog');
        var res = await fetchCatalog();
        if (!res) return;
        if (res.error) { $('sbx-list').innerHTML = '<div class="sbx-empty">' + esc(res.error) + '</div>'; return; }
        var row = res.rows.find(function (r) { return r.slug === slug; });
        if (row) { openBriefing(row); return; }
        renderCatalog(res.rows);
        var note = document.createElement('div');
        note.className = 'sbx-err';
        note.textContent = 'התרגול שביקשת לא פתוח עבורך כרגע. הנה התרגולים הזמינים.';
        $('sbx-list').prepend(note);
    }

    document.addEventListener('DOMContentLoaded', function () {
        $('sbx-start').addEventListener('click', startSession);
        $('sbx-send').addEventListener('click', sendTurn);
        $('sbx-hint').addEventListener('click', askHint);
        $('sbx-theme').addEventListener('click', toggleTheme);
        $('sbx-b-back').addEventListener('click', function () {
            if (catalog) { renderCatalog(catalog); show('catalog'); $('sbx-bar-title').textContent = 'תרגול חי'; }
            else loadCatalog();
        });
        document.querySelectorAll('.sbx-mode').forEach(function (b) {
            b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
        });

        $('sbx-exit').addEventListener('click', async function () {
            if (!confirm('לצאת מהתרגול? הסשן ייסגר ולא יהיה אפשר לחזור אליו.')) return;
            await api('sim-turn', { action: 'abandon', session_id: state.sessionId });
            state.sessionId = null;
            if (state.row) openBriefing(state.row); else loadCatalog();
        });

        $('sbx-again').addEventListener('click', function () {
            // The previous session is over; a new one is created server-side, so this
            // goes back through the dossier rather than resuming anything.
            state.sessionId = null;
            if (state.row) openBriefing(state.row); else loadCatalog();
        });
        $('sbx-back-list').addEventListener('click', function () { loadCatalog(); });

        var input = $('sbx-input');
        input.addEventListener('input', updateCount);
        input.addEventListener('keydown', function (e) {
            // Enter sends, Shift+Enter is a newline. On touch the key never fires,
            // so the button is the real control there.
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                sendTurn();
            }
        });

        window.addEventListener('beforeunload', function (e) {
            if (state.sessionId && $('sbx-session').classList.contains('active')) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        boot();
    });
})();
