// admin-therapists.js — Therapists: load, render, filter, view, approve

async function loadTherapists() {
    const { data } = await db.from('therapists').select('*').order('created_at', { ascending: false });
    therapists = data || [];
    renderTherapists();
}

function renderTherapists() {
    const search = document.getElementById('therapist-search')?.value?.toLowerCase() || '';
    let filtered = therapists;
    if (currentTherapistFilter !== 'all') filtered = filtered.filter(t => t.status === currentTherapistFilter);
    if (search) filtered = filtered.filter(t => t.full_name?.toLowerCase().includes(search) || t.phone?.includes(search));

    const tbody = document.getElementById('therapists-table');
    resetSelectAll('select-all-therapists');
    updateBulkBarFor('therapists');

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><i class="fa-solid fa-inbox"></i><br>אין מטפלים</td></tr>';
        return;
    }

    const groups = groupByDate(filtered);
    let html = '';
    for (const [group, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        html += `<tr class="date-group-row"><td colspan="9"><i class="fa-solid ${dateGroupIcons[group]}"></i> ${group} (${items.length})</td></tr>`;
        html += items.map(t => `
            <tr>
                <td class="lead-checkbox"><input type="checkbox" value="${t.id}" onchange="updateBulkBarFor('therapists')"></td>
                <td><strong>${t.full_name}</strong></td>
                <td><a href="tel:${t.phone}" style="color:var(--info);text-decoration:none;">${t.phone || '-'}</a></td>
                <td>${t.specialization || '-'}</td>
                <td style="text-align:center;">${t.experience_years || 0} שנים</td>
                <td><span class="verified-badge ${t.documents_verified ? 'yes' : 'no'}">
                    <i class="fa-solid ${t.documents_verified ? 'fa-check-circle' : 'fa-clock'}"></i>
                    ${t.documents_verified ? 'מאומת' : 'ממתין'}
                </span></td>
                <td><span class="status-badge status-${t.status}">${statusLabel(t.status)}</span></td>
                <td>${formatDate(t.created_at)}</td>
                <td class="action-btns">
                    <div class="row-menu" id="menu-t-${t.id}">
                        <button class="row-menu-btn" onclick="toggleRowMenu('menu-t-${t.id}')">⋮</button>
                        <div class="row-menu-dropdown">
                            <button class="row-menu-item" onclick="viewTherapist('${t.id}');closeAllMenus()"><i class="fa-solid fa-eye"></i> צפייה</button>
                            <button class="row-menu-item" onclick="openEditModal('therapists','${t.id}');closeAllMenus()"><i class="fa-solid fa-pen"></i> עריכה</button>
                            ${t.status === 'new' ? `<button class="row-menu-item" onclick="approveTherapist('${t.id}');closeAllMenus()" style="color:var(--success);"><i class="fa-solid fa-check"></i> אישור</button>` : ''}
                            <button class="row-menu-item danger" onclick="deleteEntity('therapists','${t.id}','${(t.full_name||'').replace(/'/g,"\\'")}');closeAllMenus()"><i class="fa-solid fa-trash"></i> מחיקה</button>
                        </div>
                    </div>
                </td>
            </tr>
        `).join('');
    }
    tbody.innerHTML = html;
}

