// admin-master-sales.js — "דף המכירה של המאסטר" panel (request 8, 31.10.2026).
// Views, clicks on the buy button and purchases for the last 7 and 30 days, plus a
// breakdown by where the visitor came from. Everything comes from one admin-guarded
// RPC, admin_master_sales_stats() (migration 20261031120000_master_sales_events.sql).
// Purchases = subscriptions rows with plan 'master_course' created in the window.

let masterSalesCache = null;            // { data, t }
const MASTER_SALES_TTL = 5 * 60 * 1000;

const MS_SOURCE_HE = {
    sidebar: 'תפריט הצד בפורטל',
    popup_welcome_pitch: 'חלון "מילה מרם" (כניסה ראשונה)',
    popup_training_cta: 'חלון "מוכן להעמיק" (אחרי שיעור)',
    popup_engaged_offer: 'הצעה ללומד פעיל (5 שיעורים ומעלה)',
    direct_link: 'קישור ישיר / שמור',
    campaign: 'קמפיין (קישור עם utm)',
    external_site: 'אתר אחר',
    back_forward: 'חזרה בדפדפן',
    unknown: 'לא ידוע',
};

function _msSourceLabel(src) {
    if (MS_SOURCE_HE[src]) return MS_SOURCE_HE[src];
    if (src && src.indexOf('link_') === 0) return `קישור מתויג: ${src.slice(5)}`;
    return src || 'לא ידוע';
}

async function loadMasterSales(force) {
    const view = document.getElementById('master-sales-stats-view');
    if (!force && masterSalesCache && (Date.now() - masterSalesCache.t) < MASTER_SALES_TTL) {
        renderMasterSales(masterSalesCache.data);
        return;
    }
    if (view) view.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> טוען נתוני דף המכירה…</div>';
    try {
        const { data, error } = await db.rpc('admin_master_sales_stats');
        if (error) throw new Error(error.message);
        masterSalesCache = { data: data || {}, t: Date.now() };
        renderMasterSales(masterSalesCache.data);
    } catch (err) {
        if (!view) return;
        view.innerHTML = `
        <div style="padding:2.5rem 2rem;text-align:center;">
            <div style="color:#f85149;font-size:1.6rem;margin-bottom:0.8rem;"><i class="fa-solid fa-circle-exclamation"></i></div>
            <p style="margin:0 0 1.2rem;line-height:1.7;">הטעינה נכשלה: ${escapeHtml(err.message || '')}.<br><span style="font-size:0.85rem;">הנתונים עצמם שמורים ולא נפגעו.</span></p>
            <button onclick="loadMasterSales(true)" style="background:var(--gold,#D4AF37);color:#003B46;border:none;border-radius:8px;padding:10px 22px;font-family:inherit;font-weight:700;cursor:pointer;">נסה שוב</button>
        </div>`;
    }
}

function _msPct(n, d) { return d ? Math.round((n / d) * 100) + '%' : '—'; }

