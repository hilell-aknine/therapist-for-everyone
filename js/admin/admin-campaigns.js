// admin-campaigns.js — Meta & paid campaigns dashboard

let campCache = null;
let campCacheTime = 0;
const CAMP_CACHE_TTL = 5 * 60 * 1000;

const META_SOURCES = ['facebook', 'instagram', 'meta', 'fb', 'ig'];
const PLATFORM_LABELS = { 'meta': 'Meta', 'instagram': 'Instagram', 'google': 'Google', 'tiktok': 'TikTok', 'other': 'אחר' };
const PLATFORM_COLORS = { 'meta': '#1877F2', 'instagram': '#E4405F', 'google': '#4285F4', 'tiktok': '#000', 'other': '#666' };
const STATUS_LABELS_CAMP = { 'draft': 'טיוטה', 'active': 'פעיל', 'paused': 'מושהה', 'completed': 'הסתיים' };
const STATUS_COLORS_CAMP = { 'draft': '#666', 'active': '#2F8592', 'paused': '#D4AF37', 'completed': '#003B46' };

async function loadCampaignDashboard() {
    if (campCache && (Date.now() - campCacheTime) < CAMP_CACHE_TTL) {
        renderCampaignData(campCache);
        return;
    }

    try {
        // Parallel: campaigns + all Meta leads across tables
        const [campaignsRes, patientsRes, therapistsRes, contactsRes, profilesRes, questRes] = await Promise.all([
            db.from('campaign_performance').select('*').order('created_at', { ascending: false }),
            db.from('patients').select('id, utm_source, utm_campaign, created_at').in('utm_source', META_SOURCES),
            db.from('therapists').select('id, utm_source, utm_campaign, created_at').in('utm_source', META_SOURCES),
            db.from('contact_requests').select('id, utm_source, utm_campaign, created_at').in('utm_source', META_SOURCES),
            db.from('profiles').select('id, role, utm_source, utm_campaign, created_at').in('utm_source', META_SOURCES),
            db.from('portal_questionnaires').select('id, utm_source, utm_campaign, created_at').in('utm_source', META_SOURCES),
        ]);

        const allMetaLeads = [
            ...(patientsRes.data || []).map(r => ({ ...r, type: 'patient' })),
            ...(therapistsRes.data || []).map(r => ({ ...r, type: 'therapist' })),
            ...(contactsRes.data || []).map(r => ({ ...r, type: 'contact' })),
        ];

        campCache = {
            campaigns: campaignsRes.data || [],
            metaLeads: allMetaLeads,
            profiles: profilesRes.data || [],
            questionnaires: questRes.data || [],
        };
        campCacheTime = Date.now();
        renderCampaignData(campCache);
    } catch (err) {
        console.error('Campaign dashboard error:', err);
    }
}

function renderCampaignData({ campaigns, metaLeads, profiles, questionnaires }) {
    const totalLeads = metaLeads.length;
    const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
    const totalSpend = campaigns.reduce((s, c) => s + parseFloat(c.spend_to_date || 0), 0);
    const avgCPL = totalLeads > 0 && totalSpend > 0 ? (totalSpend / totalLeads).toFixed(1) : '-';
    const signups = profiles.length;
    const paidCustomers = profiles.filter(p => p.role === 'paid_customer').length;

    setText('camp-total-leads', totalLeads);
    setText('camp-active', activeCampaigns);
    setText('camp-spend', totalSpend > 0 ? '₪' + totalSpend.toLocaleString() : '₪0');
    setText('camp-cpl', avgCPL !== '-' ? '₪' + avgCPL : '-');

    // Update badge
    const badge = document.getElementById('campaigns-count');
    if (badge) { badge.textContent = activeCampaigns; badge.style.display = activeCampaigns > 0 ? '' : 'none'; }

    // Funnel
    renderCampaignFunnel(totalLeads, signups, questionnaires.length, paidCustomers);

    // Campaigns table
    renderCampaignsTable(campaigns);

    // By-campaign breakdown
    renderCampaignBreakdown(metaLeads, campaigns);
}

