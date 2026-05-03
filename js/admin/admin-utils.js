// admin-utils.js — Shared utility functions

// View groups: each main sidebar item maps to sub-views
const VIEW_GROUPS = {
    'overview': { views: ['overview'], header: null, default: 'overview' },
    'mizum':    { views: ['patients', 'therapists', 'matches'], header: 'mizum-header', default: 'patients' },
    'funnel':   { views: ['pipeline'], header: null, default: 'pipeline' },
    'learning': { views: ['portal-q'], header: null, default: 'portal-q' },
    'bot':      { views: ['bot'], header: null, default: 'bot' },
    'paid':     { views: ['paid'], header: null, default: 'paid' },
    'referrals':{ views: ['referrals'], header: null, default: 'referrals' },
    'popups':   { views: ['popups'], header: null, default: 'popups' },
    'segments': { views: ['segments'], header: null, default: 'segments' },
    'automations':{ views: ['automations'], header: null, default: 'automations' },
    'retention': { views: ['retention'], header: null, default: 'retention' },
    'traffic':  { views: ['sources', 'traffic', 'analytics', 'instagram'], header: 'traffic-header', default: 'sources' },
    'settings': { views: ['settings'], header: null, default: 'settings' },
    // Legacy routes — hidden from sidebar but still accessible
    'sales':    { views: ['contact-leads', 'questionnaires', 'pipeline'], header: 'sales-header', default: 'contact-leads' },
};

// All individual view IDs (flat list)
const ALL_VIEWS = Object.values(VIEW_GROUPS).flatMap(g => g.views);
const ALL_HEADERS = Object.values(VIEW_GROUPS).map(g => g.header).filter(Boolean);

// Track current active group for sub-tab switching
let _currentGroup = 'overview';

function switchView(view) {
    // Update sidebar active state
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (event && event.currentTarget) event.currentTarget.classList.add('active');

    // Hide all views and headers
    ALL_VIEWS.forEach(v => document.getElementById(v + '-view')?.classList.add('hidden'));
    ALL_HEADERS.forEach(h => document.getElementById(h)?.classList.add('hidden'));

    const group = VIEW_GROUPS[view];
    if (!group) return;

    _currentGroup = view;

    // Show group header if exists
    if (group.header) {
        document.getElementById(group.header)?.classList.remove('hidden');
    }

    // Show default sub-view
    document.getElementById(group.default + '-view')?.classList.remove('hidden');

    // Reset sub-tab active states
    if (group.header) {
        const headerEl = document.getElementById(group.header);
        headerEl?.querySelectorAll('.sub-tab').forEach((tab, i) => {
            tab.classList.toggle('active', group.views[i] === group.default);
        });
    }

    // Lazy-load hooks
    if (view === 'learning' || group.default === 'portal-q') { if (!portalQLoaded && typeof loadPortalQuestionnaires === 'function') loadPortalQuestionnaires(); }
    if (view === 'bot' || group.default === 'bot') loadBotView();
    if (view === 'funnel' || group.default === 'pipeline') { if (typeof loadPipeline === 'function') loadPipeline(); }
    if (view === 'paid' || group.default === 'paid') loadPaidCustomers();
    if (view === 'referrals' || group.default === 'referrals') loadReferralAnalytics();
    if (view === 'popups' || group.default === 'popups') loadPopupConfigs();
    if (view === 'segments' || group.default === 'segments') loadSegments();
    if (view === 'automations' || group.default === 'automations') loadAutomations();
    if (view === 'retention' || group.default === 'retention') { if (typeof loadRetention === 'function') loadRetention(); }
    if (view === 'traffic') { if (typeof loadSources === 'function') loadSources(); }
    if (view === 'settings' || group.default === 'settings') { loadSettingsView(); loadUtmConfigs(); loadAutomationConfigs(); loadPermissionsManager(); loadSalesRepManager(); }

    // Update overview if navigating to it
    if (view === 'overview') updateOverview();
}

