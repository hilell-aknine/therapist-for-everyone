// admin-bot.js — Bot CRM: status, phones, activity log, notes, broadcast

async function getBotHeaders(json) {
    const { data: { session } } = await db.auth.getSession();
    if (!session?.access_token) throw new Error('לא מחובר — נא להתחבר מחדש');
    const headers = { 'Authorization': 'Bearer ' + session.access_token };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
}

const ACTION_LABELS = {
    'lead_created': { text: 'ליד חדש', cls: 'create' },
    'patient_created': { text: 'מטופל חדש', cls: 'create' },
    'therapist_approved': { text: 'אישור מטפל', cls: 'update' },
    'match_created': { text: 'שיבוץ', cls: 'create' },
    'note_added': { text: 'הערה', cls: 'create' },
    'payment_recorded': { text: 'תשלום', cls: 'create' },
    'status_updated': { text: 'עדכון סטטוס', cls: 'update' },
    'broadcast_sent': { text: 'ברודקאסט', cls: 'broadcast' },
    'appointment_created': { text: 'פגישה חדשה', cls: 'create' },
    'appointment_cancelled': { text: 'ביטול פגישה', cls: 'delete' },
    'lead_converted': { text: 'המרת ליד', cls: 'update' },
    'entity_deleted': { text: 'מחיקה', cls: 'delete' },
};

const ENTITY_LABELS = {
    'patient': 'מטופל', 'therapist': 'מטפל', 'lead': 'ליד',
    'appointment': 'פגישה', 'payment': 'תשלום', 'broadcast': 'ברודקאסט',
    'contact_request': 'פנייה', 'general': 'כללי',
};

function loadBotView() {
    loadBotAccess();
    loadBotStatus();
    loadActivityLog();
    loadCrmNotes();
    loadBotPhones();
}

