// admin-ai-cost.js — "עלות מורה AI" panel.
// Reads the admin-gated mentor-admin edge function (service-role aggregates
// ai_chat_usage, which admins can't read via RLS). Shows monthly Sonnet spend
// vs the 100₪ cap, so the cost can be shown to the partner (Ram).

let aiCostCache = {};            // keyed by 'YYYY-MM'
let aiCostMonth = null;          // selected month
const AI_COST_CACHE_TTL = 5 * 60 * 1000;

function _israelMonthNow() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).format(new Date());
}

function _monthOptions(n) {
    // Last n months as [{value:'YYYY-MM', label:'חודש שנה'}]
    const out = [];
    const now = new Date();
    const HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    for (let i = 0; i < n; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        out.push({ value: ym, label: `${HE[d.getMonth()]} ${d.getFullYear()}` });
    }
    return out;
}

async function loadAiCost(month) {
    const ym = month || aiCostMonth || _israelMonthNow();
    aiCostMonth = ym;
    const cached = aiCostCache[ym];
    if (cached && (Date.now() - cached.t) < AI_COST_CACHE_TTL) { renderAiCost(cached.data); return; }

    const view = document.getElementById('ai-cost-view');
    if (view) view.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> טוען נתוני עלות…</div>';

    try {
        const { data: { session } } = await db.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error('לא מחובר — יש להתחבר מחדש');
        const functionsUrl = window.SUPABASE_CONFIG?.functionsUrl || 'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1';
        const res = await fetch(`${functionsUrl}/mentor-admin?action=cost&month=${ym}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
        const data = await res.json();
        aiCostCache[ym] = { data, t: Date.now() };
        renderAiCost(data);
    } catch (err) {
        // FIX-ENGINE F-011 (2026-07-23): human Hebrew error + retry button instead of the raw
        // "Failed to fetch" (which was a CORS block on localhost — data itself is unaffected). לבקשת הלל.
        if (!view) return;
        const isNetwork = err.name === 'TypeError' || err.name === 'TimeoutError' || /fetch|network/i.test(err.message || '');
        const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        let msg;
        if (isNetwork) {
            msg = 'לא הצלחנו למשוך את נתוני העלות מהשרת. הנתונים עצמם שמורים ולא נפגעו — זו רק בעיה בטעינה.';
            if (isLocalhost) msg += '<br><span style="font-size:0.85rem;">שים לב: אתה עובד מסביבת פיתוח מקומית (localhost) — ייתכן שהשרת עדיין לא מאשר את הכתובת הזו (CORS). באתר החי זה עובד כרגיל.</span>';
        } else {
            msg = `הטעינה נכשלה: ${escapeHtml(err.message)}.<br><span style="font-size:0.85rem;">הנתונים עצמם שמורים ולא נפגעו.</span>`;
        }
        view.innerHTML = `
        <div style="padding:2.5rem 2rem;text-align:center;">
            <div style="color:#f85149;font-size:1.6rem;margin-bottom:0.8rem;"><i class="fa-solid fa-circle-exclamation"></i></div>
            <p style="color:var(--text,#e8f1f2);margin:0 0 1.2rem;line-height:1.7;">${msg}</p>
            <button onclick="loadAiCost('${aiCostMonth || ''}')" style="background:var(--gold,#D4AF37);color:#003B46;border:none;border-radius:8px;padding:10px 22px;font-family:inherit;font-weight:700;cursor:pointer;">
                <i class="fa-solid fa-rotate-right" style="margin-left:0.4rem;"></i> נסה שוב
            </button>
        </div>`;
    }
}

function renderAiCost(d) {
    const view = document.getElementById('ai-cost-view');
    if (!view) return;
    const pct = Math.min(100, d.pct_used || 0);
    const meterColor = pct >= 90 ? '#f85149' : pct >= 60 ? '#f59e0b' : '#22c55e';
    const opts = _monthOptions(6).map(o => `<option value="${o.value}"${o.value === d.month ? ' selected' : ''}>${o.label}</option>`).join('');

    const dayRows = (d.by_day || []).map(r => `
        <tr><td>${escapeHtml(formatDate(r.date))}</td><td>${r.messages.toLocaleString()}</td>
        <td>${r.prompt_tokens.toLocaleString()}</td><td>${r.completion_tokens.toLocaleString()}</td>
        <td style="font-weight:700;">${r.ils.toLocaleString()} ₪</td></tr>`).join('')
        || '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:1.5rem;">אין שימוש בחודש זה</td></tr>';

    const userRows = (d.by_user || []).map(r => `
        <tr><td>${escapeHtml(r.name)}</td><td>${r.messages.toLocaleString()}</td>
        <td>${(r.prompt_tokens + r.completion_tokens).toLocaleString()}</td>
        <td style="font-weight:700;">${r.ils.toLocaleString()} ₪</td></tr>`).join('')
        || '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:1.5rem;">אין שימוש בחודש זה</td></tr>';

    view.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
        <div>
            <h1 class="page-title"><i class="fa-solid fa-brain" style="color:var(--gold);margin-left:0.5rem;"></i> עלות מורה AI</h1>
            <p style="color:var(--text-secondary);margin:-0.6rem 0 0;font-size:0.9rem;">כמה הוצאנו על המורה החכם (Claude Sonnet) מול תקרת ${d.cap_ils} ₪ לחודש</p>
        </div>
        <select onchange="loadAiCost(this.value)" style="background:var(--bg-secondary,#0f1d24);color:var(--text,#e8f1f2);border:1px solid var(--border,#21323b);border-radius:8px;padding:8px 12px;font-family:inherit;">${opts}</select>
    </div>

    <div class="stats" style="margin-top:1rem;">
        <div class="stat-card"><div class="stat-icon" style="background:rgba(37,211,102,0.12);color:#25D366;"><i class="fa-solid fa-shekel-sign"></i></div>
            <div><div class="stat-value">${(d.spent_ils || 0).toLocaleString()} ₪</div><div class="stat-label">עלות החודש</div></div></div>
        <div class="stat-card"><div class="stat-icon gold"><i class="fa-solid fa-gauge-high"></i></div>
            <div><div class="stat-value">${d.pct_used || 0}%</div><div class="stat-label">מנוצל מהתקרה</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:rgba(88,166,255,0.12);color:#58a6ff;"><i class="fa-solid fa-piggy-bank"></i></div>
            <div><div class="stat-value">${(d.remaining_ils || 0).toLocaleString()} ₪</div><div class="stat-label">נותר עד התקרה</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:rgba(212,175,55,0.12);color:#D4AF37;"><i class="fa-solid fa-comments"></i></div>
            <div><div class="stat-value">${(d.messages || 0).toLocaleString()}</div><div class="stat-label">הודעות · ${d.active_users || 0} משתמשים</div></div></div>
    </div>

    <div style="margin:1.2rem 0 0.4rem;display:flex;justify-content:space-between;font-size:0.85rem;color:var(--text-secondary);">
        <span>${(d.spent_ils || 0).toLocaleString()} ₪ מתוך ${d.cap_ils} ₪</span><span>${pct}%</span></div>
    <div style="height:14px;background:var(--bg-secondary,#0f1d24);border:1px solid var(--border,#21323b);border-radius:8px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${meterColor};transition:width .4s;"></div></div>
    ${pct >= 100 ? '<p style="color:#f85149;margin:.5rem 0 0;font-size:.85rem;"><i class="fa-solid fa-triangle-exclamation"></i> התקרה נוצלה — המורה עבר אוטומטית למודל החינמי עד תחילת החודש הבא.</p>' : ''}

    <div class="table-container" style="margin-top:1.5rem;">
        <div class="table-header"><h3><i class="fa-solid fa-user" style="color:var(--gold);margin-left:.4rem;"></i> לפי משתמש</h3></div>
        <table><thead><tr><th>שם</th><th>הודעות</th><th>טוקנים</th><th>עלות</th></tr></thead><tbody>${userRows}</tbody></table>
    </div>

    <div class="table-container" style="margin-top:1.2rem;">
        <div class="table-header"><h3><i class="fa-solid fa-calendar-day" style="color:var(--gold);margin-left:.4rem;"></i> לפי יום</h3></div>
        <table><thead><tr><th>תאריך</th><th>הודעות</th><th>טוקני קלט</th><th>טוקני פלט</th><th>עלות</th></tr></thead><tbody>${dayRows}</tbody></table>
    </div>

    <p style="color:var(--text-secondary);font-size:0.78rem;margin-top:1rem;line-height:1.6;">
        <i class="fa-solid fa-circle-info"></i> המספרים אמיתיים, מבוססים על השימוש שנרשם. זהו אומדן עליון (טוקני cache מתומחרים במלוא מחיר הקלט), כך שהעלות בפועל תמיד שווה או נמוכה יותר. תמחור: $${d.pricing?.in_usd}/$${d.pricing?.out_usd} ל-1M טוקנים · שער ${d.pricing?.usd_ils} ₪.</p>`;
}
