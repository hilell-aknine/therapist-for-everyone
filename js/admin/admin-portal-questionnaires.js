// admin-portal-questionnaires.js — Portal questionnaire responses view

let portalQuestionnaires = [];
let portalQLoaded = false;

async function loadPortalQuestionnaires() {
    try {
        const { data: qData, error: qErr } = await db
            .from('portal_questionnaires')
            .select('*')
            .order('created_at', { ascending: false });

        if (qErr) throw qErr;

        const { data: profiles } = await db
            .from('profiles')
            .select('id, full_name, email, phone');

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        portalQuestionnaires = (qData || []).map(q => {
            const profile = profileMap[q.user_id] || {};
            return {
                ...q,
                full_name: profile.full_name || '',
                email: profile.email || '',
                phone: profile.phone || ''
            };
        });

        portalQLoaded = true;
        setText('portal-q-count', portalQuestionnaires.length);
        setText('stat-portal-q-total', portalQuestionnaires.length);
        setText('stat-portal-q-today', portalQuestionnaires.filter(q => isToday(q.created_at)).length);

        renderPortalQuestionnaires();
    } catch (err) {
        console.error('Error loading portal questionnaires:', err);
    }
}

function isToday(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    return d.toDateString() === now.toDateString();
}

// ============================================================================
// TABLE RENDER
// ============================================================================

function renderPortalQuestionnaires() {
    const search = document.getElementById('portal-q-search')?.value?.toLowerCase() || '';
    let filtered = portalQuestionnaires;

    if (search) {
        filtered = filtered.filter(q =>
            (q.full_name || '').toLowerCase().includes(search) ||
            (q.email || '').toLowerCase().includes(search) ||
            (q.phone || '').includes(search) ||
            (q.city || '').toLowerCase().includes(search)
        );
    }

    const tbody = document.getElementById('portal-q-table');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><i class="fa-solid fa-clipboard-list"></i><br>אין שאלוני היכרות</td></tr>';
        return;
    }

    const statusLabels = { 'new': 'תלמיד', 'potential': 'לקוח פוטנציאלי', 'client': 'לקוח' };
    const statusColors = { 'new': 'rgba(47,133,146,0.15);color:var(--dusty-aqua)', 'potential': 'rgba(212,175,55,0.15);color:var(--gold)', 'client': 'rgba(39,174,96,0.15);color:var(--success)' };

    const groups = groupByDate(filtered);
    let html = '';
    for (const [group, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        html += `<tr class="date-group-row"><td colspan="9"><i class="fa-solid ${dateGroupIcons[group]}"></i> ${group} (${items.length})</td></tr>`;
        html += items.map(q => {
            const st = q.status || 'new';
            const statusBg = statusColors[st] || statusColors['new'];
            return `
                <tr onclick="viewPortalQ('${q.id}')" style="cursor:pointer;">
                    <td><strong>${escapeHtml(q.full_name || '-')}</strong></td>
                    <td>${q.phone ? `<a href="tel:${escapeHtml(q.phone)}" onclick="event.stopPropagation()">${escapeHtml(q.phone)}</a>` : '-'}</td>
                    <td style="font-size:0.85rem;color:var(--text-secondary);">${escapeHtml(q.email || '-')}</td>
                    <td>${escapeHtml(q.city || '-')}</td>
                    <td><span style="font-size:0.8rem;background:rgba(212,175,55,0.1);color:var(--gold);padding:0.15rem 0.5rem;border-radius:6px;">${escapeHtml(q.why_nlp || '-')}</span></td>
                    <td><span style="font-size:0.8rem;background:${statusBg};padding:0.15rem 0.5rem;border-radius:6px;">${statusLabels[st] || 'תלמיד'}</span></td>
                    <td style="font-size:0.85rem;color:var(--text-secondary);">${formatDate(q.created_at)}</td>
                </tr>
            `;
        }).join('');
    }
    tbody.innerHTML = html;
}

// ============================================================================
// DETAIL MODAL — Visual Card Layout
// ============================================================================

