// admin-automations.js — Smart Automations Rule Builder
// ============================================================================
// Phase 1: schedule triggers, AND-only audience filter, single WhatsApp action,
// dry_run by default, cooldown + daily cap + preview + test send + run history.
// Backend: SECURITY DEFINER RPCs (admin_automations_*) + crm-bot endpoints
// at /api/automations/{preview,test-send,run-now/:id,fields}.
// ============================================================================

let _autoRules = [];
let _autoStats = new Map();
let _autoFields = [];
let _autoOps = [];
let _autoEditing = null;        // currently-edited rule object (in-memory)
let _autoFieldsLoaded = false;
let _autoFieldsLoading = null;  // in-flight promise guard
let _autoAudienceCounts = new Map();  // rule_id → { total, fetched_at }
const _autoCountCache = new Map();    // filter_hash → { total, fetched_at } (5min TTL)
let _autoLivePreviewTimer = null;
const AUTO_COUNT_TTL_MS = 5 * 60 * 1000;

// Valid cron: 5 whitespace-separated fields with digits, *, /, -, ,
const CRON_REGEX = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;

const OP_LABELS = {
    '=': 'שווה ל',
    '!=': 'שונה מ',
    '>': 'גדול מ',
    '>=': 'גדול או שווה',
    '<': 'קטן מ',
    '<=': 'קטן או שווה',
    'in': 'אחד מהערכים',
    'not_in': 'אף אחד מהערכים',
    'is_true': 'הוא כן',
    'is_false': 'הוא לא',
    'is_null': 'ריק',
    'is_not_null': 'לא ריק',
};

const TEMPLATE_VARS = ['first_name', 'full_name', 'lessons_completed', 'role'];

const RULE_TEMPLATES = [
    {
        name: 'מי שסיים מעל 5 שיעורים',
        description: 'דחיפה רכה ללומדים מתקדמים להמשיך לחלק ב\'',
        cron: '0 14 * * *',
        cron_label: 'כל יום ב-14:00',
        filter: { all: [
            { field: 'lessons_completed', op: '>', value: 5 },
            { field: 'has_phone', op: 'is_true' },
        ]},
        message: 'היי {{first_name}} 👋\nראיתי שסיימת {{lessons_completed}} שיעורים — כל הכבוד!\nהחלק השני של הקורס מחכה לך כאן:\nhttps://www.therapist-home.com/course-library.html',
    },
    {
        name: 'התראה ללידים שלא הגיבו 7 ימים',
        description: 'תזכורת ללידים שנמצאים בשלב follow_up יותר משבוע',
        cron: '0 10 * * 1-5',
        cron_label: 'כל יום בעבודה ב-10:00',
        filter: { all: [
            { field: 'sales_stage', op: '=', value: 'follow_up' },
            { field: 'sales_stage_days', op: '>', value: 7 },
            { field: 'has_phone', op: 'is_true' },
        ]},
        message: 'שלום {{first_name}}, רציתי לחזור אלייך לגבי השיחה שלנו 🙂\nאשמח לדבר רגע — מתי נוח לך השבוע?',
    },
    {
        name: 'מי שלא מילא שאלון פורטל',
        description: 'אחרי 3 ימים מההרשמה, מי שעדיין לא מילא את השאלון',
        cron: '0 11 * * *',
        cron_label: 'כל יום ב-11:00',
        filter: { all: [
            { field: 'days_since_signup', op: '>=', value: 3 },
            { field: 'filled_questionnaire', op: 'is_false' },
            { field: 'has_phone', op: 'is_true' },
        ]},
        message: 'היי {{first_name}}, ראיתי שעדיין לא השלמת את שאלון ההיכרות 💛\nזה לוקח 2 דקות ועוזר לנו להתאים לך את התוכן הכי מדויק:\nhttps://www.therapist-home.com/pages/portal-questionnaire.html',
    },
    {
        name: 'תזכורת 30 דק׳ אחרי הרשמה למי שלא מילא שאלון',
        description: 'שולחת WhatsApp אוטומטי כ-30 דקות אחרי שמישהו נרשם לפורטל אם הוא עדיין לא מילא את השאלון',
        cron: '*/5 * * * *',
        cron_label: 'כל 5 דקות',
        filter: { all: [
            { field: 'minutes_since_signup', op: '>=', value: 30 },
            { field: 'minutes_since_signup', op: '<',  value: 120 },
            { field: 'filled_questionnaire', op: 'is_false' },
            { field: 'has_phone', op: 'is_true' },
        ]},
        message: 'היי {{first_name}} 👋\nראיתי שנרשמת לפורטל לפני זמן קצר אבל עדיין לא מילאת את השאלון הקצר.\nזה לוקח שתי דקות ועוזר לנו להתאים לך בדיוק את התוכן שיעניין אותך:\nhttps://www.therapist-home.com/pages/portal-questionnaire.html',
    },
];

