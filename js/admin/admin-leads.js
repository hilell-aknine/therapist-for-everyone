// admin-leads.js — Leads + Contact Requests + Questionnaires

async function loadLeads() {
    const { data } = await db.from('profiles').select('*').order('created_at', { ascending: false });
    leads = data || [];
    renderLeads();
}

function renderLeads() {
    const search = document.getElementById('leads-search')?.value?.toLowerCase() || '';
    let filtered = leads;
    if (search) filtered = filtered.filter(l => l.full_name?.toLowerCase().includes(search) || l.email?.toLowerCase().includes(search));

    const tbody = document.getElementById('leads-table');
    resetSelectAll('select-all-leads-reg');
    updateBulkBarFor('leads');

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fa-solid fa-user-plus"></i><br>אין נרשמים</td></tr>';
        return;
    }

    const groups = groupByDate(filtered);
    let html = '';
    for (const [group, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        html += `<tr class="date-group-row"><td colspan="7"><i class="fa-solid ${dateGroupIcons[group]}"></i> ${group} (${items.length})</td></tr>`;
        html += items.map(l => `
            <tr>
                <td class="lead-checkbox"><input type="checkbox" value="${l.id}" onchange="updateBulkBarFor('leads')"></td>
                <td><strong>${l.full_name || '-'}</strong></td>
                <td>${l.phone ? `<a href="tel:${l.phone}">${l.phone}</a>` : '-'}</td>
                <td>${l.email || '-'}</td>
                <td>${l.role ? `<span class="role-badge role-${l.role}">${roleLabel(l.role)}</span>` : ''}</td>
                <td>${formatDate(l.created_at)}</td>
                <td class="action-btns">
                    <div class="row-menu" id="menu-l-${l.id}">
                        <button class="row-menu-btn" onclick="toggleRowMenu('menu-l-${l.id}')">⋮</button>
                        <div class="row-menu-dropdown">
                            <button class="row-menu-item" onclick="openEditModal('profiles','${l.id}');closeAllMenus()"><i class="fa-solid fa-pen"></i> עריכה</button>
                            <button class="row-menu-item danger" onclick="deleteEntity('profiles','${l.id}','${(l.full_name||'').replace(/'/g,"\\'")}');closeAllMenus()"><i class="fa-solid fa-trash"></i> מחיקה</button>
                        </div>
                    </div>
                </td>
            </tr>
        `).join('');
    }
    tbody.innerHTML = html;
}

