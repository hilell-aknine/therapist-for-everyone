// admin-sources.js — Unified "מקור הלקוחות" dashboard (Phase 3 ROI initiative)
// ============================================================================
// Replaces the dual GA4 "סטטיסטיקות האתר" + lead_attribution "טראפיק"/"אינסטגרם"
// dashboards with one funnel view: visitors → leads → registrations → paid,
// per source, with a single reconciliation rule and explicit transparency
// notes inside the UI.
//
// Data flow:
//   admin_unified_source_funnel (RPC)  →  funnel JSON (leads/reg/paid/mismatch)
//   ga4-analytics (Edge Function)       →  visitors per source (top of funnel)
//   merge in JS by canonical source name → render unified table
// ============================================================================

let _sourcesCache = null;
let _sourcesCacheTime = 0;
const _SOURCES_CACHE_TTL = 5 * 60 * 1000;
let _sourcesDays = 30;

// Canonical source labels — must match the bucket names in
// admin_unified_source_funnel SQL and the canonical names stored at
// capture by js/marketing-tools.js (`_normalizeSource`).
const FUNNEL_SOURCE_LABELS = {
    instagram: { he: 'אינסטגרם',         icon: 'fa-brands fa-instagram',  color: '#E4405F' },
    facebook:  { he: 'פייסבוק',          icon: 'fa-brands fa-facebook',   color: '#1877F2' },
    google:    { he: 'גוגל (חיפוש)',     icon: 'fa-brands fa-google',     color: '#4285F4' },
    youtube:   { he: 'יוטיוב',           icon: 'fa-brands fa-youtube',    color: '#FF0000' },
    tiktok:    { he: 'טיקטוק',           icon: 'fa-brands fa-tiktok',     color: '#000000' },
    whatsapp:  { he: 'וואטסאפ',          icon: 'fa-brands fa-whatsapp',   color: '#25D366' },
    referral:  { he: 'חבר / המלצה',      icon: 'fa-solid fa-user-group',  color: '#9b59b6' },
    podcast:   { he: 'פודקאסט / ראיון',  icon: 'fa-solid fa-microphone',  color: '#8B5CF6' },
    event:     { he: 'הרצאה / אירוע',    icon: 'fa-solid fa-calendar-day',color: '#F59E0B' },
    ad:        { he: 'פרסומת ממומנת',    icon: 'fa-solid fa-bullhorn',    color: '#EC4899' },
    other:     { he: 'אחר',              icon: 'fa-solid fa-globe',       color: '#6B7280' },
    unknown:   { he: 'לא ידוע / ישיר',   icon: 'fa-solid fa-question',    color: '#9CA3AF' },
};

// Healthy conversion ranges — used for visual flagging in the table.
const HEALTHY_RANGES = {
    v_to_l: { min: 0.5,  max: 5,  redBelow: 0.3 },  // visitors → leads %
    l_to_r: { min: 30,   max: 70, redBelow: 15  },  // leads → registrations %
    r_to_p: { min: 5,    max: 20, redBelow: 2   },  // registrations → paid %
};

// GA4 sometimes reports the same platform under several source names
// (e.g. instagram, l.instagram.com). Map them to one canonical bucket.
function _normalizeGA4Source(rawSource) {
    if (!rawSource) return 'unknown';
    const s = rawSource.toLowerCase().trim();
    if (s.includes('instagram') || s === 'ig' || s === 'insta') return 'instagram';
    if (s.includes('facebook')  || s === 'fb' || s === 'meta')  return 'facebook';
    if (s === 'google' || s.includes('google.'))                return 'google';
    if (s.includes('youtube')   || s === 'yt')                  return 'youtube';
    if (s.includes('tiktok'))                                   return 'tiktok';
    if (s.includes('whatsapp')  || s === 'wa.me')               return 'whatsapp';
    if (s === '(direct)' || s === '(not set)' || s === 'direct')return 'unknown';
    return 'other';
}

