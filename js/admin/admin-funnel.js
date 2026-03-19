// admin-funnel.js — Unified sales funnel with pipeline stages

let funnelData = null;
let funnelCacheTime = 0;
let funnelFilter = 'all';
const FUNNEL_TTL = 2 * 60 * 1000;

const STAGES = {
    new:           { label: 'חדש', icon: '🆕', color: '#94a3b8', order: 0 },
    contacted:     { label: 'נוצר קשר', icon: '📞', color: '#3b82f6', order: 1 },
    follow_up:     { label: 'פולו-אפ', icon: '🔄', color: '#f59e0b', order: 2 },
    presentation:  { label: 'הצגת מוצר', icon: '🎯', color: '#a855f7', order: 3 },
    negotiation:   { label: 'משא ומתן', icon: '🤝', color: '#ec4899', order: 4 },
    won:           { label: 'קנה ✅', icon: '✅', color: '#22c55e', order: 5 },
    lost:          { label: 'לא קנה', icon: '❌', color: '#ef4444', order: 6 },
    not_relevant:  { label: 'לא רלוונטי', icon: '⏭️', color: '#6b7280', order: 7 },
};

async function loadFunnel() {
    if (funnelData && (Date.now() - funnelCacheTime) < FUNNEL_TTL) {
        renderFunnel();
        return;
    }

    try {
        const [profilesRes, qRes, progressRes, salesRes] = await Promise.all([
            db.from('profiles')
                .select('id, full_name, email, phone, role, created_at, sales_stage, sales_contact_count, sales_notes, sales_last_contact')
                .in('role', ['student_lead', 'student', 'paid_customer'])
                .order('created_at', { ascending: false }),
            db.from('portal_questionnaires')
                .select('user_id, how_found, why_nlp, study_time, heat_level, city, occupation, main_challenge, motivation_tip, vision_one_year, created_at'),
            db.from('course_progress')
                .select('user_id, completed'),
            db.from('contact_requests')
                .select('full_name, phone, request_type, message, created_at')
                .eq('request_type', 'training'),
        ]);

        const qMap = {};
        (qRes.data || []).forEach(q => { if (q.user_id) qMap[q.user_id] = q; });

        const progressMap = {};
        (progressRes.data || []).forEach(p => {
            if (p.user_id && p.completed) progressMap[p.user_id] = (progressMap[p.user_id] || 0) + 1;
        });

        const salesByPhone = {};
        (salesRes.data || []).forEach(l => {
            const p = (l.phone || '').replace(/[-\s]/g, '');
            if (p) salesByPhone[p] = l;
        });

        funnelData = (profilesRes.data || []).map(p => {
            const q = qMap[p.id];
            const lessons = progressMap[p.id] || 0;
            const cleanPhone = (p.phone || '').replace(/[-\s]/g, '');
            const salesLead = salesByPhone[cleanPhone];

            // Auto-determine warmth (for display, not stage)
            let warmth = 'cold';
            if (p.role === 'paid_customer') warmth = 'paying';
            else if (salesLead) warmth = 'hot';
            else if (q) warmth = 'warm';

            return {
                ...p,
                stage: p.sales_stage || 'new',
                contactCount: p.sales_contact_count || 0,
                notes: p.sales_notes || '',
                warmth,
                lessons,
                questionnaire: q || null,
                salesLead: salesLead || null,
                source: q?.how_found || '',
            };
        });

        // Sort by stage order, then by date
        funnelData.sort((a, b) => {
            const sa = STAGES[a.stage]?.order ?? 99;
            const sb = STAGES[b.stage]?.order ?? 99;
            return sa - sb || new Date(b.created_at) - new Date(a.created_at);
        });

        funnelCacheTime = Date.now();
        renderFunnel();
    } catch (err) {
        document.getElementById('funnel-table').innerHTML =
            `<tr><td colspan="9" style="text-align:center;color:var(--danger);padding:2rem;">${err.message}</td></tr>`;
    }
}

function filterFunnel(f) {
    funnelFilter = f;
    document.querySelectorAll('#funnel-view .tab').forEach(t => t.classList.remove('active'));
    event?.target?.classList.add('active');
    renderFunnel();
}

