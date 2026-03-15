// admin-utils.js — Shared utility functions

// View groups: each main sidebar item maps to sub-views
const VIEW_GROUPS = {
    'overview': { views: ['overview'], header: null, default: 'overview' },
    'mizum':    { views: ['patients', 'therapists', 'matches'], header: 'mizum-header', default: 'patients' },
    'sales':    { views: ['contact-leads', 'questionnaires', 'pipeline'], header: 'sales-header', default: 'contact-leads' },
    'learning': { views: ['leads', 'learners', 'portal-q'], header: 'learning-header', default: 'leads' },
    'bot':      { views: ['bot'], header: null, default: 'bot' },
    'analytics':{ views: ['analytics'], header: null, default: 'analytics' },
    'settings': { views: ['settings'], header: null, default: 'settings' },
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
    if (view === 'learning' || group.default === 'learners') loadLearnersView();
    if (view === 'bot' || group.default === 'bot') loadBotView();
    if (view === 'analytics' || group.default === 'analytics') loadGA4Analytics();
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
}

function updateOverview() {
    setText('ov-patients', patients.length);
    setText('ov-therapists', therapists.length);
    setText('ov-matches', matches.length);
    setText('ov-leads', leads.length);
    setText('ov-learners', learnersData?.length || 0);
    setText('ov-pipeline', pipelineLeads.length);

    // Contact leads + questionnaires counts
    const clCount = typeof contactLeads !== 'undefined' ? contactLeads.length : 0;
    const qCount = typeof questionnaires !== 'undefined' ? questionnaires.length : 0;
    setText('ov-contact-leads', clCount);
    setText('ov-questionnaires', qCount);

    // Recent activity summary
    const recentEl = document.getElementById('overview-recent-list');
    if (!recentEl) return;

    const recentItems = [];
    const newPatients = patients.filter(p => p.status === 'new').length;
    const newTherapists = therapists.filter(t => t.status === 'new').length;
    if (newPatients > 0) recentItems.push(`<i class="fa-solid fa-user-injured" style="color:var(--gold);"></i> ${newPatients} מטופלים חדשים ממתינים לטיפול`);
    if (newTherapists > 0) recentItems.push(`<i class="fa-solid fa-user-doctor" style="color:var(--muted-teal);"></i> ${newTherapists} מטפלים חדשים ממתינים לאישור`);
    const activePipeline = pipelineLeads.filter(l => !['closed_won','closed_lost'].includes(l.stage)).length;
    if (activePipeline > 0) recentItems.push(`<i class="fa-solid fa-filter-circle-dollar" style="color:var(--gold);"></i> ${activePipeline} לידים פעילים ב-Pipeline`);
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
    const labels = { 'training': 'הכשרה', 'patient': 'מטופל', 'general': 'כללי', 'therapist': 'מטפל', 'course-feedback': 'משוב' };
    return labels[type] || type || 'כללי';
}

function requestTypeClass(type) {
    const classes = { 'training': 'green', 'patient': 'blue', 'general': 'gold', 'therapist': 'blue', 'course-feedback': 'gold' };
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
