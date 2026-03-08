// admin-settings.js — Settings, UTM, automations, permissions, sales rep manager

function getDashboardSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        return { ...SETTINGS_DEFAULTS, ...saved };
    } catch { return { ...SETTINGS_DEFAULTS }; }
}

function loadSettingsView() {
    // Sales rep: hide all settings sections (they have no settings access)
    if (window._userProfileRole === 'sales_rep') {
        document.querySelectorAll('#settings-view .settings-section').forEach(sec => {
            sec.style.display = 'none';
        });
        return;
    }
    const s = getDashboardSettings();
    document.getElementById('setting-date-range').value = s.dateRange;
    document.getElementById('setting-max-pages').value = s.maxPages;
    document.getElementById('setting-trend-days').value = s.trendDays;
    document.getElementById('setting-auto-refresh').value = s.autoRefresh;
    document.getElementById('setting-default-view').value = s.defaultView;
    document.getElementById('setting-date-groups').value = s.dateGroups;
    document.getElementById('setting-patient-filter').value = s.patientFilter;
    document.getElementById('setting-therapist-filter').value = s.therapistFilter;
    document.getElementById('setting-show-badges').value = s.showBadges;
    document.getElementById('setting-direct-warning').value = s.directWarning;
    // Sync theme select with actual theme
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    document.getElementById('setting-theme').value = currentTheme;
}

function saveDashboardSettings() {
    const settings = {
        dateRange: document.getElementById('setting-date-range').value,
        maxPages: document.getElementById('setting-max-pages').value,
        trendDays: document.getElementById('setting-trend-days').value,
        autoRefresh: document.getElementById('setting-auto-refresh').value,
        defaultView: document.getElementById('setting-default-view').value,
        dateGroups: document.getElementById('setting-date-groups').value,
        patientFilter: document.getElementById('setting-patient-filter').value,
        therapistFilter: document.getElementById('setting-therapist-filter').value,
        showBadges: document.getElementById('setting-show-badges').value,
        directWarning: document.getElementById('setting-direct-warning').value,
        theme: document.getElementById('setting-theme').value,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

    // Apply theme immediately
    const newTheme = settings.theme;
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('beit-theme', newTheme);

    // Apply badge visibility
    document.querySelectorAll('.nav-item .badge').forEach(b => {
        b.style.display = settings.showBadges === 'true' ? '' : 'none';
    });

    // Update cache TTL
    GA4_CACHE_TTL = parseInt(settings.autoRefresh) * 60 * 1000 || 0;

    // Clear analytics cache so next load uses new settings
    ga4Cache = null;
    ga4CacheTime = 0;

    // Show success message
    const msg = document.getElementById('settings-saved-msg');
    msg.style.display = 'inline';
    setTimeout(() => { msg.style.display = 'none'; }, 3000);

    showToast('ההגדרות נשמרו בהצלחה', 'success');
}

function resetDashboardSettings() {
    localStorage.removeItem(SETTINGS_KEY);
    loadSettingsView();
    ga4Cache = null;
    ga4CacheTime = 0;
    GA4_CACHE_TTL = 5 * 60 * 1000;
    showToast('ההגדרות אופסו לברירת מחדל', 'success');
}

function generateUTM() {
    const page = document.getElementById('utm-page').value;
    const source = document.getElementById('utm-source').value;
    const campaign = document.getElementById('utm-campaign').value.trim() || 'general';
    const url = `${page}?utm_source=${source}&utm_medium=social&utm_campaign=${encodeURIComponent(campaign)}`;
    const resultEl = document.getElementById('utm-result');
    resultEl.textContent = url;
    resultEl.style.display = 'block';
    document.getElementById('btn-copy-utm').style.display = 'inline-flex';
}

function copyUTM() {
    const url = document.getElementById('utm-result').textContent;
    navigator.clipboard.writeText(url).then(() => {
        showToast('הקישור הועתק!', 'success');
    }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('הקישור הועתק!', 'success');
    });
}

// ============================================================
// UTM CONFIG MANAGER — CRUD for bot_utm_configs table
// ============================================================
let utmConfigsCache = { destination: [], source: [] };

function switchUtmConfigTab(type) {
    document.getElementById('utm-tab-destination').classList.toggle('active', type === 'destination');
    document.getElementById('utm-tab-source').classList.toggle('active', type === 'source');
    document.getElementById('utm-panel-destination').style.display = type === 'destination' ? '' : 'none';
    document.getElementById('utm-panel-source').style.display = type === 'source' ? '' : 'none';
}

async function loadUtmConfigs() {
    try {
        const { data, error } = await db.from('bot_utm_configs')
            .select('*')
            .order('created_at', { ascending: true });
        if (error) throw error;

        utmConfigsCache.destination = (data || []).filter(c => c.config_type === 'destination');
        utmConfigsCache.source = (data || []).filter(c => c.config_type === 'source');

        renderUtmConfigList('destination');
        renderUtmConfigList('source');

        // Also update UTM Builder dropdowns dynamically
        populateUtmBuilderDropdowns();
    } catch (err) {
        /* UTM load error handled by UI */
        document.getElementById('utm-list-destination').innerHTML = '<div class="utm-config-empty">שגיאה בטעינת הנתונים</div>';
        document.getElementById('utm-list-source').innerHTML = '<div class="utm-config-empty">שגיאה בטעינת הנתונים</div>';
    }
}

