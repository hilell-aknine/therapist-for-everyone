// admin-agent-widget.js — Floating AI operations agent for the admin dashboard.
// ============================================================================
// One self-injecting floating button + chat panel available on EVERY admin view.
// Talks to the `admin-agent` edge function: READ queries render as Hebrew tables/
// KPI cards; WRITE actions come back as a `pending_action` shown as a confirm card
// ("אשר ובצע" / "ביטול") and only execute on explicit click.
//
// Reuses page globals when present: `db` (Supabase client), `showToast`,
// `window.SUPABASE_CONFIG.functionsUrl`. Self-contained otherwise.
// ============================================================================
(function () {
  'use strict';

  var FN = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.functionsUrl) ||
    'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1';
  var STORAGE_KEY = 'admin_agent_history_v1';
  var history = [];      // [{role:'user'|'assistant', content:'...'}]
  var busy = false;
  var openState = false;

  function esc(s) {
    if (window.escapeHtml) return window.escapeHtml(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function toast(msg, type) { if (window.showToast) window.showToast(msg, type); }

  // ---- styles ----
  function injectStyles() {
    if (document.getElementById('admin-agent-styles')) return;
    var css = '' +
      '#aa-fab{position:fixed;bottom:20px;left:20px;z-index:10000;width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;' +
      'background:linear-gradient(135deg,#D4AF37,#00606B);color:#fff;font-size:1.5rem;box-shadow:0 6px 20px rgba(0,0,0,.35);' +
      'display:flex;align-items:center;justify-content:center;transition:transform .15s ease,box-shadow .15s ease;}' +
      '#aa-fab:hover{transform:scale(1.06);box-shadow:0 8px 26px rgba(0,0,0,.45);}' +
      '#aa-fab:focus-visible{outline:3px solid #D4AF37;outline-offset:3px;}' +
      '#aa-panel{position:fixed;bottom:90px;left:20px;z-index:10000;width:min(420px,calc(100vw - 40px));height:min(620px,calc(100vh - 130px));' +
      'background:var(--bg-card,#fff);color:var(--text,#1a1a1a);border:1px solid var(--border,#e2e2e2);border-radius:18px;' +
      'box-shadow:0 18px 50px rgba(0,0,0,.4);display:none;flex-direction:column;overflow:hidden;direction:rtl;}' +
      '#aa-panel.open{display:flex;}' +
      '.aa-head{display:flex;align-items:center;gap:.6rem;padding:.85rem 1rem;background:linear-gradient(135deg,#003B46,#00606B);color:#fff;}' +
      '.aa-head .aa-title{font-weight:700;font-size:1rem;flex:1;}' +
      '.aa-head .aa-dot{width:9px;height:9px;border-radius:50%;background:#D4AF37;box-shadow:0 0 8px #D4AF37;}' +
      '.aa-head button{background:rgba(255,255,255,.15);border:none;color:#fff;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:1rem;}' +
      '.aa-head button:hover{background:rgba(255,255,255,.28);}' +
      '.aa-body{flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:.75rem;background:var(--bg,#f6f7f8);}' +
      '.aa-msg{max-width:90%;padding:.6rem .8rem;border-radius:14px;font-size:.92rem;line-height:1.5;white-space:pre-wrap;word-break:break-word;}' +
      '.aa-msg.user{align-self:flex-start;background:#00606B;color:#fff;border-bottom-right-radius:4px;}' +
      '.aa-msg.bot{align-self:flex-end;background:var(--bg-card,#fff);border:1px solid var(--border,#e2e2e2);border-bottom-left-radius:4px;}' +
      '.aa-card{align-self:stretch;background:var(--bg-card,#fff);border:1px solid var(--border,#e2e2e2);border-radius:12px;overflow:hidden;}' +
      '.aa-card-title{padding:.55rem .8rem;font-weight:700;font-size:.88rem;background:rgba(212,175,55,.12);border-bottom:1px solid var(--border,#e2e2e2);}' +
      '.aa-table-wrap{overflow-x:auto;max-height:300px;}' +
      '.aa-table{width:100%;border-collapse:collapse;font-size:.8rem;}' +
      '.aa-table th,.aa-table td{padding:.4rem .55rem;border-bottom:1px solid var(--border,#eee);text-align:right;white-space:nowrap;}' +
      '.aa-table th{position:sticky;top:0;background:var(--bg,#f0f1f2);font-weight:700;}' +
      '.aa-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:.5rem;padding:.7rem;}' +
      '.aa-kpi{background:var(--bg,#f6f7f8);border:1px solid var(--border,#eee);border-radius:10px;padding:.55rem;text-align:center;}' +
      '.aa-kpi .v{font-size:1.25rem;font-weight:800;color:var(--gold,#D4AF37);}' +
      '.aa-kpi .l{font-size:.72rem;opacity:.8;margin-top:2px;}' +
      '.aa-kpi .s{font-size:.66rem;opacity:.6;margin-top:2px;}' +
      '.aa-detail{padding:.6rem .8rem;display:flex;flex-direction:column;gap:.35rem;font-size:.84rem;}' +
      '.aa-detail .row{display:flex;gap:.5rem;border-bottom:1px dashed var(--border,#eee);padding-bottom:.3rem;}' +
      '.aa-detail .row .k{font-weight:700;min-width:120px;opacity:.85;}' +
      '.aa-confirm{align-self:stretch;background:rgba(212,175,55,.1);border:1px solid var(--gold,#D4AF37);border-radius:12px;padding:.8rem;}' +
      '.aa-confirm .sum{font-size:.9rem;line-height:1.5;white-space:pre-wrap;margin-bottom:.7rem;font-weight:600;}' +
      '.aa-confirm .acts{display:flex;gap:.5rem;}' +
      '.aa-btn{flex:1;padding:.55rem;border:none;border-radius:9px;cursor:pointer;font-weight:700;font-size:.88rem;font-family:inherit;}' +
      '.aa-btn.go{background:var(--gold,#D4AF37);color:#003B46;}' +
      '.aa-btn.cancel{background:var(--bg,#eee);color:var(--text,#333);border:1px solid var(--border,#ddd);}' +
      '.aa-btn:disabled{opacity:.5;cursor:default;}' +
      '.aa-foot{display:flex;gap:.5rem;padding:.7rem;border-top:1px solid var(--border,#e2e2e2);background:var(--bg-card,#fff);}' +
      '.aa-foot textarea{flex:1;resize:none;border:1px solid var(--border,#ddd);border-radius:10px;padding:.55rem .7rem;font-size:.9rem;font-family:inherit;max-height:90px;background:var(--bg,#fff);color:var(--text,#222);}' +
      '.aa-foot button{background:var(--gold,#D4AF37);color:#003B46;border:none;border-radius:10px;width:44px;cursor:pointer;font-size:1.1rem;}' +
      '.aa-foot button:disabled{opacity:.5;cursor:default;}' +
      '.aa-typing{align-self:flex-end;font-size:.85rem;opacity:.6;padding:.3rem .6rem;}' +
      '.aa-empty{margin:auto;text-align:center;opacity:.65;font-size:.88rem;line-height:1.7;padding:1rem;}' +
      '.aa-chip{display:inline-block;background:rgba(0,96,107,.12);border:1px solid var(--border,#ddd);border-radius:20px;padding:.25rem .6rem;margin:.2rem;font-size:.78rem;cursor:pointer;}' +
      '.aa-chip:hover{background:rgba(0,96,107,.22);}' +
      '@media (prefers-reduced-motion: reduce){#aa-fab{transition:none;}}';
    var st = document.createElement('style');
    st.id = 'admin-agent-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---- DOM ----
  var elBody, elInput, elSend, elPanel, elFab;

  function buildDom() {
    elFab = document.createElement('button');
    elFab.id = 'aa-fab';
    elFab.setAttribute('aria-label', 'סוכן הניהול החכם');
    elFab.title = 'סוכן הניהול החכם';
    elFab.innerHTML = '🤖';
    elFab.onclick = toggle;

    elPanel = document.createElement('div');
    elPanel.id = 'aa-panel';
    elPanel.setAttribute('role', 'dialog');
    elPanel.setAttribute('aria-label', 'סוכן הניהול החכם');
    elPanel.innerHTML =
      '<div class="aa-head"><span class="aa-dot"></span><span class="aa-title">סוכן הניהול</span>' +
      '<button type="button" id="aa-clear" title="נקה שיחה" aria-label="נקה שיחה">🗑</button>' +
      '<button type="button" id="aa-close" title="סגור" aria-label="סגור">✕</button></div>' +
      '<div class="aa-body" id="aa-body"></div>' +
      '<div class="aa-foot"><textarea id="aa-input" rows="1" placeholder="שאל אותי משהו… (מי למד הכי הרבה? פתח גישה ל…)" aria-label="הודעה לסוכן"></textarea>' +
      '<button type="button" id="aa-send" aria-label="שלח">➤</button></div>';

    document.body.appendChild(elFab);
    document.body.appendChild(elPanel);

    elBody = elPanel.querySelector('#aa-body');
    elInput = elPanel.querySelector('#aa-input');
    elSend = elPanel.querySelector('#aa-send');
    elPanel.querySelector('#aa-close').onclick = toggle;
    elPanel.querySelector('#aa-clear').onclick = clearChat;
    elSend.onclick = send;
    elInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    elInput.addEventListener('input', function () {
      elInput.style.height = 'auto'; elInput.style.height = Math.min(90, elInput.scrollHeight) + 'px';
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openState) toggle(); });

    renderHistory();
  }

  function toggle() {
    openState = !openState;
    elPanel.classList.toggle('open', openState);
    if (openState) setTimeout(function () { elInput && elInput.focus(); }, 50);
  }

  // ---- rendering ----
  function scrollDown() { elBody.scrollTop = elBody.scrollHeight; }

  function addMsg(role, text) {
    var d = document.createElement('div');
    d.className = 'aa-msg ' + (role === 'user' ? 'user' : 'bot');
    d.textContent = text;
    elBody.appendChild(d);
    scrollDown();
  }

  function renderEmpty() {
    var d = document.createElement('div');
    d.className = 'aa-empty';
    d.innerHTML = 'שלום הלל 👋 אני סוכן הניהול.<br>אפשר לשאול אותי הכל מהדשבורד.<br><br>' +
      ['מי למד הכי הרבה?', 'מי התחבר אחרון?', 'כמה לקוחות משלמים יש?', 'תמונת מצב כללית'].map(function (q) {
        return '<span class="aa-chip" data-q="' + esc(q) + '">' + esc(q) + '</span>';
      }).join('');
    elBody.appendChild(d);
    d.querySelectorAll('.aa-chip').forEach(function (c) {
      c.onclick = function () { elInput.value = c.getAttribute('data-q'); send(); };
    });
  }

  function renderCard(card) {
    if (!card) return;
    var el = document.createElement('div');
    if (card.kind === 'table') {
      var cols = card.columns || (card.rows && card.rows[0] ? Object.keys(card.rows[0]) : []);
      var head = cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('');
      var body = (card.rows || []).map(function (r) {
        return '<tr>' + cols.map(function (c) { return '<td>' + esc(r[c]) + '</td>'; }).join('') + '</tr>';
      }).join('');
      el.className = 'aa-card';
      el.innerHTML = '<div class="aa-card-title">' + esc(card.title) + '</div>' +
        (card.rows && card.rows.length
          ? '<div class="aa-table-wrap"><table class="aa-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>'
          : '<div class="aa-detail">אין תוצאות.</div>');
    } else if (card.kind === 'kpis') {
      el.className = 'aa-card';
      el.innerHTML = '<div class="aa-card-title">' + esc(card.title) + '</div><div class="aa-kpis">' +
        (card.items || []).map(function (it) {
          return '<div class="aa-kpi"><div class="v">' + esc(it.value) + '</div><div class="l">' + esc(it.label) + '</div>' +
            (it.sub ? '<div class="s">' + esc(it.sub) + '</div>' : '') + '</div>';
        }).join('') + '</div>';
    } else if (card.kind === 'detail') {
      el.className = 'aa-card';
      el.innerHTML = '<div class="aa-card-title">' + esc(card.title) + '</div><div class="aa-detail">' +
        (card.fields || []).map(function (f) {
          return '<div class="row"><span class="k">' + esc(f.label) + '</span><span class="val">' + esc(f.value) + '</span></div>';
        }).join('') + '</div>';
    }
    elBody.appendChild(el);
    scrollDown();
  }

  function renderConfirm(pa) {
    var el = document.createElement('div');
    el.className = 'aa-confirm';
    el.innerHTML = '<div class="sum">⚠️ ' + esc(pa.summary) + '</div>' +
      '<div class="acts"><button type="button" class="aa-btn go">אשר ובצע</button>' +
      '<button type="button" class="aa-btn cancel">ביטול</button></div>';
    var go = el.querySelector('.go'), cancel = el.querySelector('.cancel');
    go.onclick = function () { confirmAction(pa, el, go, cancel); };
    cancel.onclick = function () {
      el.querySelector('.acts').innerHTML = '<span style="opacity:.7;font-size:.85rem;">בוטל.</span>';
    };
    elBody.appendChild(el);
    scrollDown();
  }

  function showTyping(on) {
    var t = elBody.querySelector('.aa-typing');
    if (on) {
      if (!t) { t = document.createElement('div'); t.className = 'aa-typing'; t.textContent = 'הסוכן חושב…'; elBody.appendChild(t); scrollDown(); }
    } else if (t) { t.remove(); }
  }

  function renderHistory() {
    elBody.innerHTML = '';
    if (!history.length) { renderEmpty(); return; }
    history.forEach(function (m) { addMsg(m.role, m.content); });
  }

  // ---- networking ----
  // `db` is a top-level `const` in admin-state.js → it's a global LEXICAL binding
  // (bare `db`), NOT a property on window. Resolve it safely across both forms.
  function getDb() {
    try { if (typeof db !== 'undefined' && db) return db; } catch (e) { /* TDZ / not defined */ }
    if (window.db) return window.db;                            // in case it's on window
    return null;
  }

  async function getToken() {
    try {
      var client = getDb();
      if (!client) return null;
      var s = await client.auth.getSession();
      return s && s.data && s.data.session ? s.data.session.access_token : null;
    } catch (e) { return null; }
  }

  async function send() {
    if (busy) return;
    var text = (elInput.value || '').trim();
    if (!text) return;
    var emptyEl = elBody.querySelector('.aa-empty'); if (emptyEl) emptyEl.remove();

    elInput.value = ''; elInput.style.height = 'auto';
    addMsg('user', text);
    history.push({ role: 'user', content: text });
    persist();

    busy = true; elSend.disabled = true; showTyping(true);
    try {
      var token = await getToken();
      if (!token) { showTyping(false); addMsg('bot', 'יש להתחבר מחדש.'); return; }
      var res = await fetch(FN + '/admin-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ message: text, history: history.slice(-20) }),
      });
      var data = await res.json().catch(function () { return {}; });
      showTyping(false);
      if (!res.ok) { addMsg('bot', data.error || ('שגיאה ' + res.status)); return; }

      if (data.reply) { addMsg('bot', data.reply); history.push({ role: 'assistant', content: data.reply }); persist(); }
      (data.cards || []).forEach(renderCard);
      if (data.pending_action) renderConfirm(data.pending_action);
    } catch (e) {
      showTyping(false);
      addMsg('bot', 'שגיאת רשת. נסה שוב.');
    } finally {
      busy = false; elSend.disabled = false;
    }
  }

  async function confirmAction(pa, cardEl, goBtn, cancelBtn) {
    goBtn.disabled = true; cancelBtn.disabled = true;
    goBtn.textContent = 'מבצע…';
    try {
      var token = await getToken();
      if (!token) { toast('יש להתחבר מחדש', 'error'); goBtn.disabled = false; cancelBtn.disabled = false; goBtn.textContent = 'אשר ובצע'; return; }
      var res = await fetch(FN + '/admin-agent?action=execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ pending_action: pa }),
      });
      var data = await res.json().catch(function () { return {}; });
      var ok = res.ok && data.ok;
      cardEl.querySelector('.acts').innerHTML = '<span style="font-size:.88rem;font-weight:600;color:' + (ok ? '#1a7f37' : '#c72c2c') + ';">' +
        esc(data.message || (ok ? 'בוצע ✓' : 'הפעולה נכשלה')) + '</span>';
      toast(data.message || (ok ? 'בוצע' : 'נכשל'), ok ? 'success' : 'error');
    } catch (e) {
      cardEl.querySelector('.acts').innerHTML = '<span style="font-size:.85rem;color:#c72c2c;">שגיאת רשת.</span>';
    }
  }

  // ---- persistence ----
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-30))); } catch (e) { /* ignore */ }
  }
  function loadHistory() {
    try { var raw = localStorage.getItem(STORAGE_KEY); if (raw) history = JSON.parse(raw) || []; } catch (e) { history = []; }
  }
  function clearChat() {
    history = []; persist(); renderHistory();
  }

  // ---- boot ----
  var bootTries = 0;
  function boot() {
    if (!getDb() && bootTries < 40) {   // admin-state.js not ready yet — retry briefly (~12s max)
      bootTries++;
      return setTimeout(boot, 300);
    }
    injectStyles();
    loadHistory();
    buildDom();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
