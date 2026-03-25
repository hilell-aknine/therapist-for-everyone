// admin-popups.js — Popup management panel (CRUD + stats)

let popupCache = null;
let popupCacheTime = 0;
const POPUP_CACHE_TTL = 5 * 60 * 1000;

const CATEGORY_LABELS = { 'critical': 'קריטי', 'engagement': 'מעורבות', 'info': 'מידע' };
const CATEGORY_COLORS = { 'critical': '#FF6F61', 'engagement': '#D4AF37', 'info': '#2F8592' };
const AUDIENCE_LABELS = {
    'all': 'כולם',
    'authenticated': 'כל מי שרשום',
    'unauthenticated': 'אורחים (לא רשומים)',
    'free_user': 'רשומים חינם (לא משלמים)',
    'paid_customer': 'לקוחות משלמים בלבד',
    'admin': 'מנהלים בלבד'
};
const TRIGGER_LABELS = {
    'manual': 'ידני (מופעל מהקוד)',
    'page_load': 'בטעינת עמוד',
    'lesson_complete': 'אחרי סיום שיעור',
    'login': 'אחרי התחברות',
    'signup': 'אחרי הרשמה חדשה'
};
const CATEGORY_HELP = {
    'critical': 'מוצג מיד, מתעלם מקולדאון ומגבלות — רק לדברים חיוניים',
    'engagement': 'מכבד קולדאון, מגבלה יומית, ולא מוצג אם נסגר ביום הזה',
    'info': 'קל משקל — טוסטים, התראות. לא חוסם פופאפים אחרים'
};

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
        const triggerLabel = TRIGGER_LABELS[c.trigger_event] || c.trigger_event || 'ידני';
        const shown = stats[c.popup_id]?.shown || 0;
        const descHe = c.description_he || '';
        const isScheduled = c.start_date || c.end_date;
        const now = new Date();
        let scheduleNote = '';
        if (c.end_date && new Date(c.end_date) < now) scheduleNote = ' (הסתיים)';
        else if (c.start_date && new Date(c.start_date) > now) scheduleNote = ' (עתידי)';

        html += `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:0.6rem;">
                <div style="font-weight:600;">${escapeHtml(c.title)}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary);">${descHe ? escapeHtml(descHe) : escapeHtml(c.popup_id)}${scheduleNote}</div>
                ${c.trigger_min_lessons > 0 ? `<div style="font-size:0.72rem;color:var(--gold);margin-top:2px;">מופעל אחרי ${c.trigger_min_lessons} שיעורים</div>` : ''}
            </td>
            <td style="padding:0.6rem;text-align:center;">
                <span style="background:${catColor}20;color:${catColor};padding:2px 8px;border-radius:6px;font-size:0.78rem;font-weight:600;" title="${CATEGORY_HELP[c.category] || ''}">${catLabel}</span>
            </td>
            <td style="padding:0.6rem;text-align:center;font-weight:700;">${c.priority}</td>
            <td style="padding:0.6rem;text-align:center;">
                <div style="font-size:0.82rem;">${audLabel}</div>
                <div style="font-size:0.72rem;color:var(--text-secondary);">${triggerLabel}</div>
            </td>
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
                    ${!isEdit ? `<label style="font-weight:600;font-size:0.85rem;">מזהה טכני
                        <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.2rem;">שם ייחודי באנגלית, למשל: training_cta</div>
                        <input name="popup_id" required style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;direction:ltr;" placeholder="e.g. training_cta">
                    </label>` : ''}
                    <label style="font-weight:600;font-size:0.85rem;">כותרת הפופאפ
                        <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.2rem;">מה המשתמש יראה כטקסט ראשי</div>
                        <input name="title" required value="${escapeHtml(config?.title || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;">
                    </label>
                    <label style="font-weight:600;font-size:0.85rem;">הסבר קצר (לאדמין בלבד)
                        <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.2rem;">תיאור פנימי — מוצג רק בדשבורד, לא למשתמש</div>
                        <input name="description_he" value="${escapeHtml(config?.description_he || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;" placeholder="לדוגמה: מעודד שיתוף אחרי שיעור שלישי">
                    </label>
                    <label style="font-weight:600;font-size:0.85rem;">תוכן ההודעה
                        <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.2rem;">הטקסט המלא שיופיע בפופאפ</div>
                        <textarea name="message" rows="3" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;resize:vertical;">${escapeHtml(config?.message || '')}</textarea>
                    </label>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                        <label style="font-weight:600;font-size:0.85rem;">טקסט כפתור
                            <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.2rem;">למשל: "למידע נוסף"</div>
                            <input name="cta_text" value="${escapeHtml(config?.cta_text || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;">
                        </label>
                        <label style="font-weight:600;font-size:0.85rem;">קישור הכפתור
                            <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.2rem;">לאן הכפתור מוביל</div>
                            <input name="cta_link" value="${escapeHtml(config?.cta_link || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;direction:ltr;">
                        </label>
                    </div>

                    <div style="background:rgba(47,133,146,0.06);border:1px solid rgba(47,133,146,0.15);border-radius:10px;padding:0.8rem;">
                        <div style="font-weight:700;font-size:0.88rem;margin-bottom:0.6rem;"><i class="fa-solid fa-users" style="color:#2F8592;margin-left:0.3rem;"></i> למי מוצג?</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                            <label style="font-weight:600;font-size:0.85rem;">קהל יעד
                                <select name="target_audience" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                                    <option value="all" ${config?.target_audience === 'all' ? 'selected' : ''}>כולם</option>
                                    <option value="authenticated" ${config?.target_audience === 'authenticated' ? 'selected' : ''}>כל מי שרשום (חינם + משלם)</option>
                                    <option value="unauthenticated" ${config?.target_audience === 'unauthenticated' ? 'selected' : ''}>אורחים בלבד (לא רשומים)</option>
                                    <option value="free_user" ${config?.target_audience === 'free_user' ? 'selected' : ''}>רשומים חינם בלבד (לא משלמים)</option>
                                    <option value="paid_customer" ${config?.target_audience === 'paid_customer' ? 'selected' : ''}>לקוחות משלמים בלבד</option>
                                    <option value="admin" ${config?.target_audience === 'admin' ? 'selected' : ''}>מנהלים בלבד</option>
                                </select>
                            </label>
                            <label style="font-weight:600;font-size:0.85rem;">מתי קופץ?
                                <select name="trigger_event" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                                    <option value="manual" ${config?.trigger_event === 'manual' ? 'selected' : ''}>ידני (מופעל מהקוד)</option>
                                    <option value="page_load" ${config?.trigger_event === 'page_load' ? 'selected' : ''}>בטעינת עמוד</option>
                                    <option value="lesson_complete" ${config?.trigger_event === 'lesson_complete' ? 'selected' : ''}>אחרי סיום שיעור</option>
                                    <option value="login" ${config?.trigger_event === 'login' ? 'selected' : ''}>אחרי התחברות</option>
                                    <option value="signup" ${config?.trigger_event === 'signup' ? 'selected' : ''}>אחרי הרשמה חדשה</option>
                                </select>
                            </label>
                        </div>
                        <label style="font-weight:600;font-size:0.85rem;margin-top:0.6rem;display:block;">אחרי כמה שיעורים?
                            <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.2rem;">רלוונטי רק אם "מתי קופץ" = אחרי סיום שיעור. 0 = מהשיעור הראשון</div>
                            <input name="trigger_min_lessons" type="number" min="0" max="100" value="${config?.trigger_min_lessons || 0}" style="width:120px;padding:0.5rem;border:1px solid var(--border);border-radius:8px;">
                        </label>
                    </div>

                    <div style="background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.15);border-radius:10px;padding:0.8rem;">
                        <div style="font-weight:700;font-size:0.88rem;margin-bottom:0.6rem;"><i class="fa-solid fa-sliders" style="color:var(--gold);margin-left:0.3rem;"></i> הגבלות</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.8rem;">
                            <label style="font-weight:600;font-size:0.85rem;">קטגוריה
                                <div style="font-size:0.72rem;color:var(--text-secondary);">קריטי=מיידי, מעורבות=מוגבל, מידע=קל</div>
                                <select name="category" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                                    <option value="engagement" ${config?.category === 'engagement' ? 'selected' : ''}>מעורבות</option>
                                    <option value="info" ${config?.category === 'info' ? 'selected' : ''}>מידע</option>
                                    <option value="critical" ${config?.category === 'critical' ? 'selected' : ''}>קריטי</option>
                                </select>
                            </label>
                            <label style="font-weight:600;font-size:0.85rem;">עדיפות
                                <div style="font-size:0.72rem;color:var(--text-secondary);">1=הכי גבוה, 5=הכי נמוך</div>
                                <input name="priority" type="number" min="1" max="5" value="${config?.priority || 4}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                            </label>
                            <label style="font-weight:600;font-size:0.85rem;">מקסימום ליום
                                <div style="font-size:0.72rem;color:var(--text-secondary);">כמה פעמים ביום מותר להציג</div>
                                <input name="max_per_day" type="number" min="1" max="99" value="${config?.max_per_day || 1}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;margin-top:0.3rem;">
                            </label>
                        </div>
                        <label style="font-weight:600;font-size:0.85rem;margin-top:0.6rem;display:block;">קולדאון (דקות)
                            <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.2rem;">כמה דקות לחכות אחרי פופאפ אחר לפני שמציגים את זה</div>
                            <input name="cooldown_minutes" type="number" min="0" value="${config?.cooldown_minutes || 5}" style="width:120px;padding:0.5rem;border:1px solid var(--border);border-radius:8px;">
                        </label>
                    </div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
                        <label style="font-weight:600;font-size:0.85rem;">תאריך התחלה
                            <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.2rem;">ריק = פעיל מיד</div>
                            <input name="start_date" type="datetime-local" value="${config?.start_date ? config.start_date.slice(0, 16) : ''}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;">
                        </label>
                        <label style="font-weight:600;font-size:0.85rem;">תאריך סיום
                            <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.2rem;">ריק = בלי תאריך סיום</div>
                            <input name="end_date" type="datetime-local" value="${config?.end_date ? config.end_date.slice(0, 16) : ''}" style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;">
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
        description_he: form.description_he.value || null,
        message: form.message.value || null,
        cta_text: form.cta_text.value || null,
        cta_link: form.cta_link.value || null,
        category: form.category.value,
        priority: parseInt(form.priority.value),
        max_per_day: parseInt(form.max_per_day.value),
        cooldown_minutes: parseInt(form.cooldown_minutes.value),
        target_audience: form.target_audience.value,
        trigger_event: form.trigger_event.value,
        trigger_min_lessons: parseInt(form.trigger_min_lessons.value) || 0,
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