function viewTherapist(id) {
    const t = therapists.find(x => x.id === id);
    if (!t) return;
    currentViewedTherapist = t;
    document.getElementById('modal-therapist-name').textContent = t.full_name;
    const q = t.questionnaire || {};
    const health = q.health || {};
    const commitment = q.commitment || {};
    const practice = q.practice || {};

    // Format treatment methods as tags
    const methods = practice.treatment_methods || [];
    const methodTags = Array.isArray(methods) && methods.length > 0
        ? `<div class="method-tags">${methods.map(m => `<span class="method-tag">${m}</span>`).join('')}</div>`
        : '-';

    // Format therapy mode
    const therapyModeLabels = { 'zoom': 'זום בלבד', 'clinic': 'קליניקה בלבד', 'hybrid': 'משולב' };
    const therapyMode = therapyModeLabels[commitment.therapy_mode] || commitment.therapy_mode || '-';

    document.getElementById('therapist-modal-body').innerHTML = `
        <!-- BASIC INFO -->
        <div class="modal-section-divider"><i class="fa-solid fa-user"></i> פרטים אישיים</div>
        <div class="detail-row"><div class="detail-label">טלפון</div><div class="detail-value"><a href="tel:${t.phone}" style="color:var(--info);">${t.phone || '-'}</a></div></div>
        <div class="detail-row"><div class="detail-label">אימייל</div><div class="detail-value">${t.email || '-'}</div></div>
        <div class="detail-row"><div class="detail-label">עיר</div><div class="detail-value">${t.city || '-'}</div></div>
        <div class="detail-row"><div class="detail-label">מגדר</div><div class="detail-value">${genderDisplayLabel(t.gender)}</div></div>
        ${t.social_link ? `<div class="detail-row"><div class="detail-label">קישור חיצוני</div><div class="detail-value"><a href="${t.social_link}" target="_blank" class="social-link-btn"><i class="fa-solid fa-external-link"></i> פתח פרופיל</a></div></div>` : ''}

        <!-- PROFESSIONAL INFO -->
        <div class="modal-section-divider"><i class="fa-solid fa-briefcase-medical"></i> מידע מקצועי</div>
        <div class="detail-row"><div class="detail-label">התמחות</div><div class="detail-value">${t.specialization || '-'}</div></div>
        <div class="detail-row"><div class="detail-label">שיטות טיפול</div><div class="detail-value">${methodTags}</div></div>
        <div class="detail-row"><div class="detail-label">רישיון</div><div class="detail-value">${t.license_number || '-'}</div></div>
        ${t.education ? `<div class="detail-row"><div class="detail-label">השכלה</div><div class="detail-value" style="white-space:pre-wrap;">${t.education}</div></div>` : ''}

        <!-- STATS -->
        <div class="stats-grid">
            <div class="stat-box">
                <div class="value">${t.experience_years || 0}</div>
                <div class="label">שנות ניסיון</div>
            </div>
            <div class="stat-box">
                <div class="value">${practice.total_patients_estimate || 0}</div>
                <div class="label">מטופלים לאורך הקריירה</div>
            </div>
            <div class="stat-box">
                <div class="value">${practice.current_active_patients || 0}</div>
                <div class="label">מטופלים פעילים</div>
            </div>
        </div>

        <!-- WORK MODE & COMMITMENT -->
        <div class="modal-section-divider"><i class="fa-solid fa-calendar-check"></i> התחייבות ואופן עבודה</div>
        <div class="detail-row"><div class="detail-label">עבודה בזום</div><div class="detail-value">${t.works_online ? '<span style="color:var(--success);">✓ כן</span>' : 'לא'}</div></div>
        <div class="detail-row"><div class="detail-label">עבודה פרונטלית</div><div class="detail-value">${t.works_in_person ? '<span style="color:var(--success);">✓ כן</span>' : 'לא'}</div></div>
        <div class="detail-row"><div class="detail-label">אופן מועדף</div><div class="detail-value">${therapyMode}</div></div>
        <div class="detail-row"><div class="detail-label">שעות בחודש</div><div class="detail-value">${commitment.monthly_hours || t.available_hours_per_week * 4 || '-'}</div></div>
        <div class="detail-row"><div class="detail-label">תקופת התחייבות</div><div class="detail-value">${commitment.duration_months || '-'}</div></div>

        <!-- HEALTH DECLARATION -->
        <div class="modal-section-divider"><i class="fa-solid fa-heart-pulse"></i> הצהרת בריאות</div>
        <div class="detail-row">
            <div class="detail-label">בעיות רפואיות</div>
            <div class="detail-value">
                <span class="health-indicator ${health.has_medical_issues ? 'yes' : 'no'}">
                    <i class="fa-solid ${health.has_medical_issues ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i>
                    ${health.has_medical_issues ? 'יש' : 'אין'}
                </span>
            </div>
        </div>
        ${health.has_medical_issues && health.medical_issues_details ? `<div class="questionnaire-answer" style="margin-top:0.5rem;">${health.medical_issues_details}</div>` : ''}
        <div class="detail-row">
            <div class="detail-label">תרופות פסיכיאטריות</div>
            <div class="detail-value">
                <span class="health-indicator ${health.takes_psychiatric_meds ? 'yes' : 'no'}">
                    ${health.takes_psychiatric_meds ? 'כן' : 'לא'}
                </span>
            </div>
        </div>
        <div class="detail-row">
            <div class="detail-label">בטיפול אישי</div>
            <div class="detail-value">
                <span class="health-indicator no">
                    ${health.in_personal_therapy ? 'כן' : 'לא'}
                </span>
            </div>
        </div>

        <!-- DEEP PROFILE -->
        <div class="modal-section-divider"><i class="fa-solid fa-heart"></i> פרופיל עומק</div>
        ${q.why_profession ? `<div class="detail-section"><h4><i class="fa-solid fa-lightbulb"></i> למה בחרת במקצוע הטיפול?</h4><div class="questionnaire-answer">${q.why_profession}</div></div>` : ''}
        ${q.why_join ? `<div class="detail-section"><h4><i class="fa-solid fa-handshake-angle"></i> למה הצטרפת לפרויקט?</h4><div class="questionnaire-answer">${q.why_join}</div></div>` : ''}
        ${q.experience ? `<div class="detail-section"><h4><i class="fa-solid fa-briefcase"></i> ניסיון מעשי</h4><div class="questionnaire-answer">${q.experience}</div></div>` : ''}
        ${q.case_study ? `<div class="detail-section"><h4><i class="fa-solid fa-brain"></i> מקרה מורכב (Case Study)</h4><div class="questionnaire-answer">${q.case_study}</div></div>` : ''}
        ${q.challenges ? `<div class="detail-section"><h4><i class="fa-solid fa-mountain"></i> אתגרים</h4><div class="questionnaire-answer">${q.challenges}</div></div>` : ''}

        <!-- ADMIN SECTION -->
        <div class="modal-section-divider"><i class="fa-solid fa-cog"></i> ניהול</div>
        <div class="detail-row">
            <div class="detail-label">סטטוס</div>
            <div class="detail-value">
                <select id="therapist-status-select">
                    <option value="new" ${t.status === 'new' ? 'selected' : ''}>חדש</option>
                    <option value="pending_review" ${t.status === 'pending_review' ? 'selected' : ''}>בבדיקה</option>
                    <option value="approved" ${t.status === 'approved' ? 'selected' : ''}>מאושר</option>
                    <option value="active" ${t.status === 'active' ? 'selected' : ''}>פעיל</option>
                    <option value="inactive" ${t.status === 'inactive' ? 'selected' : ''}>לא פעיל</option>
                    <option value="rejected" ${t.status === 'rejected' ? 'selected' : ''}>נדחה</option>
                </select>
                <button class="btn btn-gold" onclick="updateTherapistStatus('${t.id}')" style="margin-right:0.5rem;">שמור</button>
            </div>
        </div>

        <div class="verification-toggle">
            <label>מסמכים מאומתים:</label>
            <label class="toggle-switch">
                <input type="checkbox" id="therapist-verified-toggle" ${t.documents_verified ? 'checked' : ''} onchange="toggleTherapistVerification('${t.id}', this.checked)">
                <span class="toggle-slider"></span>
            </label>
            <span style="color: ${t.documents_verified ? 'var(--success)' : 'var(--text-secondary)'};">${t.documents_verified ? 'מאומת' : 'לא מאומת'}</span>
        </div>

        <div class="detail-row" style="margin-top:1rem;">
            <div class="detail-label">תאריך הרשמה</div>
            <div class="detail-value">${formatDate(t.created_at)}</div>
        </div>

        <!-- DIGITAL SIGNATURE -->
        ${t.signature_data ? `
        <div class="modal-section-divider"><i class="fa-solid fa-signature"></i> חתימה דיגיטלית</div>
        <div style="background: #fff; padding: 15px; border-radius: 8px; text-align: center;">
            <img src="${t.signature_data}" alt="חתימה דיגיטלית" style="max-width: 100%; height: auto; max-height: 150px;">
        </div>
        <div style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);">
            <i class="fa-solid fa-clock"></i> נחתם בתאריך: ${formatDateTime(t.created_at)}
        </div>
        ` : ''}
    `;
    openModal('therapist-modal');
}

async function updateTherapistStatus(id) {
    const status = document.getElementById('therapist-status-select').value;
    const { error } = await db.from('therapists').update({ status }).eq('id', id);
    if (error) { showToast('שגיאה בעדכון', 'error'); return; }
    showToast('הסטטוס עודכן', 'success');
    closeModal('therapist-modal');
    loadTherapists();
}

async function toggleTherapistVerification(id, verified) {
    const { error } = await db.from('therapists').update({
        documents_verified: verified,
        verified_at: verified ? new Date().toISOString() : null
    }).eq('id', id);
    if (error) { showToast('שגיאה בעדכון', 'error'); return; }
    showToast(verified ? 'מסמכים אומתו' : 'אימות הוסר', 'success');
    loadTherapists();
}

async function approveTherapist(id) {
    const btn = document.querySelector(`[onclick="approveTherapist('${id}')"]`);
    const row = btn?.closest('tr');
    const { error } = await db.from('therapists').update({ status: 'approved' }).eq('id', id);
    if (error) { showToast('שגיאה באישור', 'error'); return; }
    if (row) row.classList.add('flash-success');
    showToast('המטפל אושר!', 'success');
    setTimeout(() => loadTherapists(), 800);
}