function renderCampaignFunnel(leads, signups, questionnaires, paid) {
    const el = document.getElementById('camp-funnel');
    if (!el) return;

    const maxVal = Math.max(leads, 1);
    const stages = [
        { label: 'לידים ממטא', count: leads, color: '#1877F2', pct: 100 },
        { label: 'מילאו שאלון', count: questionnaires, color: '#2F8592', pct: Math.round((questionnaires / maxVal) * 100) },
        { label: 'נרשמו לפורטל', count: signups, color: '#00606B', pct: Math.round((signups / maxVal) * 100) },
        { label: 'לקוחות משלמים', count: paid, color: '#D4AF37', pct: Math.round((paid / maxVal) * 100) },
    ];

    el.innerHTML = stages.map(s => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="width:120px;font-size:0.82rem;font-weight:500;color:var(--text-secondary);text-align:left;flex-shrink:0;">${s.label} (${s.count})</span>
            <div style="flex:1;height:24px;background:#f0f4f5;border-radius:6px;overflow:hidden;">
                <div style="height:100%;width:${Math.max(s.pct, 2)}%;background:${s.color};border-radius:6px;display:flex;align-items:center;padding-right:8px;">
                    <span style="font-size:0.75rem;font-weight:700;color:#fff;">${s.pct}%</span>
                </div>
            </div>
        </div>
    `).join('');
}

function renderCampaignsTable(campaigns) {
    const el = document.getElementById('camp-table');
    if (!el) return;

    if (!campaigns.length) {
        el.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:1.5rem;">אין קמפיינים — לחצו "הוסף קמפיין" כדי להתחיל</p>';
        return;
    }

    let html = `<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
        <thead><tr style="border-bottom:2px solid var(--border);">
            <th style="text-align:right;padding:0.5rem;">שם</th>
            <th style="text-align:center;padding:0.5rem;">פלטפורמה</th>
            <th style="text-align:center;padding:0.5rem;">לידים</th>
            <th style="text-align:center;padding:0.5rem;">הרשמות</th>
            <th style="text-align:center;padding:0.5rem;">הוצאה</th>
            <th style="text-align:center;padding:0.5rem;">CPL</th>
            <th style="text-align:center;padding:0.5rem;">סטטוס</th>
            <th style="text-align:center;padding:0.5rem;">פעולות</th>
        </tr></thead><tbody>`;

    campaigns.forEach(c => {
        const platColor = PLATFORM_COLORS[c.platform] || '#666';
        const platLabel = PLATFORM_LABELS[c.platform] || c.platform;
        const statColor = STATUS_COLORS_CAMP[c.status] || '#666';
        const statLabel = STATUS_LABELS_CAMP[c.status] || c.status;
        const spend = parseFloat(c.spend_to_date || 0);
        const cpl = c.cost_per_lead ? '₪' + c.cost_per_lead : '-';
        const dates = (c.start_date ? formatDate(c.start_date) : '') + (c.end_date ? ' - ' + formatDate(c.end_date) : '');

        html += `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:0.5rem;">
                <div style="font-weight:600;">${escapeHtml(c.name)}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary);">${c.utm_campaign ? 'UTM: ' + escapeHtml(c.utm_campaign) : ''} ${dates}</div>
            </td>
            <td style="text-align:center;padding:0.5rem;">
                <span style="background:${platColor}20;color:${platColor};padding:2px 8px;border-radius:6px;font-size:0.75rem;font-weight:600;">${platLabel}</span>
            </td>
            <td style="text-align:center;padding:0.5rem;font-weight:700;">${c.total_leads || 0}</td>
            <td style="text-align:center;padding:0.5rem;">${c.signups || 0}</td>
            <td style="text-align:center;padding:0.5rem;">${spend > 0 ? '₪' + spend.toLocaleString() : '-'}</td>
            <td style="text-align:center;padding:0.5rem;font-weight:700;color:var(--gold);">${cpl}</td>
            <td style="text-align:center;padding:0.5rem;">
                <span style="background:${statColor}20;color:${statColor};padding:2px 8px;border-radius:6px;font-size:0.75rem;font-weight:600;">${statLabel}</span>
            </td>
            <td style="text-align:center;padding:0.5rem;white-space:nowrap;">
                <button onclick="openEditCampaign('${c.id}')" style="background:none;border:none;cursor:pointer;color:var(--gold);font-size:1rem;" title="ערוך"><i class="fa-solid fa-pen-to-square"></i></button>
                <button onclick="deleteCampaign('${c.id}','${escapeHtml(c.name)}')" style="background:none;border:none;cursor:pointer;color:#FF6F61;font-size:1rem;" title="מחק"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        </tr>`;
    });

    html += '</tbody></table>';
    el.innerHTML = html;
}

function renderCampaignBreakdown(metaLeads, campaigns) {
    const el = document.getElementById('camp-breakdown');
    if (!el) return;

    // Group leads by utm_campaign
    const byCampaign = {};
    metaLeads.forEach(l => {
        const key = l.utm_campaign || 'ללא קמפיין';
        if (!byCampaign[key]) byCampaign[key] = { count: 0, sources: {} };
        byCampaign[key].count++;
        const src = l.utm_source || 'unknown';
        byCampaign[key].sources[src] = (byCampaign[key].sources[src] || 0) + 1;
    });

    const sorted = Object.entries(byCampaign).sort((a, b) => b[1].count - a[1].count);

    if (!sorted.length) {
        el.innerHTML = '<p style="color:var(--text-secondary);text-align:center;">אין נתונים עדיין</p>';
        return;
    }

    let html = '<div style="display:grid;gap:6px;">';
    sorted.forEach(([name, data]) => {
        const sourceTags = Object.entries(data.sources).map(([s, c]) =>
            `<span style="background:rgba(24,119,242,0.1);color:#1877F2;padding:1px 6px;border-radius:4px;font-size:0.72rem;">${s}: ${c}</span>`
        ).join(' ');

        html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#f8fafb;border-radius:8px;border:1px solid #eef2f3;">
            <span style="font-weight:700;font-size:1.1rem;color:var(--gold);min-width:30px;">${data.count}</span>
            <div style="flex:1;">
                <div style="font-weight:600;font-size:0.85rem;">${escapeHtml(name)}</div>
                <div style="margin-top:2px;">${sourceTags}</div>
            </div>
        </div>`;
    });
    html += '</div>';
    el.innerHTML = html;
}