function renderUtmConfigList(type) {
    const container = document.getElementById(`utm-list-${type}`);
    const items = utmConfigsCache[type];

    if (!items.length) {
        const what = type === 'destination' ? 'דפים' : 'פלטפורמות';
        container.innerHTML = `<div class="utm-config-empty"><i class="fa-solid fa-inbox" style="font-size:1.5rem;display:block;margin-bottom:0.5rem;opacity:0.4;"></i>אין ${what} עדיין. הוסף באמצעות הטופס למטה.</div>`;
        return;
    }

    container.innerHTML = items.map(c => {
        const isDest = type === 'destination';
        const subtitle = isDest
            ? `<span style="color:var(--text-secondary);">נתיב:</span> ${c.url_path || '/'}`
            : `<span style="color:var(--text-secondary);">מזהה:</span> ${c.value}`;
        const metaLabel = isDest ? (c.campaign_slug || c.value) : (c.utm_medium || 'organic');
        const metaIcon = isDest ? 'fa-tag' : 'fa-layer-group';
        const metaTitle = isDest ? 'שם הקמפיין בדוחות' : 'סוג הפלטפורמה';

        return `
        <div class="utm-config-item ${c.is_active ? '' : 'inactive'}" data-id="${c.id}">
            <label class="utm-config-toggle" title="${c.is_active ? 'לחץ לכיבוי' : 'לחץ להפעלה'}">
                <input type="checkbox" ${c.is_active ? 'checked' : ''} onchange="toggleUtmConfig('${c.id}', this.checked)">
                <span class="slider"></span>
            </label>
            <div class="utm-config-card-body">
                <div class="utm-config-card-title">${c.label || c.value}</div>
                <div class="utm-config-card-sub">${subtitle}</div>
                <div class="utm-config-aliases">
                    ${(c.hebrew_aliases || []).map(a => `<span>${a}</span>`).join('')}
                </div>
            </div>
            <span class="utm-config-meta-pill" title="${metaTitle}"><i class="fa-solid ${metaIcon}" style="margin-left:0.3rem;font-size:0.65rem;"></i> ${metaLabel}</span>
            <button class="utm-config-delete" onclick="deleteUtmConfig('${c.id}')" title="מחק">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>`;
    }).join('');
}

async function toggleUtmConfig(id, isActive) {
    try {
        const { error } = await db.from('bot_utm_configs')
            .update({ is_active: isActive })
            .eq('id', id);
        if (error) throw error;

        // Update local cache
        for (const type of ['destination', 'source']) {
            const item = utmConfigsCache[type].find(c => c.id === id);
            if (item) item.is_active = isActive;
        }
        showToast(isActive ? 'הופעל — הבוט ישתמש בזה' : 'הושבת — הבוט יתעלם מזה', 'success');
        renderUtmConfigList('destination');
        renderUtmConfigList('source');
    } catch (err) {
        showToast('שגיאה בעדכון: ' + err.message, 'error');
        await loadUtmConfigs();
    }
}

async function deleteUtmConfig(id) {
    if (!confirm('למחוק את הרשומה הזו?')) return;
    try {
        const { error } = await db.from('bot_utm_configs')
            .delete()
            .eq('id', id);
        if (error) throw error;
        showToast('נמחק', 'success');
        await loadUtmConfigs();
    } catch (err) {
        showToast('שגיאה במחיקה: ' + err.message, 'error');
    }
}

async function addUtmConfig(type) {
    try {
        let row;
        if (type === 'destination') {
            const label = document.getElementById('utm-add-dest-label').value.trim();
            const url_path = document.getElementById('utm-add-dest-path').value.trim();
            const campaign_slug = document.getElementById('utm-add-dest-campaign').value.trim().toLowerCase();
            const aliasStr = document.getElementById('utm-add-dest-aliases').value.trim();

            if (!label || !url_path) {
                showToast('חובה למלא: שם בעברית וכתובת הדף', 'error');
                return;
            }
            if (!url_path.startsWith('/')) {
                showToast('כתובת הדף חייבת להתחיל ב-/ (למשל: /pages/about.html)', 'error');
                return;
            }

            // Auto-generate value from campaign_slug or path
            const value = (campaign_slug || url_path.split('/').pop().replace('.html', '') || 'page').toLowerCase().replace(/[^a-z0-9-]/g, '-');

            row = {
                config_type: 'destination',
                value,
                label,
                url_path,
                campaign_slug: campaign_slug || value,
                hebrew_aliases: aliasStr ? aliasStr.split(',').map(s => s.trim()).filter(Boolean) : [],
                is_active: true
            };
        } else {
            const value = document.getElementById('utm-add-src-value').value.trim().toLowerCase();
            const label = document.getElementById('utm-add-src-label').value.trim();
            const utm_medium = document.getElementById('utm-add-src-medium').value;
            const aliasStr = document.getElementById('utm-add-src-aliases').value.trim();

            if (!value || !label) {
                showToast('חובה למלא: שם בעברית ומזהה באנגלית', 'error');
                return;
            }
            if (!/^[a-z0-9_-]+$/.test(value)) {
                showToast('מזהה המקור חייב להיות באנגלית קטנה בלבד (אותיות, מספרים, מקף)', 'error');
                return;
            }

            row = {
                config_type: 'source',
                value,
                label,
                utm_medium,
                hebrew_aliases: aliasStr ? aliasStr.split(',').map(s => s.trim()).filter(Boolean) : [],
                is_active: true
            };
        }

        const { error } = await db.from('bot_utm_configs').insert(row);
        if (error) {
            if (error.message && error.message.includes('duplicate')) {
                showToast('כבר קיים רשומה עם אותו מזהה. בחר שם אחר.', 'error');
            } else {
                throw error;
            }
            return;
        }

        showToast('נוסף בהצלחה!', 'success');

        // Clear form
        if (type === 'destination') {
            document.getElementById('utm-add-dest-label').value = '';
            document.getElementById('utm-add-dest-path').value = '';
            document.getElementById('utm-add-dest-campaign').value = '';
            document.getElementById('utm-add-dest-aliases').value = '';
        } else {
            document.getElementById('utm-add-src-value').value = '';
            document.getElementById('utm-add-src-label').value = '';
            document.getElementById('utm-add-src-aliases').value = '';
        }

        await loadUtmConfigs();
    } catch (err) {
        showToast('שגיאה בהוספה: ' + err.message, 'error');
    }
}

function populateUtmBuilderDropdowns() {
    // Update the UTM Builder's page dropdown from DB destinations
    const pageSelect = document.getElementById('utm-page');
    const sourceSelect = document.getElementById('utm-source');
    if (!pageSelect || !sourceSelect) return;

    const activeDests = utmConfigsCache.destination.filter(c => c.is_active);
    const activeSources = utmConfigsCache.source.filter(c => c.is_active);

    if (activeDests.length) {
        pageSelect.innerHTML = activeDests.map(d =>
            `<option value="https://www.therapist-home.com${d.url_path}">${d.label}</option>`
        ).join('');
    }

    if (activeSources.length) {
        sourceSelect.innerHTML = activeSources.map(s =>
            `<option value="${s.value}">${s.label}</option>`
        ).join('');
    }
}

// ============================================================
// AUTOMATION CONFIG MANAGER
// ============================================================
let automationConfigsCache = [];

