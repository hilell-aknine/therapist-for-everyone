// admin-learners.js — Learners progress view (course_progress + profiles)
// 2026-07-28: הטאב הוחזר. ההסרה ב-23.7 ("לא הופיע שם כלום") נבעה משני באגים, לא מחוסר נתונים:
//   1. תקרת 1000 שורות של PostgREST + מיון DESC על completed_at (Postgres = NULLS FIRST)
//      גרמו לכך שמתוך 2,533 שורות נטענו בעיקר שורות last_watched_* שממילא מסוננות.
//   2. עמודת "זמן צפייה" ו"שעות צפייה" הציגו 0 כי watched_seconds ריק בדאטה (294 שניות בסך הכל).
// התיקון: עימוד מלא + סינון בצד השרת, ו-days_inactive במקום watched_seconds.

let learnersData = [];
let learnersLoaded = false;

async function loadLearnersView() {
    if (learnersLoaded) {
        renderLearners();
        return;
    }
    await loadLearnersData();
    learnersLoaded = true;
    renderLearners();
}

async function loadLearnersData() {
    try {
        // Load course progress.
        // BUGFIX 2026-07-28: היה `.select('*').order('completed_at', desc)` בלי עימוד.
        // PostgREST מחזיר מקסימום 1000 שורות, ו-Postgres ממיין DESC עם NULLS FIRST —
        // כך שמתוך 2,533 השורות נטענו בעיקר שורות `last_watched_*` שממילא מסוננות,
        // והטאב נראה ריק. עכשיו: סינון בצד השרת + עימוד עד סוף הטבלה.
        const PAGE = 1000;
        let progress = [];
        for (let from = 0; ; from += PAGE) {
            const { data: page, error: progressErr } = await db
                .from('course_progress')
                .select('user_id, video_id, completed, completed_at, updated_at, created_at, course_type')
                .not('video_id', 'like', 'last_watched_%')
                .order('user_id', { ascending: true })
                .range(from, from + PAGE - 1);

            if (progressErr) throw progressErr;
            progress = progress.concat(page || []);
            if (!page || page.length < PAGE) break;
        }

        // Load profiles for name/email lookup
        const { data: profiles, error: profilesErr } = await db
            .from('profiles')
            .select('id, email, full_name, phone');

        if (profilesErr) throw profilesErr;

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        // Aggregate per user
        const userMap = {};
        (progress || []).forEach(r => {
            if (!userMap[r.user_id]) {
                const profile = profileMap[r.user_id] || {};
                userMap[r.user_id] = {
                    user_id: r.user_id,
                    email: profile.email || '-',
                    full_name: profile.full_name || profile.email?.split('@')[0] || 'משתמש',
                    phone: profile.phone || '',
                    completed_count: 0,
                    courses: new Set(),
                    last_activity: null
                };
            }
            const u = userMap[r.user_id];
            if (r.completed) u.completed_count++;
            if (r.course_type) u.courses.add(r.course_type);
            const activity = r.completed_at || r.updated_at || r.created_at;
            if (activity && (!u.last_activity || activity > u.last_activity)) {
                u.last_activity = activity;
            }
        });

        // Convert to array. days_inactive מחליף את watched_seconds —
        // אומת 2026-07-28: בכל הטבלה יש 294 שניות צפייה בסך הכל, השדה למעשה ריק.
        const now = Date.now();
        learnersData = Object.values(userMap).map(u => ({
            ...u,
            courses: Array.from(u.courses),
            days_inactive: u.last_activity
                ? Math.floor((now - new Date(u.last_activity).getTime()) / 86400000)
                : null
        }));

        // ההזדמנות קודם: מי שסיים הכי הרבה שיעורים ואז נעלם.
        learnersData.sort((a, b) =>
            (b.completed_count - a.completed_count) ||
            ((b.days_inactive ?? -1) - (a.days_inactive ?? -1))
        );

        const activeIn7d = learnersData.filter(u => u.days_inactive !== null && u.days_inactive <= 7).length;
        const churned = learnersData.filter(u => u.days_inactive !== null && u.days_inactive > 30).length;
        // "הזדמנות" = סיים 10+ שיעורים ואז נעלם 30+ יום. אותה הגדרה בדיוק כמו הכוכב בטבלה.
        const opportunity = learnersData.filter(u => u.completed_count >= 10 && u.days_inactive !== null && u.days_inactive > 30).length;

        setText('stat-learners-total', learnersData.length);
        setText('stat-learners-opportunity', opportunity);
        setText('stat-learners-active7d', activeIn7d);
        setText('stat-learners-churned', churned);
        setText('learners-count', learnersData.length);

    } catch (err) {
        console.error('Error loading learners data:', err);
        showToast('שגיאה בטעינת נתוני למידה', 'error');
    }
}