function switchSubView(groupName, subView) {
    const group = VIEW_GROUPS[groupName];
    if (!group) return;

    // Hide all views in this group
    group.views.forEach(v => document.getElementById(v + '-view')?.classList.add('hidden'));

    // Show selected sub-view
    document.getElementById(subView + '-view')?.classList.remove('hidden');

    // Update sub-tab active states
    const headerEl = document.getElementById(group.header);
    if (headerEl) {
        headerEl.querySelectorAll('.sub-tab').forEach((tab, i) => {
            tab.classList.toggle('active', group.views[i] === subView);
        });
    }

    // Lazy-load hooks for sub-views
    if (subView === 'learners') loadLearnersView();
    if (subView === 'portal-q' && !portalQLoaded) loadPortalQuestionnaires();
    if (subView === 'traffic' && typeof loadTrafficSources === 'function') loadTrafficSources();
    if (subView === 'sources' && typeof loadSources === 'function') loadSources();
    if (subView === 'analytics' && typeof loadGA4Analytics === 'function') loadGA4Analytics();
    if (subView === 'instagram' && typeof loadInstagramAnalytics === 'function') loadInstagramAnalytics();
}

function updateOverview() {
    setText('ov-patients', patients.length);
    setText('ov-therapists', therapists.length);
    setText('ov-matches', matches.length);

    // Leads count — use portal questionnaires array, fallback to direct count query
    const pq = (typeof portalQuestionnaires !== 'undefined') ? portalQuestionnaires : [];
    if (pq.length > 0) {
        setText('ov-leads', pq.length);
        setText('ov-questionnaires', pq.length);
        setText('ov-learners', pq.filter(q => (q.completed_count || 0) > 0).length);
    } else {
        // Fallback: direct count from DB (in case RPC failed)
        setText('ov-leads', leads.length);
        db.from('portal_questionnaires').select('id', { count: 'exact', head: true })
            .then(({ count }) => {
                if (count && count > 0) {
                    setText('ov-leads', count);
                    setText('ov-questionnaires', count);
                    setText('learning-count', count);
                    setText('funnel-registered', count);
                }
            }).catch(() => {});
    }

    // Funnel stats from portal questionnaires (real data)
    if (pq.length > 0) {
        setText('funnel-registered', pq.length);
        setText('funnel-active', pq.filter(q => (q.completed_count || 0) > 0).length);
        setText('funnel-hot', pq.filter(q => q.heat_level === 'hot' || q.heat_level === 'warm').length);
        setText('funnel-pipeline', pq.filter(q => q.status === 'potential' || q.status === 'client').length);
    }

    // Paid customers count (async, non-blocking)
    db.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active')
        .then(({ count }) => { setText('ov-paid-count', count || 0); })
        .catch(() => { setText('ov-paid-count', '—'); });

    // Recent activity summary
    const recentEl = document.getElementById('overview-recent-list');
    if (!recentEl) return;

    const recentItems = [];
    // Leads summary
    const todayLeads = pq.filter(q => q.created_at && new Date(q.created_at).toDateString() === new Date().toDateString()).length;
    if (todayLeads > 0) recentItems.push(`<i class="fa-solid fa-clipboard-list" style="color:var(--gold);"></i> ${todayLeads} לידים חדשים היום`);
    const hotLeads = pq.filter(q => q.heat_level === 'hot').length;
    if (hotLeads > 0) recentItems.push(`<i class="fa-solid fa-fire" style="color:#f85149;"></i> ${hotLeads} לידים רותחים ממתינים לטיפול`);
    const potential = pq.filter(q => q.status === 'potential').length;
    if (potential > 0) recentItems.push(`<i class="fa-solid fa-star" style="color:var(--gold);"></i> ${potential} לידים פוטנציאליים`);
    // Social cause
    const newPatients = patients.filter(p => p.status === 'new').length;
    const newTherapists = therapists.filter(t => t.status === 'new').length;
    if (newPatients > 0) recentItems.push(`<i class="fa-solid fa-user-injured" style="color:var(--muted-teal);"></i> ${newPatients} מטופלים חדשים ממתינים`);
    if (newTherapists > 0) recentItems.push(`<i class="fa-solid fa-user-doctor" style="color:var(--muted-teal);"></i> ${newTherapists} מטפלים חדשים ממתינים לאישור`);
    if (recentItems.length === 0) recentItems.push('אין פעילות חדשה');

    recentEl.innerHTML = recentItems.map(item => `<div style="padding:0.5rem 0;border-bottom:1px solid var(--border);">${item}</div>`).join('');
}