const _pqLabels = {
    studyTime: { 'פחות מ-30 דק': 'פחות מ-30 דק׳ ביום', '30 דק - שעה': '30 דק׳ – שעה ביום', '1-2 שעות': '1-2 שעות ביום', 'יותר מ-2 שעות': 'יותר מ-2 שעות ביום' },
    challenge: { 'מוטיבציה': 'שמירה על מוטיבציה', 'ניהול זמן': 'ניהול זמן', 'הבנת חומר': 'הבנת חומר ללא תמיכה', 'טכנולוגי': 'קושי טכנולוגי' },
    status: { 'new': 'תלמיד', 'potential': 'לקוח פוטנציאלי', 'client': 'לקוח' }
};

function _pqField(icon, label, value) {
    return `<div class="pq-field"><i class="fa-solid fa-${icon}" style="color:var(--gold);font-size:0.75rem;margin-left:0.4rem;"></i><span class="pq-field-label">${label}</span><span class="pq-field-value">${escapeHtml(value || '-')}</span></div>`;
}

function _pqSection(icon, title, content) {
    return `<div class="pq-section"><div class="pq-section-header"><i class="fa-solid fa-${icon}"></i> ${title}</div><div class="pq-section-body">${content}</div></div>`;
}

function _pqAnswer(question, answer) {
    if (!answer) return '';
    return `<div class="pq-answer"><div class="pq-answer-q">${question}</div><div class="pq-answer-a">${escapeHtml(answer)}</div></div>`;
}

function viewPortalQ(id) {
    const q = portalQuestionnaires.find(x => x.id === id);
    if (!q) return;

    const st = q.status || 'new';
    const content = document.getElementById('portal-q-modal-content');

    content.innerHTML = `
        <!-- Header Card -->
        <div class="pq-header-card">
            <div class="pq-avatar">${(q.full_name || '?')[0]}</div>
            <div class="pq-header-info">
                <h2 class="pq-name">${escapeHtml(q.full_name || 'ללא שם')}</h2>
                <div class="pq-meta">
                    ${q.email ? `<span><i class="fa-solid fa-envelope"></i> ${escapeHtml(q.email)}</span>` : ''}
                    ${q.phone ? `<span><i class="fa-solid fa-phone"></i> <a href="tel:${escapeHtml(q.phone)}" style="color:inherit;">${escapeHtml(q.phone)}</a></span>` : ''}
                </div>
            </div>
            <div class="pq-status-area">
                <select id="pq-status-select" class="pq-status-select" onchange="changePortalQStatus('${q.id}', this.value)">
                    <option value="new" ${st === 'new' ? 'selected' : ''}>תלמיד</option>
                    <option value="potential" ${st === 'potential' ? 'selected' : ''}>לקוח פוטנציאלי</option>
                    <option value="client" ${st === 'client' ? 'selected' : ''}>לקוח</option>
                </select>
            </div>
        </div>

        <!-- Personal Details -->
        ${_pqSection('user', 'פרטים אישיים', `
            <div class="pq-fields-grid">
                ${_pqField('venus-mars', 'מין', q.gender)}
                ${_pqField('cake-candles', 'תאריך לידה', q.birth_date)}
                ${_pqField('location-dot', 'עיר', q.city)}
                ${_pqField('briefcase', 'עיסוק', q.occupation)}
                ${_pqField('video', 'מכיר את רם?', q.knew_ram)}
                ${_pqField('calendar', 'תאריך מילוי', formatDate(q.created_at))}
            </div>
        `)}

        <!-- Learning Preferences -->
        ${_pqSection('sliders', 'העדפות למידה', `
            <div class="pq-fields-grid">
                ${_pqField('bullseye', 'למה NLP?', q.why_nlp)}
                ${_pqField('clock', 'זמן ללמידה', _pqLabels.studyTime[q.study_time] || q.study_time)}
                ${_pqField('triangle-exclamation', 'אתגר דיגיטלי', _pqLabels.challenge[q.digital_challenge] || q.digital_challenge)}
            </div>
        `)}

        <!-- Open Answers -->
        ${_pqSection('comment-dots', 'תשובות פתוחות', `
            ${_pqAnswer('מה עוזר לך לשמור על מוטיבציית למידה לאורך זמן?', q.motivation_tip)}
            ${_pqAnswer('מה הדבר שהכי היית רוצה לפתור בחייך נכון להיום?', q.main_challenge)}
            ${_pqAnswer('איפה אתה רואה את עצמך עוד שנה מהיום?', q.vision_one_year)}
        `)}

        <!-- Actions -->
        <div class="pq-actions">
            <button class="pq-btn pq-btn-docx" onclick="downloadPortalQDocx('${q.id}')">
                <i class="fa-solid fa-file-word"></i> הורד כמסמך
            </button>
            <button class="pq-btn pq-btn-whatsapp" onclick="window.open('https://wa.me/${(q.phone||'').replace(/^0/,'972').replace(/[^0-9]/g,'')}','_blank')">
                <i class="fa-brands fa-whatsapp"></i> WhatsApp
            </button>
            <button class="pq-btn pq-btn-pipeline" onclick="movePortalQToPipeline('${q.id}')">
                <i class="fa-solid fa-filter-circle-dollar"></i> העבר ל-Pipeline
            </button>
        </div>
    `;

    document.getElementById('portal-q-modal').classList.add('active');
}

