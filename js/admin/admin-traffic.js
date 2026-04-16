// admin-traffic.js — Professional Traffic Source Attribution dashboard
// ============================================================================
// Phase 1: KPI strip + first/last touch + channel funnel + landing pages +
// referrers + device donut + geography + recent rows. Reads from
// lead_attribution via admin_traffic_overview / admin_traffic_funnel /
// admin_traffic_recent RPCs.
// ============================================================================

let _trafficCache = null;
let _trafficCacheTime = 0;
const _TRAFFIC_CACHE_TTL = 5 * 60 * 1000;
let _trafficDays = 30;

async function loadTrafficSources() {
    if (_trafficCache && (Date.now() - _trafficCacheTime) < _TRAFFIC_CACHE_TTL) {
        renderTraffic(_trafficCache);
        return;
    }
    const host = document.getElementById('traffic-body');
    if (host) host.innerHTML = '<div class="traffic-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> טוען...</div>';

    try {
        const [{ data: overview, error: oErr }, { data: funnel, error: fErr }, { data: recent, error: rErr }] = await Promise.all([
            db.rpc('admin_traffic_overview', { days: _trafficDays }),
            db.rpc('admin_traffic_funnel',   { days: _trafficDays }),
            db.rpc('admin_traffic_recent',   { max_rows: 10 }),
        ]);
        if (oErr) throw oErr;
        if (fErr) throw fErr;
        if (rErr) throw rErr;

        _trafficCache = { overview: overview || {}, funnel: funnel || [], recent: recent || [] };
        _trafficCacheTime = Date.now();
        renderTraffic(_trafficCache);
    } catch (err) {
        console.error('❌ loadTrafficSources:', err);
        if (host) host.innerHTML = `<div class="traffic-error">שגיאה בטעינה: ${escapeHtml(err.message || String(err))}</div>`;
    }
}

function changeTrafficRange(days) {
    _trafficDays = days;
    _trafficCache = null;
    document.querySelectorAll('.traffic-range-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.days, 10) === days);
    });
    loadTrafficSources();
}

