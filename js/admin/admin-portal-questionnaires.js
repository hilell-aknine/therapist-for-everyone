// admin-portal-questionnaires.js — Portal questionnaire responses view with smart filters + scoring

let portalQuestionnaires = [];
let portalQLoaded = false;
let pqFilters = { dateRange: 'all', status: 'all', howFound: 'all', whyNlp: 'all', sortBy: 'date' };
let pqEngagementMap = {};

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadPortalQuestionnaires() {
    try {
        // 1. Questionnaires
        const { data: qData, error: qErr } = await db
            .from('portal_questionnaires')
            .select('*')
            .order('created_at', { ascending: false });
        if (qErr) throw qErr;

        // 2. Profiles
        const { data: profiles } = await db
            .from('profiles')
            .select('id, full_name, email, phone');
        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        // 3. Course progress (engagement)
        const { data: progress } = await db
            .from('course_progress')
            .select('user_id, completed, watched_seconds, completed_at, updated_at, created_at, video_id')
            .order('completed_at', { ascending: false });

        pqEngagementMap = {};
        (progress || []).filter(r => !r.video_id?.startsWith('last_watched_')).forEach(r => {
            if (!pqEngagementMap[r.user_id]) {
                pqEngagementMap[r.user_id] = { completed_count: 0, watched_seconds: 0, last_activity: null };
            }
            const u = pqEngagementMap[r.user_id];
            if (r.completed) u.completed_count++;
            u.watched_seconds += r.watched_seconds || 0;
            const activity = r.completed_at || r.updated_at || r.created_at;
            if (activity && (!u.last_activity || activity > u.last_activity)) u.last_activity = activity;
        });

        // 4. Merge all data
        portalQuestionnaires = (qData || []).map(q => {
            const profile = profileMap[q.user_id] || {};
            const engagement = pqEngagementMap[q.user_id] || { completed_count: 0, watched_seconds: 0, last_activity: null };
            const merged = {
                ...q,
                full_name: profile.full_name || '',
                email: profile.email || '',
                phone: profile.phone || '',
                completed_count: engagement.completed_count,
                watched_hours: Math.round((engagement.watched_seconds / 3600) * 10) / 10,
                last_activity: engagement.last_activity
            };
            merged.fitScore = calculateFitScore(merged);
            return merged;
        });

        portalQLoaded = true;
        updatePqStats();
        populatePqFilterOptions();
        renderPortalQuestionnaires();
    } catch (err) {
        console.error('Error loading portal questionnaires:', err);
    }
}

// ============================================================================
// FIT SCORE (0-100)
// ============================================================================

function calculateFitScore(q) {
    let score = 0;

    // Why NLP (0-30)
    if (q.why_nlp === 'קליניקה') score += 30;
    else if (q.why_nlp === 'שילוב בעסק') score += 20;
    else if (q.why_nlp === 'התפתחות אישית') score += 10;

    // Study time (0-20)
    if (q.study_time === 'יותר מ-2 שעות') score += 20;
    else if (q.study_time === '1-2 שעות') score += 15;
    else if (q.study_time === '30 דק - שעה') score += 10;
    else if (q.study_time === 'פחות מ-30 דק') score += 5;

    // Knew Ram (0-10)
    if (q.knew_ram === 'כן') score += 10;

    // Filled motivation tip (0-10)
    if (q.motivation_tip && q.motivation_tip.length > 5) score += 10;

    // Filled vision (0-10)
    if (q.vision_one_year && q.vision_one_year.length > 5) score += 10;

    // Lessons watched (0-20)
    score += Math.min((q.completed_count || 0), 10) * 2;

    return Math.min(score, 100);
}

function scoreClass(score) {
    if (score >= 70) return 'pq-score-high';
    if (score >= 40) return 'pq-score-mid';
    return 'pq-score-low';
}

// ============================================================================
// STATS
// ============================================================================