// ============================================================================
// STATUS CHANGE
// ============================================================================

async function changePortalQStatus(id, newStatus) {
    try {
        const { error } = await db
            .from('portal_questionnaires')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) throw error;

        // Update local data
        const q = portalQuestionnaires.find(x => x.id === id);
        if (q) q.status = newStatus;
        renderPortalQuestionnaires();
        showToast(`סטטוס עודכן ל: ${_pqLabels.status[newStatus]}`, 'success');
    } catch (err) {
        console.error('Status update error:', err);
        showToast('שגיאה בעדכון סטטוס', 'error');
    }
}

// ============================================================================
// MOVE TO PIPELINE
// ============================================================================

async function movePortalQToPipeline(id) {
    const q = portalQuestionnaires.find(x => x.id === id);
    if (!q) return;

    if (!confirm(`להעביר את ${q.full_name || 'הנרשם'} ל-Pipeline כליד חדש?`)) return;

    try {
        const { error } = await db.from('sales_leads').insert({
            full_name: q.full_name,
            phone: q.phone,
            email: q.email,
            occupation: q.occupation,
            stage: 'new_lead',
            admin_notes: `מקור: שאלון פורטל חינמי\nלמה NLP: ${q.why_nlp || '-'}\nעיר: ${q.city || '-'}\nחזון: ${q.vision_one_year || '-'}`
        });

        if (error) throw error;

        // Update status to potential
        await changePortalQStatus(id, 'potential');

        // Refresh pipeline if loaded
        if (typeof loadPipeline === 'function') await loadPipeline();

        document.getElementById('portal-q-modal').classList.remove('active');
        showToast(`${q.full_name} הועבר/ה ל-Pipeline בהצלחה!`, 'success');
    } catch (err) {
        console.error('Move to pipeline error:', err);
        showToast('שגיאה בהעברה ל-Pipeline', 'error');
    }
}

// ============================================================================
// DOWNLOAD AS DOCX (Word-compatible HTML)
// ============================================================================

