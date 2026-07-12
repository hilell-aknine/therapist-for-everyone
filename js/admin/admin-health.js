// admin-health.js — "בריאות המנוע": is the automation engine actually working?
//
// Two layers, one screen:
//   1. WhatsApp engine  — RPC admin_engine_health() (welcome queue + reminder runs)
//   2. Scheduled jobs   — RPC admin_cron_jobs() / admin_cron_runs() (migration 060)
//
// Built after 2026-07-12, when a quota error (Green API 466) silently blacklisted
// three learners for six days and nothing in the dashboard said a word.

let healthCache = null;
let healthCacheTime = 0;
const HEALTH_CACHE_TTL = 5 * 60 * 1000;

const CRON_STATUS = {
    succeeded: { label: 'הצליח', color: '#2E9E5B', icon: 'fa-circle-check' },
    failed:    { label: 'נכשל',  color: '#C0504D', icon: 'fa-circle-xmark' },
    running:   { label: 'רץ',    color: '#D4AF37', icon: 'fa-spinner' },
};

function healthRelTime(ts) {
    if (!ts) return 'מעולם';
    const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (mins < 1) return 'עכשיו';
    if (mins < 60) return `לפני ${mins} דק׳`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `לפני ${hours} שע׳`;
    return `לפני ${Math.round(hours / 24)} ימים`;
}

async function loadHealth(force) {
    const box = document.getElementById('health-view');
    if (!box) return;

    if (!force && healthCache && Date.now() - healthCacheTime < HEALTH_CACHE_TTL) {
        renderHealth(healthCache);
        return;
    }

    box.innerHTML = `<h1 class="page-title"><i class="fa-solid fa-heart-pulse" style="color:#D4AF37;margin-left:0.5rem;"></i> בריאות המנוע</h1>
        <div class="empty-state" style="padding:2rem;">טוען...</div>`;

    // The two RPCs are independent — a missing cron RPC must not hide the engine
    // panel, and vice versa. allSettled, never all.
    const [engineRes, cronRes] = await Promise.allSettled([
        db.rpc('admin_engine_health'),
        db.rpc('admin_cron_jobs'),
    ]);

    healthCache = {
        engine: engineRes.status === 'fulfilled' && !engineRes.value.error ? engineRes.value.data : null,
        engineError: engineRes.status === 'fulfilled' ? engineRes.value.error?.message : engineRes.reason?.message,
        jobs: cronRes.status === 'fulfilled' && !cronRes.value.error ? (cronRes.value.data || []) : [],
        jobsError: cronRes.status === 'fulfilled' ? cronRes.value.error?.message : cronRes.reason?.message,
    };
    healthCacheTime = Date.now();
    renderHealth(healthCache);
}

