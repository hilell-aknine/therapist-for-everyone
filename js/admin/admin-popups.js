// admin-popups.js — Popup management panel (CRUD + analytics + insights)
// ============================================================================
// v2 (migrations 054-057):
//   - Funnel metrics: CTR, dismiss rate, time-to-action, 7-day trend sparkline
//   - Summary card: top/bottom performers + fatigue alerts
//   - CSV export + Claude Code JSON export
//   - Bulk activate/deactivate
//   - Status filter tabs (all/live/draft/scheduled/paused/archived)
//   - Insights log: admin + Claude Code notes per popup
//   - admin_notes field in popup form
// ============================================================================

let popupCache = null;
let popupCacheTime = 0;
const POPUP_CACHE_TTL = 5 * 60 * 1000;
let popupStatusFilter = 'all';
let popupSelectedIds = new Set();

const CATEGORY_LABELS = { 'critical': 'קריטי', 'engagement': 'מעורבות', 'info': 'מידע' };
const CATEGORY_COLORS = { 'critical': '#FF6F61', 'engagement': '#D4AF37', 'info': '#2F8592' };
const STATUS_LABELS = {
    'live': 'חי',
    'draft': 'טיוטה',
    'scheduled': 'מתוזמן',
    'paused': 'מושהה',
    'archived': 'בארכיון'
};
const STATUS_COLORS = {
    'live': '#2F8592',
    'draft': '#999',
    'scheduled': '#D4AF37',
    'paused': '#FF6F61',
    'archived': '#555'
};
const AUDIENCE_LABELS = {
    'all': 'כולם',
    'authenticated': 'כל מי שרשום',
    'unauthenticated': 'אורחים (לא רשומים)',
    'free_user': 'רשומים חינם (לא משלמים)',
    'paid_customer': 'לקוחות משלמים בלבד',
    'admin': 'מנהלים בלבד'
};
const TRIGGER_LABELS = {
    'manual': 'ידני (מופעל מהקוד)',
    'page_load': 'בטעינת עמוד',
    'lesson_complete': 'אחרי סיום שיעור',
    'login': 'אחרי התחברות',
    'signup': 'אחרי הרשמה חדשה'
};
const CATEGORY_HELP = {
    'critical': 'מוצג מיד, מתעלם מקולדאון ומגבלות — רק לדברים חיוניים',
    'engagement': 'מכבד קולדאון, מגבלה יומית, ולא מוצג אם נסגר ביום הזה',
    'info': 'קל משקל — טוסטים, התראות. לא חוסם פופאפים אחרים'
};
const INSIGHT_KIND_LABELS = {
    'observation': 'תצפית',
    'hypothesis': 'השערה',
    'recommendation': 'המלצה',
    'experiment_result': 'תוצאת ניסוי',
    'note': 'הערה'
};
const INSIGHT_KIND_COLORS = {
    'observation': '#2F8592',
    'hypothesis': '#D4AF37',
    'recommendation': '#00606B',
    'experiment_result': '#8B6914',
    'note': '#666'
};

// ============================================================================
// LOAD + RENDER
// ============================================================================
async function loadPopupConfigs() {
    if (popupCache && (Date.now() - popupCacheTime) < POPUP_CACHE_TTL) {
        renderPopupData(popupCache);
        return;
    }

    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const [configsRes, eventsRes, insightsRes] = await Promise.all([
            db.from('popup_configs').select('*').order('priority', { ascending: true }),
            db.from('popup_events').select('popup_id, event_type, created_at, session_id, user_id, variant').gte('created_at', thirtyDaysAgo),
            db.from('popup_insights_log').select('*').order('created_at', { ascending: false }).limit(50)
        ]);

        popupCache = {
            configs: configsRes.data || [],
            events: eventsRes.data || [],
            insights: insightsRes.data || []
        };
        popupCacheTime = Date.now();
        renderPopupData(popupCache);
    } catch (err) {
        console.error('Popup configs error:', err);
    }
}

function computePopupStats(events) {
    // Aggregate per popup with funnel + trend metrics
    const stats = {};
    const now = Date.now();

    events.forEach(e => {
        if (!stats[e.popup_id]) {
            stats[e.popup_id] = {
                shown: 0, dismissed: 0, clicked: 0, timeout: 0,
                shownByDay: {}, clickedByDay: {},
                firstShown: {}, clickTimes: [],
                uniqueSessions: new Set(), uniqueUsers: new Set()
            };
        }
        const s = stats[e.popup_id];
        s[e.event_type] = (s[e.event_type] || 0) + 1;

        const day = e.created_at.slice(0, 10);
        if (e.event_type === 'shown') {
            s.shownByDay[day] = (s.shownByDay[day] || 0) + 1;
            // Track first shown per session to compute time-to-action
            const sessionKey = e.session_id || e.user_id || 'anon';
            if (!s.firstShown[sessionKey]) {
                s.firstShown[sessionKey] = new Date(e.created_at).getTime();
            }
            if (e.session_id) s.uniqueSessions.add(e.session_id);
            if (e.user_id) s.uniqueUsers.add(e.user_id);
        }
        if (e.event_type === 'clicked') {
            s.clickedByDay[day] = (s.clickedByDay[day] || 0) + 1;
            const sessionKey = e.session_id || e.user_id || 'anon';
            if (s.firstShown[sessionKey]) {
                const delta = (new Date(e.created_at).getTime() - s.firstShown[sessionKey]) / 1000;
                if (delta >= 0 && delta < 86400) s.clickTimes.push(delta);
            }
        }
    });

    // Compute derived metrics per popup
    Object.keys(stats).forEach(popupId => {
        const s = stats[popupId];
        s.ctr = s.shown > 0 ? (s.clicked / s.shown) * 100 : 0;
        s.dismissRate = s.shown > 0 ? (s.dismissed / s.shown) * 100 : 0;
        s.uniqueSessionCount = s.uniqueSessions.size;
        s.uniqueUserCount = s.uniqueUsers.size;

        // Median time-to-action (click)
        if (s.clickTimes.length) {
            const sorted = [...s.clickTimes].sort((a, b) => a - b);
            s.medianTimeToClick = sorted[Math.floor(sorted.length / 2)];
        } else {
            s.medianTimeToClick = null;
        }

        // 7-day trend: array of {day, shown, ctr}
        s.trend7d = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
            const sh = s.shownByDay[d] || 0;
            const cl = s.clickedByDay[d] || 0;
            s.trend7d.push({ day: d, shown: sh, ctr: sh > 0 ? (cl / sh) * 100 : 0 });
        }

        // Week-over-week CTR change
        const last7Shown = s.trend7d.reduce((a, x) => a + x.shown, 0);
        const last7Clicks = s.trend7d.reduce((a, x) => {
            const d = x.day;
            return a + (s.clickedByDay[d] || 0);
        }, 0);
        const last7Ctr = last7Shown > 0 ? (last7Clicks / last7Shown) * 100 : 0;
        const prev7Ctr = s.ctr; // 30d avg as baseline (imperfect but no extra query)
        s.ctrDeltaWow = last7Ctr - prev7Ctr;

        // Fatigue flag
        s.fatigue = s.dismissRate > 60 || (s.shown > 20 && s.ctrDeltaWow < -30);
    });

    return stats;
}