function updatePqStats() {
    const total = portalQuestionnaires.length;
    const today = portalQuestionnaires.filter(q => isToday(q.created_at)).length;
    const avgScore = total > 0 ? Math.round(portalQuestionnaires.reduce((s, q) => s + q.fitScore, 0) / total) : 0;

    // Top learner
    let topLearner = '-';
    if (total > 0) {
        const sorted = [...portalQuestionnaires].sort((a, b) => (b.completed_count || 0) - (a.completed_count || 0));
        if (sorted[0]?.completed_count > 0) topLearner = sorted[0].full_name || sorted[0].email || '-';
    }

    setText('portal-q-count', total);
    setText('stat-portal-q-total', total);
    setText('stat-portal-q-today', today);
    setText('stat-portal-q-avg-score', avgScore);
    setText('stat-portal-q-top-learner', topLearner);
}

// ============================================================================
// DATE HELPERS
// ============================================================================

function isToday(dateStr) {
    if (!dateStr) return false;
    return new Date(dateStr).toDateString() === new Date().toDateString();
}

function isThisWeek(dateStr) {
    if (!dateStr) return false;
    return (Date.now() - new Date(dateStr).getTime()) < 7 * 86400000;
}

function isThisMonth(dateStr) {
    if (!dateStr) return false;
    return (Date.now() - new Date(dateStr).getTime()) < 30 * 86400000;
}

// ============================================================================
// FILTERS
// ============================================================================