function renderFunnel() {
    if (!funnelData) return;

    const search = (document.getElementById('funnel-search')?.value || '').toLowerCase();
    let list = funnelData;

    // Exclude won/lost/not_relevant from main view unless specifically filtered
    if (funnelFilter === 'all') {
        list = list.filter(p => !['won', 'lost', 'not_relevant'].includes(p.stage));
    } else if (funnelFilter === 'closed') {
        list = list.filter(p => ['won', 'lost', 'not_relevant'].includes(p.stage));
    } else {
        list = list.filter(p => p.stage === funnelFilter);
    }

    if (search) {
        list = list.filter(p =>
            (p.full_name || '').toLowerCase().includes(search) ||
            (p.phone || '').includes(search) ||
            (p.email || '').toLowerCase().includes(search)
        );
    }

    // Stats from full data
    const counts = {};
    funnelData.forEach(p => { counts[p.stage] = (counts[p.stage] || 0) + 1; });
    const active = funnelData.filter(p => !['won', 'lost', 'not_relevant'].includes(p.stage)).length;

    setText('funnel-total', active);
    setText('funnel-hot', (counts.presentation || 0) + (counts.negotiation || 0));
    setText('funnel-warm', (counts.contacted || 0) + (counts.follow_up || 0));
    setText('funnel-cold', counts.new || 0);
    setText('funnel-paying', counts.won || 0);

    const badge = document.getElementById('funnel-count');
    if (badge) { badge.textContent = active; badge.style.display = active > 0 ? '' : 'none'; }

    // Table
    const tbody = document.getElementById('funnel-table');
    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">אין תוצאות</td></tr>';
        return;
    }

    const stageOptions = Object.entries(STAGES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('');

    tbody.innerHTML = list.map((p, i) => {
        const st = STAGES[p.stage] || STAGES.new;
        const date = p.created_at ? new Date(p.created_at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—';
        const hasQ = p.questionnaire ? '✅' : '—';
        const warmColors = { hot: '#f87171', warm: '#fbbf24', cold: '#94a3b8', paying: '#22c55e' };
        const wColor = warmColors[p.warmth] || '#94a3b8';

        return `<tr onclick="showProspect(${i})" style="cursor:pointer;">
            <td><strong>${p.full_name || 'ללא שם'}</strong></td>
            <td style="direction:ltr;text-align:right;font-size:0.85rem;">${p.phone || '—'}</td>
            <td>
                <select onchange="event.stopPropagation();updateStage('${p.id}',this.value)" style="font-size:0.75rem;padding:2px 4px;border:1px solid ${st.color};border-radius:6px;background:${st.color}15;color:${st.color};cursor:pointer;font-family:inherit;">
                    ${Object.entries(STAGES).map(([k, v]) => `<option value="${k}" ${k === p.stage ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
                </select>
            </td>
            <td style="text-align:center;font-size:0.85rem;">${p.contactCount > 0 ? `<span style="background:${st.color}22;color:${st.color};padding:1px 6px;border-radius:10px;font-size:0.75rem;">${p.contactCount}</span>` : '—'}</td>
            <td style="text-align:center;font-size:0.85rem;">${p.lessons > 0 ? `📚 ${p.lessons}` : '—'}</td>
            <td style="text-align:center;">${hasQ}</td>
            <td style="font-size:0.8rem;">${p.source || '—'}</td>
            <td style="font-size:0.8rem;">${date}</td>
            <td>
                <button onclick="event.stopPropagation();logContact('${p.id}')" style="font-size:0.65rem;padding:2px 6px;background:rgba(59,130,246,0.1);border:1px solid #3b82f6;border-radius:4px;cursor:pointer;color:#3b82f6;" title="רשום ניסיון קשר">📞+</button>
            </td>
        </tr>`;
    }).join('');

    window._funnelFiltered = list;
}

// === Stage update ===
async function updateStage(userId, newStage) {
    try {
        await db.from('profiles').update({
            sales_stage: newStage,
            sales_updated_at: new Date().toISOString()
        }).eq('id', userId);

        // Update local cache
        const p = funnelData?.find(x => x.id === userId);
        if (p) { p.stage = newStage; p.sales_stage = newStage; }
        renderFunnel();
    } catch (err) { alert('שגיאה: ' + err.message); }
}

// === Log contact attempt ===
async function logContact(userId) {
    const note = prompt('הערה (אופציונלי):');
    try {
        const p = funnelData?.find(x => x.id === userId);
        const newCount = (p?.contactCount || 0) + 1;
        const updates = {
            sales_contact_count: newCount,
            sales_last_contact: new Date().toISOString(),
            sales_updated_at: new Date().toISOString()
        };

        // Auto-advance: new → contacted on first contact
        if (p?.stage === 'new') {
            updates.sales_stage = 'contacted';
        }
        // Auto-advance: contacted → follow_up on 2nd+
        if (p?.stage === 'contacted' && newCount >= 2) {
            updates.sales_stage = 'follow_up';
        }

        const existingNotes = p?.notes || '';
        if (note) {
            const dateStr = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
            updates.sales_notes = `[${dateStr}] ${note}\n${existingNotes}`;
        }

        await db.from('profiles').update(updates).eq('id', userId);

        // Refresh
        funnelData = null;
        funnelCacheTime = 0;
        loadFunnel();
    } catch (err) { alert('שגיאה: ' + err.message); }
}

// === Prospect detail modal ===
function showProspect(index) {
    const p = window._funnelFiltered?.[index];
    if (!p) return;

    const q = p.questionnaire;
    const st = STAGES[p.stage] || STAGES.new;
    const date = p.created_at ? new Date(p.created_at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—';
    const lastContact = p.sales_last_contact ? new Date(p.sales_last_contact).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : 'אף פעם';

    let html = `<h3 style="color:var(--gold);margin-bottom:1rem;">${st.icon} ${p.full_name || 'ללא שם'}</h3>`;

    // Info grid
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:1rem;font-size:0.9rem;">
        <div><strong>טלפון:</strong> ${p.phone || '—'}</div>
        <div><strong>אימייל:</strong> ${p.email || '—'}</div>
        <div><strong>נרשם:</strong> ${date}</div>
        <div><strong>מקור:</strong> ${p.source || '—'}</div>
        <div><strong>שלב:</strong> <span style="color:${st.color};">${st.icon} ${st.label}</span></div>
        <div><strong>ניסיונות קשר:</strong> ${p.contactCount}</div>
        <div><strong>קשר אחרון:</strong> ${lastContact}</div>
        <div><strong>שיעורים שלמד:</strong> 📚 ${p.lessons}</div>
    </div>`;

    // Questionnaire
    if (q) {
        html += `<div style="background:var(--bg,#f3f4f6);border-radius:8px;padding:1rem;margin-bottom:1rem;">
            <h4 style="margin-bottom:0.5rem;font-size:0.9rem;"><i class="fa-solid fa-clipboard-list" style="color:var(--gold);margin-left:0.3rem;"></i> תשובות שאלון</h4>
            <div style="font-size:0.85rem;line-height:1.8;">`;
        if (q.how_found) html += `<div><strong>מאיפה הגיע:</strong> ${q.how_found}</div>`;
        if (q.why_nlp) html += `<div><strong>למה NLP:</strong> ${q.why_nlp}</div>`;
        if (q.study_time) html += `<div><strong>זמן ללמידה:</strong> ${q.study_time}</div>`;
        if (q.city) html += `<div><strong>עיר:</strong> ${q.city}</div>`;
        if (q.occupation) html += `<div><strong>עיסוק:</strong> ${q.occupation}</div>`;
        if (q.main_challenge) html += `<div><strong>אתגר עיקרי:</strong> ${q.main_challenge}</div>`;
        if (q.motivation_tip) html += `<div><strong>מוטיבציה:</strong> ${q.motivation_tip}</div>`;
        if (q.vision_one_year) html += `<div><strong>חזון לשנה:</strong> ${q.vision_one_year}</div>`;
        html += `</div></div>`;
    }

    // Notes
    html += `<div style="margin-bottom:1rem;">
        <h4 style="font-size:0.9rem;margin-bottom:0.5rem;"><i class="fa-solid fa-sticky-note" style="color:var(--gold);margin-left:0.3rem;"></i> הערות</h4>
        <textarea id="prospect-notes" style="width:100%;min-height:80px;padding:0.5rem;border:1px solid var(--border,#ddd);border-radius:8px;font-family:inherit;font-size:0.85rem;resize:vertical;" placeholder="הוסף הערות...">${p.notes || ''}</textarea>
        <button onclick="saveNotes('${p.id}')" style="margin-top:0.3rem;padding:4px 12px;background:var(--gold);color:#003B46;border:none;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;font-family:inherit;">שמור הערות</button>
    </div>`;

    // Stage selector
    html += `<div style="margin-bottom:1rem;">
        <h4 style="font-size:0.9rem;margin-bottom:0.5rem;">שנה שלב:</h4>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">`;
    Object.entries(STAGES).forEach(([k, v]) => {
        const isActive = k === p.stage;
        html += `<button onclick="updateStageFromModal('${p.id}','${k}')" style="padding:4px 10px;border-radius:6px;font-size:0.75rem;font-family:inherit;cursor:pointer;border:1px solid ${v.color};background:${isActive ? v.color : v.color + '15'};color:${isActive ? '#fff' : v.color};font-weight:${isActive ? '700' : '400'};">${v.icon} ${v.label}</button>`;
    });
    html += `</div></div>`;

    // Actions
    html += `<div style="display:flex;gap:0.5rem;margin-top:1rem;">`;
    if (p.phone) {
        const waPhone = p.phone.replace(/[-\s]/g, '').replace(/^0/, '972');
        html += `<a href="https://wa.me/${waPhone}" target="_blank" style="flex:1;padding:0.6rem;background:#25D366;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:0.85rem;text-align:center;text-decoration:none;"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>`;
    }
    if (p.stage !== 'won' && p.role !== 'paid_customer') {
        html += `<button onclick="quickActivate('${p.id}','${(p.phone||'').replace(/'/g,'')}')" style="flex:1;padding:0.6rem;background:var(--gold);color:#003B46;border:none;border-radius:8px;font-weight:700;font-size:0.85rem;cursor:pointer;font-family:inherit;"><i class="fa-solid fa-bolt"></i> הפעל גישה</button>`;
    }
    html += `</div>`;

    document.getElementById('prospect-modal-content').innerHTML = html;
    document.getElementById('prospect-modal').classList.add('active');
}

function closeProspectModal() {
    document.getElementById('prospect-modal').classList.remove('active');
}

async function saveNotes(userId) {
    const notes = document.getElementById('prospect-notes')?.value || '';
    try {
        await db.from('profiles').update({
            sales_notes: notes,
            sales_updated_at: new Date().toISOString()
        }).eq('id', userId);

        const p = funnelData?.find(x => x.id === userId);
        if (p) { p.notes = notes; p.sales_notes = notes; }
        alert('הערות נשמרו');
    } catch (err) { alert('שגיאה: ' + err.message); }
}

async function updateStageFromModal(userId, stage) {
    await updateStage(userId, stage);
    // Re-render modal
    const idx = window._funnelFiltered?.findIndex(x => x.id === userId);
    if (idx >= 0) showProspect(idx);
}

async function quickActivate(userId, phone) {
    if (!confirm('להפעיל גישה בתשלום ללקוח זה?')) return;
    try {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 12);

        await db.from('subscriptions').insert({
            user_id: userId, plan: 'master_course', price: 8880,
            start_date: new Date().toISOString(), end_date: endDate.toISOString(),
            activated_by: 'admin_dashboard', status: 'active'
        });
        await db.from('profiles').update({ role: 'paid_customer', sales_stage: 'won', sales_updated_at: new Date().toISOString() }).eq('id', userId);

        alert('✅ גישה הופעלה!');
        funnelData = null; funnelCacheTime = 0;
        if (typeof paidCache !== 'undefined') { paidCache = null; paidCacheTime = 0; }
        loadFunnel();
        closeProspectModal();
    } catch (err) { alert('שגיאה: ' + err.message); }
}