const AUTOMATION_CATEGORIES = {
    lead_lifecycle: { label: 'ניהול לידים',       icon: 'fa-user-clock' },
    safety:         { label: 'בטיחות וחירום',      icon: 'fa-shield-halved' },
    operations:     { label: 'תפעול שוטף',         icon: 'fa-gears' },
    retention:      { label: 'שימור וקשר',         icon: 'fa-hand-holding-heart' },
    reports:        { label: 'דוחות וסיכומים',     icon: 'fa-chart-pie' },
    pipelines:      { label: 'תהליכי עבודה',       icon: 'fa-arrows-rotate' },
    followups:      { label: 'מעקבים והודעות',      icon: 'fa-envelope-open-text' },
    monitoring:     { label: 'ניטור והתראות',       icon: 'fa-eye' },
    export:         { label: 'ייצוא נתונים',        icon: 'fa-file-export' },
};

const CATEGORY_COLORS = {
    safety:         { bg: 'rgba(220,53,69,0.1)',  text: '#dc3545' },
    lead_lifecycle: { bg: 'rgba(40,167,69,0.1)',  text: '#28a745' },
    operations:     { bg: 'rgba(88,166,255,0.1)', text: '#58a6ff' },
    retention:      { bg: 'rgba(212,175,55,0.1)', text: '#D4AF37' },
    reports:        { bg: 'rgba(139,92,246,0.1)', text: '#8b5cf6' },
    pipelines:      { bg: 'rgba(47,133,146,0.1)', text: '#2F8592' },
    followups:      { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
    monitoring:     { bg: 'rgba(236,72,153,0.1)', text: '#ec4899' },
    export:         { bg: 'rgba(107,114,128,0.1)', text: '#6b7280' },
};

const PARAM_INPUT_TYPES = {
    cron: 'hidden',
    leadAutoContactHours: 'number', leadStaleHours: 'number',
    patientAutoMatchHours: 'number', postAppointmentHours: 'number',
    overdueDays: 'number', maxResponseMinutes: 'number',
    escalateAfterHours: 'number', minScoreToAlert: 'number',
    inactiveDays: 'number', graceMinutes: 'number',
    expiryDays: 'number', minGapHours: 'number',
    maxWaitDays: 'number', alertAtSession: 'number',
    maxSessions: 'number', maxPatientsPerTherapist: 'number',
    minPatientsPerTherapist: 'number', dormantDays: 'number',
    afterSessions: 'number',
};

const AUTOMATION_DESCRIPTIONS = {
    // reports
    morning_briefing:          'שולח תקציר בוקר עם לידים חדשים ופגישות היום',
    daily_summary:             'מסכם את הפעילות היומית — לידים, פגישות ושיבוצים',
    weekly_report:             'מפיק דוח שבועי מקיף עם מגמות וסטטיסטיקות',
    lead_source_report:        'מנתח מאיפה מגיעים הלידים ומה המקורות החזקים',
    safety_daily_digest:       'מפיק סיכום יומי של כל אירועי הבטיחות',
    // pipelines
    lead_nurture:              'שומר על קשר אוטומטי עם לידים שטרם הומרו',
    patient_auto_match:        'מציע שיבוץ אוטומטי של מטופל למטפל מתאים',
    post_appointment:          'שולח מעקב אוטומטי אחרי כל פגישת טיפול',
    // followups
    patient_welcome:           'שולח הודעת ברוכים הבאים למטופל שנרשם',
    therapist_welcome:         'שולח הודעת ברוכים הבאים למטפל שאושר',
    post_treatment:            'מתעד ומעקב אחרי סיום סדרת טיפולים',
    payment_reminders:         'שולח תזכורות תשלום למטופלים עם חוב פתוח',
    // monitoring
    appointment_reminders:     'מתזכר מטופלים ומטפלים לקראת פגישות קרובות',
    new_lead_polling:          'סורק לידים חדשים שנכנסו ומתריע מיידית',
    proactive_alerts:          'מזהה מגמות חריגות ושולח התראות עסקיות יזומות',
    // export
    monthly_export:            'מייצא נתונים חודשיים לגיבוי או ניתוח חיצוני',
    // lead_lifecycle
    lead_first_response:       'מתריע אם ליד לא קיבל מענה תוך זמן מוגדר',
    lead_escalation:           'מסלים לידים ישנים שלא טופלו לדרג בכיר',
    lead_scoring:              'מדרג לידים אוטומטית לפי פוטנציאל המרה',
    lead_duplicate_detect:     'מזהה לידים כפולים לפי טלפון או אימייל',
    // safety
    emergency_keyword_scan:    'סורק הודעות בחיפוש מילות מצוקה או חירום',
    inactive_patient_alert:    'מתריע על מטופל שלא היה פעיל תקופה ארוכה',
    therapist_no_show_alert:   'מתריע כאשר מטפל לא הגיע לפגישה מתוכננת',
    consent_expiry_check:      'בודק תוקף הסכמות ומתריע לפני פקיעה',
    // operations
    therapist_availability_check: 'בודק זמינות מטפלים ומתריע על חוסרים',
    appointment_gap_alert:     'מזהה פערים בלוח זמנים של מטפלים',
    waitlist_processor:        'מנהל רשימת המתנה ומציע שיבוצים כשמתפנה מקום',
    session_limit_alert:       'מתריע כשמטופל מתקרב למכסת הטיפולים המקסימלית',
    therapist_load_balance:    'מאזן עומס בין מטפלים למניעת עומס יתר',
    // retention
    birthday_greeting:         'שולח ברכת יום הולדת אוטומטית למטופלים',
    milestone_celebration:     'מציין אבני דרך בטיפול — 5, 10, 15 פגישות',
    reactivation_outreach:     'פונה למטופלים שנשרו לחידוש קשר',
    satisfaction_survey:       'שולח סקר שביעות רצון אחרי מספר פגישות',
    community_digest:          'שולח עדכון קהילתי תקופתי למטופלים ומטפלים',
};

let _activeCategoryFilter = null; // null = show all

const PARAM_LABELS = {
    cron:                      'ביטוי תזמון (cron)',
    leadAutoContactHours:      'שעות לפני תזכורת ליד',
    leadStaleHours:            'שעות להסלמת ליד ישן',
    patientAutoMatchHours:     'שעות לפני הצעת שיבוץ',
    postAppointmentHours:      'שעות אחרי פגישה למעקב',
    overdueDays:               'ימים לתזכורת תשלום',
    maxResponseMinutes:        'דקות מקסימום לתגובה ראשונית',
    escalateAfterHours:        'שעות להסלמה',
    minScoreToAlert:           'ניקוד מינימלי להתראה',
    inactiveDays:              'ימים ללא פעילות',
    graceMinutes:              'דקות חסד לאי-הגעה',
    expiryDays:                'ימים לפקיעת הסכמה',
    minGapHours:               'שעות מינימום לפער בלו"ז',
    maxWaitDays:               'ימים מקסימום בהמתנה',
    alertAtSession:            'התראה בפגישה מספר',
    maxSessions:               'מכסת פגישות מקסימלית',
    maxPatientsPerTherapist:   'מטופלים מקסימום למטפל',
    minPatientsPerTherapist:   'מטופלים מינימום למטפל',
    sessionMilestones:         'אבני דרך (פגישות)',
    dormantDays:               'ימים לחוסר פעילות',
    afterSessions:             'סקר אחרי X פגישות',
};

async function loadAutomationConfigs() {
    try {
        const { data, error } = await db.from('bot_automation_configs')
            .select('*')
            .order('created_at', { ascending: true });
        if (error) throw error;
        automationConfigsCache = data || [];
        renderAutomationConfigs();
        updateAutoStats();
    } catch (err) {
        document.getElementById('automation-config-container').innerHTML =
            '<div class="utm-config-empty">שגיאה בטעינת האוטומציות</div>';
    }
}

function renderAutomationConfigs() {
    const container = document.getElementById('automation-config-container');
    if (!automationConfigsCache.length) {
        container.innerHTML = '<div class="utm-config-empty">לא נמצאו אוטומציות</div>';
        renderFilterPills();
        return;
    }

    const searchVal = (document.getElementById('auto-search')?.value || '').trim().toLowerCase();
    const allowedCats = window._userCategoryAccess; // null = all allowed

    const filtered = automationConfigsCache.filter(a => {
        if (allowedCats && Array.isArray(allowedCats) && !allowedCats.includes(a.category)) return false;
        if (_activeCategoryFilter && a.category !== _activeCategoryFilter) return false;
        if (searchVal) {
            const catInfo = AUTOMATION_CATEGORIES[a.category] || { label: '' };
            const desc = AUTOMATION_DESCRIPTIONS[a.id] || a.description || '';
            const text = `${a.label} ${desc} ${catInfo.label}`.toLowerCase();
            if (!text.includes(searchVal)) return false;
        }
        return true;
    });

    renderFilterPills();

    if (!filtered.length) {
        container.innerHTML = `<div class="utm-config-empty" style="padding:2rem;text-align:center;">
            <i class="fa-solid fa-filter-circle-xmark" style="font-size:1.5rem;color:var(--text-secondary);display:block;margin-bottom:0.5rem;"></i>
            לא נמצאו אוטומציות התואמות לחיפוש
            <div style="margin-top:0.5rem;">
                <button class="auto-filter-pill" onclick="clearAutoFilters()" style="font-size:0.75rem;cursor:pointer;">
                    <i class="fa-solid fa-rotate-left"></i> אפס סינון
                </button>
            </div>
        </div>`;
        return;
    }

    let html = '<div class="auto-grid">';
    for (const a of filtered) {
        const cat = a.category;
        const catInfo = AUTOMATION_CATEGORIES[cat] || { label: cat, icon: 'fa-gear' };
        const catColor = CATEGORY_COLORS[cat] || { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' };
        const desc = AUTOMATION_DESCRIPTIONS[a.id] || a.description || '';

        html += `<div class="auto-config-card ${a.is_enabled ? '' : 'disabled'}" data-category="${cat}">
            <div class="auto-config-card-header">
                <span class="auto-config-status-dot ${a.is_enabled ? 'active' : 'inactive'}"></span>
                <label class="utm-config-toggle" title="${a.is_enabled ? 'לחץ לכיבוי' : 'לחץ להפעלה'}">
                    <input type="checkbox" ${a.is_enabled ? 'checked' : ''}
                        onchange="toggleAutomation('${a.id}', this.checked)">
                    <span class="slider"></span>
                </label>
                <div class="auto-config-card-title">
                    <i class="fa-solid ${a.icon || 'fa-robot'}"></i> ${a.label}
                </div>
                <button class="auto-settings-btn" onclick="openParamSettings('${a.id}')" title="הגדרות">
                    <i class="fa-solid fa-gear"></i><span> הגדרות</span>
                </button>
            </div>
            <div class="auto-config-card-desc">${desc}</div>
            <div class="auto-config-card-footer">
                <span class="auto-category-badge" style="background:${catColor.bg};color:${catColor.text};">
                    <i class="fa-solid ${catInfo.icon}" style="font-size:0.6rem;"></i> ${catInfo.label}
                </span>
                <span class="auto-config-schedule-pill">
                    <i class="fa-regular fa-clock"></i> ${a.schedule}
                </span>
            </div>
        </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

function openParamSettings(automationId) {
    const item = automationConfigsCache.find(a => a.id === automationId);
    if (!item) return;

    const titleEl = document.getElementById('auto-modal-title');
    const bodyEl = document.getElementById('auto-modal-body');
    const overlay = document.getElementById('auto-settings-overlay');

    titleEl.innerHTML = `<i class="fa-solid ${item.icon || 'fa-gear'}"></i> ${item.label}`;

    const params = item.params || {};
    // Filter out hidden params (e.g. cron)
    const keys = Object.keys(params).filter(k => PARAM_INPUT_TYPES[k] !== 'hidden');

    if (!keys.length) {
        bodyEl.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:0.85rem;"><i class="fa-solid fa-check-circle" style="color:var(--success);font-size:1.3rem;margin-bottom:0.5rem;display:block;"></i>אין פרמטרים לעריכה עבור אוטומציה זו</div>';
    } else {
        let fieldsHtml = '';
        for (const key of keys) {
            const label = PARAM_LABELS[key] || key;
            const val = params[key];
            // Determine input type from map, then fallback
            let inputType = PARAM_INPUT_TYPES[key];
            if (!inputType) {
                if (typeof val === 'number') inputType = 'number';
                else if (typeof val === 'string' && val.length > 60) inputType = 'textarea';
                else inputType = 'text';
            }

            if (inputType === 'textarea') {
                fieldsHtml += `<div class="auto-modal-field">
                    <label>${label}</label>
                    <textarea data-param-key="${key}" rows="3">${val}</textarea>
                </div>`;
            } else {
                fieldsHtml += `<div class="auto-modal-field">
                    <label>${label}</label>
                    <input type="${inputType}" value="${val}" data-param-key="${key}" ${inputType === 'number' ? 'min="0"' : ''}>
                </div>`;
            }
        }
        bodyEl.innerHTML = fieldsHtml;
    }

    const saveBtn = document.getElementById('auto-modal-save');
    saveBtn.onclick = () => saveParamSettings(automationId);

    // Wire "Run Now" button
    const runBtn = document.getElementById('auto-modal-run');
    runBtn.onclick = () => triggerAutomation(automationId);
    runBtn.disabled = false;
    runBtn.classList.remove('running');
    runBtn.innerHTML = '<i class="fa-solid fa-play"></i> הפעל עכשיו';

    // Clear previous run result
    const existingResult = bodyEl.parentElement.querySelector('.auto-run-result');
    if (existingResult) existingResult.remove();

    // Load recent logs for this automation
    loadAutomationLogs(automationId);

    overlay.classList.add('active');
}

function closeParamSettings() {
    document.getElementById('auto-settings-overlay').classList.remove('active');
}

// ── Search filter (debounced) ──
let _filterTimeout;
function filterAutomations() {
    clearTimeout(_filterTimeout);
    _filterTimeout = setTimeout(() => renderAutomationConfigs(), 150);
}

// ── Category filter pills ──
function renderFilterPills() {
    const pillsContainer = document.getElementById('auto-filter-pills');
    if (!pillsContainer) return;
    const allowedCats = window._userCategoryAccess;
    const categoryOrder = [
        'lead_lifecycle', 'safety', 'operations', 'retention',
        'reports', 'pipelines', 'followups', 'monitoring', 'export'
    ];

    // Count items per category
    const counts = {};
    for (const a of automationConfigsCache) {
        if (allowedCats && Array.isArray(allowedCats) && !allowedCats.includes(a.category)) continue;
        counts[a.category] = (counts[a.category] || 0) + 1;
    }
    const totalCount = Object.values(counts).reduce((s, c) => s + c, 0);

    let html = `<button class="auto-filter-pill ${!_activeCategoryFilter ? 'active' : ''}" onclick="setAutoFilter(null)">
        הכל <span class="pill-count">(${totalCount})</span>
    </button>`;
    for (const cat of categoryOrder) {
        if (!counts[cat]) continue;
        const catInfo = AUTOMATION_CATEGORIES[cat] || { label: cat, icon: 'fa-gear' };
        const isActive = _activeCategoryFilter === cat;
        html += `<button class="auto-filter-pill ${isActive ? 'active' : ''}" onclick="setAutoFilter('${cat}')">
            <i class="fa-solid ${catInfo.icon}" style="font-size:0.65rem;"></i> ${catInfo.label}
            <span class="pill-count">(${counts[cat]})</span>
        </button>`;
    }
    pillsContainer.innerHTML = html;
}

function setAutoFilter(category) {
    _activeCategoryFilter = category;
    renderAutomationConfigs();
}

function clearAutoFilters() {
    _activeCategoryFilter = null;
    const searchEl = document.getElementById('auto-search');
    if (searchEl) searchEl.value = '';
    renderAutomationConfigs();
}


function exportAutomationConfigs() {
    if (!automationConfigsCache.length) {
        showToast('אין הגדרות לייצוא', 'error');
        return;
    }
    const exportData = {
        version: 1,
        exported_at: new Date().toISOString(),
        configs: automationConfigsCache.map(a => ({
            id: a.id,
            category: a.category,
            label: a.label,
            is_enabled: a.is_enabled,
            params: a.params,
            schedule: a.schedule,
        })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    a.download = `automation-configs-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('הגדרות יוצאו בהצלחה', 'success');
}

async function importAutomationConfigs(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    fileInput.value = '';

    try {
        const text = await file.text();
        const importData = JSON.parse(text);

        if (!importData.configs || !Array.isArray(importData.configs)) {
            showToast('קובץ לא תקין — מבנה JSON שגוי', 'error');
            return;
        }

        if (!confirm(`לייבא ${importData.configs.length} הגדרות אוטומציה?\nהפעולה תדרוס את ההגדרות הנוכחיות.`)) return;

        let updated = 0;
        let errors = 0;
        for (const cfg of importData.configs) {
            if (!cfg.id) { errors++; continue; }
            const updateObj = {};
            if (typeof cfg.is_enabled === 'boolean') updateObj.is_enabled = cfg.is_enabled;
            if (cfg.params && typeof cfg.params === 'object') updateObj.params = cfg.params;
            if (Object.keys(updateObj).length === 0) continue;
            updateObj.updated_at = new Date().toISOString();

            const { error } = await db.from('bot_automation_configs')
                .update(updateObj)
                .eq('id', cfg.id);
            if (error) { errors++; } else { updated++; }
        }

        await loadAutomationConfigs();
        showToast(`יובאו ${updated} הגדרות בהצלחה${errors ? ` (${errors} שגיאות)` : ''}`, errors ? 'warning' : 'success');
    } catch (e) {
        showToast('שגיאה בקריאת הקובץ: ' + e.message, 'error');
    }
}

// ── Live stats for automation header ──
async function updateAutoStats() {
    // 1. Active count (sync from cache)
    const activeCount = automationConfigsCache.filter(a => a.is_enabled).length;
    const totalCount = automationConfigsCache.length;
    const activeEl = document.getElementById('auto-stat-active');
    if (activeEl) activeEl.querySelector('.stat-value').textContent = `${activeCount}/${totalCount}`;

    // 2. Leads today
    try {
        const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date()) + 'T00:00:00';
        const { count } = await db.from('contact_requests')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', todayISO);
        const leadsEl = document.getElementById('auto-stat-leads');
        if (leadsEl) leadsEl.querySelector('.stat-value').textContent = count ?? 0;
    } catch (e) { /* leads stat unavailable */ }

    // 3. Bot health
    try {
        const res = await fetch(BOT_URL + '/', { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        const isOnline = data.whatsapp === 'authorized' || data.whatsapp === 'connected';
        const healthEl = document.getElementById('auto-stat-health');
        if (healthEl) {
            healthEl.querySelector('.stat-value').textContent = isOnline ? 'תקין' : 'לא זמין';
            healthEl.querySelector('.stat-value').style.color = isOnline ? 'var(--success)' : 'var(--danger)';
        }
    } catch (e) {
        const healthEl = document.getElementById('auto-stat-health');
        if (healthEl) {
            healthEl.querySelector('.stat-value').textContent = 'לא זמין';
            healthEl.querySelector('.stat-value').style.color = 'var(--danger)';
        }
    }

    // 4. Critical alerts (last 24h automation errors)
    try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: logs } = await db.from('crm_activity_log')
            .select('details')
            .like('action', 'auto_%')
            .gte('created_at', since)
            .limit(200);
        const errorCount = (logs || []).filter(l => l.details?.error || l.details?.status === 'error').length;
        const alertsEl = document.getElementById('auto-stat-alerts');
        if (alertsEl) {
            alertsEl.querySelector('.stat-value').textContent = errorCount;
            alertsEl.querySelector('.stat-value').style.color = errorCount > 0 ? 'var(--danger)' : 'var(--success)';
        }
    } catch (e) {
        const alertsEl = document.getElementById('auto-stat-alerts');
        if (alertsEl) alertsEl.querySelector('.stat-value').textContent = '–';
    }
}

// ── Automation ID → activity log action name ──
// The instrumented() wrapper in cron.js writes `auto_${id}` for ALL automations.
// Manual triggers in server.js also use `auto_${id}`. Consistent naming.
function getAutoActionName(automationId) {
    return `auto_${automationId}`;
}

async function loadAutomationLogs(automationId) {
    const container = document.getElementById('auto-logs-container');
    const countEl = document.getElementById('auto-logs-count');
    container.innerHTML = '<div class="auto-logs-loading"><i class="fa-solid fa-spinner fa-spin"></i> טוען...</div>';
    countEl.textContent = '';

    const actionName = getAutoActionName(automationId);

    try {
        const { data, error } = await db.from('crm_activity_log')
            .select('id, action, details, created_at')
            .eq('action', actionName)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (!data || !data.length) {
            container.innerHTML = '<div class="auto-logs-empty"><i class="fa-solid fa-inbox" style="font-size:1.1rem;display:block;margin-bottom:0.3rem;"></i>אין לוגים עדיין לאוטומציה זו</div>';
            countEl.textContent = '(0)';
            return;
        }

        countEl.textContent = `(${data.length})`;
        renderAutomationLogs(data, container);
    } catch (err) {
        container.innerHTML = '<div class="auto-logs-empty">שגיאה בטעינת לוגים</div>';
    }
}

function renderAutomationLogs(logs, container) {
    let html = '<ul class="auto-logs-list">';

    for (const log of logs) {
        const details = log.details || {};
        const isError = !!(details.error || details.status === 'error');
        const statusClass = isError ? 'error' : 'success';
        const statusLabel = isError ? 'שגיאה' : 'הצלחה';
        const dotClass = isError ? 'error' : 'success';

        // Format timestamp
        const d = new Date(log.created_at);
        const timeStr = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
            + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

        // Build summary line from details
        let summary = '';
        if (details.count !== undefined) summary = `${details.count} פריטים`;
        else if (details.message) summary = details.message.substring(0, 60);
        else if (details.error) summary = details.error.substring(0, 60);

        const detailJson = JSON.stringify(details, null, 2);
        const logId = 'log-detail-' + log.id;

        html += `<li class="auto-log-item">
            <span class="auto-log-dot ${dotClass}"></span>
            <div class="auto-log-body">
                <div>
                    <span class="auto-log-status ${statusClass}">${statusLabel}</span>
                    <span class="auto-log-time">${timeStr}</span>
                </div>
                ${summary ? `<div style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.1rem;">${summary}</div>` : ''}
                <pre class="auto-log-detail-panel" id="${logId}">${escapeHtml(detailJson)}</pre>
            </div>
            <button class="auto-log-details-btn" onclick="toggleLogDetail('${logId}')">
                <i class="fa-solid fa-code"></i> פרטים
            </button>
        </li>`;
    }

    html += '</ul>';
    container.innerHTML = html;
}

function toggleLogDetail(logId) {
    const panel = document.getElementById(logId);
    if (panel) panel.classList.toggle('open');
}

async function triggerAutomation(automationId) {
    if (!confirm('האם אתה בטוח שברצונך להריץ את האוטומציה ידנית עכשיו?')) return;

    const runBtn = document.getElementById('auto-modal-run');
    const modal = document.querySelector('.auto-modal');
    runBtn.disabled = true;
    runBtn.classList.add('running');
    runBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> מריץ...';

    // Remove previous result
    const prev = modal.querySelector('.auto-run-result');
    if (prev) prev.remove();

    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) throw new Error('לא מחובר');

        const resp = await fetch(BOT_URL + '/api/admin/trigger-automation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + session.access_token,
            },
            body: JSON.stringify({ automationId }),
        });

        const data = await resp.json();
        const resultDiv = document.createElement('div');
        resultDiv.className = 'auto-run-result';

        if (resp.ok && data.success) {
            resultDiv.classList.add('success');
            resultDiv.innerHTML = '<i class="fa-solid fa-check-circle"></i> האוטומציה הופעלה בהצלחה';
            runBtn.innerHTML = '<i class="fa-solid fa-check"></i> הושלם';
        } else {
            resultDiv.classList.add('error');
            resultDiv.innerHTML = `<i class="fa-solid fa-exclamation-circle"></i> שגיאה: ${data.error || 'Unknown error'}`;
            runBtn.innerHTML = '<i class="fa-solid fa-play"></i> הפעל עכשיו';
            runBtn.disabled = false;
            runBtn.classList.remove('running');
        }

        modal.querySelector('.auto-modal-actions').insertAdjacentElement('afterend', resultDiv);
    } catch (err) {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'auto-run-result error';
        resultDiv.innerHTML = `<i class="fa-solid fa-exclamation-circle"></i> שגיאת חיבור: ${err.message}`;
        modal.querySelector('.auto-modal-actions').insertAdjacentElement('afterend', resultDiv);
        runBtn.innerHTML = '<i class="fa-solid fa-play"></i> הפעל עכשיו';
        runBtn.disabled = false;
        runBtn.classList.remove('running');
    }
}

async function saveParamSettings(automationId) {
    const item = automationConfigsCache.find(a => a.id === automationId);
    if (!item) return;

    const bodyEl = document.getElementById('auto-modal-body');
    const inputs = bodyEl.querySelectorAll('[data-param-key]');
    const newParams = { ...item.params };

    for (const input of inputs) {
        const key = input.dataset.paramKey;
        const raw = input.value;
        newParams[key] = input.type === 'number' ? (parseFloat(raw) || 0) : raw;
    }

    try {
        const { error } = await db.from('bot_automation_configs')
            .update({ params: newParams, updated_at: new Date().toISOString() })
            .eq('id', automationId);
        if (error) throw error;
        item.params = newParams;
        renderAutomationConfigs();
        closeParamSettings();
        showToast('הגדרות נשמרו', 'success');
    } catch (err) {
        showToast('שגיאה בשמירה: ' + err.message, 'error');
    }
}

async function toggleAutomation(id, isEnabled) {
    try {
        const { error } = await db.from('bot_automation_configs')
            .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;

        const item = automationConfigsCache.find(a => a.id === id);
        if (item) item.is_enabled = isEnabled;
        renderAutomationConfigs();
        showToast(isEnabled ? 'אוטומציה הופעלה' : 'אוטומציה כובתה', 'success');
    } catch (err) {
        showToast('שגיאה בעדכון: ' + err.message, 'error');
        await loadAutomationConfigs();
    }
}

// Param editing handled by openParamSettings/saveParamSettings modal

// ============================================================
// PERMISSIONS MANAGER (SuperAdmin only)
// ============================================================
// ===================
// SALES REP MANAGEMENT
// ===================

async function loadSalesRepManager() {
    if (window._userProfileRole !== 'admin') {
        const section = document.getElementById('sales-rep-section');
        if (section) section.style.display = 'none';
        return;
    }
    await loadSalesReps();
    renderSalesReps();
}

async function renderSalesReps() {
    const container = document.getElementById('sales-reps-container');
    if (!salesRepsCache.length) {
        container.innerHTML = '<div class="perm-empty"><i class="fa-solid fa-user-slash"></i><br>אין אנשי מכירות רשומים.<br>הוסף איש מכירות מלמעלה.</div>';
        return;
    }

    // Get lead stats per sales rep
    const leadCounts = {};
    const wonCounts = {};
    pipelineLeads.forEach(l => {
        if (l.assigned_to) {
            leadCounts[l.assigned_to] = (leadCounts[l.assigned_to] || 0) + 1;
            if (l.stage === 'closed_won') wonCounts[l.assigned_to] = (wonCounts[l.assigned_to] || 0) + 1;
        }
    });

    let html = '';
    for (const rep of salesRepsCache) {
        const totalLeads = leadCounts[rep.id] || 0;
        const wonLeads = wonCounts[rep.id] || 0;
        const convRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;
        html += `
        <div class="perm-user-card" style="margin-bottom:0.8rem;">
            <div class="perm-user-header" style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div class="perm-user-name">
                        <i class="fa-solid fa-user-tie" style="color:var(--gold);"></i>
                        ${escapeHtml(rep.full_name || 'ללא שם')}
                        <span class="perm-user-role sales_rep" style="background:var(--muted-teal);color:white;padding:0.1rem 0.5rem;border-radius:4px;font-size:0.72rem;">sales_rep</span>
                    </div>
                    <div class="perm-user-email" style="font-size:0.8rem;color:var(--text-secondary);">${escapeHtml(rep.email || '')}</div>
                </div>
                <div style="display:flex;gap:1.5rem;align-items:center;font-size:0.82rem;">
                    <div style="text-align:center;"><strong>${totalLeads}</strong><br><span style="color:var(--text-secondary);font-size:0.72rem;">לידים</span></div>
                    <div style="text-align:center;"><strong style="color:var(--success);">${wonLeads}</strong><br><span style="color:var(--text-secondary);font-size:0.72rem;">סגירות</span></div>
                    <div style="text-align:center;"><strong>${convRate}%</strong><br><span style="color:var(--text-secondary);font-size:0.72rem;">המרה</span></div>
                    <button class="btn btn-danger" style="font-size:0.78rem;padding:0.3rem 0.6rem;" onclick="removeSalesRep('${rep.id}','${escapeHtml((rep.full_name||'').replace(/'/g,"\\\\'"))}')">
                        <i class="fa-solid fa-user-minus"></i> הסר
                    </button>
                </div>
            </div>
        </div>`;
    }
    container.innerHTML = html;
}

async function addSalesRep() {
    const name = document.getElementById('sr-add-name')?.value?.trim();
    const email = document.getElementById('sr-add-email')?.value?.trim();
    const phone = document.getElementById('sr-add-phone')?.value?.trim();

    if (!email) { showToast('נדרש אימייל', 'error'); return; }
    if (!name) { showToast('נדרש שם', 'error'); return; }

    try {
        // Use CRM bot API to create user account + setup (handles Supabase Admin API)
        const { data: { session } } = await db.auth.getSession();
        const res = await fetch(`${BOT_URL}/api/sales-rep`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ name, email, phone })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'שגיאה ביצירת איש מכירות');

        showToast(`${name} נוסף כאיש מכירות!${result.created ? ' (חשבון חדש נוצר)' : ''}`, 'success');

        // Clear form
        document.getElementById('sr-add-name').value = '';
        document.getElementById('sr-add-email').value = '';
        document.getElementById('sr-add-phone').value = '';

        // Refresh
        await loadSalesReps();
        renderSalesReps();
    } catch (err) {
        showToast('שגיאה: ' + err.message, 'error');
    }
}

async function removeSalesRep(profileId, name) {
    if (!confirm(`להסיר את ${name} מאנשי המכירות?`)) return;

    try {
        const { data: { session } } = await db.auth.getSession();
        const res = await fetch(`${BOT_URL}/api/sales-rep/${profileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'שגיאה בהסרה');

        showToast(`${name} הוסר מאנשי המכירות`, 'success');
        await loadSalesReps();
        renderSalesReps();
        loadPipeline();
    } catch (err) {
        showToast('שגיאה: ' + err.message, 'error');
    }
}

// ===================
// PERMISSIONS MANAGER
// ===================

let permUsersCache = [];

const ALL_CATEGORIES = [
    'reports', 'pipelines', 'followups', 'monitoring', 'export',
    'lead_lifecycle', 'safety', 'operations', 'retention'
];

async function loadPermissionsManager() {
    const section = document.getElementById('permissions-section');
    // Only show for SuperAdmin (role = admin and profiles.role = admin)
    if (window._userBotRole !== 'admin') {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';

    try {
        // Fetch all users with access + their profile info
        const { data, error } = await db.from('crm_bot_access')
            .select('user_id, role, category_access, profiles!inner(email, full_name, role)')
            .order('created_at', { ascending: true });
        if (error) throw error;
        permUsersCache = data || [];
        renderPermissions();
    } catch (err) {
        /* Permissions load error handled by UI */
        document.getElementById('permissions-container').innerHTML =
            '<div class="perm-empty">שגיאה בטעינת הרשאות</div>';
    }
}

function renderPermissions() {
    const container = document.getElementById('permissions-container');
    if (!permUsersCache.length) {
        container.innerHTML = '<div class="perm-empty"><i class="fa-solid fa-users-slash"></i><br>לא נמצאו משתמשים עם הרשאות CRM.<br>הוסף משתמש מלמעלה.</div>';
        return;
    }

    let html = '';
    for (const u of permUsersCache) {
        const profile = u.profiles || {};
        const email = profile.email || '—';
        const name = profile.full_name || email.split('@')[0];
        const role = u.role || 'viewer';
        const cats = u.category_access || ALL_CATEGORIES;

        html += `<div class="perm-user-card" data-uid="${u.user_id}">
            <div class="perm-user-header">
                <div>
                    <div class="perm-user-name">
                        <i class="fa-solid fa-user-circle" style="color:var(--gold);"></i>
                        ${name}
                        <span class="perm-user-role ${role}">${role}</span>
                    </div>
                    <div class="perm-user-email">${email}</div>
                </div>
                <select class="settings-input" style="width:auto;font-size:0.78rem;padding:0.3rem 0.5rem;"
                    onchange="changePermRole('${u.user_id}', this.value)">
                    <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="manager" ${role === 'manager' ? 'selected' : ''}>Manager</option>
                    <option value="viewer" ${role === 'viewer' ? 'selected' : ''}>Viewer</option>
                </select>
            </div>
            <div class="perm-categories" id="perm-cats-${u.user_id}">`;

        for (const cat of ALL_CATEGORIES) {
            const catInfo = AUTOMATION_CATEGORIES[cat] || { label: cat, icon: 'fa-gear' };
            const isActive = Array.isArray(cats) ? cats.includes(cat) : true;
            html += `<label class="perm-cat-chip ${isActive ? 'active' : ''}"
                onclick="togglePermCat(this, '${u.user_id}', '${cat}')">
                <i class="fa-solid ${catInfo.icon}" style="font-size:0.68rem;"></i>
                ${catInfo.label}
            </label>`;
        }

        html += `</div>
            <div class="perm-save-row">
                <button class="perm-save-btn" id="perm-save-${u.user_id}"
                    onclick="savePermUser('${u.user_id}')">
                    <i class="fa-solid fa-check"></i>&nbsp;שמור
                </button>
            </div>
        </div>`;
    }

    container.innerHTML = html;
}

function togglePermCat(chip, userId, cat) {
    chip.classList.toggle('active');
    // Show save button
    const saveBtn = document.getElementById('perm-save-' + userId);
    if (saveBtn) saveBtn.classList.add('visible');
}

async function changePermRole(userId, newRole) {
    try {
        const { error } = await db.from('crm_bot_access')
            .update({ role: newRole })
            .eq('user_id', userId);
        if (error) throw error;
        const u = permUsersCache.find(x => x.user_id === userId);
        if (u) u.role = newRole;
        showToast('תפקיד עודכן', 'success');
    } catch (err) {
        showToast('שגיאה: ' + err.message, 'error');
    }
}

async function savePermUser(userId) {
    const catsContainer = document.getElementById('perm-cats-' + userId);
    if (!catsContainer) return;

    const activeChips = catsContainer.querySelectorAll('.perm-cat-chip.active');
    const selectedCats = [];
    for (const chip of activeChips) {
        const catName = chip.getAttribute('onclick').match(/'([^']+)'\)$/)?.[1];
        if (catName) selectedCats.push(catName);
    }

    try {
        const { error } = await db.from('crm_bot_access')
            .update({ category_access: selectedCats })
            .eq('user_id', userId);
        if (error) throw error;

        const u = permUsersCache.find(x => x.user_id === userId);
        if (u) u.category_access = selectedCats;

        const saveBtn = document.getElementById('perm-save-' + userId);
        if (saveBtn) saveBtn.classList.remove('visible');

        showToast('הרשאות נשמרו', 'success');
    } catch (err) {
        showToast('שגיאה בשמירה: ' + err.message, 'error');
    }
}

async function addPermUser() {
    const emailInput = document.getElementById('perm-add-email');
    const roleSelect = document.getElementById('perm-add-role');
    const email = emailInput.value.trim();
    const role = roleSelect.value;

    if (!email) {
        showToast('יש להזין אימייל', 'error');
        return;
    }

    try {
        // Find user by email in profiles
        const { data: profile, error: profileErr } = await db.from('profiles')
            .select('id, email, full_name')
            .eq('email', email)
            .single();
        if (profileErr || !profile) {
            showToast('משתמש לא נמצא — ודא שהאימייל רשום במערכת', 'error');
            return;
        }

        // Check if already exists
        if (permUsersCache.find(u => u.user_id === profile.id)) {
            showToast('למשתמש כבר יש הרשאות CRM', 'error');
            return;
        }

        // Insert with all categories
        const { error } = await db.from('crm_bot_access')
            .insert({
                user_id: profile.id,
                role: role,
                category_access: ALL_CATEGORIES
            });
        if (error) throw error;

        emailInput.value = '';
        showToast('משתמש נוסף בהצלחה', 'success');
        await loadPermissionsManager();
    } catch (err) {
        showToast('שגיאה: ' + err.message, 'error');
    }
}


function applySettingsOnLoad() {
    const s = getDashboardSettings();

    // Badge visibility
    if (s.showBadges === 'false') {
        document.querySelectorAll('.nav-item .badge').forEach(b => { b.style.display = 'none'; });
    }

    // Cache TTL
    GA4_CACHE_TTL = parseInt(s.autoRefresh) * 60 * 1000 || 0;
}

// Make GA4_CACHE_TTL mutable
var GA4_CACHE_TTL = 5 * 60 * 1000;
