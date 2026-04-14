// admin-segments.js — "פילוח ופילטרים" tab
// ============================================================================
// Cross-cutting CRM segmentation: KPI strip + pre-built breakdowns +
// custom audience filter builder. Reuses Smart Automations FIELD_REGISTRY
// and /api/automations/preview for ad-hoc counts.
//
// Backend: admin_segments_overview() (migration 061) returns one JSONB blob
// with all KPIs and breakdowns. Custom builder calls fetchAudiencePreview()
// from admin-automations.js (already shipped in commit ba5e255).
// ============================================================================

let _segmentsCache = null;
let _segmentsCacheTime = 0;
const SEGMENTS_CACHE_TTL = 5 * 60 * 1000;
let _segCustomFilter = { all: [{ field: 'lessons_completed', op: '>', value: 5 }] };
let _segCustomTimer = null;

const SEG_STAGE_LABELS = {
    new: 'חדש',
    contacted: 'נוצר קשר',
    follow_up: 'מעקב',
    presentation: 'הצגה',
    negotiation: 'משא ומתן',
    won: 'נסגר',
    lost: 'לא רלוונטי',
    'ללא שלב': 'ללא שלב',
};

const SEG_ROLE_LABELS = {
    admin: 'מנהל',
    therapist: 'מטפל',
    patient: 'מטופל',
    student: 'תלמיד',
    student_lead: 'תלמיד מתעניין',
    sales_rep: 'איש מכירות',
    paid_customer: 'לקוח משלם',
    'ללא תפקיד': 'ללא תפקיד',
};

const SEG_CHANNEL_LABELS = {
    patients: 'טופס מטופל',
    therapists: 'טופס מטפל',
    contact_requests: 'טופס יצירת קשר',
    profiles: 'הרשמה לפורטל',
    portal_questionnaires: 'שאלון פורטל',
};