async function loadBotStatus() {
    const el = document.getElementById('bot-status-content');
    el.innerHTML = '<div class="bot-status-loading"><i class="fa-solid fa-spinner fa-spin"></i> בודק חיבור...</div>';
    try {
        const res = await fetch(BOT_URL + '/', { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        const isOnline = data.whatsapp === 'authorized' || data.whatsapp === 'connected';
        el.innerHTML = `
            <div class="bot-status-grid">
                <div class="bot-status-item">
                    <span class="label">מצב</span>
                    <span class="value">
                        <span class="bot-status-dot ${isOnline ? 'online' : 'offline'}"></span>
                        ${isOnline ? 'מחובר' : data.whatsapp || 'לא מחובר'}
                    </span>
                </div>
                <div class="bot-status-item">
                    <span class="label">גרסה</span>
                    <span class="value">${data.version || '?'}</span>
                </div>
                <div class="bot-status-item">
                    <span class="label">שלב</span>
                    <span class="value">${data.phase || '?'}</span>
                </div>
            </div>`;
    } catch (err) {
        el.innerHTML = `
            <div style="text-align:center;padding:1.5rem;">
                <span class="bot-status-dot offline"></span>
                <span style="color:var(--danger);font-weight:600;">הבוט לא מגיב</span>
                <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.5rem;">${err.message}</div>
            </div>`;
    }
}

async function loadActivityLog() {
    const tbody = document.getElementById('activity-log-table');
    // Reset filter chips
    document.querySelectorAll('#activity-filter-chips .filter-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('#activity-filter-chips .filter-chip[data-filter="all"]').classList.add('active');
    try {
        const { data, error } = await db
            .from('crm_activity_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);
        if (error) throw error;
        _activityData = data || [];
        renderActivityRows(tbody, _activityData);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--danger);">שגיאה: ${err.message}</td></tr>`;
    }
}

async function loadCrmNotes() {
    const tbody = document.getElementById('crm-notes-table');
    try {
        const { data, error } = await db
            .from('crm_notes')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-secondary);">אין הערות עדיין</td></tr>';
            return;
        }
        const groups = groupByDate(data);
        let html = '';
        for (const [group, items] of Object.entries(groups)) {
            if (items.length === 0) continue;
            html += `<tr class="date-group-row"><td colspan="4"><i class="fa-solid ${dateGroupIcons[group]}"></i> ${group} (${items.length})</td></tr>`;
            html += items.map(note => {
                const date = new Date(note.created_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                const entity = ENTITY_LABELS[note.entity_type] || note.entity_type || '-';
                return `<tr>
                    <td>${date}</td>
                    <td>${note.author_name || note.author_phone || '-'}</td>
                    <td>${entity}</td>
                    <td>${note.content || '-'}</td>
                </tr>`;
            }).join('');
        }
        tbody.innerHTML = html;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--danger);">שגיאה: ${err.message}</td></tr>`;
    }
}

async function triggerBotAction(endpoint, successMsg) {
    const btn = event.currentTarget;
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>מבצע...</span>';
    try {
        const res = await fetch(BOT_URL + endpoint, {
            headers: await getBotHeaders(),
            signal: AbortSignal.timeout(30000)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        showToast(successMsg, 'success');
    } catch (err) {
        showToast('שגיאה: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
    }
}

function toggleNoteForm() {
    const form = document.getElementById('note-form');
    form.classList.toggle('hidden');
}

async function addCrmNote() {
    const entityType = document.getElementById('note-entity-type').value;
    const entityId = document.getElementById('note-entity-id').value.trim() || null;
    const content = document.getElementById('note-content').value.trim();
    if (!content) { showToast('נא למלא תוכן', 'error'); return; }

    const { data: { session } } = await db.auth.getSession();
    const authorName = session?.user?.email || 'Admin Dashboard';

    const { error } = await db.from('crm_notes').insert({
        entity_type: entityType,
        entity_id: entityId,
        content: content,
        author_phone: 'dashboard',
        author_name: authorName
    });
    if (error) { showToast('שגיאה: ' + error.message, 'error'); return; }
    showToast('הערה נוספה', 'success');
    document.getElementById('note-content').value = '';
    document.getElementById('note-entity-id').value = '';
    toggleNoteForm();
    loadCrmNotes();
}

// === Bot Access Role ===
let _botRole = 'admin'; // default until loaded

async function loadBotAccess() {
    try {
        const res = await fetch(BOT_URL + '/api/my-access', {
            headers: await getBotHeaders(),
            signal: AbortSignal.timeout(8000)
        });
        if (res.ok) {
            const data = await res.json();
            _botRole = data.role || 'admin';
        }
    } catch (e) {
        _botRole = 'admin'; // fallback
    }
    applyBotRoleVisibility();
}

function applyBotRoleVisibility() {
    document.querySelectorAll('[data-bot-role]').forEach(el => {
        const allowed = el.getAttribute('data-bot-role').split(',');
        el.style.display = allowed.includes(_botRole) ? '' : 'none';
    });
}


async function loadBotPhones() {
    const list = document.getElementById('phone-list');
    list.innerHTML = '<li style="text-align:center;padding:1rem;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> טוען...</li>';
    try {
        const res = await fetch(BOT_URL + '/api/phones', {
            headers: await getBotHeaders(),
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const phones = await res.json();
        if (!phones.length) {
            list.innerHTML = '<li style="text-align:center;padding:1rem;color:var(--text-secondary);">אין טלפונים מורשים</li>';
            return;
        }
        list.innerHTML = phones.map(p => `
            <li class="phone-item">
                <div class="phone-info">
                    <span class="phone-number">${p.phone}</span>
                    ${p.label ? `<span class="phone-label">(${p.label})</span>` : ''}
                </div>
                <button class="btn-remove-phone" onclick="removeBotPhone('${p.phone}')" title="הסר">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </li>
        `).join('');
    } catch (err) {
        list.innerHTML = `<li style="text-align:center;padding:1rem;color:var(--danger);">שגיאה: ${err.message}</li>`;
    }
}

async function addBotPhone() {
    const raw = document.getElementById('new-phone-number').value.trim();
    const phone = raw.replace(/[^0-9]/g, ''); // strip +, -, spaces
    const label = document.getElementById('new-phone-label').value.trim();
    if (!phone || phone.length < 10 || phone.length > 15) {
        showToast('מספר טלפון לא תקין (10-15 ספרות)', 'error');
        return;
    }
    try {
        const res = await fetch(BOT_URL + '/api/phones', {
            method: 'POST',
            headers: await getBotHeaders(true),
            body: JSON.stringify({ phone, label })
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        showToast(`${phone} נוסף בהצלחה`, 'success');
        document.getElementById('new-phone-number').value = '';
        document.getElementById('new-phone-label').value = '';
        loadBotPhones();
    } catch (err) {
        showToast('שגיאה: ' + err.message, 'error');
    }
}

async function removeBotPhone(phone) {
    if (!confirm(`להסיר את ${phone} מהרשימה?`)) return;
    try {
        const res = await fetch(BOT_URL + '/api/phones/' + phone, {
            method: 'DELETE',
            headers: await getBotHeaders()
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        showToast(`${phone} הוסר`, 'success');
        loadBotPhones();
    } catch (err) {
        showToast('שגיאה: ' + err.message, 'error');
    }
}

// === Activity Log Filters ===
let _activityData = []; // cached rows for client-side filtering

function filterActivityLog(filter, chipEl) {
    // Update active chip
    document.querySelectorAll('#activity-filter-chips .filter-chip').forEach(c => c.classList.remove('active'));
    chipEl.classList.add('active');

    const tbody = document.getElementById('activity-log-table');
    let filtered = _activityData;

    if (filter !== 'all') {
        const FILTER_MAP = {
            'create': ['lead_created', 'patient_created', 'match_created', 'note_added', 'payment_recorded', 'appointment_created'],
            'update': ['therapist_approved', 'status_updated', 'lead_converted'],
            'delete': ['entity_deleted', 'appointment_cancelled'],
            'broadcast': ['broadcast_sent']
        };
        const actions = FILTER_MAP[filter] || [];
        filtered = _activityData.filter(r => actions.includes(r.action));
    }

    renderActivityRows(tbody, filtered);
}

function renderActivityRows(tbody, data) {
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-secondary);">אין תוצאות</td></tr>';
        return;
    }
    const groups = groupByDate(data);
    let html = '';
    for (const [group, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        html += `<tr class="date-group-row"><td colspan="5"><i class="fa-solid ${dateGroupIcons[group]}"></i> ${group} (${items.length})</td></tr>`;
        html += items.map(row => {
            const time = new Date(row.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
            const actionInfo = ACTION_LABELS[row.action] || { text: row.action, cls: 'other' };
            const entity = ENTITY_LABELS[row.entity_type] || row.entity_type || '-';
            const details = row.details ? (typeof row.details === 'string' ? row.details : JSON.stringify(row.details)).substring(0, 80) : '-';
            return `<tr>
                <td>${time}</td>
                <td>${row.actor_name || row.actor_phone || '-'}</td>
                <td><span class="action-label ${actionInfo.cls}">${actionInfo.text}</span></td>
                <td>${entity}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${details}">${details}</td>
            </tr>`;
        }).join('');
    }
    tbody.innerHTML = html;
}

// === Broadcast Count ===
let _broadcastCountTimer = null;

function updateBroadcastCount() {
    clearTimeout(_broadcastCountTimer);
    _broadcastCountTimer = setTimeout(async () => {
        const badge = document.getElementById('broadcast-count-badge');
        const numEl = document.getElementById('broadcast-count-num');
        const filter = document.getElementById('broadcast-filter').value;
        try {
            const res = await fetch(BOT_URL + '/api/broadcast/count?filter=' + filter, {
                headers: await getBotHeaders(),
                signal: AbortSignal.timeout(8000)
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            numEl.textContent = data.count;
            badge.style.display = 'inline-flex';
        } catch (e) {
            badge.style.display = 'none';
        }
    }, 600);
}

function openBroadcastModal() {
    document.getElementById('broadcast-filter').value = 'all';
    document.getElementById('broadcast-message').value = '';
    document.getElementById('broadcast-count-badge').style.display = 'none';
    openModal('broadcast-modal');
    updateBroadcastCount();
}

async function sendBroadcast() {
    const filter = document.getElementById('broadcast-filter').value;
    const message = document.getElementById('broadcast-message').value.trim();
    if (!message) { showToast('נא לכתוב הודעה', 'error'); return; }

    const btn = document.getElementById('btn-send-broadcast');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> שולח...';

    try {
        const res = await fetch(BOT_URL + '/api/broadcast', {
            method: 'POST',
            headers: await getBotHeaders(true),
            body: JSON.stringify({ filter, message }),
            signal: AbortSignal.timeout(120000)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        showToast(`ברודקאסט נשלח: ${result.sent}/${result.total} הצליחו`, 'success');
        closeModal('broadcast-modal');
        loadActivityLog();
    } catch (err) {
        showToast('שגיאת ברודקאסט: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> שלח';
    }
}

// ================================================================
// GA4 ANALYTICS — Dashboard Integration
// ================================================================

let ga4Cache = null;
let ga4CacheTime = 0;
// GA4_CACHE_TTL declared at bottom (mutable via settings)