function exportLeadsCSV() {
    if (leads.length === 0) { showToast('אין נתונים לייצוא', 'warning'); return; }
    const headers = ['שם', 'טלפון', 'אימייל', 'תפקידים', 'תאריך הרשמה'];
    const rows = leads.map(l => [
        l.full_name || '',
        l.phone || '',
        l.email || '',
        l.role || '',
        formatDate(l.created_at)
    ]);
    const bom = '\uFEFF';
    const csv = bom + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `leads_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showToast('הקובץ הורד בהצלחה!', 'success');
}

let contactLeads = [];
let currentContactFilter = 'all';

async function loadContactLeads() {
    const { data } = await db.from('contact_requests').select('*').order('created_at', { ascending: false });
    contactLeads = data || [];
    const realLeads = contactLeads.filter(l => l.request_type !== 'course-feedback');
    const feedbackCount = contactLeads.length - realLeads.length;
    document.getElementById('contact-leads-count').textContent = realLeads.length;
    document.getElementById('stat-contact-total').textContent = realLeads.length;
    document.getElementById('stat-contact-training').textContent = contactLeads.filter(l => l.request_type === 'training').length;
    document.getElementById('stat-contact-patient').textContent = contactLeads.filter(l => l.request_type === 'patient').length;
    document.getElementById('stat-contact-feedback').textContent = feedbackCount;
    renderContactLeads();
}

function filterContactLeads(filter) {
    currentContactFilter = filter;
    document.querySelectorAll('#contact-leads-view .tab').forEach(t => t.classList.remove('active'));
    event.currentTarget.classList.add('active');
    renderContactLeads();
}

function renderContactLeads() {
    const search = document.getElementById('contact-leads-search')?.value?.toLowerCase() || '';
    let filtered = contactLeads;
    if (currentContactFilter === 'all') filtered = filtered.filter(l => l.request_type !== 'course-feedback');
    else if (currentContactFilter === 'new') filtered = filtered.filter(l => l.status === 'new' && l.request_type !== 'course-feedback');
    else if (currentContactFilter === 'training') filtered = filtered.filter(l => l.request_type === 'training');
    else if (currentContactFilter === 'patient') filtered = filtered.filter(l => l.request_type === 'patient');
    else if (currentContactFilter === 'contacted') filtered = filtered.filter(l => (l.status === 'contacted' || l.status === 'converted') && l.request_type !== 'course-feedback');
    else if (currentContactFilter === 'feedback') filtered = filtered.filter(l => l.request_type === 'course-feedback');
    if (search) filtered = filtered.filter(l => (l.name || l.full_name || '').toLowerCase().includes(search) || (l.phone || '').includes(search));

    const tbody = document.getElementById('contact-leads-table');
    resetSelectAll('select-all-contact-leads');
    updateBulkBarFor('contact-leads');

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fa-solid fa-inbox"></i><br>אין לידים</td></tr>';
        return;
    }

    const groups = groupByDate(filtered);
    let html = '';
    for (const [group, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        html += `<tr class="date-group-row"><td colspan="8"><i class="fa-solid ${dateGroupIcons[group]}"></i> ${group} (${items.length})</td></tr>`;
        html += items.map(l => `
            <tr>
                <td class="lead-checkbox"><input type="checkbox" value="${l.id}" onchange="updateBulkBarFor('contact-leads')"></td>
                <td><strong>${l.name || l.full_name || 'אנונימי'}</strong></td>
                <td>${l.phone ? `<a href="tel:${l.phone}" style="color:var(--info);text-decoration:none;">${l.phone}</a>` : '-'}</td>
                <td><span class="stat-icon ${requestTypeClass(l.request_type)}" style="width:auto;height:auto;padding:0.2rem 0.6rem;border-radius:6px;font-size:0.75rem;display:inline-flex;">${requestTypeLabel(l.request_type)}</span></td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(l.message || '').replace(/"/g, '&quot;')}">${l.message || '-'}</td>
                <td><span class="status-badge status-${l.status}">${statusLabel(l.status)}</span></td>
                <td>${formatDate(l.created_at)}</td>
                <td class="action-btns">
                    <div class="row-menu" id="menu-cl-${l.id}">
                        <button class="row-menu-btn" onclick="toggleRowMenu('menu-cl-${l.id}')">⋮</button>
                        <div class="row-menu-dropdown">
                            ${l.phone ? `<button class="row-menu-item" onclick="window.open('https://wa.me/${l.phone.replace(/^0/,'972')}','_blank');closeAllMenus()"><i class="fa-brands fa-whatsapp" style="color:var(--success);"></i> WhatsApp</button>` : ''}
                            ${l.status === 'new' ? `<button class="row-menu-item" onclick="markContactLeadContacted('${l.id}');closeAllMenus()"><i class="fa-solid fa-check" style="color:var(--success);"></i> סמן כטופל</button>` : ''}
                            <button class="row-menu-item" onclick="openEditModal('contact_requests','${l.id}');closeAllMenus()"><i class="fa-solid fa-pen"></i> עריכה</button>
                            <button class="row-menu-item danger" onclick="deleteEntity('contact_requests','${l.id}','${(l.name || l.full_name || 'אנונימי').replace(/'/g,"\\'")}');closeAllMenus()"><i class="fa-solid fa-trash"></i> מחיקה</button>
                        </div>
                    </div>
                </td>
            </tr>
        `).join('');
    }
    tbody.innerHTML = html;
}

// Contact leads legacy wrappers for HTML onclick handlers
function toggleSelectAll() { toggleSelectAllFor('contact-leads'); }
function bulkDeleteLeads() { bulkDeleteEntity('contact-leads'); }

async function markContactLeadContacted(id) {
    const { error } = await db.from('contact_requests').update({ status: 'contacted', last_contacted_at: new Date().toISOString() }).eq('id', id);
    if (error) { showToast('שגיאה בעדכון', 'error'); return; }
    showToast('הליד סומן כטופל', 'success');
    loadContactLeads();
}

function exportContactLeadsCSV() {
    if (contactLeads.length === 0) { showToast('אין נתונים לייצוא', 'warning'); return; }
    const headers = ['שם', 'טלפון', 'אימייל', 'סוג פנייה', 'הודעה', 'סטטוס', 'תאריך'];
    const rows = contactLeads.map(l => [
        l.name || l.full_name || '', l.phone || '', l.email || '',
        requestTypeLabel(l.request_type), l.message || '', statusLabel(l.status), formatDate(l.created_at)
    ]);
    const bom = '\uFEFF';
    const csv = bom + [headers, ...rows].map(r => r.map(c => `"${(c+'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `contact_leads_${getDateString()}.csv`;
    link.click();
    showToast('הקובץ הורד בהצלחה!', 'success');
}

