// admin-crud.js — Entity maps, bulk selection, delete, edit modal, row menus

function resetSelectAll(checkboxId) {
    const el = document.getElementById(checkboxId);
    if (el) el.checked = false;
}

// Generic select-all for any table
function toggleSelectAllFor(tableKey) {
    const tbodyMap = { leads: 'leads-table', 'contact-leads': 'contact-leads-table' };
    const tbodyId = tbodyMap[tableKey] || tableKey + '-table';
    const selectMap = { leads: 'select-all-leads-reg', 'contact-leads': 'select-all-contact-leads' };
    const selectAllId = selectMap[tableKey] || 'select-all-' + tableKey;
    const checked = document.getElementById(selectAllId).checked;
    document.querySelectorAll(`#${tbodyId} .lead-checkbox input[type="checkbox"]`).forEach(cb => cb.checked = checked);
    updateBulkBarFor(tableKey);
}

function updateBulkBarFor(tableKey) {
    const tbodyMap = { leads: 'leads-table', 'contact-leads': 'contact-leads-table' };
    const tbodyId = tbodyMap[tableKey] || tableKey + '-table';
    const selected = document.querySelectorAll(`#${tbodyId} .lead-checkbox input[type="checkbox"]:checked`);
    const bar = document.getElementById('bulk-bar-' + tableKey);
    const count = document.getElementById('bulk-count-' + tableKey);
    if (!bar || !count) return;
    if (selected.length > 0) {
        bar.classList.add('visible');
        count.textContent = `${selected.length} נבחרו`;
    } else {
        bar.classList.remove('visible');
    }
}


const entityDbTable = {
    patients: 'patients',
    therapists: 'therapists',
    matches: 'appointments',
    leads: 'profiles',
    'contact-leads': 'contact_requests',
    'questionnaires': 'questionnaire_submissions',
    'pipeline': 'sales_leads'
};

const entityReloadFn = {
    patients: () => { loadPatients(); updateCounts(); },
    therapists: () => { loadTherapists(); updateCounts(); },
    matches: () => { loadMatches(); updateCounts(); },
    leads: () => { loadLeads(); updateCounts(); },
    'contact-leads': () => { loadContactLeads(); },
    'questionnaires': () => { loadQuestionnaires(); },
    'pipeline': () => { loadPipeline(); updateCounts(); }
};

// Generic single delete — opens confirmation modal
let pendingDeleteAction = null;

function deleteEntity(dbTable, id, name) {
    document.getElementById('delete-confirm-text').textContent = `האם למחוק את "${name}"?`;
    pendingDeleteAction = async () => {
        const { error } = await db.from(dbTable).delete().eq('id', id);
        if (error) { showToast('שגיאה במחיקה', 'error'); return; }
        showToast('נמחק בהצלחה', 'success');
        // Reload appropriate table
        for (const [key, table] of Object.entries(entityDbTable)) {
            if (table === dbTable) { entityReloadFn[key](); break; }
        }
    };
    document.getElementById('delete-confirm-modal').classList.add('active');
}

// Generic bulk delete
function bulkDeleteEntity(tableKey) {
    const tbodyMap = { leads: 'leads-table', 'contact-leads': 'contact-leads-table' };
    const tbodyId = tbodyMap[tableKey] || tableKey + '-table';
    const selected = document.querySelectorAll(`#${tbodyId} .lead-checkbox input[type="checkbox"]:checked`);
    const ids = Array.from(selected).map(cb => cb.value);
    if (ids.length === 0) return;
    const dbTable = entityDbTable[tableKey];
    document.getElementById('delete-confirm-text').textContent = `האם למחוק ${ids.length} פריטים?`;
    pendingDeleteAction = async () => {
        const { error } = await db.from(dbTable).delete().in('id', ids);
        if (error) { showToast('שגיאה במחיקה', 'error'); return; }
        showToast(`${ids.length} פריטים נמחקו`, 'success');
        entityReloadFn[tableKey]();
    };
    document.getElementById('delete-confirm-modal').classList.add('active');
}

async function confirmDeleteAction() {
    if (pendingDeleteAction) {
        await pendingDeleteAction();
        pendingDeleteAction = null;
    }
    closeDeleteModal();
}

function closeDeleteModal() {
    document.getElementById('delete-confirm-modal').classList.remove('active');
    pendingDeleteAction = null;
}

// 3-dot menu toggle
function toggleRowMenu(menuId) {
    const menu = document.getElementById(menuId);
    const wasOpen = menu.classList.contains('open');
    closeAllMenus();
    if (!wasOpen) menu.classList.add('open');
}

function closeAllMenus() {
    document.querySelectorAll('.row-menu.open').forEach(m => m.classList.remove('open'));
}


document.addEventListener('click', (e) => {
    if (!e.target.closest('.row-menu')) closeAllMenus();
});

// ===================
// INLINE EDIT MODAL
// ===================
let editingTable = null;
let editingId = null;

