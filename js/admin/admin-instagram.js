// admin-instagram.js — Instagram tracking: leads from utm_source=instagram

let igCache = null;
let igCacheTime = 0;
const IG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadInstagramAnalytics() {
    if (igCache && (Date.now() - igCacheTime) < IG_CACHE_TTL) {
        renderInstagramData(igCache);
        return;
    }

    try {
        // Query all 3 tables for utm_source = 'instagram'
        const [patientsRes, therapistsRes, contactsRes] = await Promise.all([
            db.from('patients').select('id, full_name, utm_source, utm_medium, utm_campaign, created_at').eq('utm_source', 'instagram'),
            db.from('therapists').select('id, full_name, utm_source, utm_medium, utm_campaign, created_at').eq('utm_source', 'instagram'),
            db.from('contact_requests').select('id, full_name, utm_source, utm_medium, utm_campaign, created_at').eq('utm_source', 'instagram'),
        ]);

        const allLeads = [
            ...(patientsRes.data || []).map(r => ({ ...r, type: 'מטופל' })),
            ...(therapistsRes.data || []).map(r => ({ ...r, type: 'מטפל' })),
            ...(contactsRes.data || []).map(r => ({ ...r, type: 'ליד' })),
        ];

        allLeads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        igCache = allLeads;
        igCacheTime = Date.now();
        renderInstagramData(allLeads);
    } catch (err) {
        console.error('[Instagram] Load error:', err);
        document.getElementById('ig-recent-table').innerHTML =
            `<tr><td colspan="4" style="text-align:center;color:var(--danger);padding:2rem;"><i class="fa-solid fa-circle-exclamation"></i> ${err.message}</td></tr>`;
    }
}

function renderInstagramData(allLeads) {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const today = allLeads.filter(l => l.created_at && l.created_at.startsWith(todayStr));
    const last7 = allLeads.filter(l => new Date(l.created_at) >= d7);
    const last30 = allLeads.filter(l => new Date(l.created_at) >= d30);

    // Stats cards
    setText('ig-total-leads', allLeads.length);
    setText('ig-30d-leads', last30.length);
    setText('ig-7d-leads', last7.length);
    setText('ig-today-leads', today.length);

    // Sidebar badge
    const badge = document.getElementById('ig-total-badge');
    if (badge) {
        badge.textContent = allLeads.length;
        badge.style.display = allLeads.length > 0 ? '' : 'none';
    }

    // Breakdown by type
    const typeCounts = {};
    allLeads.forEach(l => { typeCounts[l.type] = (typeCounts[l.type] || 0) + 1; });
    const typeRows = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const breakdownTbody = document.getElementById('ig-breakdown-table');
    if (typeRows.length === 0) {
        breakdownTbody.innerHTML = '<tr><td colspan="3" class="empty-state">אין לידים מאינסטגרם עדיין</td></tr>';
    } else {
        breakdownTbody.innerHTML = typeRows.map(([type, count]) => {
            const pct = allLeads.length > 0 ? Math.round((count / allLeads.length) * 100) : 0;
            const color = type === 'מטופל' ? '#3b82f6' : type === 'מטפל' ? '#22c55e' : '#f59e0b';
            return `<tr>
                <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-left:0.5rem;"></span>${type}</td>
                <td><strong>${count}</strong></td>
                <td>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <div style="flex:1;background:var(--bg);border-radius:4px;height:6px;overflow:hidden;">
                            <div style="height:100%;width:${pct}%;background:${color};border-radius:4px;"></div>
                        </div>
                        <span style="font-size:0.8rem;min-width:30px;">${pct}%</span>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // Breakdown by campaign
    const campaignCounts = {};
    allLeads.forEach(l => {
        const camp = l.utm_campaign || '(ללא קמפיין)';
        campaignCounts[camp] = (campaignCounts[camp] || 0) + 1;
    });
    const campaignRows = Object.entries(campaignCounts).sort((a, b) => b[1] - a[1]);
    const campaignsTbody = document.getElementById('ig-campaigns-table');
    if (campaignRows.length === 0) {
        campaignsTbody.innerHTML = '<tr><td colspan="3" class="empty-state">אין נתוני קמפיינים</td></tr>';
    } else {
        const campaignNameMap = {
            'bio-link-pinned': 'קישור מוצמד בביו',
            'free-course-march-2026': 'קורס חינמי מרץ 2026',
        };
        campaignsTbody.innerHTML = campaignRows.map(([camp, count]) => {
            const pct = allLeads.length > 0 ? Math.round((count / allLeads.length) * 100) : 0;
            const displayName = campaignNameMap[camp] || camp;
            return `<tr>
                <td><i class="fa-solid fa-tag" style="color:var(--gold);margin-left:0.4rem;font-size:0.8rem;"></i> ${displayName}</td>
                <td><strong>${count}</strong></td>
                <td>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <div style="flex:1;background:var(--bg);border-radius:4px;height:6px;overflow:hidden;">
                            <div style="height:100%;width:${pct}%;background:#E4405F;border-radius:4px;"></div>
                        </div>
                        <span style="font-size:0.8rem;min-width:30px;">${pct}%</span>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // Recent leads table (last 20)
    const recentTbody = document.getElementById('ig-recent-table');
    const recent = allLeads.slice(0, 20);
    if (recent.length === 0) {
        recentTbody.innerHTML = '<tr><td colspan="4" class="empty-state">אין לידים מאינסטגרם עדיין</td></tr>';
    } else {
        const campaignNameMap = {
            'bio-link-pinned': 'ביו מוצמד',
            'free-course-march-2026': 'קורס חינמי',
        };
        recentTbody.innerHTML = recent.map(l => {
            const date = new Date(l.created_at);
            const dateStr = date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jerusalem' });
            const timeStr = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
            const typeColor = l.type === 'מטופל' ? '#3b82f6' : l.type === 'מטפל' ? '#22c55e' : '#f59e0b';
            const camp = campaignNameMap[l.utm_campaign] || l.utm_campaign || '—';
            return `<tr>
                <td><strong>${l.full_name || 'ללא שם'}</strong></td>
                <td><span style="font-size:0.75rem;background:${typeColor}22;color:${typeColor};padding:2px 8px;border-radius:10px;">${l.type}</span></td>
                <td><span style="font-size:0.75rem;background:var(--bg);padding:2px 8px;border-radius:10px;">${camp}</span></td>
                <td style="font-size:0.85rem;color:var(--text-secondary);">${dateStr} ${timeStr}</td>
            </tr>`;
        }).join('');
    }
}
