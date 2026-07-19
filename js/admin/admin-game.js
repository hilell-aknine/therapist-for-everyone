// admin-game.js — Practice Game data view (nlp_game_players + profiles)
// Shows, in plain Hebrew, how each user is doing in the NLP practice game:
// score (XP), level, day-streak, lessons finished, right/wrong answers,
// accuracy, and how long since they last played.

let gameData = [];
let gameLoaded = false;

async function loadGameView() {
    if (gameLoaded) {
        renderGame();
        return;
    }
    await loadGameData();
    gameLoaded = true;
    renderGame();
}

// Count finished lessons whether completed_lessons is stored as an object map
// ({ "1-1": true }) or an array (["1-1", ...]). Both shapes exist in the wild.
function countCompletedLessons(cl) {
    if (!cl) return 0;
    if (Array.isArray(cl)) return cl.length;
    if (typeof cl === 'object') return Object.keys(cl).length;
    return 0;
}

async function loadGameData() {
    try {
        // Every player's save-state. Admin RLS policy (admin_full_player) lets
        // the admin read all rows.
        const { data: players, error: playersErr } = await db
            .from('nlp_game_players')
            .select('*')
            .order('updated_at', { ascending: false });

        if (playersErr) throw playersErr;

        // Profiles for name / phone / email lookup.
        const { data: profiles, error: profilesErr } = await db
            .from('profiles')
            .select('id, email, full_name, phone');

        if (profilesErr) throw profilesErr;

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        gameData = (players || []).map(r => {
            const profile = profileMap[r.user_id] || {};
            const correct = r.total_correct || 0;
            const wrong = r.total_wrong || 0;
            const answered = correct + wrong;
            const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : null;
            const lastActivity = r.updated_at || r.last_play_date || r.created_at || null;
            return {
                user_id: r.user_id,
                full_name: profile.full_name || profile.email?.split('@')[0] || 'משתמש',
                email: profile.email || '-',
                phone: profile.phone || '',
                course_id: r.course_id || 'practitioner',
                xp: r.xp || 0,
                level: r.level || 1,
                streak: r.streak || 0,
                longest_streak: r.longest_streak || 0,
                completed_count: countCompletedLessons(r.completed_lessons),
                correct: correct,
                wrong: wrong,
                answered: answered,
                accuracy: accuracy,
                last_activity: lastActivity
            };
        });

        // Sort by most recent activity.
        gameData.sort((a, b) => (b.last_activity || '').localeCompare(a.last_activity || ''));

        // Top summary cards.
        const now = Date.now();
        const sevenDaysAgo = now - 7 * 86400000;
        const activeIn7d = gameData.filter(u => u.last_activity && new Date(u.last_activity).getTime() > sevenDaysAgo).length;
        const totalAnswered = gameData.reduce((sum, u) => sum + u.answered, 0);
        const totalCorrect = gameData.reduce((sum, u) => sum + u.correct, 0);
        const avgAccuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

        setText('stat-game-total', gameData.length);
        setText('stat-game-active7d', activeIn7d);
        setText('stat-game-answered', totalAnswered.toLocaleString('he-IL'));
        setText('stat-game-accuracy', avgAccuracy + '%');
        setText('game-count', gameData.length);

    } catch (err) {
        console.error('Error loading game data:', err);
        showToast('שגיאה בטעינת נתוני המשחק', 'error');
    }
}