let questionnaires = [];
let currentQFilter = 'all';
let currentQId = null;

async function loadQuestionnaires() {
    const { data } = await db.from('questionnaire_submissions').select('*').order('created_at', { ascending: false });
    questionnaires = data || [];
    document.getElementById('questionnaires-count').textContent = questionnaires.length;
    document.getElementById('stat-q-total').textContent = questionnaires.length;
    document.getElementById('stat-q-new').textContent = questionnaires.filter(q => q.status === 'new').length;
    document.getElementById('stat-q-reviewed').textContent = questionnaires.filter(q => q.status === 'reviewed').length;
    document.getElementById('stat-q-approved').textContent = questionnaires.filter(q => q.status === 'approved').length;
    renderQuestionnaires();
}

function filterQuestionnaires(filter) {
    currentQFilter = filter;
    document.querySelectorAll('#questionnaires-view .tab').forEach(t => t.classList.remove('active'));
    event.currentTarget.classList.add('active');
    renderQuestionnaires();
}

function qStatusLabel(s) {
    const m = { 'new': 'חדש', 'reviewed': 'נקרא', 'approved': 'אושר', 'rejected': 'נדחה' };
    return m[s] || s || 'חדש';
}

function qStatusClass(s) {
    const m = { 'new': 'status-new', 'reviewed': 'status-contacted', 'approved': 'status-approved', 'rejected': 'status-rejected' };
    return m[s] || 'status-new';
}

function renderQuestionnaires() {
    const search = document.getElementById('questionnaires-search')?.value?.toLowerCase() || '';
    let filtered = questionnaires;
    if (currentQFilter !== 'all') filtered = filtered.filter(q => q.status === currentQFilter);
    if (search) filtered = filtered.filter(q =>
        (q.full_name || '').toLowerCase().includes(search) ||
        (q.phone || '').includes(search) ||
        (q.email || '').toLowerCase().includes(search) ||
        (q.occupation || '').toLowerCase().includes(search)
    );

    const tbody = document.getElementById('questionnaires-table');
    resetSelectAll('select-all-questionnaires');
    updateBulkBarFor('questionnaires');

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fa-solid fa-clipboard-question"></i><br>אין שאלונים</td></tr>';
        return;
    }

    const groups = groupByDate(filtered);
    let html = '';
    for (const [group, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        html += `<tr class="date-group-row"><td colspan="8"><i class="fa-solid ${dateGroupIcons[group]}"></i> ${group} (${items.length})</td></tr>`;
        html += items.map(q => `
            <tr style="cursor:pointer;" onclick="openQuestionnaireDetail('${q.id}')">
                <td class="lead-checkbox" onclick="event.stopPropagation()"><input type="checkbox" value="${q.id}" onchange="updateBulkBarFor('questionnaires')"></td>
                <td><strong>${q.full_name || 'אנונימי'}</strong></td>
                <td>${q.phone ? `<a href="tel:${q.phone}" style="color:var(--info);text-decoration:none;" onclick="event.stopPropagation()">${q.phone}</a>` : '-'}</td>
                <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${q.email || '-'}</td>
                <td>${q.occupation || '-'}</td>
                <td><span class="status-badge ${qStatusClass(q.status)}">${qStatusLabel(q.status)}</span></td>
                <td>${formatDate(q.created_at)}</td>
                <td class="action-btns" onclick="event.stopPropagation()">
                    <div class="row-menu" id="menu-q-${q.id}">
                        <button class="row-menu-btn" onclick="toggleRowMenu('menu-q-${q.id}')">⋮</button>
                        <div class="row-menu-dropdown">
                            <button class="row-menu-item" onclick="openQuestionnaireDetail('${q.id}');closeAllMenus()"><i class="fa-solid fa-eye"></i> צפייה</button>
                            ${q.phone ? `<button class="row-menu-item" onclick="window.open('https://wa.me/${q.phone.replace(/^0/,'972')}','_blank');closeAllMenus()"><i class="fa-brands fa-whatsapp" style="color:#25D366;"></i> WhatsApp</button>` : ''}
                            <button class="row-menu-item danger" onclick="deleteEntity('questionnaire_submissions','${q.id}','${(q.full_name || 'אנונימי').replace(/'/g,"\\'")}');closeAllMenus()"><i class="fa-solid fa-trash"></i> מחיקה</button>
                        </div>
                    </div>
                </td>
            </tr>
        `).join('');
    }
    tbody.innerHTML = html;
}

