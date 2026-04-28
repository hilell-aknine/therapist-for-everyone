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
    'traffic':  { views: ['traffic'], header: 'traffic-header', default: 'traffic' },
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
    if (view === 'traffic' || group.default === 'traffic') loadTrafficSources();
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