function renderPopupData({ configs, events, insights }) {
    const stats = computePopupStats(events);

    // Top-level counters
    const activeCount = configs.filter(c => c.is_active && (c.status || 'live') === 'live').length;
    const totalShown = events.filter(e => e.event_type === 'shown').length;
    const totalClicks = events.filter(e => e.event_type === 'clicked').length;
    const totalDismissed = events.filter(e => e.event_type === 'dismissed').length;
    const dismissRate = totalShown > 0 ? Math.round((totalDismissed / totalShown) * 100) + '%' : '-';

    setText('popup-active-count', activeCount);
    setText('popup-impressions-30d', totalShown);
    setText('popup-clicks-30d', totalClicks);
    setText('popup-dismiss-rate', dismissRate);

    renderPopupSummaryCard(configs, stats, events);
    renderPopupConfigsTable(configs, stats);
    renderPopupStatsTable(configs, stats);
    renderInsightsTimeline(insights || [], configs);
}

function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ============================================================================
// SUMMARY CARD — top/bottom performers + alerts
// ============================================================================
function renderPopupSummaryCard(configs, stats, events) {
    const container = document.getElementById('popup-summary-card');
    if (!container) return;

    // Today's impressions vs 7-day average
    const todayStr = new Date().toISOString().slice(0, 10);
    const shownEvents = events.filter(e => e.event_type === 'shown');
    const todayShown = shownEvents.filter(e => e.created_at.slice(0, 10) === todayStr).length;
    const last7 = shownEvents.filter(e => {
        const d = new Date(e.created_at);
        return d.getTime() > Date.now() - 7 * 86400000;
    }).length;
    const avg7 = Math.round(last7 / 7);
    const trendArrow = todayShown > avg7 ? '↑' : todayShown < avg7 ? '↓' : '→';
    const trendColor = todayShown > avg7 ? '#2F8592' : todayShown < avg7 ? '#FF6F61' : '#999';

    // Rank popups by CTR (min 10 shown to be meaningful)
    const ranked = configs
        .map(c => ({ c, s: stats[c.popup_id] }))
        .filter(x => x.s && x.s.shown >= 10)
        .sort((a, b) => b.s.ctr - a.s.ctr);

    const top3 = ranked.slice(0, 3);
    const bottom3 = ranked.slice(-3).reverse();

    // Fatigue alerts
    const fatigued = configs
        .map(c => ({ c, s: stats[c.popup_id] }))
        .filter(x => x.s && x.s.fatigue);

    // Silence: active popups with zero impressions in 30d (broken targeting?)
    const silent = configs.filter(c => c.is_active && (!stats[c.popup_id] || stats[c.popup_id].shown === 0));

    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:0.8rem;">';

    // Today vs 7-day avg
    html += `<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:0.9rem;">
        <div style="font-size:0.72rem;color:var(--text-secondary);">חשיפות היום</div>
        <div style="font-size:1.4rem;font-weight:700;">${todayShown} <span style="font-size:0.9rem;color:${trendColor};">${trendArrow}</span></div>
        <div style="font-size:0.72rem;color:var(--text-secondary);">ממוצע 7 ימים: ${avg7}</div>
    </div>`;

    // Top performers
    html += `<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:0.9rem;">
        <div style="font-size:0.72rem;color:var(--text-secondary);margin-bottom:0.3rem;"><i class="fa-solid fa-trophy" style="color:#D4AF37;"></i> 3 המובילים (CTR)</div>`;
    if (top3.length === 0) {
        html += `<div style="font-size:0.78rem;color:var(--text-secondary);">אין מספיק נתונים (צריך 10+ חשיפות)</div>`;
    } else {
        top3.forEach(x => {
            html += `<div style="font-size:0.78rem;margin:0.2rem 0;">${escapeHtml(x.c.title)} — <strong style="color:#2F8592;">${x.s.ctr.toFixed(1)}%</strong></div>`;
        });
    }
    html += '</div>';

    // Bottom performers
    html += `<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:0.9rem;">
        <div style="font-size:0.72rem;color:var(--text-secondary);margin-bottom:0.3rem;"><i class="fa-solid fa-triangle-exclamation" style="color:#FF6F61;"></i> 3 החלשים</div>`;
    if (bottom3.length === 0) {
        html += `<div style="font-size:0.78rem;color:var(--text-secondary);">אין מספיק נתונים</div>`;
    } else {
        bottom3.forEach(x => {
            html += `<div style="font-size:0.78rem;margin:0.2rem 0;">${escapeHtml(x.c.title)} — <strong style="color:#FF6F61;">${x.s.ctr.toFixed(1)}%</strong></div>`;
        });
    }
    html += '</div>';

    // Alerts
    html += `<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:0.9rem;">
        <div style="font-size:0.72rem;color:var(--text-secondary);margin-bottom:0.3rem;"><i class="fa-solid fa-bell" style="color:#D4AF37;"></i> התראות</div>`;
    const alerts = [];
    if (fatigued.length) alerts.push(`${fatigued.length} עם סימני שחיקה (סגירה >60%)`);
    if (silent.length) alerts.push(`${silent.length} פעילים בלי חשיפות ב-30 יום`);
    if (alerts.length === 0) {
        html += `<div style="font-size:0.78rem;color:#2F8592;">הכל בסדר ✓</div>`;
    } else {
        alerts.forEach(a => {
            html += `<div style="font-size:0.78rem;margin:0.2rem 0;color:#FF6F61;">• ${a}</div>`;
        });
    }
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
}