// ============================================================================
// LOAD
// ============================================================================
async function loadSegments() {
    const view = document.getElementById('segments-view');
    if (!view) return;

    if (_segmentsCache && (Date.now() - _segmentsCacheTime) < SEGMENTS_CACHE_TTL) {
        renderSegments(_segmentsCache);
        return;
    }

    view.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i> טוען נתונים...</div>`;
    try {
        const { data, error } = await db.rpc('admin_segments_overview');
        if (error) throw error;
        _segmentsCache = data;
        _segmentsCacheTime = Date.now();
        renderSegments(data);
    } catch (err) {
        console.error('admin_segments_overview failed', err);
        view.innerHTML = `<div class="empty-state seg-error">שגיאה בטעינה: ${escapeHtml(err.message || String(err))}</div>`;
    }
}

function refreshSegments() {
    _segmentsCache = null;
    loadSegments();
}

// ============================================================================
// RENDER
// ============================================================================
function renderSegments(data) {
    const view = document.getElementById('segments-view');
    if (!view) return;

    const k = data.kpis || {};
    const deltaToday = k.signups_today - k.signups_yesterday;
    const deltaSign = deltaToday > 0 ? '+' : '';

    view.innerHTML = `
        <div class="seg-toolbar">
            <h1 class="page-title" style="margin:0;">
                <i class="fa-solid fa-chart-pie" style="color:var(--gold);margin-left:0.5rem;"></i>
                פילוח ופילטרים
            </h1>
            <button class="btn btn-secondary" onclick="refreshSegments()">
                <i class="fa-solid fa-arrows-rotate"></i> רענן
            </button>
        </div>
        <p style="color:var(--text-secondary,#aaa);margin:0 0 1.5rem;font-size:0.9rem;">
            תמונת מצב חיה של כל הנרשמים — מ-5 מסלולי הרשמה (טופס מטופל, טופס מטפל, יצירת קשר, הרשמה לפורטל, שאלון פורטל). כל המספרים מחושבים לפי שעון ישראל.
        </p>

        <div class="seg-kpi-grid">
            ${renderKpiCard('נרשמו היום', k.signups_today, `<span class="seg-delta ${deltaToday >= 0 ? 'up' : 'down'}">${deltaSign}${deltaToday}</span> מאתמול`, 'fa-calendar-day')}
            ${renderKpiCard('7 ימים אחרונים', k.signups_7d, 'נרשמים חדשים', 'fa-calendar-week')}
            ${renderKpiCard('30 ימים אחרונים', k.signups_30d, 'נרשמים חדשים', 'fa-calendar')}
            ${renderKpiCard('הגיעו מפייסבוק', k.from_facebook, `אינסטגרם: ${k.from_instagram}`, 'fa-share-nodes')}
            ${renderKpiCard('למדו 5+ שיעורים', k.lessons_gt5, `10+ שיעורים: ${k.lessons_gte10}`, 'fa-graduation-cap')}
            ${renderKpiCard('לקוחות משלמים', data.active_paying || 0, `בפייפליין: ${data.pipeline_open || 0}`, 'fa-crown')}
            ${renderAbandonKpiCard(k)}
        </div>

        <div class="seg-breakdowns">
            ${renderBreakdownPanel('לפי מסלול הרשמה', 'fa-route', data.by_channel, 'channel', SEG_CHANNEL_LABELS)}
            ${renderBreakdownPanel('לפי מקור הגעה (UTM / דיווח עצמי)', 'fa-bullhorn', data.by_source, 'source', null)}
            ${renderBreakdownPanel('לפי כמות שיעורים שהושלמו (משתמשים עם חשבון)', 'fa-graduation-cap', data.by_lessons, 'bucket', null)}
            ${renderBreakdownPanel('לפי שלב מכירה (משתמשים עם חשבון)', 'fa-funnel-dollar', data.by_stage, 'stage', SEG_STAGE_LABELS)}
            ${renderBreakdownPanel('לפי תפקיד (משתמשים עם חשבון)', 'fa-user-tag', data.by_role, 'role', SEG_ROLE_LABELS)}
        </div>

        <div class="seg-builder">
            <div class="seg-builder-head">
                <h3><i class="fa-solid fa-sliders" style="color:var(--gold);"></i> בונה סגמנט מותאם אישית</h3>
                <p>בחר תנאים — נספור משתמשים בזמן אמת מאותה מאגר נתונים שמוביל את האוטומציות.</p>
            </div>
            <div id="seg-custom-count" class="auto-live-count-badge"></div>
            <div id="seg-custom-conditions"></div>
            <button class="btn btn-secondary" onclick="segAddCondition()">
                <i class="fa-solid fa-plus"></i> הוסף תנאי
            </button>
            <div class="seg-builder-actions">
                <button class="btn btn-primary" onclick="segSaveAsAutomation()">
                    <i class="fa-solid fa-bolt"></i> שמור כאוטומציה
                </button>
            </div>
            <div id="seg-custom-sample"></div>
        </div>

        <div class="seg-footer">
            עודכן: ${formatDateTime(data.generated_at)}
        </div>
    `;

    // Boot the custom builder (load FIELD_REGISTRY then render rows + run preview)
    bootCustomBuilder();
}

function renderKpiCard(label, value, sub, icon) {
    return `
        <div class="seg-kpi">
            <div class="seg-kpi-icon"><i class="fa-solid ${icon}"></i></div>
            <div class="seg-kpi-body">
                <div class="seg-kpi-label">${escapeHtml(label)}</div>
                <div class="seg-kpi-value">${(value ?? 0).toLocaleString('he-IL')}</div>
                <div class="seg-kpi-sub">${sub}</div>
            </div>
        </div>
    `;
}

function renderAbandonKpiCard(k) {
    const recent = k.abandoned_recent ?? 0;
    const total = k.abandoned_total ?? 0;
    const today = k.abandoned_today ?? 0;
    return `
        <div class="seg-kpi seg-kpi-warn">
            <div class="seg-kpi-icon"><i class="fa-solid fa-user-xmark"></i></div>
            <div class="seg-kpi-body">
                <div class="seg-kpi-label">נרשמו אך לא מילאו שאלון</div>
                <div class="seg-kpi-value">${recent.toLocaleString('he-IL')}</div>
                <div class="seg-kpi-sub">השבוע · סה"כ אי-פעם: ${total.toLocaleString('he-IL')} · היום: ${today.toLocaleString('he-IL')}</div>
                <button class="seg-reengage-btn" onclick="segLaunchReengageAutomation()">
                    <i class="fa-solid fa-paper-plane"></i> בנה אוטומציית תזכורת
                </button>
            </div>
        </div>
    `;
}

function renderBreakdownPanel(title, icon, rows, key, labelMap) {
    const safeRows = rows || [];
    const total = safeRows.reduce((sum, r) => sum + (r.count || 0), 0) || 1;
    const body = safeRows.length
        ? safeRows.map(r => {
            const rawLabel = r[key] ?? '—';
            const label = labelMap && labelMap[rawLabel] ? labelMap[rawLabel] : rawLabel;
            const pct = Math.round((r.count / total) * 100);
            return `
                <div class="seg-row" onclick="segUseFilter('${escapeHtml(key)}', '${escapeHtml(rawLabel)}')">
                    <div class="seg-row-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
                    <div class="seg-row-bar">
                        <div class="seg-row-bar-fill" style="width:${pct}%"></div>
                    </div>
                    <div class="seg-row-count">${(r.count || 0).toLocaleString('he-IL')}</div>
                    <div class="seg-row-pct">${pct}%</div>
                </div>
            `;
        }).join('')
        : `<div class="seg-empty">אין נתונים</div>`;

    return `
        <div class="seg-panel">
            <div class="seg-panel-head">
                <h4><i class="fa-solid ${icon}"></i> ${escapeHtml(title)}</h4>
                <span class="seg-panel-total">${safeRows.length} קטגוריות</span>
            </div>
            <div class="seg-panel-body">${body}</div>
        </div>
    `;
}

// ============================================================================
// CUSTOM BUILDER
// ============================================================================

const SEG_FIELD_TO_BREAKDOWN_OP = {
    role: { field: 'role', op: '=' },
    stage: { field: 'sales_stage', op: '=' },
    bucket: null,        // lesson buckets aren't a single value — open with no extra filter
    source: null,        // utm_source isn't in FIELD_REGISTRY yet (Phase 2)
};

function segUseFilter(dimension, rawLabel) {
    const map = SEG_FIELD_TO_BREAKDOWN_OP[dimension];
    if (!map) {
        showToast('הפילוח הזה ייתמך בבונה הסגמנט בפאזה הבאה', 'info');
        return;
    }
    _segCustomFilter = { all: [{ field: map.field, op: map.op, value: rawLabel }] };
    bootCustomBuilder();
    document.getElementById('seg-custom-conditions')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function bootCustomBuilder() {
    // Reuse the automations FIELD_REGISTRY loader
    if (typeof loadAutomationFields === 'function' && !_autoFieldsLoaded) {
        try { await loadAutomationFields(); } catch (e) { /* fallback registry already set */ }
    }
    renderSegConditions();
    scheduleSegPreview();
}

function renderSegConditions() {
    const host = document.getElementById('seg-custom-conditions');
    if (!host) return;
    const fields = (typeof _autoFields !== 'undefined' && _autoFields.length) ? _autoFields : [];
    const ops = (typeof _autoOps !== 'undefined' && _autoOps.length) ? _autoOps : ['=','!=','>','>=','<','<='];
    const opLabels = (typeof OP_LABELS !== 'undefined') ? OP_LABELS : {};

    host.innerHTML = (_segCustomFilter.all || []).map((cond, idx) => {
        const fieldDef = fields.find(f => f.key === cond.field) || fields[0] || { type: 'number' };
        const opOptions = ops
            .filter(op => segIsOpValid(op, fieldDef?.type))
            .map(op => `<option value="${op}" ${cond.op === op ? 'selected' : ''}>${opLabels[op] || op}</option>`)
            .join('');

        let valueInput = '';
        if (['is_true','is_false','is_null','is_not_null'].includes(cond.op)) {
            valueInput = '<span class="seg-no-value">(אין צורך בערך)</span>';
        } else if (fieldDef?.type === 'enum') {
            valueInput = `<select class="auto-input small" onchange="segUpdateCond(${idx},'value',this.value)">
                ${(fieldDef.options || []).map(o => `<option value="${o}" ${cond.value === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>`;
        } else if (fieldDef?.type === 'number') {
            valueInput = `<input type="number" class="auto-input small" value="${cond.value ?? 0}"
                          oninput="segUpdateCond(${idx},'value',Number(this.value))" />`;
        } else {
            valueInput = `<input type="text" class="auto-input small" value="${escapeHtml(cond.value || '')}"
                          oninput="segUpdateCond(${idx},'value',this.value)" />`;
        }

        return `
            <div class="auto-condition-row">
                <select class="auto-input" onchange="segUpdateCond(${idx},'field',this.value)">
                    ${fields.map(f => `<option value="${f.key}" ${cond.field === f.key ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}
                </select>
                <select class="auto-input small" onchange="segUpdateCond(${idx},'op',this.value)">${opOptions}</select>
                ${valueInput}
                <button class="btn-icon danger" onclick="segRemoveCond(${idx})"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
    }).join('');
}