async function loadSources(forceRefresh) {
    if (forceRefresh) { _sourcesCache = null; _sourcesCacheTime = 0; }
    if (_sourcesCache && (Date.now() - _sourcesCacheTime) < _SOURCES_CACHE_TTL) {
        renderSources(_sourcesCache);
        return;
    }
    const host = document.getElementById('sources-body');
    if (host) host.innerHTML = `<div class="sources-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> טוען...</div>`;

    try {
        // Fetch funnel + GA4 in parallel. GA4 is best-effort: if it fails (quota,
        // auth, network) we still render the funnel without visitors.
        const [funnelRes, ga4Res] = await Promise.allSettled([
            db.rpc('admin_unified_source_funnel', { days: _sourcesDays }),
            _fetchGA4Visitors(),
        ]);

        if (funnelRes.status === 'rejected') throw funnelRes.reason;
        if (funnelRes.value?.error)         throw funnelRes.value.error;

        const funnel = funnelRes.value?.data || {};
        const ga4    = ga4Res.status === 'fulfilled' ? ga4Res.value : null;
        const ga4Error = ga4Res.status === 'rejected' ? (ga4Res.reason?.message || String(ga4Res.reason)) : null;

        _sourcesCache = _mergeFunnelWithVisitors(funnel, ga4, ga4Error);
        _sourcesCacheTime = Date.now();
        renderSources(_sourcesCache);
    } catch (err) {
        console.error('[Sources] load error:', err);
        if (host) host.innerHTML = `<div class="sources-error"><i class="fa-solid fa-circle-exclamation"></i> שגיאה בטעינת הדשבורד: ${escapeHtml(err.message || String(err))}</div>`;
    }
}

async function _fetchGA4Visitors() {
    const { data: { session } } = await db.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('not authenticated');
    const functionsUrl = window.SUPABASE_CONFIG?.functionsUrl || 'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1';
    const res = await fetch(`${functionsUrl}/ga4-analytics`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `GA4 HTTP ${res.status}`);
    }
    return res.json();
}

function _mergeFunnelWithVisitors(funnel, ga4, ga4Error) {
    // Step 1: aggregate GA4 detailed_sources into canonical buckets.
    // GA4's `users` field is unique users (better than sessions for funnel).
    const ga4ByCanonical = {};
    let ga4TotalVisitors = 0;
    if (ga4 && ga4.detailed_sources && ga4.detailed_sources.sources) {
        ga4.detailed_sources.sources.forEach(s => {
            const canon = _normalizeGA4Source(s.source);
            ga4ByCanonical[canon] = (ga4ByCanonical[canon] || 0) + (s.users || 0);
        });
    }
    // Total unique users across the property (de-duplicated). Falls back to
    // summing the buckets if the aggregate isn't returned.
    if (ga4 && ga4.users && ga4.users.last30days) {
        ga4TotalVisitors = ga4.users.last30days.activeUsers || 0;
    } else {
        ga4TotalVisitors = Object.values(ga4ByCanonical).reduce((a, b) => a + b, 0);
    }

    // Step 2: build merged per-source rows.
    const perSource = (funnel.per_source || []).map(row => {
        const visitors = ga4ByCanonical[row.source] || 0;
        return {
            source:           row.source,
            visitors,
            leads:            row.leads || 0,
            registrations:    row.registrations || 0,
            paid:             row.paid || 0,
            utm_count:        row.utm_count || 0,
            how_found_count:  row.how_found_count || 0,
            mismatch_count:   row.mismatch_count || 0,
            v_to_l: visitors > 0 ? (row.leads / visitors) * 100 : null,
            l_to_r: row.leads > 0 ? (row.registrations / row.leads) * 100 : null,
            r_to_p: row.registrations > 0 ? (row.paid / row.registrations) * 100 : null,
        };
    });

    // Step 3: detect GA4 sources that have visitors but no funnel row (lost tracking).
    // If GA4 reports instagram visitors but we have no instagram leads, surface that.
    const seenSources = new Set(perSource.map(r => r.source));
    Object.entries(ga4ByCanonical).forEach(([canon, visitors]) => {
        if (!seenSources.has(canon) && visitors > 0) {
            perSource.push({
                source: canon, visitors,
                leads: 0, registrations: 0, paid: 0,
                utm_count: 0, how_found_count: 0, mismatch_count: 0,
                v_to_l: 0, l_to_r: null, r_to_p: null,
            });
        }
    });

    perSource.sort((a, b) => (b.leads || 0) - (a.leads || 0) || (b.visitors || 0) - (a.visitors || 0));

    return {
        days:             funnel.days || _sourcesDays,
        cutoff:           funnel.cutoff,
        historical_floor: funnel.historical_floor || '2026-04-19',
        totals_per_stage: {
            visitors:      ga4TotalVisitors,
            leads:         funnel.totals_per_stage?.leads || 0,
            registrations: funnel.totals_per_stage?.registrations || 0,
            paid:          funnel.totals_per_stage?.paid || 0,
            mismatches:    funnel.totals_per_stage?.mismatches || 0,
        },
        per_source: perSource,
        mismatches: funnel.mismatches || [],
        ga4_error:  ga4Error,
    };
}

