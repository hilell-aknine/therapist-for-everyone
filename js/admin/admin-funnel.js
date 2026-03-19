// admin-funnel.js — Sales funnel: all potential customers in one view

let funnelData = null;
let funnelCacheTime = 0;
let funnelFilter = 'all';
const FUNNEL_CACHE_TTL = 3 * 60 * 1000;

const HEAT_ICONS = {
    hot: '🔥🔥🔥',
    warm: '🔥🔥',
    cold: '🔥',
    paying: '✅'
};

const HEAT_COLORS = {
    hot: '#f87171',
    warm: '#fbbf24',
    cold: '#94a3b8',
    paying: '#22c55e'
};

async function loadFunnel() {
    if (funnelData && (Date.now() - funnelCacheTime) < FUNNEL_CACHE_TTL) {
        renderFunnel();
        return;
    }

    try {
        // Fetch all data in parallel
        const [profilesRes, questionnairesRes, salesLeadsRes, subscriptionsRes] = await Promise.all([
            db.from('profiles').select('id, full_name, email, phone, role, created_at')
                .in('role', ['student_lead', 'student', 'paid_customer'])
                .order('created_at', { ascending: false }),
            db.from('portal_questionnaires').select('user_id, how_found, why_nlp, study_time, phone, created_at, heat_level'),
            db.from('contact_requests').select('id, full_name, phone, email, request_type, message, status, created_at')
                .eq('request_type', 'training'),
            db.from('subscriptions').select('user_id, plan, status, start_date, end_date')
                .eq('status', 'active')
        ]);

        // Build maps
        const qMap = {};
        (questionnairesRes.data || []).forEach(q => { if (q.user_id) qMap[q.user_id] = q; });

        const subMap = {};
        (subscriptionsRes.data || []).forEach(s => { subMap[s.user_id] = s; });

        // Sales leads by phone for matching
        const salesByPhone = {};
        (salesLeadsRes.data || []).forEach(l => {
            const p = (l.phone || '').replace(/[-\s]/g, '');
            if (p) salesByPhone[p] = l;
        });

        // Merge into unified list
        const prospects = (profilesRes.data || []).map(p => {
            const q = qMap[p.id];
            const sub = subMap[p.id];
            const cleanPhone = (p.phone || '').replace(/[-\s]/g, '');
            const salesLead = salesByPhone[cleanPhone];

            // Determine heat level
            let heat = 'cold'; // Just registered
            if (sub) heat = 'paying';
            else if (salesLead) heat = 'hot'; // Left details about training
            else if (q) heat = 'warm'; // Filled questionnaire

            return {
                ...p,
                heat,
                questionnaire: q || null,
                salesLead: salesLead || null,
                subscription: sub || null,
                source: q?.how_found || salesLead?.message || '—'
            };
        });

        // Sort: paying first, then hot, warm, cold
        const heatOrder = { paying: 0, hot: 1, warm: 2, cold: 3 };
        prospects.sort((a, b) => heatOrder[a.heat] - heatOrder[b.heat] || new Date(b.created_at) - new Date(a.created_at));

        funnelData = prospects;
        funnelCacheTime = Date.now();
        renderFunnel();
    } catch (err) {
        console.error('[Funnel] Load error:', err);
        document.getElementById('funnel-table').innerHTML =
            `<tr><td colspan="8" style="text-align:center;color:var(--danger);padding:2rem;">${err.message}</td></tr>`;
    }
}

function filterFunnel(filter) {
    funnelFilter = filter;
    document.querySelectorAll('#funnel-view .tab').forEach(t => t.classList.remove('active'));
    event?.target?.classList.add('active');
    renderFunnel();
}