function populatePqFilterOptions() {
    // Source options
    const sources = [...new Set(portalQuestionnaires.map(q => q.how_found).filter(Boolean))];
    const sourceSelect = document.getElementById('pq-filter-source');
    if (sourceSelect) {
        sourceSelect.innerHTML = '<option value="all">מקור: הכל</option>' +
            sources.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    }

    // Why NLP options
    const whys = [...new Set(portalQuestionnaires.map(q => q.why_nlp).filter(Boolean))];
    const whySelect = document.getElementById('pq-filter-why');
    if (whySelect) {
        whySelect.innerHTML = '<option value="all">למה NLP: הכל</option>' +
            whys.map(w => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join('');
    }
}

function applyPqFilters() {
    pqFilters.dateRange = document.getElementById('pq-filter-date')?.value || 'all';
    pqFilters.status = document.getElementById('pq-filter-status')?.value || 'all';
    pqFilters.howFound = document.getElementById('pq-filter-source')?.value || 'all';
    pqFilters.whyNlp = document.getElementById('pq-filter-why')?.value || 'all';
    pqFilters.sortBy = document.getElementById('pq-filter-sort')?.value || 'date';
    renderPortalQuestionnaires();
}

// ============================================================================
// TABLE RENDER
// ============================================================================

function renderPortalQuestionnaires() {
    const search = document.getElementById('portal-q-search')?.value?.toLowerCase() || '';
    let filtered = [...portalQuestionnaires];

    // Text search
    if (search) {
        filtered = filtered.filter(q =>
            (q.full_name || '').toLowerCase().includes(search) ||
            (q.email || '').toLowerCase().includes(search) ||
            (q.phone || '').includes(search) ||
            (q.city || '').toLowerCase().includes(search)
        );
    }

    // Date range
    if (pqFilters.dateRange === 'today') filtered = filtered.filter(q => isToday(q.created_at));
    else if (pqFilters.dateRange === 'week') filtered = filtered.filter(q => isThisWeek(q.created_at));
    else if (pqFilters.dateRange === 'month') filtered = filtered.filter(q => isThisMonth(q.created_at));

    // Status
    if (pqFilters.status !== 'all') filtered = filtered.filter(q => (q.status || 'new') === pqFilters.status);

    // Source
    if (pqFilters.howFound !== 'all') filtered = filtered.filter(q => q.how_found === pqFilters.howFound);

    // Why NLP
    if (pqFilters.whyNlp !== 'all') filtered = filtered.filter(q => q.why_nlp === pqFilters.whyNlp);

    // Sort
    if (pqFilters.sortBy === 'score') filtered.sort((a, b) => b.fitScore - a.fitScore);
    else if (pqFilters.sortBy === 'views') filtered.sort((a, b) => (b.completed_count || 0) - (a.completed_count || 0));
    // 'date' = default order from Supabase

    // Update result count
    const countEl = document.getElementById('pq-results-count');
    if (countEl) countEl.textContent = `${filtered.length} תוצאות`;

    const tbody = document.getElementById('portal-q-table');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><i class="fa-solid fa-clipboard-list"></i><br>אין תוצאות</td></tr>';
        return;
    }

    const statusLabels = { 'new': 'תלמיד', 'potential': 'פוטנציאלי', 'client': 'לקוח' };
    const statusColors = { 'new': 'rgba(47,133,146,0.15);color:#2F8592', 'potential': 'rgba(212,175,55,0.15);color:#D4AF37', 'client': 'rgba(39,174,96,0.15);color:#27ae60' };

    const groups = groupByDate(filtered);
    let html = '';
    for (const [group, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        html += `<tr class="date-group-row"><td colspan="10"><i class="fa-solid ${dateGroupIcons[group]}"></i> ${group} (${items.length})</td></tr>`;
        html += items.map(q => {
            const st = q.status || 'new';
            const sc = q.fitScore || 0;
            const hours = q.watched_hours || 0;
            return `
                <tr onclick="viewPortalQ('${q.id}')" style="cursor:pointer;">
                    <td><strong>${escapeHtml(q.full_name || '-')}</strong></td>
                    <td>${q.phone ? `<a href="tel:${escapeHtml(q.phone)}" onclick="event.stopPropagation()">${escapeHtml(q.phone)}</a>` : '-'}</td>
                    <td style="font-size:0.85rem;">${escapeHtml(q.city || '-')}</td>
                    <td><span style="font-size:0.8rem;background:rgba(212,175,55,0.1);color:#D4AF37;padding:0.15rem 0.5rem;border-radius:6px;">${escapeHtml(q.why_nlp || '-')}</span></td>
                    <td><span class="pq-score ${scoreClass(sc)}">${sc}</span></td>
                    <td style="font-size:0.85rem;">
                        ${q.completed_count > 0 ? `<strong>${q.completed_count}</strong>` : '<span style="opacity:0.4;">0</span>'}
                        ${q.completed_count >= 10 ? ' <i class="fa-solid fa-fire" style="color:#f85149;font-size:0.7rem;"></i>' : ''}
                    </td>
                    <td style="font-size:0.85rem;">${hours > 0 ? hours + ' שע\'' : '<span style="opacity:0.4;">-</span>'}</td>
                    <td><span style="font-size:0.8rem;background:${statusColors[st] || statusColors['new']};padding:0.15rem 0.5rem;border-radius:6px;">${statusLabels[st] || 'תלמיד'}</span></td>
                    <td style="font-size:0.85rem;">${formatDate(q.created_at)}</td>
                </tr>
            `;
        }).join('');
    }
    tbody.innerHTML = html;
}

// ============================================================================
// DETAIL MODAL
// ============================================================================

const _pqLabels = {
    studyTime: { 'פחות מ-30 דק': 'פחות מ-30 דק׳ ביום', '30 דק - שעה': '30 דק׳ – שעה ביום', '1-2 שעות': '1-2 שעות ביום', 'יותר מ-2 שעות': 'יותר מ-2 שעות ביום' },
    challenge: { 'מוטיבציה': 'שמירה על מוטיבציה', 'ניהול זמן': 'ניהול זמן', 'הבנת חומר': 'הבנת חומר ללא תמיכה', 'טכנולוגי': 'קושי טכנולוגי' },
    status: { 'new': 'תלמיד', 'potential': 'לקוח פוטנציאלי', 'client': 'לקוח' }
};

function _pqField(icon, label, value) {
    return `<div class="pq-field"><i class="fa-solid fa-${icon}" style="color:#D4AF37;font-size:0.75rem;margin-left:0.4rem;"></i><span class="pq-field-label">${label}</span><span class="pq-field-value">${escapeHtml(value != null ? String(value) : '-')}</span></div>`;
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
    const sc = q.fitScore || 0;
    const content = document.getElementById('portal-q-modal-content');

    content.innerHTML = `
        <div class="pq-header-card">
            <div class="pq-avatar">${(q.full_name || '?')[0]}</div>
            <div class="pq-header-info">
                <h2 class="pq-name">${escapeHtml(q.full_name || 'ללא שם')} <span class="pq-score ${scoreClass(sc)}" style="font-size:0.75rem;margin-right:0.5rem;">${sc} נק׳</span></h2>
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

        ${_pqSection('user', 'פרטים אישיים', `
            <div class="pq-fields-grid">
                ${_pqField('venus-mars', 'מין', q.gender)}
                ${_pqField('cake-candles', 'תאריך לידה', q.birth_date)}
                ${_pqField('location-dot', 'עיר', q.city)}
                ${_pqField('briefcase', 'עיסוק', q.occupation)}
                ${_pqField('map-pin', 'מאיפה הגיע/ה', q.how_found)}
                ${_pqField('video', 'מכיר את רם?', q.knew_ram)}
            </div>
        `)}

        ${_pqSection('chart-line', 'מעורבות בלמידה', `
            <div class="pq-fields-grid">
                ${_pqField('star', 'ציון התאמה', sc + '/100')}
                ${_pqField('check-double', 'שיעורים שהושלמו', q.completed_count || 0)}
                ${_pqField('clock', 'שעות צפייה', (q.watched_hours || 0).toFixed(1))}
                ${_pqField('calendar-check', 'פעילות אחרונה', q.last_activity ? formatDate(q.last_activity) : 'אין עדיין')}
            </div>
        `)}

        ${_pqSection('sliders', 'העדפות למידה', `
            <div class="pq-fields-grid">
                ${_pqField('bullseye', 'למה NLP?', q.why_nlp)}
                ${_pqField('clock', 'זמן ללמידה', _pqLabels.studyTime[q.study_time] || q.study_time)}
                ${_pqField('triangle-exclamation', 'אתגר דיגיטלי', _pqLabels.challenge[q.digital_challenge] || q.digital_challenge)}
            </div>
        `)}

        ${_pqSection('comment-dots', 'תשובות פתוחות', `
            ${_pqAnswer('מה עוזר לך לשמור על מוטיבציית למידה לאורך זמן?', q.motivation_tip)}
            ${_pqAnswer('מה הדבר שהכי היית רוצה לפתור בחייך נכון להיום?', q.main_challenge)}
            ${_pqAnswer('איפה אתה רואה את עצמך עוד שנה מהיום?', q.vision_one_year)}
        `)}

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
        const { error } = await db.from('portal_questionnaires').update({ status: newStatus }).eq('id', id);
        if (error) throw error;
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
            full_name: q.full_name, phone: q.phone, email: q.email, occupation: q.occupation,
            stage: 'new_lead',
            admin_notes: `מקור: שאלון פורטל חינמי\nציון התאמה: ${q.fitScore}/100\nלמה NLP: ${q.why_nlp || '-'}\nעיר: ${q.city || '-'}\nצפה ב-${q.completed_count || 0} שיעורים\nחזון: ${q.vision_one_year || '-'}`
        });
        if (error) throw error;
        await changePortalQStatus(id, 'potential');
        if (typeof loadPipeline === 'function') await loadPipeline();
        document.getElementById('portal-q-modal').classList.remove('active');
        showToast(`${q.full_name} הועבר/ה ל-Pipeline בהצלחה!`, 'success');
    } catch (err) {
        console.error('Move to pipeline error:', err);
        showToast('שגיאה בהעברה ל-Pipeline', 'error');
    }
}

// ============================================================================
// DOWNLOAD AS DOCX
// ============================================================================

function downloadPortalQDocx(id) {
    const q = portalQuestionnaires.find(x => x.id === id);
    if (!q) return;
    const studyLabel = _pqLabels.studyTime[q.study_time] || q.study_time || '-';
    const challengeLabel = _pqLabels.challenge[q.digital_challenge] || q.digital_challenge || '-';

    const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<style>
@page{size:A4;margin:2cm}body{font-family:'David Libre','David','Arial',sans-serif;direction:rtl;color:#1a2d33;line-height:1.8;font-size:13pt}
h1{font-size:22pt;color:#003B46;border-bottom:3px solid #D4AF37;padding-bottom:8px;margin-bottom:20px}
h2{font-size:15pt;color:#003B46;background:#f0f7f8;padding:8px 14px;border-right:4px solid #D4AF37;margin:24px 0 12px}
.t{width:100%;border-collapse:collapse;margin-bottom:16px}.t td{padding:6px 12px;border-bottom:1px solid #e8e4da;vertical-align:top}.t td:first-child{font-weight:bold;color:#003B46;width:130px;white-space:nowrap}
.ab{margin-bottom:18px}.aq{font-weight:bold;color:#003B46;margin-bottom:4px}.aa{background:#faf8f4;padding:10px 14px;border-right:3px solid #D4AF37;border-radius:4px}
.f{margin-top:30px;padding-top:10px;border-top:1px solid #e8e4da;font-size:10pt;color:#999;text-align:center}
.b{display:inline-block;background:#D4AF37;color:#003B46;padding:2px 12px;border-radius:12px;font-size:11pt;font-weight:bold}
</style></head><body>
<h1>שאלון היכרות — פורטל לימודים חינמי</h1>
<p><strong>${esc(q.full_name)}</strong> &nbsp; <span class="b">${_pqLabels.status[q.status] || 'תלמיד'}</span> &nbsp; <span class="b">ציון: ${q.fitScore}/100</span></p>
<h2>פרטים אישיים</h2>
<table class="t"><tr><td>שם מלא</td><td>${esc(q.full_name)}</td></tr><tr><td>אימייל</td><td>${esc(q.email)}</td></tr><tr><td>טלפון</td><td>${esc(q.phone)}</td></tr><tr><td>מין</td><td>${esc(q.gender)}</td></tr><tr><td>תאריך לידה</td><td>${esc(q.birth_date)}</td></tr><tr><td>עיר</td><td>${esc(q.city)}</td></tr><tr><td>עיסוק</td><td>${esc(q.occupation)}</td></tr><tr><td>מאיפה הגיע/ה</td><td>${esc(q.how_found)}</td></tr><tr><td>מכיר את רם?</td><td>${esc(q.knew_ram)}</td></tr></table>
<h2>מעורבות בלמידה</h2>
<table class="t"><tr><td>ציון התאמה</td><td>${q.fitScore}/100</td></tr><tr><td>שיעורים</td><td>${q.completed_count || 0}</td></tr><tr><td>שעות צפייה</td><td>${(q.watched_hours || 0).toFixed(1)}</td></tr></table>
<h2>העדפות למידה</h2>
<table class="t"><tr><td>למה NLP?</td><td>${esc(q.why_nlp)}</td></tr><tr><td>זמן ללמידה</td><td>${esc(studyLabel)}</td></tr><tr><td>אתגר דיגיטלי</td><td>${esc(challengeLabel)}</td></tr></table>
<h2>תשובות פתוחות</h2>
<div class="ab"><div class="aq">מה עוזר לך לשמור על מוטיבציית למידה לאורך זמן?</div><div class="aa">${esc(q.motivation_tip)}</div></div>
<div class="ab"><div class="aq">מה הדבר שהכי היית רוצה לפתור בחייך נכון להיום?</div><div class="aa">${esc(q.main_challenge)}</div></div>
<div class="ab"><div class="aq">איפה אתה רואה את עצמך עוד שנה מהיום?</div><div class="aa">${esc(q.vision_one_year)}</div></div>
<div class="f">תאריך מילוי: ${formatDate(q.created_at)} &nbsp;|&nbsp; בית המטפלים — פורטל לימודים</div>
</body></html>`;

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
    const headers = ['שם', 'טלפון', 'אימייל', 'מין', 'תאריך לידה', 'עיר', 'עיסוק', 'מאיפה הגיע', 'למה NLP', 'זמן ללמידה', 'אתגר דיגיטלי', 'מכיר את רם', 'ציון התאמה', 'שיעורים', 'שעות צפייה', 'מוטיבציה', 'מה לפתור', 'חזון לשנה', 'סטטוס', 'תאריך'];
    const rows = portalQuestionnaires.map(q => [
        q.full_name || '', q.phone || '', q.email || '', q.gender || '', q.birth_date || '',
        q.city || '', q.occupation || '', q.how_found || '', q.why_nlp || '', q.study_time || '',
        q.digital_challenge || '', q.knew_ram || '', q.fitScore || 0, q.completed_count || 0,
        q.watched_hours || 0, q.motivation_tip || '', q.main_challenge || '',
        q.vision_one_year || '', _pqLabels.status[q.status] || 'תלמיד', formatDate(q.created_at)
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
