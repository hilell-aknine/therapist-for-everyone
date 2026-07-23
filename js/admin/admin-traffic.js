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
// FIX-ENGINE F-005 (2026-07-23): הדשבורד הזה מרונדר עכשיו גם בתוך "פירוט מלא
// (למתקדמים)" בעמוד הפשוט — host דינמי במקום #traffic-body קבוע. לבקשת הלל.
let _trafficHost = null;

function _getTrafficHost() {
    return _trafficHost || document.getElementById('traffic-body');
}

async function loadTrafficSources(hostEl) {
    if (hostEl) _trafficHost = hostEl;
    if (_trafficCache && (Date.now() - _trafficCacheTime) < _TRAFFIC_CACHE_TTL) {
        renderTraffic(_trafficCache);
        return;
    }
    const host = _getTrafficHost();
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
    const host = _getTrafficHost();
    if (!host) return;

    const ov = overview || {};
    const kpis = ov.kpis || {};
    // Only count records that HAVE device_type (backfilled records have NULL)
    const totalDevices = (kpis.mobile_count || 0) + (kpis.desktop_count || 0) + (kpis.tablet_count || 0);
    const mobilePct = totalDevices ? Math.round(((kpis.mobile_count || 0) / totalDevices) * 100) : null;
    const desktopPct = totalDevices ? Math.round(((kpis.desktop_count || 0) / totalDevices) * 100) : null;
    const tabletPct = totalDevices ? Math.max(0, 100 - (mobilePct || 0) - (desktopPct || 0)) : null;
    const noDeviceData = mobilePct === null;

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
                <div class="traffic-kpi-label">אנשים ייחודיים ב-${_trafficDays} ימים</div>
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
                <div class="traffic-kpi-num">${noDeviceData ? '—' : mobilePct + '%'}</div>
                <div class="traffic-kpi-label">${noDeviceData ? 'אין מידע מכשיר' : 'בנייד'}</div>
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
                ${noDeviceData ? '<div class="traffic-empty">מידע על מכשיר זמין רק מלידים חדשים (מ-19/04 והלאה)</div>' : `
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
                </div>`}
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
            💡 שים לב: הפירוט הזה כולל רק אנשים חדשים שנקלטו מאז שהמערכת החדשה הותקנה (19/4/2026). אנשים ותיקים יותר מופיעים בחלקים האחרים של הפירוט המלא.
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
        // Show medium badge (paid/organic) when available
        let mediumBadge = '';
        if (item.medium) {
            const m = item.medium.toLowerCase();
            const isPaid = m.includes('paid') || m.includes('cpc') || m.includes('ppc') || m.includes('ads');
            const isOrganic = m.includes('organic') || m.includes('referral') || m.includes('social');
            const cls = isPaid ? 'paid' : isOrganic ? 'organic' : 'unknown';
            const txt = isPaid ? 'ממומן' : isOrganic ? 'אורגני' : escapeHtml(item.medium);
            mediumBadge = `<span class="traffic-source-medium ${cls}">${txt}</span>`;
        }
        const displayLabel = String(label).length > 28 ? label.slice(0, 28) + '…' : label;
        return `
            <div class="traffic-bar-row">
                <div class="traffic-bar-label" title="${escapeHtml(label)}">${mediumBadge}${escapeHtml(displayLabel)}</div>
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
                    let medBadge = '';
                    if (r.medium) {
                        const m = r.medium.toLowerCase();
                        const isPaid = m.includes('paid') || m.includes('cpc') || m.includes('ppc') || m.includes('ads');
                        const isOrganic = m.includes('organic') || m.includes('referral') || m.includes('social');
                        const cls = isPaid ? 'paid' : isOrganic ? 'organic' : 'unknown';
                        const txt = isPaid ? 'ממומן' : isOrganic ? 'אורגני' : escapeHtml(r.medium);
                        medBadge = ` <span class="traffic-source-medium ${cls}">${txt}</span>`;
                    }
                    return `
                        <tr>
                            <td><strong>${escapeHtml(r.source || '(ריק)')}</strong>${medBadge}</td>
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

// ============================================================================
// FIX-ENGINE F-005 (2026-07-23): העמוד הפשוט של "מקורות תנועה" — דף אחד,
// במילים פשוטות. כרטיסי מספרים למעלה + רשימת "מאיפה הם הגיעו" אחת + מתג
// זמן יחיד (30 ימים / הכל). כל התוכן הצפוף הישן עבר ל"פירוט מלא (למתקדמים)".
// לבקשת הלל.
// ============================================================================

// קיבוץ המקורות הטכניים לשמות פשוטים שכל אחד מבין.
// keys = הדליים הקנוניים של admin_unified_source_funnel (ראה FUNNEL_SOURCE_LABELS).
const SIMPLE_SOURCE_GROUPS = [
    { he: 'פייסבוק ואינסטגרם', keys: ['facebook', 'instagram', 'ad'],   icon: 'fa-brands fa-instagram', color: '#E4405F' },
    { he: 'גוגל',               keys: ['google'],                        icon: 'fa-brands fa-google',    color: '#4285F4' },
    { he: 'יוטיוב',             keys: ['youtube'],                       icon: 'fa-brands fa-youtube',   color: '#FF0000' },
    { he: 'וואטסאפ',            keys: ['whatsapp'],                      icon: 'fa-brands fa-whatsapp',  color: '#25D366' },
    { he: 'חבר או המלצה',       keys: ['referral', 'podcast', 'event'],  icon: 'fa-solid fa-user-group', color: '#9b59b6' },
    { he: 'הגיעו ישירות',       keys: ['unknown'],                       icon: 'fa-solid fa-link',       color: '#9CA3AF' },
    { he: 'אחר',                keys: ['other', 'tiktok'],               icon: 'fa-solid fa-globe',      color: '#6B7280' },
];

// data = מה ש-loadSources (admin-sources.js) כבר טען: funnel אמיתי מ-Supabase
// + מבקרים מ-GA4 (best-effort). אפס המצאות: מה שלא נטען — מוצג "אין נתונים טריים".
function renderSimpleSources(data) {
    const host = document.getElementById('sources-body');
    if (!host) return;

    const t  = data.totals_per_stage || {};
    const at = data.all_time_totals  || { leads_total: 0, registrations_total: 0, paid_total: 0 };
    const isAllTime = _sourcesDays >= 3650;

    // כרטיס מבקרים: GA4 מודד תמיד רק 30 יום אחורה — אומרים את זה ביושר
    const visitorsValue = data.ga4_error
        ? '<span class="simple-card-nodata">אין נתונים טריים</span>'
        : (t.visitors || 0).toLocaleString();
    const visitorsSub = data.ga4_error
        ? 'גוגל לא ענה כרגע — נסה לרענן'
        : 'לפי גוגל · תמיד 30 הימים האחרונים';

    const leadsSub = isAllTime
        ? 'מאז שהמערכת קיימת'
        : 'סך הכל אי-פעם: ' + (at.leads_total || 0).toLocaleString();

    host.innerHTML = `
        <h1 class="page-title" style="margin-bottom:0.25rem;"><i class="fa-solid fa-compass" style="color:var(--gold,#D4AF37);margin-left:0.5rem;"></i> מקורות תנועה</h1>
        <p class="simple-intro">כמה אנשים הגיעו, ומאיפה — במילים פשוטות.</p>

        <div class="simple-toolbar">
            <div class="simple-toggle">
                <button class="simple-toggle-btn ${!isAllTime ? 'active' : ''}" onclick="changeSourcesRange(30)">30 ימים</button>
                <button class="simple-toggle-btn ${isAllTime ? 'active' : ''}" onclick="changeSourcesRange(3650)">הכל</button>
            </div>
            <button class="btn btn-secondary" onclick="loadSources(true)"><i class="fa-solid fa-rotate"></i> רענן</button>
        </div>

        <!-- כרטיסי מספרים -->
        <div class="simple-cards">
            <div class="simple-card">
                <div class="simple-card-num">${visitorsValue}</div>
                <div class="simple-card-label">נכנסו לאתר</div>
                <div class="simple-card-sub">${visitorsSub}</div>
            </div>
            <div class="simple-card">
                <div class="simple-card-num">${(t.leads || 0).toLocaleString()}</div>
                <div class="simple-card-label">השאירו פרטים</div>
                <div class="simple-card-sub">${leadsSub}</div>
            </div>
            <div class="simple-card">
                <div class="simple-card-num">${(t.registrations || 0).toLocaleString()}</div>
                <div class="simple-card-label">נרשמו לפורטל</div>
                <div class="simple-card-sub">${isAllTime ? 'מאז שהמערכת קיימת' : 'סך הכל אי-פעם: ' + (at.registrations_total || 0).toLocaleString()}</div>
            </div>
            <div class="simple-card simple-card-gold">
                <div class="simple-card-num">${(at.paid_total || 0).toLocaleString()}</div>
                <div class="simple-card-label">משלמים עכשיו</div>
                <div class="simple-card-sub">מנוי פעיל כרגע</div>
            </div>
        </div>

        <!-- מאיפה הם הגיעו -->
        <div class="simple-panel">
            <h3>מאיפה הם הגיעו?</h3>
            <p class="simple-panel-sub">לפי אנשים שהשאירו פרטים ${isAllTime ? 'מאז ומעולם' : 'ב-30 הימים האחרונים'}</p>
            ${_renderSimpleBreakdown(data.per_source || [])}
        </div>

        <!-- פירוט מלא — מקופל, למתקדמים בלבד -->
        <details class="simple-adv">
            <summary><i class="fa-solid fa-magnifying-glass-chart"></i> פירוט מלא (למתקדמים)</summary>
            <div class="simple-adv-body">
                <details class="simple-adv-block" ontoggle="_advShowUnified(this)">
                    <summary>הטבלה המלאה לפי מקור (המרות, קמפיינים)</summary>
                    <div class="simple-adv-host"></div>
                </details>
                <details class="simple-adv-block" ontoggle="_advShowGA4(this)">
                    <summary>נתוני גלישה גולמיים מגוגל</summary>
                    <div class="simple-adv-host"></div>
                </details>
                <details class="simple-adv-block" ontoggle="_advShowInstagram(this)">
                    <summary>אינסטגרם — פירוט היסטורי</summary>
                    <div class="simple-adv-host"></div>
                </details>
                <details class="simple-adv-block" ontoggle="_advShowJourney(this)">
                    <summary>מסע הלקוח — לידים אחרונים ומכשירים</summary>
                    <div class="simple-adv-host"></div>
                </details>
            </div>
        </details>
    `;
}

function _renderSimpleBreakdown(perSource) {
    // סכימת הלידים של כל מקור טכני לתוך הקבוצות הפשוטות
    const counts = new Map();
    let total = 0;
    perSource.forEach(row => {
        const n = row.leads || 0;
        if (!n) return;
        const group = SIMPLE_SOURCE_GROUPS.find(g => g.keys.includes(row.source)) ||
                      SIMPLE_SOURCE_GROUPS[SIMPLE_SOURCE_GROUPS.length - 1]; // 'אחר'
        counts.set(group, (counts.get(group) || 0) + n);
        total += n;
    });

    if (!total) {
        return '<div class="simple-empty">עדיין אין נתונים לתקופה הזו. ברגע שמישהו ישאיר פרטים — הוא יופיע כאן.</div>';
    }

    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return '<div class="simple-break">' + rows.map(([group, n]) => {
        const pct = Math.round((n / total) * 100);
        return `
            <div class="simple-break-row">
                <div class="simple-break-name">
                    <i class="${group.icon}" style="color:${group.color};"></i>
                    ${escapeHtml(group.he)}
                </div>
                <div class="simple-break-track">
                    <div class="simple-break-fill" style="width:${Math.max(pct, 2)}%;"></div>
                </div>
                <div class="simple-break-val"><strong>${n.toLocaleString()}</strong> · ${pct}%</div>
            </div>
        `;
    }).join('') + '</div>';
}

// ─── טעינה עצלה של בלוקי "פירוט מלא" — כל בלוק נטען רק בפתיחה ראשונה ────
function _advHost(el) { return el.querySelector('.simple-adv-host'); }

function _advShowUnified(el) {
    if (!el.open || el.dataset.loaded) return;
    el.dataset.loaded = '1';
    const host = _advHost(el);
    if (_sourcesCache && typeof renderSourcesAdvanced === 'function') {
        renderSourcesAdvanced(_sourcesCache, host);
    } else if (host) {
        host.innerHTML = '<div class="simple-empty">אין נתונים טריים כרגע.</div>';
    }
}

function _advShowGA4(el) {
    if (!el.open || el.dataset.loaded) return;
    el.dataset.loaded = '1';
    const host = _advHost(el);
    if (typeof loadGA4RawInto === 'function' && host) loadGA4RawInto(host);
}

function _advShowInstagram(el) {
    if (!el.open || el.dataset.loaded) return;
    el.dataset.loaded = '1';
    const host = _advHost(el);
    if (typeof loadInstagramInto === 'function' && host) loadInstagramInto(host);
}

function _advShowJourney(el) {
    if (!el.open || el.dataset.loaded) return;
    el.dataset.loaded = '1';
    const host = _advHost(el);
    if (host) loadTrafficSources(host);
}