const CRON_PRESETS = [
    { value: '*/5 * * * *', label: 'כל 5 דקות' },
    { value: '0 9 * * *', label: 'כל יום ב-09:00' },
    { value: '0 14 * * *', label: 'כל יום ב-14:00' },
    { value: '0 10 * * 1-5', label: 'ימי חול ב-10:00' },
    { value: '0 11 * * 0', label: 'יום ראשון ב-11:00' },
    { value: '0 12 1 * *', label: 'הראשון לחודש ב-12:00' },
];

// ============================================================================
// LOAD
// ============================================================================
async function loadAutomations() {
    try {
        if (!_autoFieldsLoaded) await loadAutomationFields();

        const [{ data: rules, error: rulesErr }, { data: stats }] = await Promise.all([
            db.rpc('admin_automations_list'),
            db.rpc('admin_automations_stats'),
        ]);
        if (rulesErr) throw rulesErr;

        _autoRules = rules || [];
        _autoStats = new Map((stats || []).map(s => [s.rule_id, s]));
        renderAutomations();
        // Best-effort: fetch audience count per rule in parallel, then re-render cards
        fetchAllCardAudienceCounts();
    } catch (err) {
        console.error('❌ loadAutomations:', err);
        const list = document.getElementById('automations-list');
        if (list) list.innerHTML = `<div class="empty-state">שגיאה בטעינה: ${escapeHtml(err.message || String(err))}</div>`;
    }
}

async function loadAutomationFields() {
    if (_autoFieldsLoaded) return;
    if (_autoFieldsLoading) return _autoFieldsLoading;
    _autoFieldsLoading = (async () => {
    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) throw new Error('לא מחובר');
        const resp = await fetch(BOT_URL + '/api/automations/fields', {
            headers: { 'Authorization': 'Bearer ' + session.access_token },
        });
        if (!resp.ok) throw new Error('Failed to load fields');
        const data = await resp.json();
        _autoFields = data.fields || [];
        _autoOps = data.ops || [];
        _autoFieldsLoaded = true;
    } catch (err) {
        console.warn('⚠️ Could not load field registry from bot — using fallback', err);
        // Hardcoded fallback so the UI works even if the bot is down
        _autoFields = [
            { key: 'lessons_completed', label: 'מספר שיעורים שהושלמו', type: 'number' },
            { key: 'last_lesson_days_ago', label: 'ימים מאז השיעור האחרון', type: 'number' },
            { key: 'role', label: 'תפקיד', type: 'enum', options: ['admin','therapist','patient','student_lead','student','sales_rep','paid_customer'] },
            { key: 'days_since_signup', label: 'ימים מאז הרשמה', type: 'number' },
            { key: 'minutes_since_signup', label: 'דקות מאז הרשמה', type: 'number' },
            { key: 'sales_stage', label: 'שלב מכירה', type: 'enum', options: ['new','contacted','follow_up','presentation','negotiation','won','lost'] },
            { key: 'sales_stage_days', label: 'ימים בשלב הנוכחי', type: 'number' },
            { key: 'has_phone', label: 'יש מספר טלפון', type: 'boolean' },
            { key: 'filled_questionnaire', label: 'מילא שאלון פורטל', type: 'boolean' },
            { key: 'is_paying', label: 'לקוח משלם פעיל', type: 'boolean' },
        ];
        _autoOps = ['=','!=','>','>=','<','<=','in','not_in','is_true','is_false','is_null','is_not_null'];
        _autoFieldsLoaded = true;
    }
    })();
    try { await _autoFieldsLoading; } finally { _autoFieldsLoading = null; }
}