function renderSources(data) {
    const host = document.getElementById('sources-body');
    if (!host) return;

    const t = data.totals_per_stage;
    const totalV2L = t.visitors > 0 ? ((t.leads / t.visitors) * 100).toFixed(2) : '—';
    const totalL2R = t.leads > 0 ? ((t.registrations / t.leads) * 100).toFixed(0) : '—';
    const totalR2P = t.registrations > 0 ? ((t.paid / t.registrations) * 100).toFixed(0) : '—';

    host.innerHTML = `
        <!-- Toolbar -->
        <div class="sources-toolbar">
            <div class="sources-range">
                <button class="sources-range-btn ${_sourcesDays===7?'active':''}"  onclick="changeSourcesRange(7)">7 ימים</button>
                <button class="sources-range-btn ${_sourcesDays===30?'active':''}" onclick="changeSourcesRange(30)">30 ימים</button>
                <button class="sources-range-btn ${_sourcesDays===90?'active':''}" onclick="changeSourcesRange(90)">90 ימים</button>
            </div>
            <div class="sources-actions">
                <button class="btn btn-secondary" onclick="showWeeklyReconciliation()">
                    <i class="fa-solid fa-chart-simple"></i> דוח התאמה שבועי
                </button>
                <button class="btn btn-secondary" onclick="loadSources(true)">
                    <i class="fa-solid fa-rotate"></i> רענן
                </button>
            </div>
        </div>

        <!-- Transparency banner — always visible -->
        <div class="sources-banner sources-banner-info">
            <i class="fa-solid fa-circle-info"></i>
            <div>
                <strong>איך לקרוא את הנתונים</strong><br>
                <span><strong>גולשים</strong> — ביקורים באתר (Google Analytics). כולל גם מי שלא השאיר פרטים.</span>
                <span> · <strong>לידים</strong> — מי שהשאיר פרטים בטופס.</span>
                <span> · <strong>רשומים</strong> — מי שיצר חשבון בפורטל.</span>
                <span> · <strong>משלמים</strong> — מנוי פעיל כעת.</span><br>
                <span><strong>כלל קביעת מקור:</strong> UTM קודם → "איך הגעת אלינו" כגיבוי → "לא ידוע".</span>
            </div>
        </div>

        <!-- Historical floor banner — until backfill phase -->
        <div class="sources-banner sources-banner-warn">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <span>נתונים מלאים מ-${escapeHtml(data.historical_floor)} והלאה. לידים מתקופות מוקדמות יותר יופיעו תחת "לא ידוע".</span>
        </div>

        ${data.ga4_error ? `
            <div class="sources-banner sources-banner-error">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span><strong>נתוני גולשים מ-GA4 לא נטענו:</strong> ${escapeHtml(data.ga4_error)}. הטבלה למטה מציגה את שאר הנתונים בלבד (לידים, רשומים, משלמים).</span>
            </div>
        ` : ''}

        ${t.mismatches > 0 ? `
            <div class="sources-banner sources-banner-mismatch">
                <i class="fa-solid fa-circle-exclamation"></i>
                <span><strong>${t.mismatches} לידים</strong> שבהם המקור הטכני (UTM) שונה מהדיווח העצמי של המשתמש. ייתכן שראו פרסום וגם חבר שלח להם קישור — שני המקורות נכונים.</span>
                <button class="btn btn-link" onclick="showMismatchesModal()"><i class="fa-solid fa-list"></i> צפייה ברשימה</button>
            </div>
        ` : ''}

        <!-- KPI strip -->
        <div class="sources-kpis">
            <div class="sources-kpi">
                <div class="sources-kpi-num">${(t.visitors || 0).toLocaleString()}</div>
                <div class="sources-kpi-label">גולשים (${_sourcesDays} ימים)</div>
            </div>
            <div class="sources-kpi">
                <div class="sources-kpi-num">${(t.leads || 0).toLocaleString()}</div>
                <div class="sources-kpi-label">לידים</div>
            </div>
            <div class="sources-kpi">
                <div class="sources-kpi-num">${(t.registrations || 0).toLocaleString()}</div>
                <div class="sources-kpi-label">רשומים</div>
            </div>
            <div class="sources-kpi">
                <div class="sources-kpi-num">${(t.paid || 0).toLocaleString()}</div>
                <div class="sources-kpi-label">משלמים</div>
            </div>
            <div class="sources-kpi">
                <div class="sources-kpi-num">${totalV2L}%</div>
                <div class="sources-kpi-label">המרה כוללת — גולש→ליד</div>
            </div>
        </div>

        <!-- Per-source funnel table -->
        <div class="sources-panel">
            <h3>פירוט לפי מקור</h3>
            ${_renderSourcesTable(data.per_source)}
        </div>
    `;
}

