// admin-patients.js — Patients + Matches: load, render, filter, view, createMatch

async function loadPatients() {
    const { data } = await db.from('patients').select('*').order('created_at', { ascending: false });
    patients = data || [];
    renderPatients();
}

async function loadMatches() {
    const { data } = await db.from('matches').select('*, therapists(full_name), patients(full_name)').order('created_at', { ascending: false });
    matches = data || [];
    renderMatches();
}

function renderPatients() {
    const search = document.getElementById('patient-search')?.value?.toLowerCase() || '';
    let filtered = patients;
    if (currentPatientFilter !== 'all') filtered = filtered.filter(p => p.status === currentPatientFilter);
    if (search) filtered = filtered.filter(p => p.full_name?.toLowerCase().includes(search) || p.phone?.includes(search));

    const tbody = document.getElementById('patients-table');
    resetSelectAll('select-all-patients');
    updateBulkBarFor('patients');

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fa-solid fa-inbox"></i><br>אין מטופלים</td></tr>';
        return;
    }

    const groups = groupByDate(filtered);
    let html = '';
    for (const [group, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        html += `<tr class="date-group-row"><td colspan="8"><i class="fa-solid ${dateGroupIcons[group]}"></i> ${group} (${items.length})</td></tr>`;
        html += items.map(p => `
            <tr>
                <td class="lead-checkbox"><input type="checkbox" value="${p.id}" onchange="updateBulkBarFor('patients')"></td>
                <td><strong>${p.full_name}</strong></td>
                <td><a href="tel:${p.phone}" style="color:var(--info);text-decoration:none;">${p.phone || '-'}</a></td>
                <td>${p.city || '-'}</td>
                <td><span class="verified-badge ${p.id_verified ? 'yes' : 'no'}">
                    <i class="fa-solid ${p.id_verified ? 'fa-check-circle' : 'fa-clock'}"></i>
                    ${p.id_verified ? 'מאומת' : 'ממתין'}
                </span></td>
                <td><span class="status-badge status-${p.status}">${statusLabel(p.status)}</span></td>
                <td>${formatDate(p.created_at)}</td>
                <td class="action-btns">
                    <div class="row-menu" id="menu-p-${p.id}">
                        <button class="row-menu-btn" onclick="toggleRowMenu('menu-p-${p.id}')">⋮</button>
                        <div class="row-menu-dropdown">
                            <button class="row-menu-item" onclick="viewPatient('${p.id}');closeAllMenus()"><i class="fa-solid fa-eye"></i> צפייה</button>
                            <button class="row-menu-item" onclick="openEditModal('patients','${p.id}');closeAllMenus()"><i class="fa-solid fa-pen"></i> עריכה</button>
                            <button class="row-menu-item danger" onclick="deleteEntity('patients','${p.id}','${(p.full_name||'').replace(/'/g,"\\'")}');closeAllMenus()"><i class="fa-solid fa-trash"></i> מחיקה</button>
                        </div>
                    </div>
                </td>
            </tr>
        `).join('');
    }
    tbody.innerHTML = html;
}

