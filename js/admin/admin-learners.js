// admin-learners.js — Learners progress view (course_progress + profiles)

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
        // Load course progress
        const { data: progress, error: progressErr } = await db
            .from('course_progress')
            .select('*')
            .order('completed_at', { ascending: false });

        if (progressErr) throw progressErr;

        // Load profiles for name/email lookup
        const { data: profiles, error: profilesErr } = await db
            .from('profiles')
            .select('id, email, full_name, phone');

        if (profilesErr) throw profilesErr;

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        // Aggregate per user
        const userMap = {};
        (progress || []).filter(r => !r.video_id?.startsWith('last_watched_')).forEach(r => {
            if (!userMap[r.user_id]) {
                const profile = profileMap[r.user_id] || {};
                userMap[r.user_id] = {
                    user_id: r.user_id,
                    email: profile.email || '-',
                    full_name: profile.full_name || profile.email?.split('@')[0] || 'משתמש',
                    phone: profile.phone || '',
                    completed_count: 0,
                    watched_seconds: 0,
                    courses: new Set(),
                    last_activity: null
                };
            }
            const u = userMap[r.user_id];
            if (r.completed) u.completed_count++;
            u.watched_seconds += r.watched_seconds || 0;
            if (r.course_type) u.courses.add(r.course_type);
            const activity = r.completed_at || r.updated_at || r.created_at;
            if (activity && (!u.last_activity || activity > u.last_activity)) {
                u.last_activity = activity;
            }
        });

        // Convert to array
        learnersData = Object.values(userMap).map(u => ({
            ...u,
            courses: Array.from(u.courses)
        }));

        // Sort by last activity
        learnersData.sort((a, b) => (b.last_activity || '').localeCompare(a.last_activity || ''));

        // Update stats
        const now = Date.now();
        const sevenDaysAgo = now - 7 * 86400000;
        const totalHours = Math.round(learnersData.reduce((sum, u) => sum + u.watched_seconds, 0) / 3600);
        const activeIn7d = learnersData.filter(u => u.last_activity && new Date(u.last_activity).getTime() > sevenDaysAgo).length;
        const withCompleted = learnersData.filter(u => u.completed_count > 0).length;

        setText('stat-learners-total', learnersData.length);
        setText('stat-learners-completed', withCompleted);
        setText('stat-learners-active7d', activeIn7d);
        setText('stat-learners-hours', totalHours);
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

    const groups = groupByDate(filtered.map(u => ({ ...u, created_at: u.last_activity })));
    let html = '';
    for (const [group, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        html += `<tr class="date-group-row"><td colspan="7"><i class="fa-solid ${dateGroupIcons[group]}"></i> ${group} (${items.length})</td></tr>`;
        html += items.map(u => {
            const hours = Math.floor(u.watched_seconds / 3600);
            const mins = Math.floor((u.watched_seconds % 3600) / 60);
            const timeStr = hours > 0 ? `${hours} שע' ${mins} דק'` : `${mins} דק'`;
            const coursesStr = u.courses.map(c => courseLabels[c] || c).join(', ') || '-';

            return `
                <tr>
                    <td><strong>${escapeHtml(u.full_name)}</strong></td>
                    <td>${u.phone ? `<a href="tel:${escapeHtml(u.phone)}">${escapeHtml(u.phone)}</a>` : '-'}</td>
                    <td style="font-size:0.85rem;color:var(--text-secondary);">${escapeHtml(u.email)}</td>
                    <td>
                        <span style="display:inline-flex;align-items:center;gap:0.3rem;">
                            <strong style="color:${u.completed_count > 0 ? 'var(--success)' : 'var(--text-secondary)'};">${u.completed_count}</strong>
                            ${u.completed_count >= 10 ? '<i class="fa-solid fa-fire" style="color:var(--danger);font-size:0.75rem;"></i>' : ''}
                        </span>
                    </td>
                    <td style="font-size:0.85rem;">${timeStr}</td>
                    <td><span style="font-size:0.8rem;background:rgba(212,175,55,0.1);color:var(--gold);padding:0.15rem 0.5rem;border-radius:6px;">${coursesStr}</span></td>
                    <td style="font-size:0.85rem;color:var(--text-secondary);">${formatDate(u.last_activity)}</td>
                </tr>
            `;
        }).join('');
    }
    tbody.innerHTML = html;
}

function exportLearnersCSV() {
    if (learnersData.length === 0) { showToast('אין נתונים לייצוא', 'warning'); return; }
    const headers = ['שם', 'טלפון', 'אימייל', 'שיעורים שהושלמו', 'זמן צפייה (דקות)', 'קורסים', 'פעילות אחרונה'];
    const rows = learnersData.map(u => [
        u.full_name || '',
        u.phone || '',
        u.email || '',
        u.completed_count,
        Math.round(u.watched_seconds / 60),
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
