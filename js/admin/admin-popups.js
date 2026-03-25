// admin-popups.js — Popup management panel (CRUD + stats)

let popupCache = null;
let popupCacheTime = 0;
const POPUP_CACHE_TTL = 5 * 60 * 1000;

const CATEGORY_LABELS = { 'critical': 'קריטי', 'engagement': 'מעורבות', 'info': 'מידע' };
const CATEGORY_COLORS = { 'critical': '#FF6F61', 'engagement': '#D4AF37', 'info': '#2F8592' };
const AUDIENCE_LABELS = { 'all': 'כולם', 'authenticated': 'מחוברים', 'unauthenticated': 'אורחים', 'paid_customer': 'לקוחות משלמים' };

async function loadPopupConfigs() {
    if (popupCache && (Date.now() - popupCacheTime) < POPUP_CACHE_TTL) {
        renderPopupData(popupCache);
        return;
    }

    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const [configsRes, eventsRes] = await Promise.all([
            db.from('popup_configs').select('*').order('priority', { ascending: true }),
            db.from('popup_events').select('popup_id, event_type, created_at').gte('created_at', thirtyDaysAgo)
        ]);

        popupCache = {
            configs: configsRes.data || [],
            events: eventsRes.data || []
        };
        popupCacheTime = Date.now();
        renderPopupData(popupCache);
    } catch (err) {
        console.error('Popup configs error:', err);
    }
}

function renderPopupData({ configs, events }) {
    // Aggregate events per popup
    const stats = {};
    events.forEach(e => {
        if (!stats[e.popup_id]) stats[e.popup_id] = { shown: 0, dismissed: 0, clicked: 0, timeout: 0 };
        stats[e.popup_id][e.event_type] = (stats[e.popup_id][e.event_type] || 0) + 1;
    });

    // Global stats
    const activeCount = configs.filter(c => c.is_active).length;
    const totalShown = events.filter(e => e.event_type === 'shown').length;
    const totalClicks = events.filter(e => e.event_type === 'clicked').length;
    const totalDismissed = events.filter(e => e.event_type === 'dismissed').length;
    const dismissRate = totalShown > 0 ? Math.round((totalDismissed / totalShown) * 100) + '%' : '-';

    setText('popup-active-count', activeCount);
    setText('popup-impressions-30d', totalShown);
    setText('popup-clicks-30d', totalClicks);
    setText('popup-dismiss-rate', dismissRate);

    // Render configs table
    renderPopupConfigsTable(configs, stats);

    // Render per-popup stats
    renderPopupStatsTable(configs, stats);
}

