// admin-utils.js — Shared utility functions

function switchView(view) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    event.currentTarget.classList.add('active');
    ['patients','therapists','matches','leads','contact-leads','questionnaires','pipeline','bot','analytics','settings'].forEach(v => {
        document.getElementById(v + '-view')?.classList.toggle('hidden', view !== v);
    });
    if (view === 'bot') loadBotView();
    if (view === 'analytics') loadGA4Analytics();
    if (view === 'settings') { loadSettingsView(); loadUtmConfigs(); loadAutomationConfigs(); loadPermissionsManager(); loadSalesRepManager(); }
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