// Editable fields per table
const editableFields = {
    patients: [
        { key: 'full_name', label: 'שם מלא', type: 'text' },
        { key: 'phone', label: 'טלפון', type: 'text' },
        { key: 'email', label: 'אימייל', type: 'email' },
        { key: 'city', label: 'עיר', type: 'text' },
        { key: 'status', label: 'סטטוס', type: 'select', options: { new: 'חדש', waiting: 'ממתין', in_treatment: 'בטיפול', completed: 'הושלם' } }
    ],
    therapists: [
        { key: 'full_name', label: 'שם מלא', type: 'text' },
        { key: 'phone', label: 'טלפון', type: 'text' },
        { key: 'email', label: 'אימייל', type: 'email' },
        { key: 'specialization', label: 'התמחות', type: 'text' },
        { key: 'experience_years', label: 'שנות ניסיון', type: 'number' },
        { key: 'status', label: 'סטטוס', type: 'select', options: { new: 'חדש', approved: 'מאושר', active: 'פעיל', inactive: 'לא פעיל' } }
    ],
    appointments: [
        { key: 'status', label: 'סטטוס', type: 'select', options: { new: 'חדש', active: 'פעיל', completed: 'הושלם', cancelled: 'בוטל' } },
        { key: 'session_count', label: 'מספר פגישות', type: 'number' }
    ],
    profiles: [
        { key: 'full_name', label: 'שם מלא', type: 'text' },
        { key: 'email', label: 'אימייל', type: 'email' }
    ],
    contact_requests: [
        { key: 'name', label: 'שם', type: 'text' },
        { key: 'phone', label: 'טלפון', type: 'text' },
        { key: 'email', label: 'אימייל', type: 'email' },
        { key: 'message', label: 'הודעה', type: 'textarea' },
        { key: 'status', label: 'סטטוס', type: 'select', options: { new: 'חדש', contacted: 'נוצר קשר', converted: 'הומר' } }
    ]
};

async function openEditModal(table, id) {
    editingTable = table;
    editingId = id;

    const { data, error } = await db.from(table).select('*').eq('id', id).single();
    if (error || !data) { showToast('שגיאה בטעינת נתונים', 'error'); return; }

    const fields = editableFields[table] || [];
    const formHtml = fields.map(f => {
        if (f.type === 'select') {
            const opts = Object.entries(f.options).map(([v, l]) =>
                `<option value="${v}" ${data[f.key] === v ? 'selected' : ''}>${l}</option>`
            ).join('');
            return `<div style="margin-bottom:1rem;"><label style="display:block;font-weight:600;margin-bottom:0.3rem;font-size:0.85rem;">${f.label}</label><select id="edit-${f.key}" style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;font-family:inherit;background:var(--bg);color:var(--text);">${opts}</select></div>`;
        }
        if (f.type === 'textarea') {
            return `<div style="margin-bottom:1rem;"><label style="display:block;font-weight:600;margin-bottom:0.3rem;font-size:0.85rem;">${f.label}</label><textarea id="edit-${f.key}" rows="3" style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;font-family:inherit;resize:vertical;background:var(--bg);color:var(--text);">${data[f.key] || ''}</textarea></div>`;
        }
        return `<div style="margin-bottom:1rem;"><label style="display:block;font-weight:600;margin-bottom:0.3rem;font-size:0.85rem;">${f.label}</label><input id="edit-${f.key}" type="${f.type}" value="${data[f.key] || ''}" style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;font-family:inherit;background:var(--bg);color:var(--text);"></div>`;
    }).join('');

    document.getElementById('edit-modal-body').innerHTML = formHtml;
    document.getElementById('edit-modal').classList.add('active');
}

async function saveEdit() {
    if (!editingTable || !editingId) return;
    const fields = editableFields[editingTable] || [];
    const updates = {};
    fields.forEach(f => {
        const el = document.getElementById('edit-' + f.key);
        if (el) updates[f.key] = f.type === 'number' ? Number(el.value) : el.value;
    });

    const { error } = await db.from(editingTable).update(updates).eq('id', editingId);
    if (error) { showToast('שגיאה בשמירה', 'error'); return; }

    showToast('נשמר בהצלחה', 'success');
    closeEditModal();

    // Reload the right table
    for (const [key, table] of Object.entries(entityDbTable)) {
        if (table === editingTable) { entityReloadFn[key](); break; }
    }
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('active');
    editingTable = null;
    editingId = null;
}

// ===================
// CONTACT LEADS (contact_requests)

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal('patient-modal'); closeModal('therapist-modal'); closeModal('export-modal'); closeModal('broadcast-modal'); closeModal('questionnaire-modal'); closeModal('pipeline-modal'); closeDeleteModal(); closeEditModal(); closeAllMenus(); }
});

// ===================
// QUESTIONNAIRE SUBMISSIONS