function downloadPortalQDocx(id) {
    const q = portalQuestionnaires.find(x => x.id === id);
    if (!q) return;

    const studyLabel = _pqLabels.studyTime[q.study_time] || q.study_time || '-';
    const challengeLabel = _pqLabels.challenge[q.digital_challenge] || q.digital_challenge || '-';

    const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<style>
    @page { size: A4; margin: 2cm; }
    body { font-family: 'David Libre', 'David', 'Arial', sans-serif; direction: rtl; color: #1a2d33; line-height: 1.8; font-size: 13pt; }
    h1 { font-size: 22pt; color: #003B46; border-bottom: 3px solid #D4AF37; padding-bottom: 8px; margin-bottom: 20px; }
    h2 { font-size: 15pt; color: #003B46; background: #f0f7f8; padding: 8px 14px; border-right: 4px solid #D4AF37; margin: 24px 0 12px; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .info-table td { padding: 6px 12px; border-bottom: 1px solid #e8e4da; vertical-align: top; }
    .info-table td:first-child { font-weight: bold; color: #003B46; width: 130px; white-space: nowrap; }
    .answer-block { margin-bottom: 18px; }
    .answer-q { font-weight: bold; color: #003B46; margin-bottom: 4px; }
    .answer-a { background: #faf8f4; padding: 10px 14px; border-right: 3px solid #D4AF37; border-radius: 4px; }
    .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #e8e4da; font-size: 10pt; color: #999; text-align: center; }
    .badge { display: inline-block; background: #D4AF37; color: #003B46; padding: 2px 12px; border-radius: 12px; font-size: 11pt; font-weight: bold; }
</style>
</head>
<body>
<h1>שאלון היכרות — פורטל לימודים חינמי</h1>
<p><strong>${esc(q.full_name || '-')}</strong> &nbsp; <span class="badge">${_pqLabels.status[q.status] || 'תלמיד'}</span></p>

<h2>פרטים אישיים</h2>
<table class="info-table">
    <tr><td>שם מלא</td><td>${esc(q.full_name)}</td></tr>
    <tr><td>אימייל</td><td>${esc(q.email)}</td></tr>
    <tr><td>טלפון</td><td>${esc(q.phone)}</td></tr>
    <tr><td>מין</td><td>${esc(q.gender)}</td></tr>
    <tr><td>תאריך לידה</td><td>${esc(q.birth_date)}</td></tr>
    <tr><td>עיר</td><td>${esc(q.city)}</td></tr>
    <tr><td>עיסוק</td><td>${esc(q.occupation)}</td></tr>
    <tr><td>מכיר את רם?</td><td>${esc(q.knew_ram)}</td></tr>
</table>

<h2>העדפות למידה</h2>
<table class="info-table">
    <tr><td>למה NLP?</td><td>${esc(q.why_nlp)}</td></tr>
    <tr><td>זמן ללמידה</td><td>${esc(studyLabel)}</td></tr>
    <tr><td>אתגר דיגיטלי</td><td>${esc(challengeLabel)}</td></tr>
</table>

<h2>תשובות פתוחות</h2>
<div class="answer-block">
    <div class="answer-q">מה עוזר לך לשמור על מוטיבציית למידה לאורך זמן?</div>
    <div class="answer-a">${esc(q.motivation_tip)}</div>
</div>
<div class="answer-block">
    <div class="answer-q">מה הדבר שהכי היית רוצה לפתור בחייך נכון להיום?</div>
    <div class="answer-a">${esc(q.main_challenge)}</div>
</div>
<div class="answer-block">
    <div class="answer-q">איפה אתה רואה את עצמך עוד שנה מהיום?</div>
    <div class="answer-a">${esc(q.vision_one_year)}</div>
</div>

<div class="footer">
    תאריך מילוי: ${formatDate(q.created_at)} &nbsp;|&nbsp; בית המטפלים — פורטל לימודים
</div>
</body>
</html>`;

    const blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `שאלון_${(q.full_name || 'ללא_שם').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.doc`;
    link.click();
    showToast('המסמך הורד בהצלחה!', 'success');
}

function esc(v) { return escapeHtml(v || '-'); }

// ============================================================================
// CSV EXPORT
// ============================================================================

function exportPortalQCSV() {
    if (portalQuestionnaires.length === 0) { showToast('אין נתונים לייצוא', 'warning'); return; }
    const headers = ['שם', 'טלפון', 'אימייל', 'מין', 'תאריך לידה', 'עיר', 'עיסוק', 'למה NLP', 'זמן ללמידה', 'אתגר דיגיטלי', 'מכיר את רם', 'מוטיבציה', 'מה לפתור', 'חזון לשנה', 'סטטוס', 'תאריך'];
    const rows = portalQuestionnaires.map(q => [
        q.full_name || '', q.phone || '', q.email || '', q.gender || '', q.birth_date || '',
        q.city || '', q.occupation || '', q.why_nlp || '', q.study_time || '',
        q.digital_challenge || '', q.knew_ram || '', q.motivation_tip || '',
        q.main_challenge || '', q.vision_one_year || '', _pqLabels.status[q.status] || 'תלמיד', formatDate(q.created_at)
    ]);
    const bom = '\uFEFF';
    const csv = bom + [headers, ...rows].map(r => r.map(c => `"${(c+'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `portal_questionnaires_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showToast('הקובץ הורד בהצלחה!', 'success');
}
