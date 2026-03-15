// admin-portal-questionnaires.js — Portal questionnaire responses view

let portalQuestionnaires = [];
let portalQLoaded = false;

async function loadPortalQuestionnaires() {
    try {
        // Load questionnaires
        const { data: qData, error: qErr } = await db
            .from('portal_questionnaires')
            .select('*')
            .order('created_at', { ascending: false });

        if (qErr) throw qErr;

        // Load profiles for name/email/phone lookup
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
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fa-solid fa-clipboard-list"></i><br>אין שאלוני היכרות</td></tr>';
        return;
    }

    const whyNlpLabels = {
        'התפתחות אישית': 'התפתחות אישית',
        'שילוב בעסק': 'שילוב בעסק',
        'קליניקה': 'פתיחת קליניקה'
    };

    const groups = groupByDate(filtered);
    let html = '';
    for (const [group, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        html += `<tr class="date-group-row"><td colspan="8"><i class="fa-solid ${dateGroupIcons[group]}"></i> ${group} (${items.length})</td></tr>`;
        html += items.map(q => {
            const whyLabel = whyNlpLabels[q.why_nlp] || q.why_nlp || '-';
            return `
                <tr onclick="viewPortalQ('${q.id}')" style="cursor:pointer;">
                    <td><strong>${escapeHtml(q.full_name || '-')}</strong></td>
                    <td>${q.phone ? `<a href="tel:${escapeHtml(q.phone)}" onclick="event.stopPropagation()">${escapeHtml(q.phone)}</a>` : '-'}</td>
                    <td style="font-size:0.85rem;color:var(--text-secondary);">${escapeHtml(q.email || '-')}</td>
                    <td>${escapeHtml(q.gender || '-')}</td>
                    <td>${escapeHtml(q.city || '-')}</td>
                    <td><span style="font-size:0.8rem;background:rgba(212,175,55,0.1);color:var(--gold);padding:0.15rem 0.5rem;border-radius:6px;">${escapeHtml(whyLabel)}</span></td>
                    <td>${escapeHtml(q.knew_ram || '-')}</td>
                    <td style="font-size:0.85rem;color:var(--text-secondary);">${formatDate(q.created_at)}</td>
                </tr>
            `;
        }).join('');
    }
    tbody.innerHTML = html;
}

function viewPortalQ(id) {
    const q = portalQuestionnaires.find(x => x.id === id);
    if (!q) return;

    const studyLabels = {
        'פחות מ-30 דק': 'פחות מ-30 דק׳ ביום',
        '30 דק - שעה': '30 דק׳ – שעה ביום',
        '1-2 שעות': '1-2 שעות ביום',
        'יותר מ-2 שעות': 'יותר מ-2 שעות ביום'
    };

    const challengeLabels = {
        'מוטיבציה': 'שמירה על מוטיבציה',
        'ניהול זמן': 'ניהול זמן',
        'הבנת חומר': 'הבנת חומר ללא תמיכה',
        'טכנולוגי': 'קושי טכנולוגי'
    };

    const content = document.getElementById('portal-q-modal-content');
    content.innerHTML = `
        <div style="display:grid;gap:1.2rem;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div><strong style="color:var(--text-secondary);font-size:0.8rem;">שם</strong><br>${escapeHtml(q.full_name || '-')}</div>
                <div><strong style="color:var(--text-secondary);font-size:0.8rem;">אימייל</strong><br>${escapeHtml(q.email || '-')}</div>
                <div><strong style="color:var(--text-secondary);font-size:0.8rem;">טלפון</strong><br>${q.phone ? `<a href="tel:${escapeHtml(q.phone)}">${escapeHtml(q.phone)}</a>` : '-'}</div>
                <div><strong style="color:var(--text-secondary);font-size:0.8rem;">מין</strong><br>${escapeHtml(q.gender || '-')}</div>
                <div><strong style="color:var(--text-secondary);font-size:0.8rem;">תאריך לידה</strong><br>${escapeHtml(q.birth_date || '-')}</div>
                <div><strong style="color:var(--text-secondary);font-size:0.8rem;">עיר</strong><br>${escapeHtml(q.city || '-')}</div>
                <div><strong style="color:var(--text-secondary);font-size:0.8rem;">עיסוק</strong><br>${escapeHtml(q.occupation || '-')}</div>
                <div><strong style="color:var(--text-secondary);font-size:0.8rem;">מכיר את רם?</strong><br>${escapeHtml(q.knew_ram || '-')}</div>
            </div>
            <hr style="border:none;border-top:1px solid var(--border-light);">
            <div>
                <strong style="color:var(--gold);font-size:0.85rem;">למה NLP?</strong>
                <p style="margin:0.3rem 0;">${escapeHtml(q.why_nlp || '-')}</p>
            </div>
            <div>
                <strong style="color:var(--gold);font-size:0.85rem;">זמן ללמידה</strong>
                <p style="margin:0.3rem 0;">${escapeHtml(studyLabels[q.study_time] || q.study_time || '-')}</p>
            </div>
            <div>
                <strong style="color:var(--gold);font-size:0.85rem;">אתגר בלמידה דיגיטלית</strong>
                <p style="margin:0.3rem 0;">${escapeHtml(challengeLabels[q.digital_challenge] || q.digital_challenge || '-')}</p>
            </div>
            <hr style="border:none;border-top:1px solid var(--border-light);">
            <div>
                <strong style="color:var(--gold);font-size:0.85rem;">מה עוזר לשמור על מוטיבציה?</strong>
                <p style="margin:0.3rem 0;line-height:1.7;">${escapeHtml(q.motivation_tip || '-')}</p>
            </div>
            <div>
                <strong style="color:var(--gold);font-size:0.85rem;">מה הכי רוצה לפתור?</strong>
                <p style="margin:0.3rem 0;line-height:1.7;">${escapeHtml(q.main_challenge || '-')}</p>
            </div>
            <div>
                <strong style="color:var(--gold);font-size:0.85rem;">איפה רואה את עצמו/ה בעוד שנה?</strong>
                <p style="margin:0.3rem 0;line-height:1.7;">${escapeHtml(q.vision_one_year || '-')}</p>
            </div>
            <div style="font-size:0.8rem;color:var(--text-secondary);text-align:left;margin-top:0.5rem;">
                נשלח: ${formatDate(q.created_at)}
            </div>
        </div>
    `;

    document.getElementById('portal-q-modal').classList.add('active');
}

function exportPortalQCSV() {
    if (portalQuestionnaires.length === 0) { showToast('אין נתונים לייצוא', 'warning'); return; }
    const headers = ['שם', 'טלפון', 'אימייל', 'מין', 'תאריך לידה', 'עיר', 'עיסוק', 'למה NLP', 'זמן ללמידה', 'אתגר דיגיטלי', 'מכיר את רם', 'מוטיבציה', 'מה לפתור', 'חזון לשנה', 'תאריך'];
    const rows = portalQuestionnaires.map(q => [
        q.full_name || '', q.phone || '', q.email || '', q.gender || '', q.birth_date || '',
        q.city || '', q.occupation || '', q.why_nlp || '', q.study_time || '',
        q.digital_challenge || '', q.knew_ram || '', q.motivation_tip || '',
        q.main_challenge || '', q.vision_one_year || '', formatDate(q.created_at)
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