function renderTraffic({ overview, funnel, recent }) {
    const host = document.getElementById('traffic-body');
    if (!host) return;

    const ov = overview || {};
    const kpis = ov.kpis || {};
    const totalDevices = (kpis.mobile_count || 0) + (kpis.desktop_count || 0) + (kpis.tablet_count || 0);
    const mobilePct = totalDevices ? Math.round(((kpis.mobile_count || 0) / totalDevices) * 100) : 0;
    const desktopPct = totalDevices ? Math.round(((kpis.desktop_count || 0) / totalDevices) * 100) : 0;
    const tabletPct = totalDevices ? Math.max(0, 100 - mobilePct - desktopPct) : 0;

    const firstTouch = ov.first_touch || [];
    const lastTouch  = ov.last_touch  || [];
    const device     = ov.device      || [];
    const geo        = ov.geo         || [];
    const landing    = ov.landing     || [];
    const referrers  = ov.referrers   || [];

    const topChannel = (firstTouch[0] && firstTouch[0].source) || '—';

    host.innerHTML = `
        <div class="traffic-toolbar">
            <div class="traffic-range">
                <button class="traffic-range-btn" data-days="7"   onclick="changeTrafficRange(7)">7 ימים</button>
                <button class="traffic-range-btn active" data-days="30"  onclick="changeTrafficRange(30)">30 ימים</button>
                <button class="traffic-range-btn" data-days="90"  onclick="changeTrafficRange(90)">90 ימים</button>
            </div>
            <button class="btn btn-secondary" onclick="_trafficCache=null; loadTrafficSources();">
                <i class="fa-solid fa-rotate"></i> רענן
            </button>
        </div>

        <!-- KPI strip -->
        <div class="traffic-kpis">
            <div class="traffic-kpi">
                <div class="traffic-kpi-num">${kpis.total_leads || 0}</div>
                <div class="traffic-kpi-label">לידים ב-${_trafficDays} ימים</div>
            </div>
            <div class="traffic-kpi">
                <div class="traffic-kpi-num">${kpis.today || 0}</div>
                <div class="traffic-kpi-label">היום</div>
            </div>
            <div class="traffic-kpi">
                <div class="traffic-kpi-num">${kpis.last_7d || 0}</div>
                <div class="traffic-kpi-label">7 ימים אחרונים</div>
            </div>
            <div class="traffic-kpi">
                <div class="traffic-kpi-num">${mobilePct}%</div>
                <div class="traffic-kpi-label">בנייד</div>
            </div>
            <div class="traffic-kpi">
                <div class="traffic-kpi-num" style="font-size:1.1rem;">${escapeHtml(topChannel)}</div>
                <div class="traffic-kpi-label">ערוץ #1 (מקור ראשון)</div>
            </div>
        </div>

        <!-- First vs Last touch -->
        <div class="traffic-row">
            <div class="traffic-panel">
                <h3>מקור ראשון <span class="traffic-hint">(איפה התאהבו בך)</span></h3>
                ${renderBars(firstTouch, kpis.total_leads || 1)}
            </div>
            <div class="traffic-panel">
                <h3>מקור סוגר <span class="traffic-hint">(מה סגר את העסקה)</span></h3>
                ${renderBars(lastTouch, kpis.total_leads || 1)}
            </div>
        </div>

        <!-- Channel funnel -->
        <div class="traffic-panel" style="margin-top:1rem;">
            <h3>משפך לפי ערוץ <span class="traffic-hint">(ליד → שאלון → רישום → משלם)</span></h3>
            ${renderFunnel(funnel)}
        </div>

        <!-- Landing + Device -->
        <div class="traffic-row">
            <div class="traffic-panel">
                <h3>דפי נחיתה מובילים</h3>
                ${renderBars(landing.map(l => ({ source: l.url, n: l.n })), kpis.total_leads || 1)}
            </div>
            <div class="traffic-panel">
                <h3>מכשיר</h3>
                <div class="traffic-donut">
                    <div class="traffic-donut-row">
                        <span class="dot mobile"></span>
                        <span class="label">נייד</span>
                        <span class="val">${mobilePct}%</span>
                        <span class="count">(${kpis.mobile_count || 0})</span>
                    </div>
                    <div class="traffic-donut-row">
                        <span class="dot desktop"></span>
                        <span class="label">דסקטופ</span>
                        <span class="val">${desktopPct}%</span>
                        <span class="count">(${kpis.desktop_count || 0})</span>
                    </div>
                    <div class="traffic-donut-row">
                        <span class="dot tablet"></span>
                        <span class="label">טאבלט</span>
                        <span class="val">${tabletPct}%</span>
                        <span class="count">(${kpis.tablet_count || 0})</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Referrers + Geography -->
        <div class="traffic-row">
            <div class="traffic-panel">
                <h3>אתרי הפניה <span class="traffic-hint">(כשאין UTM)</span></h3>
                ${renderBars(referrers.map(r => ({ source: r.domain, n: r.n })), kpis.total_leads || 1)}
            </div>
            <div class="traffic-panel">
                <h3>גיאוגרפיה</h3>
                ${renderGeo(geo)}
            </div>
        </div>

        <!-- Recent rows -->
        <div class="traffic-panel" style="margin-top:1rem;">
            <h3>10 לידים אחרונים — פירוט מלא</h3>
            ${renderRecent(recent)}
        </div>

        <div class="traffic-footnote">
            💡 שים לב: הדשבורד הזה מבוסס על טבלת <code>lead_attribution</code> שמלאה רק מלידים חדשים שנשלחים דרך ה-Edge Function המעודכן. לידים ישנים (לפני ${new Date().toLocaleDateString('he-IL')}) לא יופיעו כאן אלא רק בלשוניות הישנות (Instagram + קמפיינים).
        </div>
    `;
}

