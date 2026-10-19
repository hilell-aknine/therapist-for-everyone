// admin-sandbox.js — "מעבדת אימון" panel.
// Per-lesson funnel, flagged lessons and a recent-sessions feed for the practice
// sandbox. sim_sessions / sim_turns are owner-read only, so every read goes through
// the admin-guarded SECURITY DEFINER RPCs from 20261019120000_sandbox_per_lesson.sql.

let sandboxAdminCache = null;          // { data, t }
const SANDBOX_ADMIN_TTL = 5 * 60 * 1000;
const _sbxTranscriptCache = {};         // session_id → transcript jsonb

const SBX_OUTCOME_HE = {
    success: 'הגיע ליעד',
    budget: 'נגמרו התורות',
    collapse: 'הקשר קרס',
    abandoned: 'ננטש',
};

function _sbxPct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

function _sbxDuration(sec) {
    if (sec == null) return '—';
    const m = Math.floor(sec / 60), s = sec % 60;
    return m ? `${m}:${String(s).padStart(2, '0')} דק׳` : `${s} שנ׳`;
}

function _sbxAgo(ts) {
    if (!ts) return '';
    const diff = (Date.now() - Date.parse(ts)) / 1000;
    if (diff < 60) return 'עכשיו';
    if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דק׳`;
    if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שע׳`;
    return `לפני ${Math.floor(diff / 86400)} ימים`;
}

function _sbxLesson(m, l) {
    return (m != null && l != null) ? `M${m}·L${l}` : '—';
}

async function loadSandboxAdmin(force) {
    if (!force && sandboxAdminCache && (Date.now() - sandboxAdminCache.t) < SANDBOX_ADMIN_TTL) {
        renderSandboxAdmin(sandboxAdminCache.data);
        return;
    }
    const view = document.getElementById('sandbox-view');
    if (view) view.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> טוען את מעבדת האימון…</div>';

    try {
        const [stats, recent, cost, totals] = await Promise.all([
            db.rpc('admin_sandbox_lesson_stats'),
            db.rpc('admin_sandbox_recent', { p_limit: 50 }),
            db.rpc('admin_sandbox_cost_month'),
            db.rpc('admin_sandbox_totals'),
        ]);
        for (const r of [stats, recent, cost, totals]) if (r.error) throw new Error(r.error.message);
        const data = { stats: stats.data || [], recent: recent.data || [], cost: cost.data || [], totals: totals.data || {} };
        sandboxAdminCache = { data, t: Date.now() };
        renderSandboxAdmin(data);
    } catch (err) {
        if (!view) return;
        const isNetwork = err.name === 'TypeError' || /fetch|network/i.test(err.message || '');
        const msg = isNetwork
            ? 'לא הצלחנו למשוך את נתוני מעבדת האימון מהשרת. הנתונים עצמם שמורים ולא נפגעו, זו רק בעיה בטעינה.'
            : `הטעינה נכשלה: ${escapeHtml(err.message)}.<br><span style="font-size:0.85rem;">הנתונים עצמם שמורים ולא נפגעו.</span>`;
        view.innerHTML = `
        <div style="padding:2.5rem 2rem;text-align:center;">
            <div style="color:#f85149;font-size:1.6rem;margin-bottom:0.8rem;"><i class="fa-solid fa-circle-exclamation"></i></div>
            <p style="color:var(--text,#e8f1f2);margin:0 0 1.2rem;line-height:1.7;">${msg}</p>
            <button onclick="loadSandboxAdmin(true)" style="background:var(--gold,#D4AF37);color:#003B46;border:none;border-radius:8px;padding:10px 22px;font-family:inherit;font-weight:700;cursor:pointer;">
                <i class="fa-solid fa-rotate-right" style="margin-left:0.4rem;"></i> נסה שוב
            </button>
        </div>`;
    }
}