function renderMasterSales(d) {
    const view = document.getElementById('master-sales-stats-view');
    if (!view) return;
    const wins = d.windows || [];
    const w = days => wins.find(x => Number(x.days) === days) || {};
    const w7 = w(7), w30 = w(30);
    const since = d.first_event_at ? new Date(d.first_event_at).toLocaleDateString('he-IL') : null;

    const card = (label, v7, v30, hint) => `
        <div style="flex:1 1 180px;background:var(--bg-card,#0d2a33);border:1px solid rgba(212,175,55,.25);border-radius:12px;padding:1rem 1.1rem;">
            <div style="color:var(--text-secondary);font-size:.85rem;margin-bottom:.4rem;">${label}</div>
            <div style="display:flex;gap:1.2rem;align-items:baseline;">
                <div><div style="font-size:1.7rem;font-weight:800;color:var(--gold,#D4AF37);line-height:1;">${v7 ?? 0}</div><div style="font-size:.75rem;color:var(--text-secondary);">7 ימים</div></div>
                <div><div style="font-size:1.7rem;font-weight:800;line-height:1;">${v30 ?? 0}</div><div style="font-size:.75rem;color:var(--text-secondary);">30 ימים</div></div>
            </div>
            ${hint ? `<div style="font-size:.75rem;color:var(--text-secondary);margin-top:.5rem;">${hint}</div>` : ''}
        </div>`;

    const sources = (d.sources || []).map(s => `
        <tr>
            <td>${escapeHtml(_msSourceLabel(s.source))}</td>
            <td>${s.views_7 || 0}</td>
            <td>${s.views_30 || 0}</td>
            <td>${s.clicks_30 || 0}</td>
            <td>${_msPct(s.clicks_30 || 0, s.views_30 || 0)}</td>
        </tr>`).join('') || '<tr><td colspan="5" style="color:var(--text-secondary);text-align:center;">עוד אין צפיות. המונה התחיל לספור ב-31.10.2026.</td></tr>';

    view.innerHTML = `
    <div style="padding:1.2rem;">
        <h2 style="margin:0 0 .3rem;">דף המכירה של המאסטר</h2>
        <p style="margin:0 0 1.2rem;color:var(--text-secondary);font-size:.9rem;line-height:1.6;">
            כל פתיחה של דף המכירה וכל לחיצה על "קניתם אותי" נספרות כאן. לא נספרים אדמינים ותלמיד הבדיקה.
            ${since ? `סופר מ-${escapeHtml(since)}. אין נתונים לפני כן.` : 'המונה התחיל לספור ב-31.10.2026. אין נתונים לפני כן.'}
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:.8rem;margin-bottom:1.2rem;">
            ${card('צפיות בדף', w7.views, w30.views, 'כל פתיחה. רענון תוך 30 שניות נספר פעם אחת')}
            ${card('אנשים שונים שראו', w7.viewers, w30.viewers, `ב-30 יום: ${w30.member_viewers || 0} לומדים רשומים · ${w30.guest_viewers || 0} אורחים`)}
            ${card('לחצו על כפתור הרכישה', w7.clickers, w30.clickers, `${w30.clicks || 0} לחיצות ב-30 יום · ${_msPct(w30.clickers || 0, w30.viewers || 0)} מהצופים`)}
            ${card('קנו', w7.purchases, w30.purchases, 'מנויי מאסטר שנפתחו בתקופה')}
        </div>
        <h3 style="margin:0 0 .6rem;font-size:1rem;">מאיפה הגיעו לדף</h3>
        <div style="overflow-x:auto;">
        <style>#msSourcesTbl th,#msSourcesTbl td{padding:.55rem .45rem;white-space:normal;}#msSourcesTbl td:not(:first-child),#msSourcesTbl th:not(:first-child){text-align:center;white-space:nowrap;}</style>
        <table class="data-table" id="msSourcesTbl" style="width:100%;font-size:.88rem;">
            <thead><tr><th>מקור</th><th>צפיות<br>7 ימים</th><th>צפיות<br>30 ימים</th><th>לחיצות<br>30 ימים</th><th>%<br>לחיצה</th></tr></thead>
            <tbody>${sources}</tbody>
        </table>
        </div>
        <p style="margin:1rem 0 0;color:var(--text-secondary);font-size:.8rem;line-height:1.6;">
            "קנו" נספר לפי היום שבו נפתח המנוי, ולא בהכרח היום שבו הקונה ראה את הדף.<br>
            כדי לדעת כמה הגיעו ממייל או מפוסט מסוים, מוסיפים לקישור תווית באנגלית, למשל:<br>
            <span dir="ltr" style="unicode-bidi:isolate;word-break:break-all;">course-library-v2.html?from=email#master-sales</span>
        </p>
        <button onclick="loadMasterSales(true)" style="margin-top:1rem;background:transparent;color:var(--gold,#D4AF37);border:1px solid var(--gold,#D4AF37);border-radius:8px;padding:8px 18px;font-family:inherit;cursor:pointer;">
            <i class="fa-solid fa-rotate-right" style="margin-left:.4rem;"></i> רענון
        </button>
    </div>`;
}