function _renderSourcesTable(rows) {
    if (!rows || !rows.length) {
        return '<div class="sources-empty">אין נתונים לתקופה הנבחרת</div>';
    }
    const headerRow = `
        <thead>
            <tr>
                <th>מקור</th>
                <th title="ביקורים באתר מ-Google Analytics. אם הקישור לא הכיל UTM, גולש מאינסטגרם יופיע כ&quot;Organic Social&quot; ולא כאינסטגרם.">גולשים <i class="fa-solid fa-circle-info"></i></th>
                <th title="מי שהשאיר פרטים בטופס מ-19/4/2026 והלאה. לידים ישנים יותר ללא UTM נופלים תחת &quot;לא ידוע&quot;.">לידים <i class="fa-solid fa-circle-info"></i></th>
                <th title="מי שפתח חשבון בפורטל. כולל בקורס החינמי.">רשומים <i class="fa-solid fa-circle-info"></i></th>
                <th title="מנוי בסטטוס &quot;active&quot; כעת. לא כולל מנויים שפגו.">משלמים <i class="fa-solid fa-circle-info"></i></th>
                <th title="גולשים שהפכו ללידים. בריא: 0.5%–5%. אדום: מתחת ל-0.3%.">גולש→ליד</th>
                <th title="לידים שהפכו לרשומים. בריא: 30%–70%.">ליד→רשום</th>
                <th title="רשומים שהפכו למשלמים. בריא: 5%–20%.">רשום→משלם</th>
                <th title="פירוט המקור: כמה הגיעו דרך UTM, כמה דרך &quot;איך הגעת אלינו&quot;, וכמה לידים יש להם שני מקורות סותרים.">פירוט מקור</th>
            </tr>
        </thead>
    `;

    const bodyRows = rows.map(row => {
        const meta = FUNNEL_SOURCE_LABELS[row.source] || { he: row.source, icon: 'fa-solid fa-globe', color: '#6B7280' };
        const v2lClass = _flagClass(row.v_to_l, HEALTHY_RANGES.v_to_l);
        const l2rClass = _flagClass(row.l_to_r, HEALTHY_RANGES.l_to_r);
        const r2pClass = _flagClass(row.r_to_p, HEALTHY_RANGES.r_to_p);

        const isUnknown = row.source === 'unknown';
        const unknownNote = isUnknown
            ? `<i class="fa-solid fa-circle-info" style="margin-right:0.4rem;color:var(--text-secondary);" title="כולל: (1) לידים ישירים ללא UTM. (2) לידים מלפני 19/4/2026. (3) לידים שלא ענו על &quot;איך הגעת אלינו&quot;. ודא ש-UTM מופיע בכל קישור באינסטגרם/פייסבוק/וואטסאפ דרך הגדרות → UTM Builder."></i>`
            : '';

        const breakdown = `
            <span title="לידים שהגיעו עם UTM בלינק" style="color:#3B82F6;">UTM ${row.utm_count}</span>
            ${row.how_found_count > 0 ? ` · <span title="לידים שדיווחו בעצמם איך הגיעו" style="color:#A855F7;">דיווח עצמי ${row.how_found_count}</span>` : ''}
            ${row.mismatch_count > 0 ? ` · <span title="לידים שבהם UTM ו&quot;איך הגעת&quot; סותרים" style="color:#F59E0B;">⚠ סתירה ${row.mismatch_count}</span>` : ''}
        `;

        return `
            <tr>
                <td>
                    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${meta.color};margin-left:0.5rem;"></span>
                    <i class="${meta.icon}" style="color:${meta.color};margin-left:0.4rem;"></i>
                    ${escapeHtml(meta.he)}
                    ${unknownNote}
                </td>
                <td><strong>${(row.visitors || 0).toLocaleString()}</strong></td>
                <td><strong>${(row.leads || 0).toLocaleString()}</strong></td>
                <td>${(row.registrations || 0).toLocaleString()}</td>
                <td>${(row.paid || 0).toLocaleString()}</td>
                <td class="${v2lClass}">${_fmtPct(row.v_to_l)}</td>
                <td class="${l2rClass}">${_fmtPct(row.l_to_r)}</td>
                <td class="${r2pClass}">${_fmtPct(row.r_to_p)}</td>
                <td style="font-size:0.8rem;">${breakdown}</td>
            </tr>
        `;
    }).join('');

    return `<table class="sources-table">${headerRow}<tbody>${bodyRows}</tbody></table>`;
}