function toggleSelectAllQ() { toggleSelectAllFor('questionnaires'); }
function bulkDeleteQuestionnaires() { bulkDeleteEntity('questionnaires'); }

function openQuestionnaireDetail(id) {
    const q = questionnaires.find(x => x.id === id);
    if (!q) return;
    currentQId = id;

    document.getElementById('q-modal-title').textContent = `שאלון התאמה — ${q.full_name || 'ללא שם'}`;

    const waPhone = (q.phone || '').replace(/^0/, '972').replace(/[^0-9]/g, '');
    const waBtn = document.getElementById('q-btn-whatsapp');
    if (waPhone) {
        waBtn.href = `https://wa.me/${waPhone}`;
        waBtn.style.display = '';
    } else {
        waBtn.style.display = 'none';
    }

    const section = (icon, title, content) => content ? `
        <div class="detail-section">
            <h4><i class="fa-solid ${icon}"></i> ${title}</h4>
            <div class="questionnaire-answer">${escapeHtml(content)}</div>
        </div>` : '';

    const detailRow = (label, val) => val ? `
        <div class="detail-row">
            <span class="detail-label">${label}</span>
            <span class="detail-value">${escapeHtml(val)}</span>
        </div>` : '';

    const genderLabel = { 'זכר': 'זכר', 'נקבה': 'נקבה', 'אחר': 'אחר' };

    const html = `
        <div style="padding:1.5rem;">
            <!-- Personal Info Card -->
            <div style="background:var(--bg);border-radius:12px;padding:1.2rem;margin-bottom:1.5rem;border-right:4px solid var(--gold);">
                <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;">
                    <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,var(--gold),#c9a227);display:flex;align-items:center;justify-content:center;color:white;font-size:1.3rem;font-weight:700;">
                        ${(q.full_name || '?')[0]}
                    </div>
                    <div>
                        <h3 style="margin:0;color:var(--text-primary);font-size:1.1rem;">${escapeHtml(q.full_name || 'ללא שם')}</h3>
                        <span class="status-badge ${qStatusClass(q.status)}" style="margin-top:4px;">${qStatusLabel(q.status)}</span>
                    </div>
                    <div style="margin-right:auto;text-align:left;font-size:0.85rem;color:var(--text-secondary);">
                        ${formatDate(q.created_at)}
                    </div>
                </div>
                ${detailRow('מגדר', genderLabel[q.gender] || q.gender)}
                ${detailRow('אימייל', q.email)}
                ${detailRow('טלפון', q.phone)}
                ${detailRow('שנת לידה', q.birth_year)}
                ${detailRow('עיסוק', q.occupation)}
            </div>

            <!-- Connection -->
            <div class="detail-section">
                <h4><i class="fa-solid fa-link" style="color:var(--info);"></i> החיבור בינינו</h4>
            </div>
            ${detailRow('איך הגיע אלינו', q.how_found)}
            ${section('fa-heart', 'מה נגע בך מהתוכן שלנו?', q.what_touched_you)}

            <!-- Inner World -->
            ${section('fa-child-reaching', 'מה זה "מטפל" עבורך?', q.what_is_therapist)}
            ${section('fa-shield-halved', 'חולשה או נקודת תורפה', q.weakness)}
            ${section('fa-mountain-sun', 'משבר או תקופה מאתגרת', q.challenge)}
            ${section('fa-trophy', 'הישג שגורם לך לחייך', q.achievement)}

            <!-- Dreams & Goals -->
            ${section('fa-rocket', 'למה דווקא עכשיו?', q.why_now)}
            ${section('fa-crystal-ball', 'איך אתה רואה את עצמך בעוד 3 שנים?', q.vision_3_years)}
            ${section('fa-quote-right', 'המוטו שלך', q.motto)}

            <!-- Background -->
            ${(q.currently_practicing || q.previous_studies || q.people_accompanied) ? `
                <div class="detail-section">
                    <h4><i class="fa-solid fa-briefcase" style="color:var(--muted-teal);"></i> רקע מקצועי</h4>
                </div>
                ${detailRow('עוסק/ת בטיפול כיום?', q.currently_practicing)}
                ${detailRow('לימודים קודמים', q.previous_studies)}
                ${detailRow('אנשים שליוויתי', q.people_accompanied)}
            ` : ''}

            <!-- Admin Notes -->
            <div class="detail-section" style="margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border);">
                <h4><i class="fa-solid fa-sticky-note" style="color:var(--gold);"></i> הערות אדמין</h4>
                <textarea id="q-admin-notes" style="width:100%;min-height:80px;border-radius:8px;border:1px solid var(--border);padding:0.8rem;font-family:inherit;font-size:0.9rem;resize:vertical;background:var(--bg);" placeholder="הוסף הערות פנימיות...">${escapeHtml(q.notes || '')}</textarea>
                <button class="btn" style="margin-top:0.5rem;background:var(--muted-teal);color:white;" onclick="saveQNotes()"><i class="fa-solid fa-save"></i> שמור הערות</button>
            </div>
        </div>
    `;

    document.getElementById('q-modal-body').innerHTML = html;
    document.getElementById('questionnaire-modal').classList.add('active');

    // Auto-mark as reviewed if new
    if (q.status === 'new') {
        updateQStatus('reviewed', true);
    }
}