function renderFunnel() {
    if (!funnelData) return;

    const search = (document.getElementById('funnel-search')?.value || '').toLowerCase();
    let filtered = funnelData;

    if (funnelFilter !== 'all') {
        filtered = filtered.filter(p => p.heat === funnelFilter);
    }

    if (search) {
        filtered = filtered.filter(p =>
            (p.full_name || '').toLowerCase().includes(search) ||
            (p.phone || '').includes(search) ||
            (p.email || '').toLowerCase().includes(search)
        );
    }

    // Stats (always from full data)
    const hot = funnelData.filter(p => p.heat === 'hot').length;
    const warm = funnelData.filter(p => p.heat === 'warm').length;
    const cold = funnelData.filter(p => p.heat === 'cold').length;
    const paying = funnelData.filter(p => p.heat === 'paying').length;

    setText('funnel-total', funnelData.length);
    setText('funnel-hot', hot);
    setText('funnel-warm', warm);
    setText('funnel-cold', cold);
    setText('funnel-paying', paying);

    const badge = document.getElementById('funnel-count');
    if (badge) { badge.textContent = funnelData.length; badge.style.display = funnelData.length > 0 ? '' : 'none'; }

    // Table
    const tbody = document.getElementById('funnel-table');
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">אין תוצאות</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map((p, i) => {
        const heatIcon = HEAT_ICONS[p.heat];
        const heatColor = HEAT_COLORS[p.heat];
        const date = p.created_at ? new Date(p.created_at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—';
        const hasQ = p.questionnaire ? '<i class="fa-solid fa-check-circle" style="color:#22c55e;" title="מילא שאלון"></i>' : '<span style="color:var(--text-muted);">—</span>';
        const source = p.source && p.source !== '—' ? p.source : '';

        return `<tr style="cursor:pointer;" onclick="showProspect(${i})">
            <td><strong>${p.full_name || 'ללא שם'}</strong></td>
            <td style="direction:ltr;text-align:right;">${p.phone || '—'}</td>
            <td style="font-size:0.8rem;">${p.email || '—'}</td>
            <td><span style="font-size:0.75rem;background:${heatColor}22;color:${heatColor};padding:2px 8px;border-radius:10px;">${heatIcon}</span></td>
            <td style="font-size:0.8rem;">${source}</td>
            <td style="font-size:0.8rem;">${date}</td>
            <td style="text-align:center;">${hasQ}</td>
            <td>
                ${p.heat !== 'paying' ? `<button onclick="event.stopPropagation();quickActivate('${p.id}','${(p.phone||'').replace(/'/g,'')}')" style="font-size:0.65rem;padding:2px 8px;background:rgba(212,175,55,0.1);border:1px solid var(--gold);border-radius:4px;cursor:pointer;color:var(--gold);white-space:nowrap;" title="הפעל גישה">💳 הפעל</button>` : '<span style="font-size:0.75rem;color:#22c55e;">✅ משלם</span>'}
            </td>
        </tr>`;
    }).join('');

    // Store for modal access
    window._funnelFiltered = filtered;
}

