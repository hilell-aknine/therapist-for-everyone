/* =============================================================================
   sandbox.js — client for the patient simulator.
   Spec: docs/specs/sandbox-patient-simulator.md

   The client is deliberately thin. It holds no scoring rules, no unlock
   conditions and no success criteria — all of that lives in the Edge Function,
   because anything shipped to the browser is the answer key.

   It also never shows the move classification mid-session. Showing the learner
   "give_advice" live would teach them to game the classifier instead of reading
   the patient. It all lands in the debrief.
   ============================================================================= */
(function () {
    'use strict';

    var FN = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.functionsUrl)
        || 'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1';
    var MAX_CHARS = 600;

    var METRICS = [
        { k: 'rapport', label: 'ראפור' },
        { k: 'resistance', label: 'התנגדות' },
        { k: 'emotional_depth', label: 'עומק' },
        { k: 'specificity', label: 'פירוט' }
    ];

    var state = {
        sessionId: null,
        scenarioSlug: null,
        title: '',
        briefing: null,
        turnBudget: 12,
        turnsLeft: 12,
        totalFacts: 0,
        busy: false
    };

    var el = {};

    function $(id) { return document.getElementById(id); }

    function show(screen) {
        ['catalog', 'briefing', 'session', 'debrief'].forEach(function (s) {
            var n = $('sbx-' + s);
            if (n) n.classList.toggle('active', s === screen);
        });
        window.scrollTo({ top: 0, behavior: 'auto' });
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── auth + transport ────────────────────────────────────────────────────

    async function token() {
        try {
            var s = await window.Auth.getSession();
            return (s && s.access_token) || '';
        } catch (e) { return ''; }
    }

    async function api(path, body) {
        var t = await token();
        if (!t) { location.href = 'login.html?next=' + encodeURIComponent(location.pathname); return null; }
        var res = await fetch(FN + '/' + path, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey) || '',
                'Authorization': 'Bearer ' + t
            },
            body: JSON.stringify(body)
        });
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

    async function loadCatalog() {
        var host = $('sbx-list');
        host.innerHTML = '<div class="sbx-empty">טוען…</div>';

        var db = window.supabaseClient || (window.Auth && window.Auth.client);
        if (!db) { host.innerHTML = '<div class="sbx-empty">לא הצלחנו להתחבר. רענן את הדף.</div>'; return; }

        // Gate BEFORE the RPC. sim_catalog is revoked from anon, so a logged-out
        // visitor used to land on the raw Postgres string "permission denied for
        // function sim_catalog" — English, mid-Hebrew-page. The RPC is not the
        // place to discover you are logged out.
        var t = await token();
        if (!t) { location.href = 'login.html?next=' + encodeURIComponent(location.pathname); return; }

        var r = await db.rpc('sim_catalog');
        if (r.error) {
            // Never surface a database message to a learner. Log it for us, show
            // them something they can act on.
            console.error('[sandbox] sim_catalog failed:', r.error);
            host.innerHTML = '<div class="sbx-empty">לא הצלחנו לטעון את התרגולים כרגע.<br>נסו לרענן, ואם זה חוזר כתבו לנו.</div>';
            return;
        }
        var rows = r.data || [];
        if (!rows.length) {
            host.innerHTML = '<div class="sbx-empty">עוד אין כאן תרחישים פתוחים עבורך.</div>';
            return;
        }

        host.innerHTML = '';
        rows.forEach(function (row) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'sbx-scenario';
            var sub = (row.patient_name ? row.patient_name + ' · ' : '')
                + row.turn_budget + ' תורות'
                + (row.attempts ? ' · ' + row.attempts + ' ניסיונות' : '');
            var badge = row.best_outcome === 'success'
                ? '<span class="sbx-badge done">הושלם</span>'
                : '<span class="sbx-badge">רמה ' + row.difficulty + '</span>';
            b.innerHTML = '<div class="sbx-scenario-main">'
                + '<p class="sbx-scenario-t">' + esc(row.title) + '</p>'
                + '<p class="sbx-scenario-s">' + esc(sub) + '</p></div>' + badge;
            b.addEventListener('click', function () { openBriefing(row.slug, row); });
            host.appendChild(b);
        });
        show('catalog');
    }

    // ── briefing ────────────────────────────────────────────────────────────

    function openBriefing(slug, row) {
        state.scenarioSlug = slug;
        state.row = row;                 // kept so "לנסות שוב" needs no DOM archaeology
        var br = row.briefing || {};
        $('sbx-briefing-err').innerHTML = '';
        $('sbx-b-title').textContent = row.title || '';
        $('sbx-b-intro').textContent = br.patient_intro || '';
        $('sbx-b-mission').textContent = br.mission || '';

        var rules = $('sbx-b-rules');
        rules.innerHTML = '';
        (br.rules || []).forEach(function (r) {
            var li = document.createElement('li');
            li.textContent = r;
            rules.appendChild(li);
        });

        var chips = $('sbx-b-measured');
        chips.innerHTML = '';
        (br.measured || []).forEach(function (m) {
            var s = document.createElement('span');
            s.className = 'sbx-chip';
            s.textContent = m;
            chips.appendChild(s);
        });

        $('sbx-b-budget').textContent = row.turn_budget;
        show('briefing');
    }

    async function startSession() {
        if (state.busy) return;
        state.busy = true;
        var btn = $('sbx-start');
        btn.disabled = true;
        btn.textContent = 'פותח חדר…';

        var d = await api('sim-turn', { action: 'start', scenario_slug: state.scenarioSlug });
        state.busy = false;
        btn.disabled = false;
        btn.textContent = 'התחל את התרגול';
        if (!d) return;

        if (d.error) { fail(d.error); return; }

        state.sessionId = d.session_id;
        state.title = d.title || '';
        state.turnBudget = d.turn_budget || 12;
        state.turnsLeft = d.turns_left;
        state.totalFacts = d.total_facts || 0;

        $('sbx-bar-title').textContent = state.title;
        $('sbx-chat').innerHTML = '';
        buildRail();
        renderMetrics(d.metrics);
        renderProgress(0);
        addMsg('pt', 'מירב', d.opening);
        setTurns(d.turns_left);
        enableComposer(true);
        show('session');
        $('sbx-input').focus();
    }

    // ── session ─────────────────────────────────────────────────────────────

    function buildRail() {
        var rail = $('sbx-rail');
        rail.innerHTML = '';
        METRICS.forEach(function (m) {
            var d = document.createElement('div');
            d.className = 'sbx-metric';
            d.setAttribute('data-k', m.k);
            d.innerHTML = '<div class="sbx-metric-top"><span>' + m.label + '</span>'
                + '<span class="sbx-metric-val" data-v="' + m.k + '">0</span></div>'
                + '<div class="sbx-track"><div class="sbx-fill" data-f="' + m.k + '"></div></div>';
            rail.appendChild(d);
        });
        var p = document.createElement('div');
        p.className = 'sbx-progress';
        p.id = 'sbx-pips';
        rail.appendChild(p);
    }

    function renderMetrics(m) {
        if (!m) return;
        METRICS.forEach(function (x) {
            var v = Math.max(0, Math.min(100, Number(m[x.k]) || 0));
            var val = document.querySelector('[data-v="' + x.k + '"]');
            var fill = document.querySelector('[data-f="' + x.k + '"]');
            if (val) val.textContent = v;
            if (fill) fill.style.width = v + '%';
        });
    }

    function renderProgress(unlocked) {
        var host = $('sbx-pips');
        if (!host) return;
        var pips = '';
        for (var i = 0; i < state.totalFacts; i++) {
            pips += '<span class="sbx-pip' + (i < unlocked ? ' on' : '') + '"></span>';
        }
        host.innerHTML = '<span>פרטים שנחשפו</span>' + pips;
    }

    function setTurns(n) {
        state.turnsLeft = n;
        var t = $('sbx-turns');
        t.textContent = n + ' תורות';
        t.classList.toggle('low', n <= 3);
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

    function addReveal() {
        var chat = $('sbx-chat');
        var d = document.createElement('div');
        d.className = 'sbx-reveal';
        d.innerHTML = '🔓 <span>היא מסרה פרט חדש</span>';
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
        d.innerHTML = '<div class="sbx-typing"><span></span><span></span><span></span></div>';
        chat.appendChild(d);
        d.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }

    function enableComposer(on) {
        $('sbx-input').disabled = !on;
        $('sbx-hint').disabled = !on;
        // Send stays disabled until there is actually something to send.
        $('sbx-send').disabled = !on || !$('sbx-input').value.trim();
    }

    async function sendTurn() {
        if (state.busy) return;
        var input = $('sbx-input');
        var text = input.value.trim();
        if (!text) return;
        if (text.length > MAX_CHARS) return;

        state.busy = true;
        enableComposer(false);
        addMsg('me', 'את/ה', text);
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
            // A 503 means the turn was NOT consumed — say so, so the learner does
            // not think they burned one.
            addMsg('sys', '', d.error);
            enableComposer(true);
            input.focus();
            return;
        }

        if (d.revealed) addReveal();
        addMsg('pt', 'מירב', d.reply);
        renderMetrics(d.metrics);
        renderProgress(d.unlocked_count || 0);
        setTurns(d.turns_left);

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
        addMsg('hint', 'רמז', d.hint);
    }

    // ── debrief ─────────────────────────────────────────────────────────────

    var OUTCOME = {
        success: { icon: '🎯', cls: 'success', t: 'הגעת ליעד' },
        budget: { icon: '⏱', cls: 'fail', t: 'התורות נגמרו' },
        collapse: { icon: '🚪', cls: 'fail', t: 'הקשר נקטע' },
        abandoned: { icon: '—', cls: 'fail', t: 'הסשן נסגר' }
    };

    var SCORE_LABEL = {
        overall: 'כולל',
        rapport_building: 'בניית ראפור',
        chunk_down: 'פירוק הכללה',
        language_discipline: 'משמעת שפה',
        pacing: 'קצב'
    };

    async function endSession(outcome) {
        var o = OUTCOME[outcome] || OUTCOME.abandoned;
        $('sbx-verdict').className = 'sbx-verdict ' + o.cls;
        $('sbx-v-icon').textContent = o.icon;
        $('sbx-v-title').textContent = o.t;
        $('sbx-v-sub').textContent = 'מכין את התחקיר…';
        $('sbx-d-body').innerHTML = '';
        show('debrief');

        var d = await api('sim-debrief', { session_id: state.sessionId });
        if (!d) return;
        if (d.error) {
            $('sbx-v-sub').textContent = '';
            $('sbx-d-body').innerHTML = '<div class="sbx-err">' + esc(d.error) + '</div>';
            return;
        }
        renderDebrief(d.debrief || {});
    }

    function renderDebrief(db) {
        $('sbx-v-sub').textContent = db.headline || '';

        var html = '';

        if (db.scores) {
            html += '<div class="sbx-scores">';
            ['overall', 'rapport_building', 'chunk_down', 'language_discipline', 'pacing']
                .forEach(function (k) {
                    if (db.scores[k] == null) return;
                    html += '<div class="sbx-score"><div class="sbx-score-k">'
                        + esc(SCORE_LABEL[k] || k) + '</div><div class="sbx-score-v">'
                        + esc(db.scores[k]) + '</div></div>';
                });
            html += '</div>';
        }

        // Countable facts come from the engine, not from the model's prose.
        html += '<p class="sbx-note">'
            + 'תורות: ' + esc(db.turns_used) + ' מתוך ' + esc(db.turn_budget || state.turnBudget)
            + ' · פרטים שנחשפו: ' + esc((db.facts_unlocked || []).length) + ' מתוך ' + state.totalFacts
            + (db.target_achieved ? ' · היעד הושג' : ' · היעד לא הושג')
            + (db.hint_count ? ' · רמזים: ' + esc(db.hint_count) : '')
            + '</p>';

        if ((db.strengths || []).length) {
            html += '<h2 class="sbx-h2">מה עבד</h2>';
            db.strengths.forEach(function (s) {
                html += '<div class="sbx-strength">' + esc(s) + '</div>';
            });
        }

        if ((db.growth_edges || []).length) {
            html += '<h2 class="sbx-h2">איפה זה נפל</h2>';
            db.growth_edges.forEach(function (g) {
                html += '<div class="sbx-edge">'
                    + '<div class="sbx-edge-turn">תור ' + esc(g.turn) + '</div>'
                    + (g.student_said ? '<p class="sbx-said">' + esc(g.student_said) + '</p>' : '')
                    + (g.what_happened ? '<p class="sbx-happened">' + esc(g.what_happened) + '</p>' : '')
                    + (g.golden_line
                        ? '<div class="sbx-golden"><strong>השורה שהייתה עובדת</strong>' + esc(g.golden_line) + '</div>'
                        : '')
                    + (g.why ? '<p class="sbx-why">' + esc(g.why) + '</p>' : '')
                    + '</div>';
            });
        }

        $('sbx-d-body').innerHTML = html;
    }

    // ── composer plumbing ───────────────────────────────────────────────────

    function updateCount() {
        var input = $('sbx-input');
        var n = input.value.length;
        var c = $('sbx-count');
        c.textContent = n > MAX_CHARS - 120 ? (MAX_CHARS - n) : '';
        c.classList.toggle('over', n > MAX_CHARS);
        $('sbx-send').disabled = state.busy || !input.value.trim() || n > MAX_CHARS;
        input.style.height = 'auto';
        input.style.height = Math.min(140, input.scrollHeight) + 'px';
    }

    // ── boot ────────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', function () {
        el.input = $('sbx-input');

        $('sbx-start').addEventListener('click', startSession);
        $('sbx-send').addEventListener('click', sendTurn);
        $('sbx-hint').addEventListener('click', askHint);
        $('sbx-b-back').addEventListener('click', function () { show('catalog'); });

        $('sbx-exit').addEventListener('click', async function () {
            if (!confirm('לצאת מהתרגול? הסשן ייסגר ולא יהיה אפשר לחזור אליו.')) return;
            await api('sim-turn', { action: 'abandon', session_id: state.sessionId });
            loadCatalog();
        });

        $('sbx-again').addEventListener('click', function () { openBriefingAgain(); });
        $('sbx-back-list').addEventListener('click', function () { loadCatalog(); });

        el.input.addEventListener('input', updateCount);
        el.input.addEventListener('keydown', function (e) {
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

        loadCatalog();
    });

    function openBriefingAgain() {
        // The previous session is over and a new one has to be created server-side,
        // so this goes back through the briefing rather than resuming anything.
        state.sessionId = null;
        if (state.row && state.scenarioSlug) openBriefing(state.scenarioSlug, state.row);
        else loadCatalog();
    }
})();