function renderMatches() {
    const tbody = document.getElementById('matches-table');
    resetSelectAll('select-all-matches');
    updateBulkBarFor('matches');

    if (matches.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fa-solid fa-handshake"></i><br>אין שידוכים</td></tr>';
        return;
    }

    const groups = groupByDate(matches);
    let html = '';
    for (const [group, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        html += `<tr class="date-group-row"><td colspan="7"><i class="fa-solid ${dateGroupIcons[group]}"></i> ${group} (${items.length})</td></tr>`;
        html += items.map(m => `
            <tr>
                <td class="lead-checkbox"><input type="checkbox" value="${m.id}" onchange="updateBulkBarFor('matches')"></td>
                <td>${m.patients?.full_name || '-'}</td>
                <td>${m.therapists?.full_name || '-'}</td>
                <td><span class="status-badge status-${m.status}">${statusLabel(m.status)}</span></td>
                <td>${m.session_count || 0}</td>
                <td>${formatDate(m.created_at)}</td>
                <td class="action-btns">
                    <select onchange="updateMatchStatus('${m.id}', this.value)" style="padding:0.3rem;font-size:0.8rem;">
                        <option value="new" ${m.status === 'new' ? 'selected' : ''}>חדש</option>
                        <option value="active" ${m.status === 'active' ? 'selected' : ''}>פעיל</option>
                        <option value="completed" ${m.status === 'completed' ? 'selected' : ''}>הושלם</option>
                        <option value="cancelled" ${m.status === 'cancelled' ? 'selected' : ''}>בוטל</option>
                    </select>
                    <div class="row-menu" id="menu-m-${m.id}">
                        <button class="row-menu-btn" onclick="toggleRowMenu('menu-m-${m.id}')">⋮</button>
                        <div class="row-menu-dropdown">
                            <button class="row-menu-item" onclick="openEditModal('appointments','${m.id}');closeAllMenus()"><i class="fa-solid fa-pen"></i> עריכה</button>
                            <button class="row-menu-item danger" onclick="deleteEntity('appointments','${m.id}','שידוך');closeAllMenus()"><i class="fa-solid fa-trash"></i> מחיקה</button>
                        </div>
                    </div>
                </td>
            </tr>
        `).join('');
    }
    tbody.innerHTML = html;
}

function viewPatient(id) {
    const p = patients.find(x => x.id === id);
    if (!p) return;
    currentViewedPatient = p;
    document.getElementById('modal-patient-name').textContent = p.full_name;
    const q = p.questionnaire || {};
    const fam = q.family_dynamics || {};
    const med = q.medical_background || {};
    const inner = q.inner_world || {};

    const maritalLabels = { 'רווק/ה': 'רווק/ה', 'נשוי/אה': 'נשוי/ה', 'גרוש/ה': 'גרוש/ה', 'אלמן/ה': 'אלמן/ה', 'בזוגיות': 'בזוגיות' };
    const militaryLabels = { 'צה"ל': 'צה"ל', 'שירות לאומי': 'שירות לאומי', 'פטור': 'פטור', 'לא שירתתי': 'לא שירתתי' };

    // Build siblings HTML
    let siblingsHtml = '';
    if (fam.siblings_count > 0 || (Array.isArray(fam.siblings_details) && fam.siblings_details.length > 0)) {
        const details = Array.isArray(fam.siblings_details) ? fam.siblings_details : [];
        siblingsHtml = `<div class="detail-row"><div class="detail-label">אחים/אחיות</div><div class="detail-value">${fam.siblings_count || details.length}</div></div>`;
        if (details.length > 0) {
            siblingsHtml += details.map((s, i) => `
                <div class="detail-row" style="padding-right:1rem;font-size:0.9rem;">
                    <div class="detail-label" style="width:100px;">${escapeHtml(s.name || 'אח/ות ' + (i+1))}</div>
                    <div class="detail-value" style="color:var(--text-secondary);">${escapeHtml(s.relationship || '-')}</div>
                </div>
            `).join('');
        }
    }

    document.getElementById('patient-modal-body').innerHTML = `
        <!-- PERSONAL INFO -->
        <div class="modal-section-divider"><i class="fa-solid fa-user"></i> פרטים אישיים</div>
        <div class="detail-row"><div class="detail-label">טלפון</div><div class="detail-value"><a href="tel:${p.phone}" style="color:var(--info);">${p.phone || '-'}</a></div></div>
        <div class="detail-row"><div class="detail-label">אימייל</div><div class="detail-value">${escapeHtml(p.email || '-')}</div></div>
        <div class="detail-row"><div class="detail-label">עיר</div><div class="detail-value">${escapeHtml(p.city || '-')}</div></div>
        ${p.birth_date ? `<div class="detail-row"><div class="detail-label">תאריך לידה</div><div class="detail-value">${formatDate(p.birth_date)}</div></div>` : ''}
        ${p.gender ? `<div class="detail-row"><div class="detail-label">מגדר</div><div class="detail-value">${genderDisplayLabel(p.gender)}</div></div>` : ''}
        ${p.marital_status ? `<div class="detail-row"><div class="detail-label">מצב משפחתי</div><div class="detail-value">${maritalLabels[p.marital_status] || p.marital_status}</div></div>` : ''}
        ${p.occupation ? `<div class="detail-row"><div class="detail-label">תעסוקה</div><div class="detail-value">${escapeHtml(p.occupation)}</div></div>` : ''}
        ${p.military_service ? `<div class="detail-row"><div class="detail-label">שירות צבאי</div><div class="detail-value">${militaryLabels[p.military_service] || p.military_service}</div></div>` : ''}

        <!-- PREFERENCES -->
        <div class="modal-section-divider"><i class="fa-solid fa-sliders"></i> העדפות טיפול</div>
        <div class="detail-row"><div class="detail-label">סוג טיפול</div><div class="detail-value">${therapyTypeLabel(p.therapy_type)}</div></div>
        <div class="detail-row"><div class="detail-label">העדפת מטפל</div><div class="detail-value">${genderLabel(p.therapist_gender_preference)}</div></div>

        <!-- REASON & EXPECTATIONS -->
        ${q.main_reason ? `<div class="modal-section-divider"><i class="fa-solid fa-comment-medical"></i> סיבת הפנייה</div><div class="questionnaire-answer">${escapeHtml(q.main_reason)}</div>` : ''}
        ${q.previous_therapy_history ? `<div class="detail-section"><h4><i class="fa-solid fa-history"></i> טיפול קודם</h4><div class="questionnaire-answer">${escapeHtml(q.previous_therapy_history)}</div></div>` : ''}
        ${q.expectations ? `<div class="detail-section"><h4><i class="fa-solid fa-bullseye"></i> ציפיות מהטיפול</h4><div class="questionnaire-answer">${escapeHtml(q.expectations)}</div></div>` : ''}
        ${q.why_now ? `<div class="detail-section"><h4><i class="fa-solid fa-bolt"></i> למה דווקא עכשיו</h4><div class="questionnaire-answer">${escapeHtml(q.why_now)}</div></div>` : ''}
        ${q.fears ? `<div class="detail-section"><h4><i class="fa-solid fa-shield-halved"></i> חששות לגבי הטיפול</h4><div class="questionnaire-answer">${escapeHtml(q.fears)}</div></div>` : ''}

        <!-- FAMILY DYNAMICS -->
        ${(fam.mother_relationship || fam.father_relationship) ? `
        <div class="modal-section-divider"><i class="fa-solid fa-people-roof"></i> דינמיקה משפחתית</div>
        ${fam.mother_name || fam.mother_relationship ? `
            <div class="detail-row"><div class="detail-label">האם</div><div class="detail-value"><strong>${escapeHtml(fam.mother_name || '-')}</strong></div></div>
            ${fam.mother_relationship ? `<div class="questionnaire-answer" style="margin:0.3rem 0 0.8rem;font-size:0.88rem;">${escapeHtml(fam.mother_relationship)}</div>` : ''}
        ` : ''}
        ${fam.father_name || fam.father_relationship ? `
            <div class="detail-row"><div class="detail-label">האב</div><div class="detail-value"><strong>${escapeHtml(fam.father_name || '-')}</strong></div></div>
            ${fam.father_relationship ? `<div class="questionnaire-answer" style="margin:0.3rem 0 0.8rem;font-size:0.88rem;">${escapeHtml(fam.father_relationship)}</div>` : ''}
        ` : ''}
        ${siblingsHtml}
        ` : ''}

        <!-- MEDICAL BACKGROUND -->
        ${(med.chronic_issues || med.medications || med.other_treatment) ? `
        <div class="modal-section-divider"><i class="fa-solid fa-notes-medical"></i> רקע רפואי</div>
        ${med.chronic_issues ? `<div class="detail-section"><h4><i class="fa-solid fa-heart-pulse"></i> מחלות כרוניות</h4><div class="questionnaire-answer">${escapeHtml(med.chronic_issues)}</div></div>` : ''}
        ${med.medications ? `<div class="detail-section"><h4><i class="fa-solid fa-pills"></i> תרופות</h4><div class="questionnaire-answer">${escapeHtml(med.medications)}</div></div>` : ''}
        ${med.other_treatment ? `
            <div class="detail-row"><div class="detail-label">טיפול נוסף</div><div class="detail-value"><span class="health-indicator yes"><i class="fa-solid fa-exclamation-circle"></i> כן</span></div></div>
            ${med.other_treatment_details ? `<div class="questionnaire-answer" style="margin-top:0.3rem;">${escapeHtml(med.other_treatment_details)}</div>` : ''}
        ` : ''}
        ` : ''}

        <!-- INNER WORLD -->
        ${(inner.early_memory || inner.open_space) ? `
        <div class="modal-section-divider"><i class="fa-solid fa-brain"></i> עולם פנימי</div>
        ${inner.early_memory ? `<div class="detail-section"><h4><i class="fa-solid fa-child-reaching"></i> זכרון מוקדם מילדות</h4><div class="questionnaire-answer">${escapeHtml(inner.early_memory)}</div></div>` : ''}
        ${inner.open_space ? `<div class="detail-section"><h4><i class="fa-solid fa-feather-pointed"></i> מרחב פתוח</h4><div class="questionnaire-answer">${escapeHtml(inner.open_space)}</div></div>` : ''}
        ` : ''}

        <!-- ADMIN SECTION -->
        <div class="modal-section-divider"><i class="fa-solid fa-cog"></i> ניהול</div>
        <div class="detail-row">
            <div class="detail-label">סטטוס</div>
            <div class="detail-value">
                <select id="patient-status-select">
                    <option value="new" ${p.status === 'new' ? 'selected' : ''}>חדש</option>
                    <option value="waiting" ${p.status === 'waiting' ? 'selected' : ''}>ממתין לשיבוץ</option>
                    <option value="matched" ${p.status === 'matched' ? 'selected' : ''}>שובץ</option>
                    <option value="in_treatment" ${p.status === 'in_treatment' ? 'selected' : ''}>בטיפול</option>
                    <option value="completed" ${p.status === 'completed' ? 'selected' : ''}>הושלם</option>
                    <option value="rejected" ${p.status === 'rejected' ? 'selected' : ''}>נדחה</option>
                </select>
                <button class="btn btn-gold" onclick="updatePatientStatus('${p.id}')" style="margin-right:0.5rem;">שמור</button>
            </div>
        </div>

        <div class="verification-toggle">
            <label>זהות מאומתת:</label>
            <label class="toggle-switch">
                <input type="checkbox" id="patient-verified-toggle" ${p.id_verified ? 'checked' : ''} onchange="togglePatientVerification('${p.id}', this.checked)">
                <span class="toggle-slider"></span>
            </label>
            <span style="color: ${p.id_verified ? 'var(--success)' : 'var(--text-secondary)'};">${p.id_verified ? 'מאומת' : 'לא מאומת'}</span>
        </div>

        <div class="detail-row" style="margin-top:0.5rem;"><div class="detail-label">תאריך הרשמה</div><div class="detail-value">${formatDateTime(p.created_at)}</div></div>

        <div class="match-form">
            <div class="form-group">
                <label><i class="fa-solid fa-handshake"></i> שיבוץ למטפל</label>
                <select id="match-therapist-select">
                    <option value="">בחר מטפל...</option>
                    ${therapists.filter(t => t.status === 'active' || t.status === 'approved').map(t =>
                        `<option value="${t.id}">${t.full_name} - ${(t.specializations || [t.specialization]).filter(Boolean).join(', ') || 'כללי'}</option>`
                    ).join('')}
                </select>
            </div>
            <button class="btn btn-gold" onclick="createMatch('${p.id}')">
                <i class="fa-solid fa-check"></i> שבץ
            </button>
        </div>

        <!-- DIGITAL SIGNATURE -->
        ${p.signature_data ? `
        <div class="modal-section-divider" style="margin-top: 1.5rem;"><i class="fa-solid fa-signature"></i> חתימה דיגיטלית</div>
        <div style="background: #fff; padding: 15px; border-radius: 8px; text-align: center;">
            <img src="${p.signature_data}" alt="חתימה דיגיטלית" style="max-width: 100%; height: auto; max-height: 150px;">
        </div>
        <div style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);">
            <i class="fa-solid fa-clock"></i> נחתם בתאריך: ${formatDateTime(p.created_at)}
        </div>
        ` : ''}
    `;
    openModal('patient-modal');
}

