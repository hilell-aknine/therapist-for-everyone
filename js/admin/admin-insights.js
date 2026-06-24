// admin-insights.js — "תובנות מהמורה" panel.
// Recurring student questions mined into marketing angles + automation
// opportunities (voice-of-customer). Reads the admin-gated mentor-admin function.

let insightsCache = null;
let insightsCacheTime = 0;
const INSIGHTS_CACHE_TTL = 5 * 60 * 1000;
let insightsDays = 30;

const TAG_META = {
    pain:      { label: 'כאב',     color: '#f85149' },
    desire:    { label: 'רצון',    color: '#22c55e' },
    objection: { label: 'התנגדות', color: '#f59e0b' },
    confusion: { label: 'בלבול',   color: '#58a6ff' },
};

async function loadInsights(refresh) {
    if (!refresh && insightsCache && (Date.now() - insightsCacheTime) < INSIGHTS_CACHE_TTL) {
        renderInsights(insightsCache); return;
    }
    const view = document.getElementById('mentor-insights-view');
    if (view) view.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> ${refresh ? 'מנתח שאלות (עד דקה)…' : 'טוען תובנות…'}</div>`;
    try {
        const { data: { session } } = await db.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error('לא מחובר — יש להתחבר מחדש');
        const functionsUrl = window.SUPABASE_CONFIG?.functionsUrl || 'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1';
        const qs = `action=insights&days=${insightsDays}${refresh ? '&refresh=1' : ''}`;
        const res = await fetch(`${functionsUrl}/mentor-admin?${qs}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(90000),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
        const data = await res.json();
        insightsCache = data; insightsCacheTime = Date.now();
        renderInsights(data);
    } catch (err) {
        if (view) view.innerHTML = `<div style="padding:2rem;text-align:center;color:#f85149;"><i class="fa-solid fa-circle-exclamation"></i> ${escapeHtml(err.message)}</div>`;
    }
}

function setInsightsDays(d) { insightsDays = Number(d) || 30; }

function copyAngle(btn) {
    const txt = btn.getAttribute('data-angle') || '';
    navigator.clipboard?.writeText(txt).then(() => {
        const orig = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-check"></i> הועתק';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
    });
}

function renderInsights(d) {
    const view = document.getElementById('mentor-insights-view');
    if (!view) return;
    const themes = d.themes || [];
    const when = d.generated_at ? new Date(d.generated_at).toLocaleString('he-IL') : '—';

    const themeCards = themes.map(t => {
        const tag = TAG_META[t.marketing_tag] || { label: t.marketing_tag || '', color: '#6c7a89' };
        const quotes = (t.examples || []).slice(0, 3).map(q => `<li style="margin:.2rem 0;">"${escapeHtml(q)}"</li>`).join('');
        return `
        <div class="stat-card" style="display:block;padding:1.1rem;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;">
                <h3 style="margin:0;font-size:1.05rem;">${escapeHtml(t.title)}</h3>
                <span style="background:${tag.color}22;color:${tag.color};border:1px solid ${tag.color};padding:2px 10px;border-radius:999px;font-size:.75rem;font-weight:700;white-space:nowrap;">${tag.label} · ${t.count}</span>
            </div>
            <ul style="margin:.6rem 0;padding-inline-start:1.1rem;color:var(--text-secondary);font-size:.88rem;">${quotes}</ul>
            <div style="background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.25);border-radius:8px;padding:.6rem .8rem;margin-top:.4rem;">
                <div style="font-size:.78rem;color:var(--gold);font-weight:700;margin-bottom:.2rem;">זווית שיווקית</div>
                <div style="font-size:.9rem;">${escapeHtml(t.marketing_angle || '')}
                    <button onclick="copyAngle(this)" data-angle="${escapeHtml(t.marketing_angle || '')}" style="margin-inline-start:.5rem;background:var(--gold);color:#003B46;border:none;border-radius:6px;padding:3px 10px;font-size:.75rem;font-weight:700;cursor:pointer;font-family:inherit;"><i class="fa-solid fa-copy"></i> העתק</button>
                </div>
            </div>
            <div style="margin-top:.5rem;font-size:.85rem;color:var(--text-secondary);"><i class="fa-solid fa-robot" style="color:#2F8592;"></i> אוטומציה: ${escapeHtml(t.automation_opportunity || '')}</div>
        </div>`;
    }).join('') || '<p style="color:var(--text-secondary);padding:1rem;">אין עדיין מספיק שאלות לניתוח. הריצו "נתח עכשיו" אחרי שתצטבר פעילות.</p>';

    const offCourse = (d.off_course_topics || []).map(s => `<span style="background:#58a6ff22;color:#58a6ff;border:1px solid #58a6ff;padding:3px 10px;border-radius:999px;font-size:.8rem;margin:.2rem;display:inline-block;">${escapeHtml(s)}</span>`).join('');

    view.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
        <div>
            <h1 class="page-title"><i class="fa-solid fa-lightbulb" style="color:var(--gold);margin-left:0.5rem;"></i> תובנות מהמורה</h1>
            <p style="color:var(--text-secondary);margin:-0.6rem 0 0;font-size:0.9rem;">השאלות החוזרות של התלמידים = שפת הלקוח. כאבים, רצונות והתנגדויות מוכנים למרקטינג ולאוטומציות.</p>
        </div>
        <div style="display:flex;gap:.5rem;align-items:center;">
            <select onchange="setInsightsDays(this.value)" style="background:var(--bg-secondary,#0f1d24);color:var(--text,#e8f1f2);border:1px solid var(--border,#21323b);border-radius:8px;padding:8px 12px;font-family:inherit;">
                <option value="30"${insightsDays === 30 ? ' selected' : ''}>30 יום</option>
                <option value="60"${insightsDays === 60 ? ' selected' : ''}>60 יום</option>
                <option value="90"${insightsDays === 90 ? ' selected' : ''}>90 יום</option>
            </select>
            <button onclick="loadInsights(true)" style="background:var(--gold);color:#003B46;border:none;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer;font-family:inherit;"><i class="fa-solid fa-wand-magic-sparkles"></i> נתח עכשיו</button>
        </div>
    </div>

    <p style="color:var(--text-secondary);font-size:.8rem;margin:.6rem 0 1rem;">
        <i class="fa-solid fa-clock"></i> עודכן: ${escapeHtml(when)} · ${d.total_questions || 0} שאלות · חלון ${d.window_days || insightsDays} ימים${d.cached ? ' · (מתוך מטמון)' : ''}</p>

    ${d.summary ? `<div class="stat-card" style="display:block;padding:1rem;margin-bottom:1rem;"><div style="font-size:.78rem;color:var(--gold);font-weight:700;margin-bottom:.3rem;">תמצית</div><div style="font-size:.92rem;line-height:1.6;">${escapeHtml(d.summary)}</div></div>` : ''}

    <div class="stats" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));">${themeCards}</div>

    ${offCourse ? `<div class="table-container" style="margin-top:1.2rem;padding:1rem;"><h3 style="margin:0 0 .6rem;"><i class="fa-solid fa-compass" style="color:#58a6ff;margin-left:.4rem;"></i> נושאים מחוץ לקורס שחזרו (ביקוש למוצר/תוכן הבא)</h3>${offCourse}</div>` : ''}`;
}