async function updateQStatus(status, silent) {
    if (!currentQId) return;
    const { error } = await db.from('questionnaire_submissions')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', currentQId);
    if (error) { showToast('שגיאה בעדכון', 'error'); return; }
    if (!silent) {
        const labels = { 'approved': 'המועמד אושר', 'reviewed': 'סומן כנקרא', 'rejected': 'המועמד נדחה' };
        showToast(labels[status] || 'עודכן', 'success');
        closeModal('questionnaire-modal');
    }
    loadQuestionnaires();
}

async function saveQNotes() {
    if (!currentQId) return;
    const notes = document.getElementById('q-admin-notes')?.value || '';
    const { error } = await db.from('questionnaire_submissions')
        .update({ notes, updated_at: new Date().toISOString() })
        .eq('id', currentQId);
    if (error) { showToast('שגיאה בשמירה', 'error'); return; }
    const q = questionnaires.find(x => x.id === currentQId);
    if (q) q.notes = notes;
    showToast('ההערות נשמרו', 'success');
}

function exportQuestionnairesCSV() {
    if (questionnaires.length === 0) { showToast('אין נתונים לייצוא', 'warning'); return; }
    const headers = ['שם', 'מגדר', 'אימייל', 'טלפון', 'שנת לידה', 'עיסוק', 'איך הגיע', 'מה נגע בך', 'מה זה מטפל', 'חולשה', 'אתגר', 'הישג', 'למה עכשיו', 'חזון 3 שנים', 'מוטו', 'עוסק בטיפול', 'לימודים', 'אנשים שליוויתי', 'סטטוס', 'הערות', 'תאריך'];
    const rows = questionnaires.map(q => [
        q.full_name || '', q.gender || '', q.email || '', q.phone || '', q.birth_year || '', q.occupation || '',
        q.how_found || '', q.what_touched_you || '', q.what_is_therapist || '', q.weakness || '', q.challenge || '',
        q.achievement || '', q.why_now || '', q.vision_3_years || '', q.motto || '',
        q.currently_practicing || '', q.previous_studies || '', q.people_accompanied || '',
        qStatusLabel(q.status), q.notes || '', formatDate(q.created_at)
    ]);
    const bom = '\uFEFF';
    const csv = bom + [headers, ...rows].map(r => r.map(c => `"${(c+'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `questionnaires_${getDateString()}.csv`;
    link.click();
    showToast('הקובץ הורד בהצלחה!', 'success');
}