// ============================================================================
// RENDER — list view
// ============================================================================
function renderAutomations() {
    const list = document.getElementById('automations-list');
    if (!list) return;

    if (!_autoRules.length) {
        list.innerHTML = `
            <div class="empty-state" style="text-align:center;padding:3rem 1rem;">
                <i class="fa-solid fa-bolt" style="font-size:3rem;color:var(--gold);opacity:0.4;"></i>
                <h3 style="margin:1rem 0 0.5rem;color:var(--frost-white);">עדיין אין כללים</h3>
                <p style="color:#999;margin-bottom:1.5rem;">צור כלל אוטומציה ראשון או בחר תבנית מוכנה למטה</p>
                ${renderTemplates()}
            </div>
        `;
        return;
    }

    const cards = _autoRules.map(renderRuleCard).join('');
    list.innerHTML = `
        <div class="automations-toolbar">
            <button class="btn btn-primary" onclick="openAutomationEditor(null)">
                <i class="fa-solid fa-plus"></i> כלל חדש
            </button>
            <span class="auto-count">${_autoRules.length} כללים · ${_autoRules.filter(r => r.is_enabled).length} פעילים</span>
        </div>
        <div class="automations-grid">${cards}</div>
        <div class="auto-templates-section">
            <h3>תבניות מוכנות</h3>
            ${renderTemplates()}
        </div>
    `;
}

function renderTemplates() {
    return `<div class="auto-templates-grid">
        ${RULE_TEMPLATES.map((t, i) => `
            <div class="auto-template-card" onclick="useAutomationTemplate(${i})">
                <div class="auto-template-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                <div class="auto-template-name">${escapeHtml(t.name)}</div>
                <div class="auto-template-desc">${escapeHtml(t.description)}</div>
                <div class="auto-template-cron"><i class="fa-solid fa-clock"></i> ${escapeHtml(t.cron_label)}</div>
            </div>
        `).join('')}
    </div>`;
}

function renderRuleCard(rule) {
    const stats = _autoStats.get(rule.id) || {};
    const cronExpr = rule.trigger_config?.cron || '—';
    const cronLabel = humanizeCron(cronExpr);
    const conditions = (rule.audience_filter?.all || []).length;
    const enabledClass = rule.is_enabled ? 'enabled' : 'disabled';
    const audienceCount = _autoAudienceCounts.has(rule.id) ? _autoAudienceCounts.get(rule.id) : null;
    const audienceBadge = audienceCount !== null
        ? `<span class="auto-audience-badge" title="כמה משתמשים תואמים כרגע לתנאי הכלל"><i class="fa-solid fa-users"></i> ${audienceCount} תואמים</span>`
        : `<span class="auto-audience-badge loading"><i class="fa-solid fa-circle-notch fa-spin"></i> בודק...</span>`;
    const dryBadge = rule.dry_run
        ? '<span class="auto-badge auto-badge-dry">מצב תרגול</span>'
        : '<span class="auto-badge auto-badge-live">חי</span>';
    const lastFired = stats.last_fired
        ? `הרצה אחרונה: ${formatDateTime(stats.last_fired)}`
        : 'עדיין לא רץ';

    return `
        <div class="automation-card ${enabledClass}">
            <div class="auto-card-head">
                <label class="auto-toggle">
                    <input type="checkbox" ${rule.is_enabled ? 'checked' : ''}
                           onchange="toggleAutomationEnabled('${rule.id}', this.checked)">
                    <span class="auto-toggle-slider"></span>
                </label>
                <div class="auto-card-title">
                    <h3>${escapeHtml(rule.name || 'ללא שם')}</h3>
                    <div class="auto-card-meta">
                        ${dryBadge}
                        ${audienceBadge}
                        <span><i class="fa-solid fa-clock"></i> ${escapeHtml(cronLabel)}</span>
                        <span><i class="fa-solid fa-filter"></i> ${conditions} תנאים</span>
                    </div>
                </div>
                <div class="auto-card-actions">
                    <button class="btn-icon" title="ערוך" onclick="openAutomationEditor('${rule.id}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-icon" title="הפעל עכשיו" onclick="runAutomationNow('${rule.id}')">
                        <i class="fa-solid fa-play"></i>
                    </button>
                    <button class="btn-icon" title="היסטוריה" onclick="viewAutomationRuns('${rule.id}')">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                    </button>
                    <button class="btn-icon" title="שכפל" onclick="cloneAutomation('${rule.id}')">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                    <button class="btn-icon danger" title="מחק" onclick="deleteAutomation('${rule.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            ${rule.description ? `<p class="auto-card-desc">${escapeHtml(rule.description)}</p>` : ''}
            <div class="auto-card-stats">
                <div class="auto-stat">
                    <div class="auto-stat-num">${stats.sent_today || 0}</div>
                    <div class="auto-stat-label">היום</div>
                </div>
                <div class="auto-stat">
                    <div class="auto-stat-num">${stats.sent_7d || 0}</div>
                    <div class="auto-stat-label">7 ימים</div>
                </div>
                <div class="auto-stat">
                    <div class="auto-stat-num">${stats.total_sent || 0}</div>
                    <div class="auto-stat-label">סה״כ</div>
                </div>
                ${stats.failed_7d ? `<div class="auto-stat error"><div class="auto-stat-num">${stats.failed_7d}</div><div class="auto-stat-label">שגיאות 7d</div></div>` : ''}
            </div>
            <div class="auto-card-footer">${lastFired}</div>
        </div>
    `;
}