function renderPopupConfigsTable(configs, stats) {
    const container = document.getElementById('popup-configs-table');
    if (!container) return;

    if (!configs.length) {
        container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;">אין פופאפים מוגדרים</p>';
        return;
    }

    let html = `<table style="width:100%;border-collapse:collapse;">
        <thead>
            <tr style="border-bottom:2px solid var(--border);">
                <th style="text-align:right;padding:0.6rem;font-weight:600;color:var(--text-secondary);">שם</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">קטגוריה</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">עדיפות</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">קהל</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">חשיפות</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">סטטוס</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">פעולות</th>
            </tr>
        </thead>
        <tbody>`;

    configs.forEach(c => {
        const catColor = CATEGORY_COLORS[c.category] || '#999';
        const catLabel = CATEGORY_LABELS[c.category] || c.category;
        const audLabel = AUDIENCE_LABELS[c.target_audience] || c.target_audience;
        const shown = stats[c.popup_id]?.shown || 0;
        const isScheduled = c.start_date || c.end_date;
        const now = new Date();
        let scheduleNote = '';
        if (c.end_date && new Date(c.end_date) < now) scheduleNote = ' (הסתיים)';
        else if (c.start_date && new Date(c.start_date) > now) scheduleNote = ' (עתידי)';

        html += `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:0.6rem;">
                <div style="font-weight:600;">${escapeHtml(c.title)}</div>
                <div style="font-size:0.78rem;color:var(--text-secondary);">${escapeHtml(c.popup_id)}${scheduleNote}</div>
            </td>
            <td style="padding:0.6rem;text-align:center;">
                <span style="background:${catColor}20;color:${catColor};padding:2px 8px;border-radius:6px;font-size:0.78rem;font-weight:600;">${catLabel}</span>
            </td>
            <td style="padding:0.6rem;text-align:center;font-weight:700;">${c.priority}</td>
            <td style="padding:0.6rem;text-align:center;font-size:0.82rem;">${audLabel}</td>
            <td style="padding:0.6rem;text-align:center;font-weight:600;color:var(--gold);">${shown}</td>
            <td style="padding:0.6rem;text-align:center;">
                <button onclick="togglePopupActive('${c.id}', ${!c.is_active})" style="background:${c.is_active ? '#2F8592' : '#666'};color:#fff;border:none;border-radius:6px;padding:3px 10px;font-size:0.75rem;font-weight:600;cursor:pointer;">
                    ${c.is_active ? 'פעיל' : 'כבוי'}
                </button>
            </td>
            <td style="padding:0.6rem;text-align:center;">
                <button onclick="openEditPopupModal('${c.id}')" style="background:none;border:none;cursor:pointer;color:var(--gold);font-size:1rem;" title="ערוך">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="deletePopupConfig('${c.id}', '${escapeHtml(c.title)}')" style="background:none;border:none;cursor:pointer;color:#FF6F61;font-size:1rem;margin-right:0.3rem;" title="מחק">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderPopupStatsTable(configs, stats) {
    const container = document.getElementById('popup-stats-table');
    if (!container) return;

    let html = `<table style="width:100%;border-collapse:collapse;">
        <thead>
            <tr style="border-bottom:2px solid var(--border);">
                <th style="text-align:right;padding:0.6rem;font-weight:600;color:var(--text-secondary);">פופאפ</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">חשיפות</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">לחיצות</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">סגירות</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">CTR</th>
                <th style="text-align:center;padding:0.6rem;font-weight:600;color:var(--text-secondary);">% סגירה</th>
            </tr>
        </thead>
        <tbody>`;

    configs.forEach(c => {
        const s = stats[c.popup_id] || { shown: 0, clicked: 0, dismissed: 0 };
        const ctr = s.shown > 0 ? Math.round((s.clicked / s.shown) * 100) + '%' : '-';
        const dismissRate = s.shown > 0 ? Math.round((s.dismissed / s.shown) * 100) + '%' : '-';

        html += `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:0.6rem;font-weight:600;">${escapeHtml(c.title)}</td>
            <td style="padding:0.6rem;text-align:center;">${s.shown}</td>
            <td style="padding:0.6rem;text-align:center;color:#2F8592;font-weight:600;">${s.clicked}</td>
            <td style="padding:0.6rem;text-align:center;color:#FF6F61;">${s.dismissed}</td>
            <td style="padding:0.6rem;text-align:center;font-weight:700;color:var(--gold);">${ctr}</td>
            <td style="padding:0.6rem;text-align:center;color:var(--text-secondary);">${dismissRate}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// Toggle active/inactive
async function togglePopupActive(configId, newState) {
    try {
        await db.from('popup_configs').update({ is_active: newState, updated_at: new Date().toISOString() }).eq('id', configId);
        popupCache = null;
        loadPopupConfigs();
        showToast(newState ? 'פופאפ הופעל' : 'פופאפ כובה', 'success');
    } catch (err) {
        showToast('שגיאה בעדכון', 'error');
    }
}

// Delete config
async function deletePopupConfig(configId, title) {
    if (!confirm('למחוק את הפופאפ "' + title + '"?')) return;
    try {
        await db.from('popup_configs').delete().eq('id', configId);
        popupCache = null;
        loadPopupConfigs();
        showToast('פופאפ נמחק', 'success');
    } catch (err) {
        showToast('שגיאה במחיקה', 'error');
    }
}

// Open edit modal
function openEditPopupModal(configId) {
    const config = popupCache?.configs?.find(c => c.id === configId);
    if (!config) return;
    renderPopupFormModal(config);
}

// Open create modal
function openCreatePopupModal() {
    renderPopupFormModal(null);
}

function renderPopupFormModal(config) {
    const isEdit = !!config;
    const title = isEdit ? 'עריכת פופאפ' : 'יצירת פופאפ חדש';

    // Remove existing modal if any
    document.getElementById('popup-form-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'popup-form-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.onclick = function (e) { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
        <div style="background:var(--card-bg,#fff);border-radius:16px;padding:2rem;width:90%;max-width:550px;max-height:85vh;overflow-y:auto;direction:rtl;" onclick="event.stopPropagation()">
            <h2 style="margin-bottom:1.2rem;display:flex;align-items:center;gap:0.5rem;">
                <i class="fa-solid fa-window-restore" style="color:#2F8592;"></i> ${title}
            </h2>
            <form onsubmit="savePopupConfig(event, ${isEdit ? "'" + config.id + "'" : 'null'})">
                <div style="display:grid;gap:0.8rem;">
                    ${!isEdit ? `<label style="font-weight:600;font-size:0.85rem;">מזהה (popup_id)
                        <input name="popup_id" required style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;direction:ltr;" placeholder="e.g. training_cta">
                    </label>` : ''}
                    <label style="font-weight:600;font-size:0.85rem;">כותרת
                        <input name="title" required value="${escapeHtml(config?.title || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                    </label>
                    <label style="font-weight:600;font-size:0.85rem;">הודעה
                        <textarea name="message" rows="3" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;resize:vertical;">${escapeHtml(config?.message || '')}</textarea>
                    </label>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                        <label style="font-weight:600;font-size:0.85rem;">טקסט כפתור (CTA)
                            <input name="cta_text" value="${escapeHtml(config?.cta_text || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                        </label>
                        <label style="font-weight:600;font-size:0.85rem;">קישור CTA
                            <input name="cta_link" value="${escapeHtml(config?.cta_link || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;direction:ltr;">
                        </label>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.8rem;">
                        <label style="font-weight:600;font-size:0.85rem;">קטגוריה
                            <select name="category" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                                <option value="engagement" ${config?.category === 'engagement' ? 'selected' : ''}>מעורבות</option>
                                <option value="info" ${config?.category === 'info' ? 'selected' : ''}>מידע</option>
                                <option value="critical" ${config?.category === 'critical' ? 'selected' : ''}>קריטי</option>
                            </select>
                        </label>
                        <label style="font-weight:600;font-size:0.85rem;">עדיפות (1-5)
                            <input name="priority" type="number" min="1" max="5" value="${config?.priority || 4}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                        </label>
                        <label style="font-weight:600;font-size:0.85rem;">מקסימום ליום
                            <input name="max_per_day" type="number" min="1" max="99" value="${config?.max_per_day || 1}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                        </label>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                        <label style="font-weight:600;font-size:0.85rem;">קהל יעד
                            <select name="target_audience" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                                <option value="all" ${config?.target_audience === 'all' ? 'selected' : ''}>כולם</option>
                                <option value="authenticated" ${config?.target_audience === 'authenticated' ? 'selected' : ''}>מחוברים</option>
                                <option value="unauthenticated" ${config?.target_audience === 'unauthenticated' ? 'selected' : ''}>אורחים</option>
                                <option value="paid_customer" ${config?.target_audience === 'paid_customer' ? 'selected' : ''}>לקוחות משלמים</option>
                            </select>
                        </label>
                        <label style="font-weight:600;font-size:0.85rem;">קולדאון (דקות)
                            <input name="cooldown_minutes" type="number" min="0" value="${config?.cooldown_minutes || 5}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                        </label>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                        <label style="font-weight:600;font-size:0.85rem;">תאריך התחלה (אופציונלי)
                            <input name="start_date" type="datetime-local" value="${config?.start_date ? config.start_date.slice(0, 16) : ''}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                        </label>
                        <label style="font-weight:600;font-size:0.85rem;">תאריך סיום (אופציונלי)
                            <input name="end_date" type="datetime-local" value="${config?.end_date ? config.end_date.slice(0, 16) : ''}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                        </label>
                    </div>
                </div>
                <div style="display:flex;gap:0.6rem;margin-top:1.5rem;justify-content:flex-end;">
                    <button type="button" onclick="this.closest('#popup-form-modal').remove()" style="padding:0.5rem 1.2rem;border:1px solid var(--border);border-radius:8px;background:none;cursor:pointer;font-weight:600;">ביטול</button>
                    <button type="submit" style="padding:0.5rem 1.5rem;background:var(--gold);color:var(--deep-petrol);border:none;border-radius:8px;font-weight:700;cursor:pointer;">${isEdit ? 'שמור' : 'צור'}</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
}

async function savePopupConfig(event, configId) {
    event.preventDefault();
    const form = event.target;
    const data = {
        title: form.title.value,
        message: form.message.value || null,
        cta_text: form.cta_text.value || null,
        cta_link: form.cta_link.value || null,
        category: form.category.value,
        priority: parseInt(form.priority.value),
        max_per_day: parseInt(form.max_per_day.value),
        cooldown_minutes: parseInt(form.cooldown_minutes.value),
        target_audience: form.target_audience.value,
        start_date: form.start_date.value ? new Date(form.start_date.value).toISOString() : null,
        end_date: form.end_date.value ? new Date(form.end_date.value).toISOString() : null,
        updated_at: new Date().toISOString()
    };

    try {
        if (configId) {
            // Update
            const { error } = await db.from('popup_configs').update(data).eq('id', configId);
            if (error) throw error;
            showToast('פופאפ עודכן', 'success');
        } else {
            // Create
            data.popup_id = form.popup_id.value;
            const { error } = await db.from('popup_configs').insert([data]);
            if (error) throw error;
            showToast('פופאפ נוצר', 'success');
        }
        document.getElementById('popup-form-modal')?.remove();
        popupCache = null;
        loadPopupConfigs();
    } catch (err) {
        showToast('שגיאה: ' + (err.message || 'לא ידוע'), 'error');
    }
}