function filterPatients(status) {
    currentPatientFilter = status;
    document.querySelectorAll('#patients-view .tab').forEach(t => t.classList.remove('active'));
    event.currentTarget.classList.add('active');
    renderPatients();
}

function filterTherapists(status) {
    currentTherapistFilter = status;
    document.querySelectorAll('#therapists-view .tab').forEach(t => t.classList.remove('active'));
    event.currentTarget.classList.add('active');
    renderTherapists();
}

function genderDisplayLabel(gender) {
    const labels = { 'male': 'זכר', 'female': 'נקבה', 'other': 'אחר' };
    return labels[gender] || gender || '-';
}

function openModal(id) {
    const el = document.getElementById(id);
    el.classList.add('active');
    if (window.UI && UI.trapFocus) _focusTrapCleanup = UI.trapFocus(el);
}
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    if (_focusTrapCleanup) { _focusTrapCleanup(); _focusTrapCleanup = null; }
}

function statusLabel(status) {
    const labels = { 'new': 'חדש', 'pending_review': 'בבדיקה', 'waiting': 'ממתין', 'matched': 'שובץ', 'in_treatment': 'בטיפול', 'completed': 'הושלם', 'rejected': 'נדחה', 'approved': 'מאושר', 'active': 'פעיל', 'inactive': 'לא פעיל', 'cancelled': 'בוטל', 'contacted': 'נוצר קשר', 'converted': 'הומר' };
    return labels[status] || status;
}

function roleLabel(role) {
    const labels = { 'admin': 'מנהל', 'student_lead': 'תלמיד', 'therapist': 'מטפל', 'patient': 'מטופל' };
    return labels[role] || role;
}

function requestTypeLabel(type) {
    const labels = { 'training': 'הכשרה', 'patient': 'מטופל', 'general': 'כללי', 'therapist': 'מטפל', 'course-feedback': 'משוב', 'whatsapp_manual': '📱 בוט', 'manual': '📱 בוט', 'portal_questionnaire': 'שאלון פורטל' };
    return labels[type] || type || 'כללי';
}

function requestTypeClass(type) {
    const classes = { 'training': 'green', 'patient': 'blue', 'general': 'gold', 'therapist': 'blue', 'course-feedback': 'gold', 'whatsapp_manual': 'blue', 'manual': 'blue', 'portal_questionnaire': 'green' };
    return classes[type] || 'gold';
}

function therapyTypeLabel(type) {
    const labels = { 'online': 'זום (אונליין)', 'in_person': 'פרונטלי', 'both': 'שניהם' };
    return labels[type] || type || '-';
}