// ============================================================================
// CONFIGS TABLE (with checkboxes, status filter, fatigue chips)
// ============================================================================
function renderPopupConfigsTable(configs, stats) {
    const container = document.getElementById('popup-configs-table');
    if (!container) return;

    // Apply status filter
    let filtered = configs;
    if (popupStatusFilter !== 'all') {
        filtered = configs.filter(c => (c.status || (c.is_active ? 'live' : 'paused')) === popupStatusFilter);
    }

    if (!filtered.length) {
        container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;">אין פופאפים בסטטוס הזה</p>';
        return;
    }

    let html = `<table style="width:100%;border-collapse:collapse;">
        <thead>
            <tr style="border-bottom:2px solid var(--border);">
                <th style="width:28px;padding:0.6rem 0.3rem;"><input type="checkbox" id="popup-select-all" onclick="toggleAllPopupSelection(this.checked)"></th>
                <th style="text-align:right;padding:0.6rem;font-weight:600;color:var(--text-secondary);">שם</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">סטטוס</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">קטגוריה</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">קהל</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">חשיפות</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">CTR</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">7 ימים</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">פעולות</th>
            </tr>
        </thead>
        <tbody>`;

    filtered.forEach(c => {
        const catColor = CATEGORY_COLORS[c.category] || '#999';
        const catLabel = CATEGORY_LABELS[c.category] || c.category;
        const audLabel = AUDIENCE_LABELS[c.target_audience] || c.target_audience;
        const triggerLabel = TRIGGER_LABELS[c.trigger_event] || c.trigger_event || 'ידני';
        const status = c.status || (c.is_active ? 'live' : 'paused');
        const statusColor = STATUS_COLORS[status] || '#999';
        const statusLabel = STATUS_LABELS[status] || status;
        const s = stats[c.popup_id] || { shown: 0, ctr: 0, fatigue: false, trend7d: [] };
        const descHe = c.description_he || '';
        const isChecked = popupSelectedIds.has(c.id) ? 'checked' : '';
        const variantBadge = c.variant_group ? `<span style="background:rgba(212,175,55,0.15);color:#8B6914;padding:1px 6px;border-radius:4px;font-size:0.68rem;margin-right:4px;">A/B: ${escapeHtml(c.variant_label || '?')}</span>` : '';
        const fatigueChip = s.fatigue ? `<span title="סימני שחיקה — שקול להחליף קופי או להשהות" style="background:#FFF3CD;color:#8B6914;padding:1px 6px;border-radius:4px;font-size:0.68rem;margin-right:4px;"><i class="fa-solid fa-triangle-exclamation"></i> שחיקה</span>` : '';
        const sparkline = renderSparkline(s.trend7d || []);

        html += `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:0.6rem 0.3rem;text-align:center;"><input type="checkbox" class="popup-select-cb" data-id="${c.id}" ${isChecked} onclick="togglePopupSelection('${c.id}', this.checked)"></td>
            <td style="padding:0.6rem;">
                <div style="font-weight:600;">${escapeHtml(c.title)} ${variantBadge} ${fatigueChip}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary);">${descHe ? escapeHtml(descHe) : escapeHtml(c.popup_id)}</div>
                ${c.trigger_min_lessons > 0 ? `<div style="font-size:0.72rem;color:var(--gold);margin-top:2px;">מופעל אחרי ${c.trigger_min_lessons} שיעורים</div>` : ''}
            </td>
            <td style="padding:0.6rem;text-align:center;">
                <span style="background:${statusColor}20;color:${statusColor};padding:2px 8px;border-radius:6px;font-size:0.75rem;font-weight:600;">${statusLabel}</span>
            </td>
            <td style="padding:0.6rem;text-align:center;">
                <span style="background:${catColor}20;color:${catColor};padding:2px 8px;border-radius:6px;font-size:0.78rem;font-weight:600;" title="${CATEGORY_HELP[c.category] || ''}">${catLabel}</span>
            </td>
            <td style="padding:0.6rem;text-align:center;">
                <div style="font-size:0.82rem;">${audLabel}</div>
                <div style="font-size:0.72rem;color:var(--text-secondary);">${triggerLabel}</div>
            </td>
            <td style="padding:0.6rem;text-align:center;font-weight:600;color:var(--gold);">${s.shown}</td>
            <td style="padding:0.6rem;text-align:center;font-weight:700;color:#2F8592;">${s.shown > 0 ? s.ctr.toFixed(1) + '%' : '-'}</td>
            <td style="padding:0.6rem;text-align:center;">${sparkline}</td>
            <td style="padding:0.6rem;text-align:center;white-space:nowrap;">
                <button onclick="previewPopup('${c.id}')" style="background:none;border:none;cursor:pointer;color:#2F8592;font-size:1rem;" title="תצוגה מקדימה">
                    <i class="fa-solid fa-eye"></i>
                </button>
                <button onclick="openEditPopupModal('${c.id}')" style="background:none;border:none;cursor:pointer;color:var(--gold);font-size:1rem;" title="ערוך">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="togglePopupActive('${c.id}', ${!c.is_active})" style="background:none;border:none;cursor:pointer;color:${c.is_active ? '#FF6F61' : '#2F8592'};font-size:1rem;" title="${c.is_active ? 'השהה' : 'הפעל'}">
                    <i class="fa-solid fa-power-off"></i>
                </button>
                <button onclick="deletePopupConfig('${c.id}', '${escapeHtml(c.title)}')" style="background:none;border:none;cursor:pointer;color:#FF6F61;font-size:1rem;" title="מחק">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// Mini SVG sparkline for 7-day trend
function renderSparkline(trend) {
    if (!trend.length) return '<span style="color:var(--text-secondary);font-size:0.7rem;">—</span>';
    const max = Math.max(...trend.map(d => d.shown), 1);
    const w = 60, h = 20;
    const step = w / (trend.length - 1 || 1);
    const points = trend.map((d, i) => {
        const x = i * step;
        const y = h - (d.shown / max) * h;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg width="${w}" height="${h}" style="vertical-align:middle;"><polyline fill="none" stroke="#2F8592" stroke-width="1.5" points="${points}"/></svg>`;
}

// ============================================================================
// DETAIL STATS TABLE
// ============================================================================
function renderPopupStatsTable(configs, stats) {
    const container = document.getElementById('popup-stats-table');
    if (!container) return;

    let html = `<table style="width:100%;border-collapse:collapse;">
        <thead>
            <tr style="border-bottom:2px solid var(--border);">
                <th style="text-align:right;padding:0.6rem;font-weight:600;color:var(--text-secondary);">פופאפ</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">חשיפות</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">משתמשים ייחודיים</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">לחיצות</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">סגירות</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">CTR</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">% סגירה</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">זמן ללחיצה</th>
            </tr>
        </thead>
        <tbody>`;

    configs.forEach(c => {
        const s = stats[c.popup_id] || { shown: 0, clicked: 0, dismissed: 0, ctr: 0, dismissRate: 0, medianTimeToClick: null, uniqueSessionCount: 0, uniqueUserCount: 0 };
        const unique = s.uniqueUserCount + s.uniqueSessionCount;
        const tta = s.medianTimeToClick !== null ? `${Math.round(s.medianTimeToClick)}s` : '—';

        html += `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:0.6rem;font-weight:600;">${escapeHtml(c.title)}</td>
            <td style="padding:0.6rem;text-align:center;">${s.shown}</td>
            <td style="padding:0.6rem;text-align:center;color:var(--text-secondary);">${unique}</td>
            <td style="padding:0.6rem;text-align:center;color:#2F8592;font-weight:600;">${s.clicked}</td>
            <td style="padding:0.6rem;text-align:center;color:#FF6F61;">${s.dismissed}</td>
            <td style="padding:0.6rem;text-align:center;font-weight:700;color:var(--gold);">${s.shown > 0 ? s.ctr.toFixed(1) + '%' : '-'}</td>
            <td style="padding:0.6rem;text-align:center;color:var(--text-secondary);">${s.shown > 0 ? s.dismissRate.toFixed(1) + '%' : '-'}</td>
            <td style="padding:0.6rem;text-align:center;color:var(--text-secondary);font-size:0.82rem;">${tta}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// ============================================================================
// STATUS FILTER + BULK OPS
// ============================================================================
function filterPopupStatus(status) {
    popupStatusFilter = status;
    document.querySelectorAll('.popup-tab-btn').forEach(btn => {
        const active = btn.dataset.status === status;
        btn.style.background = active ? 'var(--deep-petrol)' : 'none';
        btn.style.color = active ? '#fff' : '';
        btn.classList.toggle('active', active);
    });
    if (popupCache) renderPopupData(popupCache);
}

function togglePopupSelection(id, checked) {
    if (checked) popupSelectedIds.add(id);
    else popupSelectedIds.delete(id);
    updateBulkButtons();
}

function toggleAllPopupSelection(checked) {
    document.querySelectorAll('.popup-select-cb').forEach(cb => {
        cb.checked = checked;
        if (checked) popupSelectedIds.add(cb.dataset.id);
        else popupSelectedIds.delete(cb.dataset.id);
    });
    updateBulkButtons();
}

function updateBulkButtons() {
    const anySelected = popupSelectedIds.size > 0;
    const a = document.getElementById('popup-bulk-activate');
    const d = document.getElementById('popup-bulk-deactivate');
    if (a) a.style.display = anySelected ? '' : 'none';
    if (d) d.style.display = anySelected ? '' : 'none';
}

async function bulkTogglePopups(activate) {
    if (popupSelectedIds.size === 0) return;
    if (!confirm(`${activate ? 'להפעיל' : 'לכבות'} ${popupSelectedIds.size} פופאפים?`)) return;
    try {
        const ids = Array.from(popupSelectedIds);
        await db.from('popup_configs').update({
            is_active: activate,
            status: activate ? 'live' : 'paused',
            updated_at: new Date().toISOString()
        }).in('id', ids);
        popupSelectedIds.clear();
        popupCache = null;
        loadPopupConfigs();
        showToast(`${ids.length} פופאפים עודכנו`, 'success');
    } catch (err) {
        showToast('שגיאה בעדכון קבוצתי', 'error');
    }
}

// ============================================================================
// CSV + CLAUDE JSON EXPORT
// ============================================================================
function exportPopupStatsCsv() {
    if (!popupCache) return;
    const { configs, events } = popupCache;
    const stats = computePopupStats(events);

    const rows = [['popup_id', 'title', 'status', 'category', 'target_audience', 'trigger_event', 'shown', 'clicked', 'dismissed', 'ctr_pct', 'dismiss_rate_pct', 'median_time_to_click_s', 'unique_users', 'unique_sessions', 'variant_group', 'variant_label']];
    configs.forEach(c => {
        const s = stats[c.popup_id] || {};
        rows.push([
            c.popup_id,
            (c.title || '').replace(/,/g, ' '),
            c.status || (c.is_active ? 'live' : 'paused'),
            c.category || '',
            c.target_audience || '',
            c.trigger_event || 'manual',
            s.shown || 0,
            s.clicked || 0,
            s.dismissed || 0,
            s.ctr ? s.ctr.toFixed(2) : 0,
            s.dismissRate ? s.dismissRate.toFixed(2) : 0,
            s.medianTimeToClick != null ? Math.round(s.medianTimeToClick) : '',
            s.uniqueUserCount || 0,
            s.uniqueSessionCount || 0,
            c.variant_group || '',
            c.variant_label || ''
        ]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile('popup-stats-' + new Date().toISOString().slice(0, 10) + '.csv', csv, 'text/csv;charset=utf-8;');
    showToast('CSV הורד', 'success');
}

// Claude Code-ready export: full structured JSON with everything needed for analysis.
// Admin runs this, saves the file, and asks Claude Code to read it and give recommendations.
// See docs/popup-insights.md for the playbook Claude uses.
function exportPopupInsightsJson() {
    if (!popupCache) return;
    const { configs, events, insights } = popupCache;
    const stats = computePopupStats(events);

    const payload = {
        generated_at: new Date().toISOString(),
        period_days: 30,
        schema_version: 1,
        readme: 'Feed this JSON to Claude Code along with docs/popup-insights.md. Claude will analyze metrics, spot underperformers, suggest A/B tests, and write recommendations back to popup_insights_log.',
        totals: {
            active_popups: configs.filter(c => c.is_active && (c.status || 'live') === 'live').length,
            shown: events.filter(e => e.event_type === 'shown').length,
            clicked: events.filter(e => e.event_type === 'clicked').length,
            dismissed: events.filter(e => e.event_type === 'dismissed').length
        },
        popups: configs.map(c => {
            const s = stats[c.popup_id] || {};
            return {
                popup_id: c.popup_id,
                id: c.id,
                title: c.title,
                description_he: c.description_he,
                admin_notes: c.admin_notes,
                status: c.status || (c.is_active ? 'live' : 'paused'),
                category: c.category,
                priority: c.priority,
                target_audience: c.target_audience,
                trigger_event: c.trigger_event,
                trigger_min_lessons: c.trigger_min_lessons,
                variant_group: c.variant_group,
                variant_label: c.variant_label,
                start_date: c.start_date,
                end_date: c.end_date,
                metrics: {
                    shown: s.shown || 0,
                    clicked: s.clicked || 0,
                    dismissed: s.dismissed || 0,
                    ctr_pct: s.ctr ? +s.ctr.toFixed(2) : 0,
                    dismiss_rate_pct: s.dismissRate ? +s.dismissRate.toFixed(2) : 0,
                    median_time_to_click_s: s.medianTimeToClick != null ? Math.round(s.medianTimeToClick) : null,
                    unique_users: s.uniqueUserCount || 0,
                    unique_sessions: s.uniqueSessionCount || 0,
                    ctr_delta_wow_pct: s.ctrDeltaWow != null ? +s.ctrDeltaWow.toFixed(2) : null,
                    trend_7d: s.trend7d || [],
                    fatigue_flag: !!s.fatigue
                }
            };
        }),
        recent_insights: (insights || []).slice(0, 30).map(i => ({
            popup_id: i.popup_id,
            kind: i.kind,
            title: i.title,
            body: i.body,
            author: i.author,
            created_at: i.created_at,
            metrics_snapshot: i.metrics_snapshot
        }))
    };

    const json = JSON.stringify(payload, null, 2);
    downloadFile('popup-insights-' + new Date().toISOString().slice(0, 10) + '.json', json, 'application/json;charset=utf-8;');
    showToast('JSON לקלוד הורד — תן לו יחד עם docs/popup-insights.md', 'success');
}

function downloadFile(filename, content, mime) {
    const blob = new Blob(['\ufeff' + content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

// ============================================================================
// INSIGHTS LOG (admin notes + Claude Code notes timeline)
// ============================================================================
function renderInsightsTimeline(insights, configs) {
    const container = document.getElementById('popup-insights-list');
    if (!container) return;

    if (!insights.length) {
        container.innerHTML = `<div style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:0.88rem;">
            <p>אין תובנות עדיין.</p>
            <p style="font-size:0.78rem;margin-top:0.4rem;">לחץ "ייצא לקלוד" ושלח את ה-JSON + docs/popup-insights.md לקלוד קוד. הוא יכתוב תובנות לכאן אוטומטית.</p>
        </div>`;
        return;
    }

    const titleMap = {};
    configs.forEach(c => { titleMap[c.popup_id] = c.title; });

    let html = '<div style="display:flex;flex-direction:column;gap:0.8rem;">';
    insights.forEach(i => {
        const kindColor = INSIGHT_KIND_COLORS[i.kind] || '#666';
        const kindLabel = INSIGHT_KIND_LABELS[i.kind] || i.kind;
        const authorIcon = i.author === 'claude_code' ? '<i class="fa-solid fa-robot"></i>' : '<i class="fa-solid fa-user"></i>';
        const authorLabel = i.author === 'claude_code' ? 'Claude Code' : 'אדמין';
        const popupTitle = i.popup_id ? (titleMap[i.popup_id] || i.popup_id) : 'כללי (כל הפופאפים)';
        const created = new Date(i.created_at).toLocaleString('he-IL');

        html += `<div style="background:#fff;border-right:3px solid ${kindColor};border-radius:8px;padding:0.9rem 1rem;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.4rem;flex-wrap:wrap;gap:0.3rem;">
                <div>
                    <span style="background:${kindColor}20;color:${kindColor};padding:2px 8px;border-radius:4px;font-size:0.72rem;font-weight:700;">${kindLabel}</span>
                    <span style="font-size:0.78rem;color:var(--text-secondary);margin-right:0.4rem;">${escapeHtml(popupTitle)}</span>
                </div>
                <div style="font-size:0.72rem;color:var(--text-secondary);">
                    ${authorIcon} ${authorLabel} · ${created}
                    <button onclick="deleteInsight('${i.id}')" style="background:none;border:none;color:#FF6F61;cursor:pointer;margin-right:0.4rem;" title="מחק"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
            <div style="font-weight:700;font-size:0.92rem;margin-bottom:0.3rem;">${escapeHtml(i.title)}</div>
            <div style="font-size:0.85rem;line-height:1.5;color:#333;white-space:pre-wrap;">${escapeHtml(i.body)}</div>
            ${i.metrics_snapshot ? `<details style="margin-top:0.5rem;font-size:0.75rem;"><summary style="cursor:pointer;color:var(--text-secondary);">מדדים בזמן הכתיבה</summary><pre style="background:#f5f5f5;padding:0.5rem;border-radius:4px;margin-top:0.3rem;direction:ltr;text-align:left;overflow-x:auto;">${escapeHtml(JSON.stringify(i.metrics_snapshot, null, 2))}</pre></details>` : ''}
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function openInsightModal() {
    document.getElementById('insight-modal')?.remove();
    const configs = popupCache?.configs || [];
    const modal = document.createElement('div');
    modal.id = 'insight-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.onclick = function (e) { if (e.target === modal) modal.remove(); };

    const options = ['<option value="">כללי (לא קשור לפופאפ ספציפי)</option>']
        .concat(configs.map(c => `<option value="${c.popup_id}">${escapeHtml(c.title)}</option>`)).join('');

    modal.innerHTML = `
        <div style="background:var(--card-bg,#fff);border-radius:16px;padding:2rem;width:90%;max-width:550px;max-height:85vh;overflow-y:auto;direction:rtl;" onclick="event.stopPropagation()">
            <h2 style="margin-bottom:1.2rem;"><i class="fa-solid fa-lightbulb" style="color:var(--gold);margin-left:0.4rem;"></i> הוספת תובנה</h2>
            <form onsubmit="saveInsight(event)">
                <div style="display:grid;gap:0.8rem;">
                    <label style="font-weight:600;font-size:0.85rem;">פופאפ קשור (אופציונלי)
                        <select name="popup_id" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">${options}</select>
                    </label>
                    <label style="font-weight:600;font-size:0.85rem;">סוג
                        <select name="kind" required style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                            <option value="observation">תצפית — משהו שראיתי בנתונים</option>
                            <option value="hypothesis">השערה — למה משהו קורה</option>
                            <option value="recommendation">המלצה — מה לעשות</option>
                            <option value="experiment_result">תוצאת ניסוי</option>
                            <option value="note">הערה כללית</option>
                        </select>
                    </label>
                    <label style="font-weight:600;font-size:0.85rem;">כותרת קצרה
                        <input name="title" required style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;" placeholder="לדוגמה: CTR של auth_modal ירד ב-30%">
                    </label>
                    <label style="font-weight:600;font-size:0.85rem;">תוכן מלא
                        <textarea name="body" required rows="6" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;resize:vertical;" placeholder="תיאור מפורט, מספרים, השערות..."></textarea>
                    </label>
                </div>
                <div style="display:flex;gap:0.6rem;margin-top:1.5rem;justify-content:flex-end;">
                    <button type="button" onclick="this.closest('#insight-modal').remove()" style="padding:0.5rem 1.2rem;border:1px solid var(--border);border-radius:8px;background:none;cursor:pointer;font-weight:600;">ביטול</button>
                    <button type="submit" style="padding:0.5rem 1.5rem;background:var(--gold);color:var(--deep-petrol);border:none;border-radius:8px;font-weight:700;cursor:pointer;">שמור תובנה</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
}

async function saveInsight(event) {
    event.preventDefault();
    const form = event.target;
    const data = {
        popup_id: form.popup_id.value || null,
        kind: form.kind.value,
        title: form.title.value,
        body: form.body.value,
        author: 'admin'
    };
    try {
        const { error } = await db.from('popup_insights_log').insert([data]);
        if (error) throw error;
        document.getElementById('insight-modal')?.remove();
        popupCache = null;
        loadPopupConfigs();
        showToast('התובנה נשמרה', 'success');
    } catch (err) {
        showToast('שגיאה: ' + (err.message || 'לא ידוע'), 'error');
    }
}

async function deleteInsight(id) {
    if (!confirm('למחוק את התובנה?')) return;
    try {
        await db.from('popup_insights_log').delete().eq('id', id);
        popupCache = null;
        loadPopupConfigs();
        showToast('נמחק', 'success');
    } catch (err) {
        showToast('שגיאה', 'error');
    }
}

// ============================================================================
// CRUD ACTIONS (existing, lightly updated)
// ============================================================================
async function togglePopupActive(configId, newState) {
    try {
        await db.from('popup_configs').update({
            is_active: newState,
            status: newState ? 'live' : 'paused',
            updated_at: new Date().toISOString()
        }).eq('id', configId);
        popupCache = null;
        loadPopupConfigs();
        showToast(newState ? 'פופאפ הופעל' : 'פופאפ כובה', 'success');
    } catch (err) {
        showToast('שגיאה בעדכון', 'error');
    }
}

async function deletePopupConfig(configId, title) {
    if (!confirm('למחוק את הפופאפ "' + title + '"?')) return;
    try {
        await db.from('popup_configs').delete().eq('id', configId);
        popupCache = null;
        loadPopupConfigs();
        showToast('פופאפ נמחק', 'success');
    } catch (err) {
        showToast('שגיאה במחיקה', 'error');
    }
}

function openEditPopupModal(configId) {
    const config = popupCache?.configs?.find(c => c.id === configId);
    if (!config) return;
    renderPopupFormModal(config);
}

function openCreatePopupModal() {
    renderPopupFormModal(null);
}

function renderPopupFormModal(config) {
    const isEdit = !!config;
    const title = isEdit ? 'עריכת פופאפ' : 'יצירת פופאפ חדש';
    document.getElementById('popup-form-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'popup-form-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.onclick = function (e) { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
        <div style="background:var(--card-bg,#fff);border-radius:16px;padding:2rem;width:90%;max-width:600px;max-height:88vh;overflow-y:auto;direction:rtl;" onclick="event.stopPropagation()">
            <h2 style="margin-bottom:1.2rem;display:flex;align-items:center;gap:0.5rem;">
                <i class="fa-solid fa-window-restore" style="color:#2F8592;"></i> ${title}
            </h2>
            <form onsubmit="savePopupConfig(event, ${isEdit ? "'" + config.id + "'" : 'null'})">
                <div style="display:grid;gap:0.8rem;">
                    ${!isEdit ? `<label style="font-weight:600;font-size:0.85rem;">מזהה טכני
                        <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.2rem;">שם ייחודי באנגלית, למשל: training_cta</div>
                        <input name="popup_id" required style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;direction:ltr;" placeholder="e.g. training_cta">
                    </label>` : ''}
                    <label style="font-weight:600;font-size:0.85rem;">כותרת הפופאפ
                        <input name="title" required value="${escapeHtml(config?.title || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;">
                    </label>
                    <label style="font-weight:600;font-size:0.85rem;">הסבר קצר (לאדמין בלבד)
                        <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.2rem;">תיאור פנימי — מוצג רק בדשבורד</div>
                        <input name="description_he" value="${escapeHtml(config?.description_he || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;">
                    </label>
                    <label style="font-weight:600;font-size:0.85rem;">תוכן ההודעה
                        <textarea name="message" rows="3" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;resize:vertical;">${escapeHtml(config?.message || '')}</textarea>
                    </label>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                        <label style="font-weight:600;font-size:0.85rem;">טקסט כפתור
                            <input name="cta_text" value="${escapeHtml(config?.cta_text || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;">
                        </label>
                        <label style="font-weight:600;font-size:0.85rem;">קישור הכפתור
                            <input name="cta_link" value="${escapeHtml(config?.cta_link || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;direction:ltr;">
                        </label>
                    </div>

                    <div style="background:rgba(47,133,146,0.06);border:1px solid rgba(47,133,146,0.15);border-radius:10px;padding:0.8rem;">
                        <div style="font-weight:700;font-size:0.88rem;margin-bottom:0.6rem;"><i class="fa-solid fa-users" style="color:#2F8592;margin-left:0.3rem;"></i> למי מוצג?</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                            <label style="font-weight:600;font-size:0.85rem;">קהל יעד
                                <select name="target_audience" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                                    <option value="all" ${config?.target_audience === 'all' ? 'selected' : ''}>כולם</option>
                                    <option value="authenticated" ${config?.target_audience === 'authenticated' ? 'selected' : ''}>כל מי שרשום</option>
                                    <option value="unauthenticated" ${config?.target_audience === 'unauthenticated' ? 'selected' : ''}>אורחים בלבד</option>
                                    <option value="free_user" ${config?.target_audience === 'free_user' ? 'selected' : ''}>רשומים חינם בלבד</option>
                                    <option value="paid_customer" ${config?.target_audience === 'paid_customer' ? 'selected' : ''}>לקוחות משלמים בלבד</option>
                                    <option value="admin" ${config?.target_audience === 'admin' ? 'selected' : ''}>מנהלים בלבד</option>
                                </select>
                            </label>
                            <label style="font-weight:600;font-size:0.85rem;">מתי קופץ?
                                <select name="trigger_event" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                                    <option value="manual" ${config?.trigger_event === 'manual' ? 'selected' : ''}>ידני (מהקוד)</option>
                                    <option value="page_load" ${config?.trigger_event === 'page_load' ? 'selected' : ''}>בטעינת עמוד</option>
                                    <option value="lesson_complete" ${config?.trigger_event === 'lesson_complete' ? 'selected' : ''}>אחרי סיום שיעור</option>
                                    <option value="login" ${config?.trigger_event === 'login' ? 'selected' : ''}>אחרי התחברות</option>
                                    <option value="signup" ${config?.trigger_event === 'signup' ? 'selected' : ''}>אחרי הרשמה חדשה</option>
                                </select>
                            </label>
                        </div>
                        <label style="font-weight:600;font-size:0.85rem;margin-top:0.6rem;display:block;">אחרי כמה שיעורים?
                            <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.2rem;">0 = מיד מהשיעור הראשון</div>
                            <input name="trigger_min_lessons" type="number" min="0" max="100" value="${config?.trigger_min_lessons || 0}" style="width:120px;padding:0.5rem;border:1px solid var(--border);border-radius:8px;">
                        </label>
                    </div>

                    <div style="background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.15);border-radius:10px;padding:0.8rem;">
                        <div style="font-weight:700;font-size:0.88rem;margin-bottom:0.6rem;"><i class="fa-solid fa-sliders" style="color:var(--gold);margin-left:0.3rem;"></i> הגבלות וסטטוס</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.8rem;">
                            <label style="font-weight:600;font-size:0.85rem;">קטגוריה
                                <select name="category" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                                    <option value="engagement" ${config?.category === 'engagement' ? 'selected' : ''}>מעורבות</option>
                                    <option value="info" ${config?.category === 'info' ? 'selected' : ''}>מידע</option>
                                    <option value="critical" ${config?.category === 'critical' ? 'selected' : ''}>קריטי</option>
                                </select>
                            </label>
                            <label style="font-weight:600;font-size:0.85rem;">עדיפות
                                <input name="priority" type="number" min="1" max="5" value="${config?.priority || 4}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                            </label>
                            <label style="font-weight:600;font-size:0.85rem;">מקס/יום
                                <input name="max_per_day" type="number" min="1" max="99" value="${config?.max_per_day || 1}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                            </label>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-top:0.6rem;">
                            <label style="font-weight:600;font-size:0.85rem;">קולדאון (דקות)
                                <input name="cooldown_minutes" type="number" min="0" value="${config?.cooldown_minutes || 5}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                            </label>
                            <label style="font-weight:600;font-size:0.85rem;">סטטוס מחזור חיים
                                <select name="status" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                                    <option value="live" ${(config?.status || 'live') === 'live' ? 'selected' : ''}>חי — פעיל</option>
                                    <option value="draft" ${config?.status === 'draft' ? 'selected' : ''}>טיוטה</option>
                                    <option value="scheduled" ${config?.status === 'scheduled' ? 'selected' : ''}>מתוזמן</option>
                                    <option value="paused" ${config?.status === 'paused' ? 'selected' : ''}>מושהה</option>
                                    <option value="archived" ${config?.status === 'archived' ? 'selected' : ''}>בארכיון</option>
                                </select>
                            </label>
                        </div>
                    </div>

                    <div style="background:rgba(139,105,20,0.05);border:1px solid rgba(212,175,55,0.2);border-radius:10px;padding:0.8rem;">
                        <div style="font-weight:700;font-size:0.88rem;margin-bottom:0.6rem;"><i class="fa-solid fa-flask" style="color:#8B6914;margin-left:0.3rem;"></i> A/B Testing</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                            <label style="font-weight:600;font-size:0.85rem;">קבוצת ניסוי
                                <div style="font-size:0.72rem;color:var(--text-secondary);">פופאפים עם אותה קבוצה ייבחרו רנדומלית — להשוואה</div>
                                <input name="variant_group" value="${escapeHtml(config?.variant_group || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;" placeholder="ריק = לא בניסוי">
                            </label>
                            <label style="font-weight:600;font-size:0.85rem;">תווית וריאנט
                                <div style="font-size:0.72rem;color:var(--text-secondary);">שם קצר, לדוגמה: A / B / קצר / ארוך</div>
                                <input name="variant_label" value="${escapeHtml(config?.variant_label || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                            </label>
                        </div>
                    </div>

                    <div style="background:rgba(47,133,146,0.04);border:1px dashed rgba(47,133,146,0.3);border-radius:10px;padding:0.8rem;">
                        <div style="font-weight:700;font-size:0.88rem;margin-bottom:0.4rem;"><i class="fa-solid fa-robot" style="color:#2F8592;margin-left:0.3rem;"></i> הערות לניהול / Claude Code</div>
                        <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.4rem;">רשום כאן השערות, מטרות, מה לבדוק. קלוד קוד יקרא את זה כשתבקש ממנו לנתח ולהמליץ.</div>
                        <textarea name="admin_notes" rows="3" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;resize:vertical;" placeholder="למשל: נוצר כדי לבדוק אם כפתור זהב ממיר טוב יותר מתכלת. מטרה: CTR > 8%. אם CTR < 5% אחרי שבוע — להחליף קופי.">${escapeHtml(config?.admin_notes || '')}</textarea>
                    </div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                        <label style="font-weight:600;font-size:0.85rem;">תאריך התחלה
                            <input name="start_date" type="datetime-local" value="${config?.start_date ? config.start_date.slice(0, 16) : ''}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;">
                        </label>
                        <label style="font-weight:600;font-size:0.85rem;">תאריך סיום
                            <input name="end_date" type="datetime-local" value="${config?.end_date ? config.end_date.slice(0, 16) : ''}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;">
                        </label>
                    </div>
                </div>
                <div style="display:flex;gap:0.6rem;margin-top:1.5rem;justify-content:flex-end;">
                    <button type="button" onclick="this.closest('#popup-form-modal').remove()" style="padding:0.5rem 1.2rem;border:1px solid var(--border);border-radius:8px;background:none;cursor:pointer;font-weight:600;">ביטול</button>
                    <button type="submit" style="padding:0.5rem 1.5rem;background:var(--gold);color:var(--deep-petrol);border:none;border-radius:8px;font-weight:700;cursor:pointer;">${isEdit ? 'שמור' : 'צור'}</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
}

async function savePopupConfig(event, configId) {
    event.preventDefault();
    const form = event.target;
    const status = form.status.value;
    const data = {
        title: form.title.value,
        description_he: form.description_he.value || null,
        message: form.message.value || null,
        cta_text: form.cta_text.value || null,
        cta_link: form.cta_link.value || null,
        category: form.category.value,
        priority: parseInt(form.priority.value),
        max_per_day: parseInt(form.max_per_day.value),
        cooldown_minutes: parseInt(form.cooldown_minutes.value),
        target_audience: form.target_audience.value,
        trigger_event: form.trigger_event.value,
        trigger_min_lessons: parseInt(form.trigger_min_lessons.value) || 0,
        variant_group: form.variant_group.value || null,
        variant_label: form.variant_label.value || null,
        admin_notes: form.admin_notes.value || null,
        status: status,
        is_active: status === 'live' || status === 'scheduled',
        start_date: form.start_date.value ? new Date(form.start_date.value).toISOString() : null,
        end_date: form.end_date.value ? new Date(form.end_date.value).toISOString() : null,
        updated_at: new Date().toISOString()
    };

    try {
        if (configId) {
            const { error } = await db.from('popup_configs').update(data).eq('id', configId);
            if (error) throw error;
            showToast('פופאפ עודכן', 'success');
        } else {
            data.popup_id = form.popup_id.value;
            const { error } = await db.from('popup_configs').insert([data]);
            if (error) throw error;
            showToast('פופאפ נוצר', 'success');
        }
        document.getElementById('popup-form-modal')?.remove();
        popupCache = null;
        loadPopupConfigs();
    } catch (err) {
        showToast('שגיאה: ' + (err.message || 'לא ידוע'), 'error');
    }
}

// ============================================================================
// PREVIEW (iframe-based real preview using popup-preview.html)
// ============================================================================
function previewPopup(configId) {
    const config = popupCache?.configs?.find(c => c.id === configId);
    if (!config) return;

    document.getElementById('popup-preview-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'popup-preview-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.onclick = function (e) { if (e.target === modal) modal.remove(); };

    const previewUrl = 'popup-preview.html?popup_id=' + encodeURIComponent(config.popup_id);
    const s = getPopupStats(config.popup_id);

    modal.innerHTML = `
        <div style="background:var(--card-bg,#fff);border-radius:16px;width:92%;max-width:780px;max-height:92vh;overflow-y:auto;direction:rtl;" onclick="event.stopPropagation()">
            <div style="background:linear-gradient(135deg,#003B46,#00606B);padding:1.2rem 1.5rem;border-radius:16px 16px 0 0;display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:0.6rem;">
                    <i class="fa-solid fa-eye" style="color:#D4AF37;"></i>
                    <span style="color:#fff;font-weight:700;">תצוגה מקדימה — ${escapeHtml(config.title)}</span>
                </div>
                <button onclick="this.closest('#popup-preview-modal').remove()" style="background:none;border:none;color:rgba(255,255,255,0.6);font-size:1.3rem;cursor:pointer;">&times;</button>
            </div>
            <div style="padding:1.2rem;">
                <div style="background:#f5f5f5;border-radius:10px;overflow:hidden;margin-bottom:1rem;">
                    <iframe src="${previewUrl}" style="width:100%;height:480px;border:none;" title="popup preview"></iframe>
                </div>
                <div style="display:flex;gap:1.5rem;font-size:0.85rem;padding:0.5rem;background:rgba(47,133,146,0.05);border-radius:8px;">
                    <div><span style="color:var(--text-secondary);">חשיפות:</span> <strong>${s.shown}</strong></div>
                    <div><span style="color:var(--text-secondary);">לחיצות:</span> <strong style="color:#2F8592;">${s.clicked}</strong></div>
                    <div><span style="color:var(--text-secondary);">סגירות:</span> <strong style="color:#FF6F61;">${s.dismissed}</strong></div>
                    <div><span style="color:var(--text-secondary);">CTR:</span> <strong style="color:var(--gold);">${s.shown > 0 ? ((s.clicked / s.shown) * 100).toFixed(1) + '%' : '-'}</strong></div>
                </div>
                ${config.admin_notes ? `<div style="margin-top:1rem;padding:0.8rem;background:rgba(212,175,55,0.06);border-right:3px solid #D4AF37;border-radius:6px;font-size:0.85rem;"><strong>הערות אדמין:</strong><br>${escapeHtml(config.admin_notes)}</div>` : ''}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function getPopupStats(popupId) {
    const events = popupCache?.events || [];
    const s = { shown: 0, clicked: 0, dismissed: 0, timeout: 0 };
    events.forEach(e => {
        if (e.popup_id === popupId && s[e.event_type] !== undefined) {
            s[e.event_type]++;
        }
    });
    return s;
}