function renderHealth(h) {
    const box = document.getElementById('health-view');
    if (!box) return;

    const e = h.engine || {};
    const w = e.welcome || {};
    const r = e.reminders || {};
    const failures = e.recent_failures || [];
    const rules = e.rules || [];

    // The verdict line. A number nobody reads is not observability — say the word.
    const alarms = [];
    if (w.stuck > 0) alarms.push(`${w.stuck} הודעות ברוך-הבא תקועות בתור מעל שעה`);
    if (r.failed_24h > 0) alarms.push(`${r.failed_24h} תזכורות נכשלו ב-24 השעות האחרונות`);
    const deadRules = rules.filter(x => !x.is_enabled).length;
    if (deadRules > 0) alarms.push(`${deadRules} כללי תזכורת כבויים`);
    const failedJobs = (h.jobs || []).reduce((s, j) => s + (Number(j.failed_7d) || 0), 0);
    if (failedJobs > 0) alarms.push(`${failedJobs} ריצות קרון נכשלו השבוע`);

    const verdict = alarms.length
        ? `<div style="background:rgba(192,80,77,0.1);border:1px solid rgba(192,80,77,0.4);border-radius:12px;padding:1rem 1.2rem;margin-bottom:1.2rem;">
             <div style="font-weight:700;color:#C0504D;margin-bottom:0.4rem;"><i class="fa-solid fa-triangle-exclamation"></i> דורש טיפול</div>
             <ul style="margin:0;padding-inline-start:1.2rem;color:var(--text-secondary);font-size:0.9rem;line-height:1.8;">
               ${alarms.map(a => `<li>${escapeHtml(a)}</li>`).join('')}
             </ul>
           </div>`
        : `<div style="background:rgba(46,158,91,0.1);border:1px solid rgba(46,158,91,0.4);border-radius:12px;padding:1rem 1.2rem;margin-bottom:1.2rem;color:#2E9E5B;font-weight:700;">
             <i class="fa-solid fa-circle-check"></i> המנוע תקין — אין תור תקוע, אין כשלים פתוחים.
           </div>`;

    const kpi = (label, value, hint, danger) => `
        <div class="stat-card" style="background:${danger ? 'rgba(192,80,77,0.08)' : 'rgba(212,175,55,0.08)'};border-right:3px solid ${danger ? '#C0504D' : '#D4AF37'};border-radius:10px;padding:0.9rem 1.1rem;">
            <div style="font-size:0.78rem;color:var(--text-secondary);">${label}</div>
            <div style="font-size:1.5rem;font-weight:700;color:${danger ? '#C0504D' : 'var(--text-primary)'};">${value}</div>
            <div style="font-size:0.72rem;color:var(--text-secondary);">${hint}</div>
        </div>`;

    box.innerHTML = `
        <h1 class="page-title">
            <i class="fa-solid fa-heart-pulse" style="color:#D4AF37;margin-left:0.5rem;"></i> בריאות המנוע
            <button class="btn" onclick="loadHealth(true)" style="float:left;font-size:0.85rem;">
                <i class="fa-solid fa-rotate"></i> רענן
            </button>
        </h1>

        ${h.engineError
            ? `<div class="empty-state" style="color:#C0504D;padding:1.5rem;">לא ניתן לטעון את נתוני המנוע: ${escapeHtml(h.engineError)}<br>
                 <span style="font-size:0.8rem;color:var(--text-secondary);">ודא שהמיגרציה admin_engine_health הורצה ושאתה מחובר כמנהל.</span></div>`
            : verdict}

        <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0.8rem;margin-bottom:1.5rem;">
            ${kpi('ברוך-הבא — נשלחו (7 ימים)', w.sent_7d ?? '—', `סה״כ ${w.sent ?? 0} מאז ההשקה`)}
            ${kpi('תקועים בתור', w.stuck ?? 0, 'אמור להיות 0', (w.stuck || 0) > 0)}
            ${kpi('תזכורות — נשלחו (7 ימים)', r.sent_7d ?? '—', `אחרונה: ${healthRelTime(r.last_sent)}`)}
            ${kpi('תזכורות שנכשלו (7 ימים)', r.failed_7d ?? 0, '466 = חריגת מכסה', (r.failed_7d || 0) > 0)}
        </div>

        <h2 style="font-size:1.05rem;margin:0 0 0.7rem;color:var(--text-primary);"><i class="fa-solid fa-bolt" style="color:#D4AF37;"></i> כללי התזכורות</h2>
        <div class="auto-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:0.8rem;margin-bottom:1.5rem;">
            ${rules.length ? rules.map(x => `
                <div class="card" style="padding:0.9rem 1.1rem;border-radius:10px;border:1px solid var(--border);">
                    <div style="display:flex;align-items:center;gap:0.5rem;font-weight:600;color:var(--text-primary);font-size:0.9rem;">
                        <span style="width:8px;height:8px;border-radius:50%;background:${x.is_enabled ? '#2E9E5B' : '#C0504D'};"></span>
                        ${escapeHtml(x.name || '—')}
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.4rem;">
                        ${x.is_enabled ? 'פעיל' : 'כבוי'}${x.dry_run ? ' · מצב יבש (לא שולח)' : ''}<br>
                        ריצה אחרונה: ${healthRelTime(x.last_run_at)} · ${escapeHtml(x.last_run_status || '—')}
                    </div>
                </div>`).join('')
            : '<div class="empty-state">אין כללים מוגדרים</div>'}
        </div>

        <h2 style="font-size:1.05rem;margin:0 0 0.7rem;color:var(--text-primary);"><i class="fa-solid fa-circle-xmark" style="color:#C0504D;"></i> כשלי שליחה אחרונים (30 יום)</h2>
        <div class="card" style="padding:0;border-radius:10px;border:1px solid var(--border);margin-bottom:1.5rem;overflow-x:auto;">
            ${failures.length ? `
            <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                <thead><tr style="background:rgba(0,59,70,0.05);">
                    <th style="text-align:right;padding:0.6rem 1rem;">מתי</th>
                    <th style="text-align:right;padding:0.6rem 1rem;">כלל</th>
                    <th style="text-align:right;padding:0.6rem 1rem;">טלפון</th>
                    <th style="text-align:right;padding:0.6rem 1rem;">שגיאה</th>
                </tr></thead>
                <tbody>${failures.map(f => `
                    <tr style="border-top:1px solid var(--border);">
                        <td style="padding:0.6rem 1rem;white-space:nowrap;">${formatDateTime(f.fired_at)}</td>
                        <td style="padding:0.6rem 1rem;">${escapeHtml(f.rule || '—')}</td>
                        <td style="padding:0.6rem 1rem;direction:ltr;text-align:right;">${escapeHtml(f.phone || '')}</td>
                        <td style="padding:0.6rem 1rem;color:#C0504D;">${escapeHtml(f.error || '')}</td>
                    </tr>`).join('')}
                </tbody>
            </table>` : '<div class="empty-state" style="padding:1.5rem;">אין כשלים — כל השליחות עברו.</div>'}
        </div>

        <h2 style="font-size:1.05rem;margin:0 0 0.7rem;color:var(--text-primary);"><i class="fa-solid fa-clock-rotate-left" style="color:#2F8592;"></i> משימות מתוזמנות (cron)</h2>
        ${h.jobsError
            ? `<div class="empty-state" style="color:#C0504D;padding:1.5rem;">לא ניתן לטעון את המשימות: ${escapeHtml(h.jobsError)}</div>`
            : `<div style="display:grid;gap:0.7rem;">
                ${(h.jobs || []).length ? h.jobs.map(j => {
                    const st = CRON_STATUS[j.last_status] || { label: j.last_status || '—', color: 'var(--text-secondary)', icon: 'fa-circle' };
                    return `
                    <div class="card" style="padding:0.9rem 1.1rem;border-radius:10px;border:1px solid var(--border);">
                        <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
                            <span style="width:8px;height:8px;border-radius:50%;background:${j.active ? '#2E9E5B' : '#999'};"></span>
                            <b style="color:var(--text-primary);font-size:0.92rem;">${escapeHtml(j.jobname || '—')}</b>
                            <code style="font-size:0.75rem;color:var(--text-secondary);direction:ltr;">${escapeHtml(j.schedule || '')}</code>
                            <span style="margin-inline-start:auto;color:${st.color};font-size:0.82rem;">
                                <i class="fa-solid ${st.icon}"></i> ${escapeHtml(st.label)} · ${healthRelTime(j.last_start)}
                            </span>
                        </div>
                        <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.4rem;">
                            יעד: ${escapeHtml(j.target || '—')} · 7 ימים: ${j.success_7d || 0} הצליחו, <span style="color:${(j.failed_7d || 0) > 0 ? '#C0504D' : 'inherit'};">${j.failed_7d || 0} נכשלו</span>
                            <button class="btn" style="float:left;font-size:0.78rem;padding:0.25rem 0.7rem;" onclick="toggleCronRuns(${j.jobid}, this)">
                                <i class="fa-solid fa-list-ul"></i> יומן ריצות
                            </button>
                        </div>
                        <div id="cron-runs-${j.jobid}" style="display:none;margin-top:0.7rem;padding-inline-start:0.8rem;border-inline-start:2px solid var(--border);"></div>
                    </div>`;
                }).join('') : '<div class="empty-state">אין משימות מתוזמנות</div>'}
            </div>`}
    `;
}