function _sbxStackBar(r) {
    const total = (r.passed || 0) + (r.failed || 0) + (r.abandoned || 0) + (r.in_progress || 0);
    if (!total) return '<div style="height:10px;background:var(--bg-secondary,#0f1d24);border-radius:6px;"></div>';
    const seg = (n, color, label) => n
        ? `<div title="${label}: ${n}" style="width:${(n / total) * 100}%;background:${color};"></div>` : '';
    return `<div style="display:flex;height:10px;border-radius:6px;overflow:hidden;background:var(--bg-secondary,#0f1d24);min-width:120px;">
        ${seg(r.passed, '#22c55e', 'עברו')}${seg(r.failed, '#f59e0b', 'לא עברו')}${seg(r.abandoned, '#f85149', 'ננטשו')}${seg(r.in_progress, '#58a6ff', 'בתהליך')}
    </div>`;
}

function renderSandboxAdmin(d) {
    const view = document.getElementById('sandbox-view');
    if (!view) return;

    const stats = d.stats || [];
    const totalSessions = stats.reduce((a, r) => a + (r.sessions || 0), 0);
    const totalPassed = stats.reduce((a, r) => a + (r.passed || 0), 0);
    const learners = Number((d.totals || {}).learners) || 0;
    const learners7d = Number((d.totals || {}).learners_7d) || 0;
    let scoreW = 0, scoreN = 0;
    for (const r of stats) if (r.avg_score != null && r.sessions) { scoreW += Number(r.avg_score) * r.sessions; scoreN += r.sessions; }
    const avgScore = scoreN ? Math.round(scoreW / scoreN) : null;
    const costIls = (d.cost || []).reduce((a, r) => a + Number(r.est_ils || 0), 0);
    const published = stats.filter(r => r.is_published).length;

    // ── Flags ──
    const flags = [];
    for (const r of stats) {
        if (r.sessions >= 3 && r.avg_score != null && Number(r.avg_score) < 70) {
            flags.push({ r, why: `ציון ממוצע ${Math.round(r.avg_score)}`, note: 'טכניקה קשה ללומדים, או שהתרחיש צריך כיול' });
        }
        if (r.sessions >= 3 && _sbxPct(r.abandoned, r.sessions) > 40) {
            flags.push({ r, why: `${_sbxPct(r.abandoned, r.sessions)}% נטישה`, note: 'לומדים עוזבים באמצע. אולי הפתיחה קשה מדי או לא ברורה' });
        }
    }
    const flagsHtml = flags.length ? flags.map(f => `
        <div style="display:flex;gap:.8rem;align-items:flex-start;padding:.8rem 1rem;border:1px solid rgba(245,158,11,.4);background:rgba(245,158,11,.08);border-radius:10px;margin-bottom:.6rem;">
            <i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;margin-top:.2rem;"></i>
            <div><strong>${escapeHtml(_sbxLesson(f.r.module_id, f.r.lesson_id))} · ${escapeHtml(f.r.title)}</strong>
                <span style="color:#f59e0b;margin-right:.5rem;">${escapeHtml(f.why)}</span>
                <div style="color:var(--text-secondary);font-size:.85rem;margin-top:.2rem;">${escapeHtml(f.note)} · ${f.r.sessions} סשנים</div></div>
        </div>`).join('')
        : '<p style="color:var(--text-secondary);font-size:.9rem;margin:0;">אין כרגע שיעורים מסומנים. (סימון דורש לפחות 3 סשנים בשיעור.)</p>';

    // ── Funnel grouped by module ──
    const byModule = {};
    for (const r of stats) {
        const key = r.course_type === 'master' ? `מאסטר · מפגש ${r.module_id ?? '?'}` : `מודול ${r.module_id ?? '?'}`;
        (byModule[key] = byModule[key] || []).push(r);
    }
    const funnelRows = Object.entries(byModule).map(([mod, rows]) => `
        <tr><td colspan="7" style="background:var(--bg-secondary,#0f1d24);font-weight:700;color:var(--gold,#D4AF37);">${escapeHtml(mod)}</td></tr>
        ${rows.map(r => {
            const empty = !r.sessions;
            const flagged = flags.some(f => f.r.scenario_id === r.scenario_id);
            return `<tr style="${empty ? 'opacity:.45;' : ''}${flagged ? 'box-shadow:inset -3px 0 0 #f59e0b;' : ''}">
                <td><strong>${escapeHtml(_sbxLesson(r.module_id, r.lesson_id))}</strong> ${escapeHtml(r.title)}
                    ${r.is_published ? '' : '<span style="font-size:.72rem;color:#f85149;margin-right:.3rem;">(לא מפורסם)</span>'}
                    <div style="font-size:.75rem;color:var(--text-secondary);">${escapeHtml(r.primary_skill || '')}</div></td>
                <td>${r.learners || 0} / ${r.sessions || 0}</td>
                <td style="min-width:140px;">${_sbxStackBar(r)}
                    <div style="font-size:.72rem;color:var(--text-secondary);margin-top:.2rem;">${r.passed || 0} עברו · ${r.failed || 0} לא · ${r.abandoned || 0} ננטשו</div></td>
                <td>${empty ? '—' : _sbxPct(r.passed, r.sessions) + '%'}</td>
                <td style="font-weight:700;${r.avg_score != null && Number(r.avg_score) < 70 && r.sessions >= 3 ? 'color:#f59e0b;' : ''}">${r.avg_score != null ? Math.round(r.avg_score) : '—'}</td>
                <td>${r.avg_turns != null ? Number(r.avg_turns).toFixed(1) : '—'}</td>
                <td style="font-size:.8rem;color:var(--text-secondary);">${r.last_at ? escapeHtml(_sbxAgo(r.last_at)) : ''}</td>
            </tr>`;
        }).join('')}`).join('')
        || '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:1.5rem;">אין עדיין תרחישים</td></tr>';

    // ── Recent feed ──
    const recentRows = (d.recent || []).map(r => `
        <tr class="sbx-row" style="cursor:pointer;" onclick="toggleSandboxTranscript('${escapeHtml(r.session_id)}')">
            <td>${escapeHtml(r.learner_name || r.learner_email || 'לומד')}</td>
            <td>${escapeHtml(_sbxLesson(r.module_id, r.lesson_id))} <span style="color:var(--text-secondary);font-size:.8rem;">${escapeHtml(r.scenario_title || '')}</span></td>
            <td>${r.mode === 'exam' ? 'מבחן' : 'אימון'}</td>
            <td>${r.difficulty ?? '—'}</td>
            <td>${r.status === 'in_session' ? '<span style="color:#58a6ff;">בתהליך</span>' : escapeHtml(SBX_OUTCOME_HE[r.outcome] || r.outcome || '—')}</td>
            <td style="font-weight:700;">${r.overall_score ?? '—'}</td>
            <td>${r.passed === true ? '<span style="color:#22c55e;">✓</span>' : r.passed === false ? '<span style="color:#f85149;">✗</span>' : '—'}</td>
            <td>${escapeHtml(_sbxDuration(r.duration_seconds))}</td>
            <td style="font-size:.8rem;color:var(--text-secondary);">${escapeHtml(_sbxAgo(r.started_at))}</td>
        </tr>
        <tr id="sbx-tr-${escapeHtml(r.session_id)}" class="hidden"><td colspan="9" style="background:var(--bg-secondary,#0f1d24);"></td></tr>`).join('')
        || '<tr><td colspan="9" style="text-align:center;color:var(--text-secondary);padding:1.5rem;">אין עדיין סשנים</td></tr>';

    view.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
        <div>
            <h1 class="page-title"><i class="fa-solid fa-user-doctor" style="color:var(--gold);margin-left:0.5rem;"></i> מעבדת אימון</h1>
            <p style="color:var(--text-secondary);margin:-0.6rem 0 0;font-size:0.9rem;">תרגול מול מטופל מדומה לכל שיעור · ${published} תרחישים מפורסמים</p>
        </div>
        <button onclick="loadSandboxAdmin(true)" style="background:transparent;color:var(--text,#e8f1f2);border:1px solid var(--border,#21323b);border-radius:8px;padding:8px 14px;font-family:inherit;cursor:pointer;">
            <i class="fa-solid fa-rotate-right"></i> רענן</button>
    </div>

    <div class="stats" style="margin-top:1rem;">
        <div class="stat-card"><div class="stat-icon gold"><i class="fa-solid fa-comments"></i></div>
            <div><div class="stat-value">${totalSessions.toLocaleString()}</div><div class="stat-label">סשנים</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:rgba(88,166,255,0.12);color:#58a6ff;"><i class="fa-solid fa-users"></i></div>
            <div><div class="stat-value">${Math.max(learners, 0).toLocaleString()}</div><div class="stat-label">לומדים שתרגלו · ${learners7d} השבוע</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:rgba(34,197,94,0.12);color:#22c55e;"><i class="fa-solid fa-circle-check"></i></div>
            <div><div class="stat-value">${_sbxPct(totalPassed, totalSessions)}%</div><div class="stat-label">שיעור מעבר</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:rgba(212,175,55,0.12);color:#D4AF37;"><i class="fa-solid fa-star"></i></div>
            <div><div class="stat-value">${avgScore ?? '—'}</div><div class="stat-label">ציון ממוצע</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:rgba(37,211,102,0.12);color:#25D366;"><i class="fa-solid fa-shekel-sign"></i></div>
            <div><div class="stat-value">${costIls.toFixed(2)} ₪</div><div class="stat-label">עלות החודש (אומדן עליון)</div></div></div>
    </div>

    <div class="table-container" style="margin-top:1.5rem;padding:1rem 1.2rem;">
        <h3 style="margin:0 0 .8rem;"><i class="fa-solid fa-flag" style="color:#f59e0b;margin-left:.4rem;"></i> שיעורים שדורשים תשומת לב</h3>
        ${flagsHtml}
    </div>

    <div class="table-container" style="margin-top:1.2rem;">
        <div class="table-header"><h3><i class="fa-solid fa-filter" style="color:var(--gold);margin-left:.4rem;"></i> משפך לפי שיעור</h3></div>
        <div style="overflow-x:auto;"><table><thead><tr><th>שיעור</th><th>לומדים / סשנים</th><th>תוצאות</th><th>השלמה</th><th>ציון ממוצע</th><th>תורות ממוצע</th><th>אחרון</th></tr></thead>
        <tbody>${funnelRows}</tbody></table></div>
    </div>

    <div class="table-container" style="margin-top:1.2rem;">
        <div class="table-header"><h3><i class="fa-solid fa-clock-rotate-left" style="color:var(--gold);margin-left:.4rem;"></i> סשנים אחרונים</h3>
            <span style="font-size:.8rem;color:var(--text-secondary);">לחיצה על שורה פותחת את התמליל המלא</span></div>
        <div style="overflow-x:auto;"><table><thead><tr><th>לומד</th><th>שיעור</th><th>מצב</th><th>רמה</th><th>תוצאה</th><th>ציון</th><th>עבר</th><th>משך</th><th>מתי</th></tr></thead>
        <tbody>${recentRows}</tbody></table></div>
    </div>

    <p style="color:var(--text-secondary);font-size:0.78rem;margin-top:1rem;line-height:1.6;">
        <i class="fa-solid fa-circle-info"></i> "עבר" = המטופל הגיע ליעד התרחיש וגם הציון הכולל עבר את רף המעבר. סימון שיעור דורש לפחות 3 סשנים. העלות מחושבת כמו התקרה המשותפת (בתעריף Sonnet), לכן היא אומדן עליון.</p>`;
}

async function toggleSandboxTranscript(sessionId) {
    const row = document.getElementById(`sbx-tr-${sessionId}`);
    if (!row) return;
    if (!row.classList.contains('hidden')) { row.classList.add('hidden'); return; }
    row.classList.remove('hidden');
    const cell = row.firstElementChild;

    if (!_sbxTranscriptCache[sessionId]) {
        cell.innerHTML = '<div style="padding:1rem;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> טוען תמליל…</div>';
        const { data, error } = await db.rpc('admin_sandbox_transcript', { p_session: sessionId });
        if (error) {
            cell.innerHTML = `<div style="padding:1rem;color:#f85149;">טעינת התמליל נכשלה: ${escapeHtml(error.message)}</div>`;
            return;
        }
        _sbxTranscriptCache[sessionId] = data || {};
    }
    cell.innerHTML = _sbxRenderTranscript(_sbxTranscriptCache[sessionId]);
}

function _sbxRenderTranscript(t) {
    const turns = (t.turns || []).map(x => {
        if (x.turn_index === 0) {
            return `<div style="margin:.4rem 0;"><span style="color:var(--text-secondary);font-size:.78rem;">פתיחה</span>
                <div style="padding:.5rem .8rem;border-radius:8px;background:rgba(255,255,255,.04);">${escapeHtml(x.patient_text)}</div></div>`;
        }
        const conf = x.confidence != null ? Math.round(Number(x.confidence) * 100) + '%' : '';
        return `<div style="margin:.7rem 0;border-right:2px solid var(--border,#21323b);padding-right:.7rem;">
            <div style="font-size:.75rem;color:var(--text-secondary);">תור ${x.turn_index} ·
                <code style="color:var(--gold,#D4AF37);">${escapeHtml(x.move || '')}</code> ${conf ? '· ביטחון ' + conf : ''}</div>
            <div style="padding:.45rem .8rem;margin-top:.25rem;border-radius:8px;background:rgba(212,175,55,.08);"><strong>מטפל:</strong> ${escapeHtml(x.student_text)}</div>
            <div style="padding:.45rem .8rem;margin-top:.25rem;border-radius:8px;background:rgba(255,255,255,.04);"><strong>מטופל:</strong> ${escapeHtml(x.patient_text)}</div>
            ${x.note ? `<div style="font-size:.8rem;color:var(--text-secondary);margin-top:.25rem;"><i class="fa-solid fa-gavel"></i> ${escapeHtml(x.note)}</div>` : ''}
        </div>`;
    }).join('') || '<div style="color:var(--text-secondary);">אין תורות.</div>';

    const db_ = t.debrief;
    const debrief = db_ ? `
        <div style="padding:.8rem 1rem;border:1px solid rgba(212,175,55,.3);border-radius:10px;margin-bottom:1rem;">
            <div style="display:flex;gap:1.2rem;flex-wrap:wrap;align-items:center;">
                <span style="font-size:1.4rem;font-weight:800;color:var(--gold,#D4AF37);">${db_.overall_score ?? db_.scores?.overall ?? '—'}</span>
                <span>${db_.passed ? '<span style="color:#22c55e;">✓ עבר</span>' : '<span style="color:#f85149;">✗ לא עבר</span>'}
                    ${db_.passing_score != null ? `<span style="color:var(--text-secondary);font-size:.8rem;"> · רף ${db_.passing_score}</span>` : ''}</span>
                ${db_.headline ? `<span style="color:var(--text-secondary);">${escapeHtml(db_.headline)}</span>` : ''}
            </div>
            ${db_.actionable_takeaway ? `<div style="margin-top:.6rem;"><strong>הדבר האחד:</strong> ${escapeHtml(db_.actionable_takeaway)}</div>` : ''}
            ${(db_.missed_opportunities || []).length ? `<div style="margin-top:.4rem;"><strong>הזדמנויות שהוחמצו:</strong><ul style="margin:.3rem 0 0;padding-right:1.2rem;">${db_.missed_opportunities.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul></div>` : ''}
        </div>` : '<div style="color:var(--text-secondary);margin-bottom:.8rem;">אין עדיין תחקיר לסשן הזה.</div>';

    return `<div style="padding:1rem;max-height:520px;overflow-y:auto;">${debrief}${turns}</div>`;
}