function _flagClass(value, range) {
    if (value == null) return 'sources-cell-na';
    if (value < range.redBelow) return 'sources-cell-red';
    if (value < range.min || value > range.max) return 'sources-cell-warn';
    return 'sources-cell-good';
}

function _fmtPct(v) {
    if (v == null) return '—';
    if (v < 1) return v.toFixed(2) + '%';
    return v.toFixed(0) + '%';
}

function changeSourcesRange(days) {
    _sourcesDays = days;
    _sourcesCache = null;
    loadSources();
}

// ─── Mismatches modal ─────────────────────────────────────────────────────
function showMismatchesModal() {
    if (!_sourcesCache || !_sourcesCache.mismatches) return;
    const rows = _sourcesCache.mismatches.map(m => `
        <tr>
            <td>${formatDateTime(m.created_at)}</td>
            <td>${escapeHtml(m.phone || m.email || '—')}</td>
            <td><strong>${escapeHtml(m.utm_canonical || '—')}</strong></td>
            <td>${escapeHtml(m.how_found_canonical || '—')} <span style="color:var(--text-secondary);font-size:0.8rem;">(${escapeHtml(m.how_found_raw || '')})</span></td>
        </tr>
    `).join('');

    const html = `
        <div class="modal active" id="mismatches-modal" onclick="if(event.target===this)closeMismatchesModal()">
            <div class="modal-content" style="max-width:760px;">
                <div class="modal-header">
                    <h2><i class="fa-solid fa-circle-exclamation" style="color:#F59E0B;"></i> סתירות מקור — ${_sourcesCache.mismatches.length} לידים</h2>
                    <button class="modal-close" onclick="closeMismatchesModal()"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <p style="color:var(--text-secondary);margin-bottom:1rem;">
                        UTM (טכני, מהקישור) שונה מהדיווח העצמי של המשתמש. כלל ההתאמה: UTM גובר. <strong>זה לא בהכרח באג</strong> — לעיתים המשתמש זוכר שחבר שלח לו קישור, אבל בפועל הוא קליק על קישור פרסומי. ייתכנו שני מקורות נכונים בו זמנית.
                    </p>
                    <table class="sources-table">
                        <thead>
                            <tr><th>זמן</th><th>זיהוי</th><th>UTM</th><th>איך הגיע</th></tr>
                        </thead>
                        <tbody>${rows || '<tr><td colspan="4" class="sources-empty">אין סתירות</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container.firstElementChild);
}

function closeMismatchesModal() {
    const m = document.getElementById('mismatches-modal');
    if (m) m.remove();
}

// ─── Weekly reconciliation report ─────────────────────────────────────────
async function showWeeklyReconciliation() {
    let data;
    try {
        const res = await db.rpc('admin_source_reconciliation_weekly');
        if (res.error) throw res.error;
        data = res.data || {};
    } catch (err) {
        showToast('שגיאה בטעינת דוח: ' + (err.message || err), 'error');
        return;
    }

    const tw = data.this_week || { total: 0, both: 0, utm_only: 0, how_found_only: 0, neither: 0 };
    const l30 = data.last_30d || { total: 0, both: 0, utm_only: 0, how_found_only: 0, neither: 0 };

    const pct = (n, total) => total > 0 ? Math.round((n / total) * 100) : 0;

    const renderRow = (label, week, month) => `
        <tr>
            <td>${escapeHtml(label)}</td>
            <td><strong>${week.toLocaleString()}</strong> <span class="sources-cell-small">(${pct(week, tw.total)}%)</span></td>
            <td>${month.toLocaleString()} <span class="sources-cell-small">(${pct(month, l30.total)}%)</span></td>
        </tr>
    `;

    const html = `
        <div class="modal active" id="reconciliation-modal" onclick="if(event.target===this)closeReconciliationModal()">
            <div class="modal-content" style="max-width:640px;">
                <div class="modal-header">
                    <h2><i class="fa-solid fa-chart-simple"></i> דוח התאמה שבועי</h2>
                    <button class="modal-close" onclick="closeReconciliationModal()"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <p style="color:var(--text-secondary);margin-bottom:1rem;">
                        סיכום איכות נתוני המקור — השבוע מול 30 הימים האחרונים. ככל שיותר לידים מסומנים כ"שניהם" או "UTM בלבד" — איכות הנתונים גבוהה יותר. עלייה ב-"אף אחד" = איתות לבדוק שה-UTM מופיע בכל קישור פרסומי.
                    </p>
                    <table class="sources-table">
                        <thead><tr><th>קטגוריה</th><th>השבוע</th><th>30 יום</th></tr></thead>
                        <tbody>
                            ${renderRow('סך הכל לידים',                 tw.total,            l30.total)}
                            ${renderRow('שניהם (UTM + דיווח עצמי)',     tw.both,             l30.both)}
                            ${renderRow('UTM בלבד',                      tw.utm_only,         l30.utm_only)}
                            ${renderRow('דיווח עצמי בלבד',               tw.how_found_only,   l30.how_found_only)}
                            ${renderRow('אף אחד (לא ידוע)',              tw.neither,          l30.neither)}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container.firstElementChild);
}

function closeReconciliationModal() {
    const m = document.getElementById('reconciliation-modal');
    if (m) m.remove();
}