function renderLearners() {
    const search = document.getElementById('learners-search')?.value?.toLowerCase() || '';
    let filtered = learnersData;

    if (search) {
        filtered = filtered.filter(u =>
            (u.full_name || '').toLowerCase().includes(search) ||
            (u.email || '').toLowerCase().includes(search)
        );
    }

    const tbody = document.getElementById('learners-table');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fa-solid fa-graduation-cap"></i><br>אין לומדים</td></tr>';
        return;
    }

    const courseLabels = {
        'practitioner': 'NLP Practitioner',
        'master': 'NLP Master',
        'nlp-practitioner': 'NLP Practitioner',
        'nlp-master': 'NLP Master'
    };

    tbody.innerHTML = filtered.map(u => {
        const d = u.days_inactive;
        // "הזדמנות" = סיים 10+ שיעורים ונעלם 30+ יום. אלה הכי קרובים לסיים.
        const isOpportunity = u.completed_count >= 10 && d !== null && d > 30;
        let state, stateColor;
        if (d === null)      { state = 'אין נתון';            stateColor = 'var(--text-secondary)'; }
        else if (d <= 7)     { state = `פעיל · ${d} ימים`;    stateColor = 'var(--success)'; }
        else if (d <= 30)    { state = `מצטנן · ${d} ימים`;   stateColor = 'var(--gold)'; }
        else                 { state = `נעלם · ${d} ימים`;    stateColor = 'var(--danger)'; }
        const coursesStr = u.courses.map(c => courseLabels[c] || c).join(', ') || '-';
        const rowStyle = isOpportunity ? ' style="background:rgba(212,175,55,0.07);"' : '';

        return `
            <tr${rowStyle}>
                <td>
                    <strong>${escapeHtml(u.full_name)}</strong>
                    ${isOpportunity ? '<i class="fa-solid fa-star" style="color:var(--gold);font-size:0.7rem;margin-right:0.35rem;" title="הזדמנות: סיים הרבה ונעלם"></i>' : ''}
                </td>
                <td>${u.phone ? `<a href="tel:${escapeHtml(u.phone)}">${escapeHtml(u.phone)}</a>` : '-'}</td>
                <td style="font-size:0.85rem;color:var(--text-secondary);">${escapeHtml(u.email)}</td>
                <td>
                    <strong style="color:${u.completed_count > 0 ? 'var(--success)' : 'var(--text-secondary)'};">${u.completed_count}</strong>
                </td>
                <td style="font-size:0.85rem;color:${stateColor};font-weight:600;">${state}</td>
                <td><span style="font-size:0.8rem;background:rgba(212,175,55,0.1);color:var(--gold);padding:0.15rem 0.5rem;border-radius:6px;">${coursesStr}</span></td>
                <td style="font-size:0.85rem;color:var(--text-secondary);">${formatDate(u.last_activity)}</td>
            </tr>
        `;
    }).join('');
}

function exportLearnersCSV() {
    if (learnersData.length === 0) { showToast('אין נתונים לייצוא', 'warning'); return; }
    const headers = ['שם', 'טלפון', 'אימייל', 'שיעורים שהושלמו', 'ימים מאז פעילות', 'קורסים', 'פעילות אחרונה'];
    const rows = learnersData.map(u => [
        u.full_name || '',
        u.phone || '',
        u.email || '',
        u.completed_count,
        u.days_inactive ?? '',
        u.courses.join(', '),
        formatDate(u.last_activity)
    ]);
    const bom = '\uFEFF';
    const csv = bom + [headers, ...rows].map(r => r.map(c => `"${(c+'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `learners_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showToast('הקובץ הורד בהצלחה!', 'success');
}