function showProspect(index) {
    const p = window._funnelFiltered?.[index];
    if (!p) return;

    const q = p.questionnaire;
    const s = p.salesLead;
    const sub = p.subscription;
    const heatIcon = HEAT_ICONS[p.heat];
    const date = p.created_at ? new Date(p.created_at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—';

    let html = `<h3 style="color:var(--gold);margin-bottom:1rem;"><i class="fa-solid fa-user"></i> ${p.full_name || 'ללא שם'} ${heatIcon}</h3>`;

    // Basic info
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:1.5rem;font-size:0.9rem;">`;
    html += `<div><strong>טלפון:</strong> ${p.phone || '—'}</div>`;
    html += `<div><strong>אימייל:</strong> ${p.email || '—'}</div>`;
    html += `<div><strong>נרשם:</strong> ${date}</div>`;
    html += `<div><strong>מקור:</strong> ${p.source || '—'}</div>`;
    html += `</div>`;

    // Questionnaire
    if (q) {
        html += `<div style="background:var(--bg,#f3f4f6);border-radius:8px;padding:1rem;margin-bottom:1rem;">`;
        html += `<h4 style="margin-bottom:0.5rem;font-size:0.9rem;"><i class="fa-solid fa-clipboard-list" style="color:var(--gold);margin-left:0.3rem;"></i> תשובות שאלון</h4>`;
        html += `<div style="font-size:0.85rem;line-height:1.8;">`;
        if (q.how_found) html += `<div><strong>מאיפה הגיע:</strong> ${q.how_found}</div>`;
        if (q.why_nlp) html += `<div><strong>למה NLP:</strong> ${q.why_nlp}</div>`;
        if (q.study_time) html += `<div><strong>זמן ללמידה:</strong> ${q.study_time}</div>`;
        if (q.heat_level) html += `<div><strong>רמת חום (שאלון):</strong> ${q.heat_level}</div>`;
        html += `</div></div>`;
    }

    // Sales lead info
    if (s) {
        html += `<div style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:8px;padding:1rem;margin-bottom:1rem;">`;
        html += `<h4 style="margin-bottom:0.5rem;font-size:0.9rem;color:#f87171;"><i class="fa-solid fa-fire-flame-curved" style="margin-left:0.3rem;"></i> פנייה לגבי הכשרה</h4>`;
        html += `<div style="font-size:0.85rem;line-height:1.8;">`;
        if (s.message) html += `<div><strong>הודעה:</strong> ${s.message}</div>`;
        if (s.status) html += `<div><strong>סטטוס:</strong> ${s.status}</div>`;
        html += `</div></div>`;
    }

    // Subscription
    if (sub) {
        const end = sub.end_date ? new Date(sub.end_date).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—';
        html += `<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:8px;padding:1rem;margin-bottom:1rem;">`;
        html += `<h4 style="margin-bottom:0.5rem;font-size:0.9rem;color:#22c55e;"><i class="fa-solid fa-crown" style="margin-left:0.3rem;"></i> לקוח משלם</h4>`;
        html += `<div style="font-size:0.85rem;">תוקף עד: ${end}</div>`;
        html += `</div>`;
    }

    // Action button
    if (p.heat !== 'paying') {
        html += `<button onclick="quickActivate('${p.id}','${(p.phone||'').replace(/'/g,'')}')" style="width:100%;padding:0.7rem;background:var(--gold);color:#003B46;border:none;border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;font-family:inherit;margin-top:0.5rem;">
            <i class="fa-solid fa-bolt"></i> הפעל גישה בתשלום
        </button>`;
    }

    // WhatsApp link
    if (p.phone) {
        const waPhone = p.phone.replace(/[-\s]/g, '').replace(/^0/, '972');
        html += `<a href="https://wa.me/${waPhone}" target="_blank" style="display:block;width:100%;padding:0.6rem;background:#25D366;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:0.9rem;cursor:pointer;font-family:inherit;margin-top:0.5rem;text-align:center;text-decoration:none;">
            <i class="fa-brands fa-whatsapp"></i> שלח הודעה בוואטסאפ
        </a>`;
    }

    document.getElementById('prospect-modal-content').innerHTML = html;
    document.getElementById('prospect-modal').classList.add('active');
}

function closeProspectModal() {
    document.getElementById('prospect-modal').classList.remove('active');
}

async function quickActivate(userId, phone) {
    if (!confirm('להפעיל גישה בתשלום ללקוח זה?')) return;

    try {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 12);

        const { error: sErr } = await db.from('subscriptions').insert({
            user_id: userId,
            plan: 'master_course',
            price: 8880,
            start_date: new Date().toISOString(),
            end_date: endDate.toISOString(),
            activated_by: 'admin_dashboard',
            status: 'active'
        });
        if (sErr) throw sErr;

        await db.from('profiles').update({ role: 'paid_customer' }).eq('id', userId);

        alert('✅ גישה הופעלה בהצלחה!');
        funnelData = null;
        funnelCacheTime = 0;
        paidCache = null;
        paidCacheTime = 0;
        loadFunnel();
        closeProspectModal();
    } catch (err) {
        alert('שגיאה: ' + err.message);
    }
}