async function updatePatientStatus(id) {
    const status = document.getElementById('patient-status-select').value;
    const { error } = await db.from('patients').update({ status }).eq('id', id);
    if (error) { showToast('שגיאה בעדכון', 'error'); return; }
    showToast('הסטטוס עודכן', 'success');
    closeModal('patient-modal');
    loadPatients();
}

async function togglePatientVerification(id, verified) {
    const { error } = await db.from('patients').update({
        id_verified: verified,
        verified_at: verified ? new Date().toISOString() : null
    }).eq('id', id);
    if (error) { showToast('שגיאה בעדכון', 'error'); return; }
    showToast(verified ? 'זהות אומתה' : 'אימות הוסר', 'success');
    loadPatients();
}

async function createMatch(patientId) {
    const therapistId = document.getElementById('match-therapist-select').value;
    if (!therapistId) { showToast('בחר מטפל', 'error'); return; }

    const { error } = await db.from('matches').insert({
        patient_id: patientId,
        therapist_id: therapistId,
        status: 'new'
    });

    if (error) {
        if (error.code === '23505') { showToast('שידוך כבר קיים', 'error'); }
        else { showToast('שגיאה ביצירת שידוך', 'error'); }
        return;
    }

    await db.from('patients').update({ status: 'matched' }).eq('id', patientId);
    showToast('השידוך נוצר!', 'success');
    closeModal('patient-modal');
    // Flash the patients stat card
    const statCards = document.querySelectorAll('.stat-card');
    if (statCards[0]) statCards[0].classList.add('flash-success');
    setTimeout(() => { statCards[0]?.classList.remove('flash-success'); loadAllData(); }, 800);
}

async function updateMatchStatus(id, status) {
    const btn = document.querySelector(`[onclick*="updateMatchStatus('${id}'"]`);
    const row = btn?.closest('tr');
    const { error } = await db.from('matches').update({ status }).eq('id', id);
    if (error) { showToast('שגיאה בעדכון', 'error'); return; }
    if (row) row.classList.add('flash-success');
    showToast('הסטטוס עודכן', 'success');
    setTimeout(() => loadMatches(), 800);
}