// ============ CRUD ============

function openAddCampaign() {
    renderCampaignModal(null);
}

function openEditCampaign(id) {
    const c = campCache?.campaigns?.find(x => x.id === id);
    if (!c) return;
    renderCampaignModal(c);
}

function renderCampaignModal(config) {
    const isEdit = !!config;
    document.getElementById('campaign-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'campaign-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
    <div style="background:var(--card-bg,#fff);border-radius:16px;padding:1.5rem;width:90%;max-width:550px;max-height:85vh;overflow-y:auto;direction:rtl;" onclick="event.stopPropagation()">
        <h2 style="margin-bottom:1rem;font-size:1.1rem;"><i class="fa-brands fa-meta" style="color:#1877F2;margin-left:0.4rem;"></i> ${isEdit ? 'עריכת קמפיין' : 'קמפיין חדש'}</h2>
        <form onsubmit="saveCampaign(event, ${isEdit ? "'" + config.id + "'" : 'null'})">
            <div style="display:grid;gap:0.7rem;">
                <label style="font-weight:600;font-size:0.85rem;">שם הקמפיין
                    <input name="name" required value="${escapeHtml(config?.name || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.2rem;">
                </label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;">
                    <label style="font-weight:600;font-size:0.85rem;">פלטפורמה
                        <select name="platform" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.2rem;">
                            <option value="meta" ${config?.platform === 'meta' ? 'selected' : ''}>Meta (Facebook)</option>
                            <option value="instagram" ${config?.platform === 'instagram' ? 'selected' : ''}>Instagram</option>
                            <option value="google" ${config?.platform === 'google' ? 'selected' : ''}>Google Ads</option>
                            <option value="tiktok" ${config?.platform === 'tiktok' ? 'selected' : ''}>TikTok</option>
                            <option value="other" ${config?.platform === 'other' ? 'selected' : ''}>אחר</option>
                        </select>
                    </label>
                    <label style="font-weight:600;font-size:0.85rem;">סטטוס
                        <select name="status" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.2rem;">
                            <option value="draft" ${config?.status === 'draft' ? 'selected' : ''}>טיוטה</option>
                            <option value="active" ${config?.status === 'active' ? 'selected' : ''}>פעיל</option>
                            <option value="paused" ${config?.status === 'paused' ? 'selected' : ''}>מושהה</option>
                            <option value="completed" ${config?.status === 'completed' ? 'selected' : ''}>הסתיים</option>
                        </select>
                    </label>
                </div>
                <label style="font-weight:600;font-size:0.85rem;">UTM Campaign
                    <div style="font-size:0.72rem;color:var(--text-secondary);">הערך שמופיע ב-?utm_campaign= בלינק המודעה</div>
                    <input name="utm_campaign" value="${escapeHtml(config?.utm_campaign || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;direction:ltr;" placeholder="e.g. free-course-march-2026">
                </label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;">
                    <label style="font-weight:600;font-size:0.85rem;">תקציב (₪)
                        <input name="budget" type="number" step="0.01" min="0" value="${config?.budget || 0}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.2rem;">
                    </label>
                    <label style="font-weight:600;font-size:0.85rem;">הוצאה עד כה (₪)
                        <input name="spend_to_date" type="number" step="0.01" min="0" value="${config?.spend_to_date || 0}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.2rem;">
                    </label>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;">
                    <label style="font-weight:600;font-size:0.85rem;">תאריך התחלה
                        <input name="start_date" type="date" value="${config?.start_date || ''}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.2rem;">
                    </label>
                    <label style="font-weight:600;font-size:0.85rem;">תאריך סיום
                        <input name="end_date" type="date" value="${config?.end_date || ''}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.2rem;">
                    </label>
                </div>
                <label style="font-weight:600;font-size:0.85rem;">קהל יעד
                    <textarea name="target_audience_description" rows="2" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.2rem;resize:vertical;">${escapeHtml(config?.target_audience_description || '')}</textarea>
                </label>
                <label style="font-weight:600;font-size:0.85rem;">טקסט מודעה
                    <textarea name="ad_copy" rows="3" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.2rem;resize:vertical;">${escapeHtml(config?.ad_copy || '')}</textarea>
                </label>
                <label style="font-weight:600;font-size:0.85rem;">הערות
                    <textarea name="notes" rows="2" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.2rem;resize:vertical;">${escapeHtml(config?.notes || '')}</textarea>
                </label>
            </div>
            <div style="display:flex;gap:0.5rem;margin-top:1.2rem;justify-content:flex-end;">
                <button type="button" onclick="this.closest('#campaign-modal').remove()" style="padding:0.5rem 1rem;border:1px solid var(--border);border-radius:8px;background:none;cursor:pointer;">ביטול</button>
                <button type="submit" style="padding:0.5rem 1.5rem;background:var(--gold);color:var(--deep-petrol);border:none;border-radius:8px;font-weight:700;cursor:pointer;">${isEdit ? 'שמור' : 'צור'}</button>
            </div>
        </form>
    </div>`;

    document.body.appendChild(modal);
}

async function saveCampaign(event, id) {
    event.preventDefault();
    const f = event.target;
    const data = {
        name: f.name.value,
        platform: f.platform.value,
        status: f.status.value,
        utm_campaign: f.utm_campaign.value || null,
        budget: parseFloat(f.budget.value) || 0,
        spend_to_date: parseFloat(f.spend_to_date.value) || 0,
        start_date: f.start_date.value || null,
        end_date: f.end_date.value || null,
        target_audience_description: f.target_audience_description.value || null,
        ad_copy: f.ad_copy.value || null,
        notes: f.notes.value || null,
        updated_at: new Date().toISOString()
    };

    try {
        if (id) {
            const { error } = await db.from('ad_campaigns').update(data).eq('id', id);
            if (error) throw error;
            showToast('קמפיין עודכן', 'success');
        } else {
            const { error } = await db.from('ad_campaigns').insert([data]);
            if (error) throw error;
            showToast('קמפיין נוצר', 'success');
        }
        document.getElementById('campaign-modal')?.remove();
        campCache = null;
        loadCampaignDashboard();
    } catch (err) {
        showToast('שגיאה: ' + (err.message || ''), 'error');
    }
}

async function deleteCampaign(id, name) {
    if (!confirm('למחוק את הקמפיין "' + name + '"?')) return;
    try {
        await db.from('ad_campaigns').delete().eq('id', id);
        campCache = null;
        loadCampaignDashboard();
        showToast('קמפיין נמחק', 'success');
    } catch (err) {
        showToast('שגיאה במחיקה', 'error');
    }
}

// Tab switching inside campaigns view
function switchCampaignTab(tab) {
    document.getElementById('camp-stats-panel')?.classList.toggle('hidden', tab !== 'stats');
    document.getElementById('camp-creative-panel')?.classList.toggle('hidden', tab !== 'creative');
    document.querySelectorAll('#campaigns-view .camp-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
}