// ─── Rendering helpers ─────────────────────────────────────────────────────
function renderBars(items, total) {
    if (!items || !items.length) return '<div class="traffic-empty">אין נתונים</div>';
    const max = Math.max(...items.map(i => i.n || 0), 1);
    return '<div class="traffic-bars">' + items.map(item => {
        const label = item.source || '(ריק)';
        const pct = total ? Math.round(((item.n || 0) / total) * 100) : 0;
        const barW = Math.round(((item.n || 0) / max) * 100);
        return `
            <div class="traffic-bar-row">
                <div class="traffic-bar-label" title="${escapeHtml(label)}">${escapeHtml(String(label).length > 34 ? label.slice(0, 34) + '…' : label)}</div>
                <div class="traffic-bar-track"><div class="traffic-bar-fill" style="width:${barW}%;"></div></div>
                <div class="traffic-bar-val">${item.n} · ${pct}%</div>
            </div>
        `;
    }).join('') + '</div>';
}

function renderFunnel(rows) {
    if (!rows || !rows.length) return '<div class="traffic-empty">אין נתונים למשפך</div>';
    return `
        <table class="traffic-funnel-table">
            <thead>
                <tr>
                    <th>ערוץ</th>
                    <th>לידים</th>
                    <th>→ שאלון</th>
                    <th>→ רישום</th>
                    <th>→ משלם</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(r => {
                    const q   = r.leads ? Math.round((r.questionnaires / r.leads) * 100) : 0;
                    const s   = r.leads ? Math.round((r.signups / r.leads) * 100) : 0;
                    const p   = r.leads ? Math.round((r.paid / r.leads) * 100) : 0;
                    return `
                        <tr>
                            <td><strong>${escapeHtml(r.source || '(ריק)')}</strong></td>
                            <td>${r.leads}</td>
                            <td>${r.questionnaires} <span class="pct">(${q}%)</span></td>
                            <td>${r.signups} <span class="pct">(${s}%)</span></td>
                            <td>${r.paid} <span class="pct">(${p}%)</span></td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function renderGeo(geoRows) {
    if (!geoRows || !geoRows.length) return '<div class="traffic-empty">אין נתוני גיאוגרפיה עדיין</div>';
    return '<div class="traffic-geo-list">' + geoRows.map(g => `
        <div class="traffic-geo-row">
            <span class="traffic-geo-city">${escapeHtml(g.city || '—')}</span>
            <span class="traffic-geo-country">${escapeHtml(g.country || '')}</span>
            <span class="traffic-geo-count">${g.n}</span>
        </div>
    `).join('') + '</div>';
}

function renderRecent(rows) {
    if (!rows || !rows.length) return '<div class="traffic-empty">אין לידים עדיין ב-lead_attribution</div>';
    return `
        <div class="traffic-recent-wrap">
            <table class="traffic-recent-table">
                <thead>
                    <tr>
                        <th>זמן</th>
                        <th>טבלה</th>
                        <th>מקור ראשון</th>
                        <th>מקור אחרון</th>
                        <th>דף נחיתה</th>
                        <th>מכשיר</th>
                        <th>מיקום</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td>${formatDateTime(r.created_at)}</td>
                            <td><span class="traffic-tag">${escapeHtml(r.linked_table || '—')}</span></td>
                            <td>${escapeHtml(r.first_utm_source || r.first_referrer_domain || '(direct)')}</td>
                            <td>${escapeHtml(r.last_utm_source  || r.last_referrer_domain  || '(direct)')}</td>
                            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(r.last_landing_url || '')}">${escapeHtml(r.last_landing_url || '—')}</td>
                            <td>${escapeHtml(r.device_type || '—')} ${r.os_name ? '· ' + escapeHtml(r.os_name) : ''}</td>
                            <td>${escapeHtml(r.city || '')} ${r.country_code ? '(' + escapeHtml(r.country_code) + ')' : ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}