// ============================================================================
// EDITOR — modal form
// ============================================================================
function openAutomationEditor(ruleId) {
    if (!_autoFieldsLoaded) {
        loadAutomationFields().then(() => openAutomationEditor(ruleId));
        return;
    }

    if (ruleId) {
        _autoEditing = JSON.parse(JSON.stringify(_autoRules.find(r => r.id === ruleId) || {}));
    } else {
        _autoEditing = {
            name: '',
            description: '',
            is_enabled: false,
            dry_run: true,
            trigger_type: 'schedule',
            trigger_config: { cron: '0 14 * * *' },
            audience_filter: { all: [{ field: 'lessons_completed', op: '>', value: 5 }] },
            action_type: 'whatsapp',
            action_config: { message_template: 'היי {{first_name}}!\n\n' },
            cooldown_days: 9999,
            daily_cap: 100,
        };
    }

    renderAutomationEditor();
    document.getElementById('automation-editor-modal').classList.add('active');
}

function closeAutomationEditor() {
    document.getElementById('automation-editor-modal').classList.remove('active');
    _autoEditing = null;
}

function renderAutomationEditor() {
    const r = _autoEditing;
    if (!r) return;
    const body = document.getElementById('automation-editor-body');

    const conditionsHtml = (r.audience_filter.all || []).map((cond, i) => renderConditionRow(cond, i)).join('');

    const cronCustom = !CRON_PRESETS.find(p => p.value === (r.trigger_config?.cron || ''));

    body.innerHTML = `
        <div class="auto-edit-section">
            <h4>1. שם וכותרת</h4>
            <input type="text" id="auto-edit-name" class="auto-input" placeholder="לדוגמה: דחיפה ללומדים מתקדמים"
                   value="${escapeHtml(r.name || '')}" />
            <textarea id="auto-edit-desc" class="auto-input" rows="2" placeholder="תיאור קצר למה הכלל קיים">${escapeHtml(r.description || '')}</textarea>
        </div>

        <div class="auto-edit-section">
            <h4>2. מתי להפעיל</h4>
            <div class="auto-cron-row">
                <select id="auto-cron-preset" class="auto-input" onchange="onAutomationCronPresetChange()">
                    ${CRON_PRESETS.map(p => `<option value="${p.value}" ${(r.trigger_config?.cron === p.value) ? 'selected' : ''}>${p.label}</option>`).join('')}
                    <option value="__custom__" ${cronCustom ? 'selected' : ''}>מותאם אישית (cron)</option>
                </select>
                <input type="text" id="auto-cron-custom" class="auto-input ${cronCustom ? '' : 'hidden'}"
                       placeholder="0 14 * * *" value="${escapeHtml(r.trigger_config?.cron || '')}" />
            </div>
            <div class="auto-help">פורמט cron של 5 שדות (דקה שעה יום-בחודש חודש יום-בשבוע). לדוגמה: <code>0 14 * * *</code> = כל יום ב-14:00.</div>
        </div>

        <div class="auto-edit-section">
            <h4>3. למי לשלוח <span class="auto-help-inline">(תנאים מתחברים ב-AND)</span></h4>
            <div id="auto-live-count-badge" class="auto-live-count-badge"></div>
            <div id="auto-conditions-list">${conditionsHtml}</div>
            <button class="btn btn-secondary" onclick="addAutomationCondition()">
                <i class="fa-solid fa-plus"></i> הוסף תנאי
            </button>
            <div class="auto-preview-row">
                <button class="btn btn-secondary" onclick="previewAutomation()">
                    <i class="fa-solid fa-eye"></i> תצוגה מפורטת (דוגמה)
                </button>
                <span id="auto-preview-result" class="auto-preview-result"></span>
            </div>
            <div id="auto-preview-sample"></div>
        </div>

        <div class="auto-edit-section">
            <h4>4. מה לשלוח</h4>
            <textarea id="auto-edit-message" class="auto-input" rows="6"
                      placeholder="הקלד את ההודעה. השתמש ב-{{משתנה}} להחלפה דינמית."
                      oninput="renderAutomationLivePreview()">${escapeHtml(r.action_config?.message_template || '')}</textarea>
            <div class="auto-vars-chips">
                ${TEMPLATE_VARS.map(v => `<span class="auto-var-chip" onclick="insertAutomationVar('${v}')">{{${v}}}</span>`).join('')}
            </div>
            <div id="auto-live-preview" class="auto-live-preview"></div>
        </div>

        <div class="auto-edit-section">
            <h4>5. בטיחות</h4>
            <label class="auto-checkbox-row">
                <input type="checkbox" id="auto-dry-run" ${r.dry_run ? 'checked' : ''} />
                <div>
                    <strong>מצב תרגול</strong>
                    <div class="auto-help">הכלל ירוץ ויירשם, אבל לא יישלח שום וואטסאפ. הסר את הסימון רק אחרי שאתה בטוח.</div>
                </div>
            </label>
            <div class="auto-input-row">
                <label>מקסימום משלוחים ביום</label>
                <input type="number" id="auto-daily-cap" class="auto-input small" value="${r.daily_cap || 100}" min="1" max="1000" />
            </div>
            <div class="auto-input-row">
                <label>אל תשלח שוב לאותו אדם במשך X ימים</label>
                <input type="number" id="auto-cooldown" class="auto-input small" value="${r.cooldown_days || 9999}" min="0" max="9999" />
                <div class="auto-help">9999 = לעולם לא לשלוח שוב. 0 = אין הגבלה.</div>
            </div>
        </div>
    `;

    document.getElementById('automation-editor-title').textContent = r.id ? `ערוך כלל: ${r.name}` : 'כלל חדש';
    scheduleLivePreview();
}