function genderLabel(gender) {
    const labels = { 'any': 'לא משנה', 'male': 'מטפל (גבר)', 'female': 'מטפלת (אישה)' };
    return labels[gender] || gender || '-';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('he-IL');
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('he-IL') + ' בשעה ' + date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function showToast(message, type) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===================
// SHARED: Date grouping, Select-all, Bulk delete, Single delete
// ===================

function getDateGroup(dateStr) {
    if (!dateStr) return 'ישן יותר';
    const d = new Date(dateStr).toDateString();
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (d === today) return 'היום';
    if (d === yesterday) return 'אתמול';
    return 'ישן יותר';
}

const dateGroupIcons = { 'היום': 'fa-calendar-day', 'אתמול': 'fa-calendar-minus', 'ישן יותר': 'fa-calendar-week' };

function groupByDate(items) {
    const groups = { 'היום': [], 'אתמול': [], 'ישן יותר': [] };
    items.forEach(item => groups[getDateGroup(item.created_at)].push(item));
    return groups;
}

function qStatusLabel(s) {
    const m = { 'new': 'חדש', 'reviewed': 'נקרא', 'approved': 'אושר', 'rejected': 'נדחה' };
    return m[s] || s || 'חדש';
}

function qStatusClass(s) {
    const m = { 'new': 'status-new', 'reviewed': 'status-contacted', 'approved': 'status-approved', 'rejected': 'status-rejected' };
    return m[s] || 'status-new';
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '-';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===================
// SHARED: Lead source rendering (unified across patients/therapists/leads/pipeline/portal-q)
// ===================

const SRC_HE = {
    instagram: 'אינסטגרם', facebook: 'פייסבוק', google: 'גוגל',
    youtube: 'יוטיוב', whatsapp: 'וואטסאפ', tiktok: 'טיקטוק',
    email: 'אימייל', telegram: 'טלגרם', twitter: 'טוויטר',
    linkedin: 'לינקדאין', meta: 'פייסבוק', fb: 'פייסבוק', ig: 'אינסטגרם'
};

const SRC_COLORS = {
    instagram: '#E4405F', facebook: '#1877F2', google: '#4285F4',
    youtube: '#FF0000', whatsapp: '#25D366', tiktok: '#111111',
    email: '#7f8c8d', telegram: '#0088cc', twitter: '#1DA1F2',
    linkedin: '#0A66C2', meta: '#1877F2', fb: '#1877F2', ig: '#E4405F'
};

// Returns { label, color, key } for a lead row's traffic source.
// Prefers attribution table over inline row UTM. Falls back to how_found, then referrer.
function formatLeadSource(row, attrib) {
    const utmRaw = (attrib?.last_utm_source || attrib?.first_utm_source || row?.utm_source || '').toString().toLowerCase().trim();
    const medium = attrib?.last_utm_medium || attrib?.first_utm_medium || row?.utm_medium;
    const howFound = attrib?.self_reported_source || row?.how_found;
    const ref = attrib?.last_referrer_domain || attrib?.first_referrer_domain;

    if (utmRaw) {
        const heName = SRC_HE[utmRaw] || utmRaw;
        const color = SRC_COLORS[utmRaw] || '#6c7a89';
        const label = medium ? `${heName} · ${medium}` : heName;
        return { label, color, key: utmRaw };
    }
    if (howFound) {
        return { label: howFound, color: '#9b59b6', key: 'self:' + howFound.toString().toLowerCase().trim() };
    }
    if (ref) {
        return { label: ref, color: '#3498db', key: 'ref:' + ref.toString().toLowerCase().trim() };
    }
    return { label: 'ישיר / לא ידוע', color: '#5a6470', key: 'direct' };
}

function renderSourceChip(row, attrib) {
    const { label, color } = formatLeadSource(row, attrib);
    return `<span class="source-chip" style="background:${color}">${escapeHtml(label)}</span>`;
}

// Build options for the source filter dropdown from a list of lead rows.
// Returns array of { value, label } for unique sources actually present.
function buildSourceFilterOptions(rows, tableName) {
    const seen = new Map();
    rows.forEach(r => {
        const attrib = (typeof attributionMap !== 'undefined') ? attributionMap.get(`${tableName}:${r.id}`) : null;
        const { label, key } = formatLeadSource(r, attrib);
        if (!seen.has(key)) seen.set(key, label);
    });
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
}

// Returns true if the row matches the selected source filter key (or filter is 'all').
function leadMatchesSourceFilter(row, attrib, filterKey) {
    if (!filterKey || filterKey === 'all') return true;
    const { key } = formatLeadSource(row, attrib);
    return key === filterKey;
}

// Refreshes a <select> element with options derived from the current data.
// Preserves the currently selected value if still present.
function refreshSourceFilterDropdown(selectId, rows, tableName, currentValue) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const options = buildSourceFilterOptions(rows, tableName);
    const html = ['<option value="all">כל המקורות</option>']
        .concat(options.map(o => `<option value="${escapeHtml(o.value)}"${o.value === currentValue ? ' selected' : ''}>${escapeHtml(o.label)}</option>`))
        .join('');
    if (sel.innerHTML !== html) sel.innerHTML = html;
    if (currentValue && [...sel.options].some(o => o.value === currentValue)) sel.value = currentValue;
}

// Called by source filter dropdown onchange. Re-renders the table.
function setSourceFilter(tableName, value) {
    if (typeof currentSourceFilter === 'undefined') return;
    currentSourceFilter[tableName] = value;
    const renderers = {
        patients: () => typeof renderPatients === 'function' && renderPatients(),
        therapists: () => typeof renderTherapists === 'function' && renderTherapists(),
        leads: () => typeof renderLeads === 'function' && renderLeads(),
        contact_leads: () => typeof renderContactLeads === 'function' && renderContactLeads(),
        pipeline: () => typeof renderPipeline === 'function' && renderPipeline(),
        portal_q: () => typeof renderPortalQuestionnaires === 'function' && renderPortalQuestionnaires()
    };
    renderers[tableName]?.();
}