function segIsOpValid(op, type) {
    if (type === 'boolean') return ['is_true', 'is_false'].includes(op);
    if (type === 'number') return ['=','!=','>','>=','<','<=','is_null','is_not_null'].includes(op);
    if (type === 'enum') return ['=','!=','in','not_in','is_null','is_not_null'].includes(op);
    return ['=','!=','is_null','is_not_null'].includes(op);
}

function segUpdateCond(idx, key, value) {
    const cond = _segCustomFilter.all[idx];
    if (!cond) return;
    cond[key] = value;
    if (key === 'field') {
        const fields = (typeof _autoFields !== 'undefined') ? _autoFields : [];
        const def = fields.find(f => f.key === value);
        if (def?.type === 'boolean') { cond.op = 'is_true'; cond.value = true; }
        else if (def?.type === 'number') { cond.op = '>'; cond.value = 0; }
        else if (def?.type === 'enum') { cond.op = '='; cond.value = (def.options || [''])[0]; }
        else { cond.op = '='; cond.value = ''; }
        renderSegConditions();
    }
    scheduleSegPreview();
}

function segAddCondition() {
    _segCustomFilter.all.push({ field: 'lessons_completed', op: '>', value: 1 });
    renderSegConditions();
    scheduleSegPreview();
}

function segRemoveCond(idx) {
    _segCustomFilter.all.splice(idx, 1);
    renderSegConditions();
    scheduleSegPreview();
}