// "מתי שיחק לאחרונה" in plain Hebrew: היום / אתמול / לפני X ימים / תאריך.
function gameLastPlayed(dateStr) {
    if (!dateStr) return 'עדיין לא שיחק';
    const then = new Date(dateStr).getTime();
    if (isNaN(then)) return '-';
    const days = Math.floor((Date.now() - then) / 86400000);
    if (days <= 0) return 'היום';
    if (days === 1) return 'אתמול';
    if (days < 7) return `לפני ${days} ימים`;
    if (days < 14) return 'לפני שבוע';
    if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`;
    if (days < 60) return 'לפני חודש';
    if (days < 365) return `לפני ${Math.floor(days / 30)} חודשים`;
    return new Date(dateStr).toLocaleDateString('he-IL');
}

const gameCourseLabels = {
    'practitioner': 'תרגול (חינם)',
    'master': 'מאסטר (בתשלום)',
    'nlp-practitioner': 'תרגול (חינם)',
    'nlp-master': 'מאסטר (בתשלום)'
};

function renderGame() {
    const search = document.getElementById('game-search')?.value?.toLowerCase() || '';
    let filtered = gameData;

    if (search) {
        filtered = filtered.filter(u =>
            (u.full_name || '').toLowerCase().includes(search) ||
            (u.email || '').toLowerCase().includes(search)
        );
    }

    const tbody = document.getElementById('game-table');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="fa-solid fa-gamepad"></i><br>עדיין אין שחקנים במשחק התרגול</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(u => {
        const accColor = u.accuracy === null ? 'var(--text-secondary)'
            : u.accuracy >= 80 ? 'var(--success)'
            : u.accuracy >= 50 ? 'var(--gold)'
            : 'var(--danger)';
        const accStr = u.accuracy === null ? '—' : u.accuracy + '%';
        const streakStr = u.streak > 0
            ? `<span style="display:inline-flex;align-items:center;gap:0.25rem;"><i class="fa-solid fa-fire" style="color:#f85149;font-size:0.8rem;"></i> ${u.streak}</span>`
            : '<span style="color:var(--text-secondary);">0</span>';
        const courseStr = gameCourseLabels[u.course_id] || u.course_id;

        return `
            <tr>
                <td>
                    <strong>${escapeHtml(u.full_name)}</strong>
                    ${u.phone ? `<div style="font-size:0.75rem;"><a href="tel:${escapeHtml(u.phone)}" style="color:var(--text-secondary);">${escapeHtml(u.phone)}</a></div>` : ''}
                </td>
                <td><span style="background:rgba(47,133,146,0.12);color:var(--dusty-aqua);padding:0.15rem 0.5rem;border-radius:6px;font-size:0.8rem;">רמה ${u.level}</span></td>
                <td><strong style="color:var(--gold);">${u.xp.toLocaleString('he-IL')}</strong> <span style="font-size:0.75rem;color:var(--text-secondary);">נק'</span></td>
                <td>${streakStr}</td>
                <td><strong style="color:${u.completed_count > 0 ? 'var(--success)' : 'var(--text-secondary)'};">${u.completed_count}</strong></td>
                <td style="font-size:0.85rem;">
                    <span style="color:var(--success);">${u.correct} ✓</span>
                    <span style="color:var(--text-secondary);">/</span>
                    <span style="color:var(--danger);">${u.wrong} ✗</span>
                    <span style="color:${accColor};font-weight:600;margin-inline-start:0.35rem;">${accStr}</span>
                </td>
                <td style="font-size:0.8rem;color:var(--text-secondary);">${courseStr}</td>
                <td style="font-size:0.85rem;color:var(--text-secondary);">${gameLastPlayed(u.last_activity)}</td>
            </tr>
        `;
    }).join('');
}

function exportGameCSV() {
    if (gameData.length === 0) { showToast('אין נתונים לייצוא', 'warning'); return; }
    const headers = ['שם', 'טלפון', 'אימייל', 'רמה', 'ניקוד (XP)', 'רצף ימים', 'רצף שיא', 'שיעורים שסיים', 'תשובות נכונות', 'תשובות שגויות', 'דיוק %', 'קורס', 'שיחק לאחרונה'];
    const rows = gameData.map(u => [
        u.full_name || '',
        u.phone || '',
        u.email || '',
        u.level,
        u.xp,
        u.streak,
        u.longest_streak,
        u.completed_count,
        u.correct,
        u.wrong,
        u.accuracy === null ? '' : u.accuracy,
        gameCourseLabels[u.course_id] || u.course_id,
        gameLastPlayed(u.last_activity)
    ]);
    const bom = '﻿';
    const csv = bom + [headers, ...rows].map(r => r.map(c => `"${(c + '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `game_players_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showToast('הקובץ הורד בהצלחה!', 'success');
}