function renderConditionRow(cond, idx) {
    const fieldDef = _autoFields.find(f => f.key === cond.field) || _autoFields[0];
    const opOptions = _autoOps
        .filter(op => isOpValidForType(op, fieldDef?.type))
        .map(op => `<option value="${op}" ${cond.op === op ? 'selected' : ''}>${OP_LABELS[op] || op}</option>`)
        .join('');

    let valueInput = '';
    if (['is_true','is_false','is_null','is_not_null'].includes(cond.op)) {
        valueInput = '<span style="color:#777;align-self:center;">(אין צורך בערך)</span>';
    } else if (fieldDef?.type === 'enum') {
        valueInput = `<select class="auto-input small" onchange="updateConditionField(${idx},'value',this.value)">
            ${(fieldDef.options || []).map(opt => `<option value="${opt}" ${cond.value === opt ? 'selected' : ''}>${opt}</option>`).join('')}
        </select>`;
    } else if (fieldDef?.type === 'number') {
        valueInput = `<input type="number" class="auto-input small" value="${cond.value ?? 0}" oninput="updateConditionField(${idx},'value',Number(this.value))" />`;
    } else {
        valueInput = `<input type="text" class="auto-input small" value="${escapeHtml(cond.value || '')}" oninput="updateConditionField(${idx},'value',this.value)" />`;
    }

    return `
        <div class="auto-condition-row">
            <select class="auto-input" onchange="updateConditionField(${idx},'field',this.value)">
                ${_autoFields.map(f => `<option value="${f.key}" ${cond.field === f.key ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}
            </select>
            <select class="auto-input small" onchange="updateConditionField(${idx},'op',this.value)">${opOptions}</select>
            ${valueInput}
            <button class="btn-icon danger" onclick="removeAutomationCondition(${idx})"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `;
}

function isOpValidForType(op, type) {
    if (type === 'boolean') return ['is_true', 'is_false'].includes(op);
    if (type === 'number') return ['=','!=','>','>=','<','<=','is_null','is_not_null'].includes(op);
    if (type === 'enum') return ['=','!=','in','not_in','is_null','is_not_null'].includes(op);
    return ['=','!=','is_null','is_not_null'].includes(op);
}

function onAutomationCronPresetChange() {
    const sel = document.getElementById('auto-cron-preset');
    const custom = document.getElementById('auto-cron-custom');
    if (sel.value === '__custom__') {
        custom.classList.remove('hidden');
        custom.focus();
    } else {
        custom.classList.add('hidden');
        custom.value = sel.value;
        _autoEditing.trigger_config.cron = sel.value;
    }
}

function updateConditionField(idx, key, value) {
    const cond = _autoEditing.audience_filter.all[idx];
    cond[key] = value;
    if (key === 'field') {
        // Reset op + value to safe defaults for the new field type
        const fieldDef = _autoFields.find(f => f.key === value);
        if (fieldDef?.type === 'boolean') { cond.op = 'is_true'; cond.value = true; }
        else if (fieldDef?.type === 'number') { cond.op = '>'; cond.value = 0; }
        else if (fieldDef?.type === 'enum') { cond.op = '='; cond.value = (fieldDef.options || [''])[0]; }
        else { cond.op = '='; cond.value = ''; }
        renderAutomationEditor();
        return;
    }
    scheduleLivePreview();
}

function addAutomationCondition() {
    _autoEditing.audience_filter.all.push({ field: 'lessons_completed', op: '>', value: 1 });
    renderAutomationEditor();
}

function removeAutomationCondition(idx) {
    _autoEditing.audience_filter.all.splice(idx, 1);
    renderAutomationEditor();
}

function insertAutomationVar(varName) {
    const ta = document.getElementById('auto-edit-message');
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const insert = `{{${varName}}}`;
    ta.value = text.slice(0, start) + insert + text.slice(end);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = start + insert.length;
    renderAutomationLivePreview();
}

function renderAutomationLivePreview() {
    const ta = document.getElementById('auto-edit-message');
    const target = document.getElementById('auto-live-preview');
    if (!ta || !target) return;
    const sample = { first_name: 'הילל', full_name: 'הילל אקנין', lessons_completed: 7, role: 'student_lead' };
    const rendered = (ta.value || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => sample[k] ?? '');
    target.innerHTML = `<div class="auto-preview-label">תצוגה מקדימה (לדוגמה: הילל אקנין)</div><div class="auto-preview-bubble">${escapeHtml(rendered).replace(/\n/g, '<br>')}</div>`;
}

// ============================================================================
// SAVE
// ============================================================================
function readEditorIntoState() {
    const r = _autoEditing;
    if (!r) return null;
    r.name = document.getElementById('auto-edit-name').value.trim();
    r.description = document.getElementById('auto-edit-desc').value.trim();

    const presetSel = document.getElementById('auto-cron-preset').value;
    const customVal = document.getElementById('auto-cron-custom').value.trim();
    r.trigger_config = { cron: presetSel === '__custom__' ? customVal : presetSel };

    r.action_config = { message_template: document.getElementById('auto-edit-message').value };
    r.dry_run = document.getElementById('auto-dry-run').checked;
    r.daily_cap = parseInt(document.getElementById('auto-daily-cap').value, 10) || 100;
    r.cooldown_days = parseInt(document.getElementById('auto-cooldown').value, 10) || 0;
    return r;
}

async function saveAutomation() {
    const r = readEditorIntoState();
    if (!r) return;
    if (!r.name) return showToast('חסר שם לכלל', 'error');
    if (!r.trigger_config.cron) return showToast('חסר לוח זמנים', 'error');
    if (!CRON_REGEX.test(r.trigger_config.cron.trim())) {
        return showToast('לוח זמנים לא חוקי (פורמט cron נדרש: "דקה שעה יום חודש יום-בשבוע")', 'error');
    }
    if (!r.action_config.message_template?.trim()) return showToast('חסרה הודעה', 'error');

    try {
        const { error } = await db.rpc('admin_automations_upsert', { rule: r });
        if (error) throw error;
        showToast('הכלל נשמר ✓', 'success');
        closeAutomationEditor();
        await loadAutomations();
    } catch (err) {
        console.error('❌ saveAutomation:', err);
        showToast('שגיאה בשמירה: ' + (err.message || err), 'error');
    }
}

async function toggleAutomationEnabled(ruleId, enabled) {
    try {
        const rule = _autoRules.find(r => r.id === ruleId);
        if (!rule) return;
        const { error } = await db.rpc('admin_automations_upsert', {
            rule: { id: ruleId, is_enabled: enabled },
        });
        if (error) throw error;
        rule.is_enabled = enabled;
        showToast(enabled ? 'הכלל הופעל' : 'הכלל הושבת', 'success');
        renderAutomations();
    } catch (err) {
        showToast('שגיאה: ' + (err.message || err), 'error');
        loadAutomations();
    }
}

function cloneAutomation(ruleId) {
    const src = _autoRules.find(r => r.id === ruleId);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    delete copy.id;
    copy.name = (copy.name || 'ללא שם') + ' (עותק)';
    copy.is_enabled = false;
    copy.dry_run = true;
    _autoEditing = copy;
    renderAutomationEditor();
    document.getElementById('automation-editor-modal').classList.add('active');
}

async function deleteAutomation(ruleId) {
    if (!confirm('למחוק את הכלל לצמיתות? פעולה זו אינה הפיכה.')) return;
    try {
        const { error } = await db.rpc('admin_automations_delete', { rule_id: ruleId });
        if (error) throw error;
        showToast('הכלל נמחק', 'success');
        await loadAutomations();
    } catch (err) {
        showToast('שגיאה במחיקה: ' + (err.message || err), 'error');
    }
}

// ============================================================================
// PREVIEW + TEST + RUN — calls crm-bot
// ============================================================================

function hashAudienceFilter(filter) {
    try { return JSON.stringify(filter?.all || []); } catch { return '[]'; }
}

async function fetchAudiencePreview(rule) {
    const key = hashAudienceFilter(rule.audience_filter);
    const cached = _autoCountCache.get(key);
    if (cached && (Date.now() - cached.fetched_at) < AUTO_COUNT_TTL_MS) {
        return cached.data;
    }
    const data = await callBot('/api/automations/preview', { rule });
    _autoCountCache.set(key, { data, fetched_at: Date.now() });
    return data;
}

async function fetchAllCardAudienceCounts() {
    if (!_autoRules.length) return;
    const results = await Promise.allSettled(
        _autoRules.map(r => fetchAudiencePreview(r).then(d => ({ id: r.id, total: d.total })))
    );
    let anyUpdated = false;
    for (const res of results) {
        if (res.status === 'fulfilled' && res.value) {
            _autoAudienceCounts.set(res.value.id, res.value.total);
            anyUpdated = true;
        }
    }
    if (anyUpdated) renderAutomations();
}

function scheduleLivePreview() {
    clearTimeout(_autoLivePreviewTimer);
    const badge = document.getElementById('auto-live-count-badge');
    if (badge) badge.innerHTML = '<span class="auto-count-loading">בודק...</span>';
    _autoLivePreviewTimer = setTimeout(runLivePreview, 350);
}

async function runLivePreview() {
    const badge = document.getElementById('auto-live-count-badge');
    if (!badge || !_autoEditing) return;
    // Snapshot filter state from editor before fetching (in case user keeps typing)
    readEditorIntoState();
    const snapshot = JSON.parse(JSON.stringify(_autoEditing));
    try {
        const data = await fetchAudiencePreview(snapshot);
        // Ignore stale result if editor state changed meanwhile
        if (hashAudienceFilter(snapshot.audience_filter) !== hashAudienceFilter(_autoEditing?.audience_filter)) return;
        const total = data.total ?? 0;
        const cls = total === 0 ? 'zero' : 'ok';
        badge.innerHTML = `<span class="auto-count-pill ${cls}"><strong>${total}</strong> משתמשים תואמים</span>`;
    } catch (err) {
        badge.innerHTML = `<span class="auto-count-pill err">שגיאה: ${escapeHtml(err.message || '')}</span>`;
    }
}

async function callBot(path, body) {
    const { data: { session } } = await db.auth.getSession();
    if (!session) throw new Error('לא מחובר');
    const resp = await fetch(BOT_URL + path, {
        method: body !== undefined ? 'POST' : 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + session.access_token,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    return data;
}

async function previewAutomation() {
    const r = readEditorIntoState();
    if (!r) return;
    const result = document.getElementById('auto-preview-result');
    const sampleEl = document.getElementById('auto-preview-sample');
    result.textContent = 'בודק...';
    sampleEl.innerHTML = '';
    try {
        const data = await fetchAudiencePreview(r);
        result.innerHTML = `<strong>${data.total}</strong> משתמשים תואמים`;
        // Dedupe sample rows by masked phone (backend may return duplicates on joined queries)
        const seen = new Set();
        const dedupedSample = (data.sample || []).filter(u => {
            const key = u.phone_masked || u.full_name;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        if (dedupedSample.length) {
            sampleEl.innerHTML = `<div class="auto-sample-list">
                <div class="auto-sample-title">דוגמה ל-${dedupedSample.length} מהם:</div>
                ${dedupedSample.map(u => `
                    <div class="auto-sample-row">
                        <span>${escapeHtml(u.full_name || '—')}</span>
                        <span class="auto-sample-phone">${escapeHtml(u.phone_masked || '')}</span>
                        <span class="auto-sample-lessons">${u.lessons_completed ?? 0} שיעורים</span>
                    </div>
                `).join('')}
            </div>`;
        }
    } catch (err) {
        result.innerHTML = `<span class="auto-error-text">שגיאה: ${escapeHtml(err.message)}</span>`;
    }
}

async function testSendAutomation() {
    const r = readEditorIntoState();
    if (!r) return;
    if (!r.action_config?.message_template?.trim()) return showToast('חסרה הודעה', 'error');
    try {
        const data = await callBot('/api/automations/test-send', { rule: r });
        showToast(`נשלח אליך ✓ (${data.matched_count} תואמים)`, 'success');
    } catch (err) {
        showToast('שגיאה: ' + err.message, 'error');
    }
}

async function runAutomationNow(ruleId) {
    const rule = _autoRules.find(r => r.id === ruleId);
    if (!rule) return;
    const warn = rule.dry_run
        ? `הכלל "${rule.name}" יבוצע ב-מצב תרגול (לא יישלחו וואטסאפים אמיתיים). להמשיך?`
        : `⚠️ הכלל "${rule.name}" יישלח אמיתית עד ${rule.daily_cap} משתמשים. להמשיך?`;
    if (!confirm(warn)) return;
    try {
        showToast('מריץ...', 'info');
        const data = await callBot(`/api/automations/run-now/${ruleId}`, {});
        const summary = `התאמות: ${data.matched} | נשלחו: ${data.sent} | תרגול: ${data.dry_run} | שגיאות: ${data.failed}`;
        showToast(summary, data.failed > 0 ? 'error' : 'success');
        await loadAutomations();
    } catch (err) {
        showToast('שגיאה: ' + err.message, 'error');
    }
}

async function viewAutomationRuns(ruleId) {
    try {
        const { data, error } = await db.rpc('admin_automations_runs', { rule_id: ruleId, max_rows: 50 });
        if (error) throw error;
        const rule = _autoRules.find(r => r.id === ruleId);
        const rows = (data || []).map(run => `
            <tr>
                <td>${formatDateTime(run.fired_at)}</td>
                <td><span class="auto-run-status auto-run-${run.status}">${run.status}</span></td>
                <td style="direction:ltr;font-family:monospace;font-size:0.85em;">${escapeHtml(run.phone || '—')}</td>
                <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml((run.message_text || '').slice(0, 80))}</td>
                <td class="auto-run-err-cell">${escapeHtml(run.error || '')}</td>
            </tr>
        `).join('');
        const modal = document.getElementById('automation-runs-modal');
        document.getElementById('automation-runs-title').textContent = `היסטוריה — ${rule?.name || ''}`;
        document.getElementById('automation-runs-body').innerHTML = data?.length
            ? `<table class="auto-runs-table"><thead><tr><th>זמן</th><th>סטטוס</th><th>טלפון</th><th>הודעה</th><th>שגיאה</th></tr></thead><tbody>${rows}</tbody></table>`
            : '<div class="empty-state">עדיין אין הרצות</div>';
        modal.classList.add('active');
    } catch (err) {
        showToast('שגיאה בטעינת היסטוריה: ' + err.message, 'error');
    }
}

function closeAutomationRuns() {
    document.getElementById('automation-runs-modal').classList.remove('active');
}

function useAutomationTemplate(idx) {
    const t = RULE_TEMPLATES[idx];
    _autoEditing = {
        name: t.name,
        description: t.description,
        is_enabled: false,
        dry_run: true,
        trigger_type: 'schedule',
        trigger_config: { cron: t.cron },
        audience_filter: t.filter,
        action_type: 'whatsapp',
        action_config: { message_template: t.message },
        cooldown_days: 9999,
        daily_cap: 100,
    };
    renderAutomationEditor();
    document.getElementById('automation-editor-modal').classList.add('active');
}

// ============================================================================
// HELPERS
// ============================================================================
function humanizeCron(expr) {
    const preset = CRON_PRESETS.find(p => p.value === expr);
    if (preset) return preset.label;
    if (expr === '* * * * *') return 'כל דקה';
    if (/^\*\/(\d+) \* \* \* \*$/.test(expr)) return `כל ${RegExp.$1} דקות`;
    if (/^0 (\d+) \* \* \*$/.test(expr)) return `כל יום ב-${RegExp.$1.padStart(2,'0')}:00`;
    return expr;
}