function scheduleSegPreview() {
    clearTimeout(_segCustomTimer);
    const badge = document.getElementById('seg-custom-count');
    if (badge) badge.innerHTML = '<span class="auto-count-loading">בודק...</span>';
    _segCustomTimer = setTimeout(runSegPreview, 350);
}

async function runSegPreview() {
    const badge = document.getElementById('seg-custom-count');
    const sampleEl = document.getElementById('seg-custom-sample');
    if (!badge) return;

    if (typeof fetchAudiencePreview !== 'function') {
        badge.innerHTML = '<span class="auto-count-pill err">חסר חיבור לבונה האוטומציות</span>';
        return;
    }

    // Build a minimal rule shape that the bot endpoint expects
    const rule = {
        name: '__segments_preview__',
        audience_filter: JSON.parse(JSON.stringify(_segCustomFilter)),
        action_type: 'whatsapp',
        action_config: { message_template: ' ' },
    };

    try {
        const data = await fetchAudiencePreview(rule);
        const total = data.total ?? 0;
        const cls = total === 0 ? 'zero' : 'ok';
        badge.innerHTML = `<span class="auto-count-pill ${cls}"><strong>${total}</strong> משתמשים תואמים</span>`;

        const seen = new Set();
        const dedup = (data.sample || []).filter(u => {
            const k = u.phone_masked || u.full_name;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
        if (sampleEl) {
            sampleEl.innerHTML = dedup.length
                ? `<div class="auto-sample-list">
                    <div class="auto-sample-title">דוגמה ל-${dedup.length} מהם:</div>
                    ${dedup.map(u => `
                        <div class="auto-sample-row">
                            <span>${escapeHtml(u.full_name || '—')}</span>
                            <span class="auto-sample-phone">${escapeHtml(u.phone_masked || '')}</span>
                            <span class="auto-sample-lessons">${u.lessons_completed ?? 0} שיעורים</span>
                        </div>
                    `).join('')}
                </div>`
                : '';
        }
    } catch (err) {
        badge.innerHTML = `<span class="auto-count-pill err">שגיאה: ${escapeHtml(err.message || '')}</span>`;
    }
}

function segLaunchReengageAutomation() {
    const preset = {
        all: [
            { field: 'filled_questionnaire', op: 'is_false' },
            { field: 'days_since_signup', op: '<=', value: 7 },
            { field: 'has_phone', op: 'is_true' },
        ],
    };
    const message = 'היי {{first_name}} 👋\nראינו שנרשמת לפורטל אבל עדיין לא מילאת את השאלון הקצר.\nזה לוקח שתי דקות ועוזר לנו להתאים לך בדיוק את התוכן שיעניין אותך:\nhttps://www.therapist-home.com/pages/portal-questionnaire.html';
    segLaunchAutomationWithFilter(preset, 'תזכורת למי שלא מילא שאלון', message);
}

function segLaunchAutomationWithFilter(filter, name, messageTemplate) {
    if (typeof openAutomationEditor !== 'function' || typeof _autoEditing === 'undefined') {
        showToast('בונה האוטומציות לא נטען', 'error');
        return;
    }
    const navItems = document.querySelectorAll('.nav-item');
    let target = null;
    navItems.forEach(el => {
        if (el.getAttribute('onclick')?.includes("'automations'")) target = el;
    });
    if (target) target.click();
    setTimeout(() => {
        openAutomationEditor(null);
        if (window._autoEditing) {
            window._autoEditing.audience_filter = JSON.parse(JSON.stringify(filter));
            window._autoEditing.name = name;
            if (messageTemplate) {
                window._autoEditing.action_config = { message_template: messageTemplate };
            }
            if (typeof renderAutomationEditor === 'function') renderAutomationEditor();
        }
    }, 200);
}

function segSaveAsAutomation() {
    segLaunchAutomationWithFilter(_segCustomFilter, 'סגמנט מהפילוחים', null);
}