// Sidebar badge — one cheap call on load. The whole point is that a sick engine
// announces itself without anyone remembering to open this tab.
document.addEventListener('DOMContentLoaded', async () => {
    if (window._authReady) await window._authReady;
    try {
        const { data, error } = await db.rpc('admin_engine_health');
        if (error || !data) return;
        const count = (data.welcome?.stuck || 0) + (data.reminders?.failed_24h || 0);
        const badge = document.getElementById('health-alert-badge');
        if (badge && count > 0) {
            badge.textContent = count;
            badge.style.display = '';
        }
    } catch (err) {
        console.warn('health badge check failed:', err);
    }
});

async function toggleCronRuns(jobid, btn) {
    const box = document.getElementById('cron-runs-' + jobid);
    if (!box) return;
    if (box.style.display !== 'none') { box.style.display = 'none'; return; }

    box.style.display = 'block';
    box.innerHTML = '<div class="empty-state" style="padding:0.6rem;">טוען...</div>';
    try {
        const { data, error } = await db.rpc('admin_cron_runs', { p_jobid: jobid, max_rows: 25 });
        if (error) throw error;
        if (!data || !data.length) {
            box.innerHTML = '<div class="empty-state" style="padding:0.6rem;">אין ריצות מתועדות</div>';
            return;
        }
        box.innerHTML = data.map(run => {
            const st = CRON_STATUS[run.status] || { label: run.status, color: 'var(--text-secondary)', icon: 'fa-circle' };
            return `<div style="margin-bottom:0.7rem;font-size:0.82rem;">
                <i class="fa-solid ${st.icon}" style="color:${st.color};"></i>
                <b style="color:${st.color};">${escapeHtml(st.label)}</b>
                <span style="color:var(--text-secondary);">${formatDateTime(run.start_time)}</span>
                ${run.duration_ms != null ? `<span style="color:var(--text-secondary);"> · ${Math.round(run.duration_ms)}ms</span>` : ''}
                ${run.return_message ? `<div style="color:var(--text-secondary);font-size:0.76rem;margin-top:0.2rem;white-space:pre-wrap;word-break:break-word;">${escapeHtml(run.return_message)}</div>` : ''}
            </div>`;
        }).join('');
    } catch (err) {
        box.innerHTML = `<div style="color:#C0504D;padding:0.6rem;font-size:0.82rem;">שגיאה בטעינת היומן: ${escapeHtml(err.message)}</div>`;
    }
}
