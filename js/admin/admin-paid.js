// admin-paid.js — Paid customers dashboard tab

let paidCache = null;
let paidCacheTime = 0;
const PAID_CACHE_TTL = 5 * 60 * 1000;

const PLAN_LABELS = {
    'master_course': 'קורס מאסטר NLP',
    'practitioner_course': 'קורס פרקטישנר NLP',
    'bundle': 'חבילה מלאה'
};

const STATUS_LABELS_PAID = {
    'active': { text: 'פעיל', color: '#22c55e' },
    'expired': { text: 'פקע', color: '#f85149' },
    'cancelled': { text: 'בוטל', color: '#6b7280' },
    'suspended': { text: 'מושהה', color: '#f59e0b' }
};

function daysRemaining(endDate) {
    return Math.max(0, Math.ceil((new Date(endDate) - new Date()) / (24 * 60 * 60 * 1000)));
}

async function loadPaidCustomers() {
    if (paidCache && (Date.now() - paidCacheTime) < PAID_CACHE_TTL) {
        renderPaidCustomers(paidCache);
        return;
    }

    try {
        const { data, error } = await db.from('subscriptions')
            .select('*, profiles:user_id(id, full_name, email, phone)')
            .order('created_at', { ascending: false });

        if (error) throw error;

        paidCache = data || [];
        paidCacheTime = Date.now();
        renderPaidCustomers(paidCache);
    } catch (err) {
        console.error('[Paid] Load error:', err);
        document.getElementById('paid-customers-table').innerHTML =
            `<tr><td colspan="10" style="text-align:center;color:var(--danger);padding:2rem;"><i class="fa-solid fa-circle-exclamation"></i> ${err.message}</td></tr>`;
    }
}

function renderPaidCustomers(subs) {
    const active = subs.filter(s => s.status === 'active');
    const d30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const expiringSoon = active.filter(s => new Date(s.end_date) <= d30);
    const totalRevenue = active.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);

    setText('paid-active-count', active.length);
    setText('paid-total-revenue', totalRevenue.toLocaleString() + ' ₪');
    setText('paid-expiring-count', expiringSoon.length);
    setText('paid-total-count', subs.length);

    const badge = document.getElementById('paid-count-badge');
    if (badge) {
        badge.textContent = active.length;
        badge.style.display = active.length > 0 ? '' : 'none';
    }

    const tbody = document.getElementById('paid-customers-table');
    if (!subs.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">אין לקוחות משלמים עדיין</td></tr>';
        return;
    }

    tbody.innerHTML = subs.map(s => {
        const profile = s.profiles || {};
        const days = daysRemaining(s.end_date);
        const status = STATUS_LABELS_PAID[s.status] || { text: s.status, color: '#6b7280' };
        const plan = PLAN_LABELS[s.plan] || s.plan;
        const start = s.start_date ? new Date(s.start_date).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—';
        const end = s.end_date ? new Date(s.end_date).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—';
        const daysColor = s.status === 'active' ? (days <= 30 ? '#f85149' : days <= 90 ? '#f59e0b' : '#22c55e') : '#6b7280';

        return `<tr>
            <td><strong>${profile.full_name || 'ללא שם'}</strong></td>
            <td style="direction:ltr;text-align:right;">${profile.phone || '—'}</td>
            <td><span style="font-size:0.75rem;background:var(--bg);padding:2px 8px;border-radius:10px;">${plan}</span></td>
            <td><strong>${parseFloat(s.price).toLocaleString()} ₪</strong></td>
            <td style="font-size:0.85rem;">${start}</td>
            <td style="font-size:0.85rem;">${end}</td>
            <td><span style="color:${daysColor};font-weight:600;">${s.status === 'active' ? days : '—'}</span></td>
            <td><span style="font-size:0.75rem;background:${status.color}22;color:${status.color};padding:2px 8px;border-radius:10px;">${status.text}</span></td>
            <td>${s.contract_url ? `<a href="${s.contract_url}" target="_blank" style="color:var(--gold);"><i class="fa-solid fa-file-contract"></i></a>` : `<button onclick="uploadContract('${s.id}')" class="btn-sm" style="font-size:0.7rem;padding:2px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text-secondary);" title="העלאת חוזה"><i class="fa-solid fa-upload"></i></button>`}</td>
            <td>
                <div style="display:flex;gap:4px;">
                    <button onclick="editSub('${s.id}')" style="font-size:0.65rem;padding:2px 6px;background:rgba(59,130,246,0.1);border:1px solid #3b82f6;border-radius:4px;cursor:pointer;color:#3b82f6;" title="עריכה">✏️</button>
                    <button onclick="deleteSub('${s.id}','${(profile.full_name||'').replace(/'/g,'')}')" style="font-size:0.65rem;padding:2px 6px;background:rgba(248,81,73,0.1);border:1px solid #f85149;border-radius:4px;cursor:pointer;color:#f85149;" title="מחיקה">🗑️</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// === Activate new paid customer (modal) ===
function showActivateModal() {
    const modal = document.getElementById('paid-activate-modal');
    modal.classList.add('active');
    document.getElementById('activate-phone').value = '';
    document.getElementById('activate-months').value = '12';
    document.getElementById('activate-price').value = '8880';
    document.getElementById('activate-notes').value = '';
    document.getElementById('activate-result').textContent = '';
}

function closeActivateModal() {
    document.getElementById('paid-activate-modal').classList.remove('active');
}

async function activateNewCustomer() {
    const phone = document.getElementById('activate-phone').value.trim();
    const months = parseInt(document.getElementById('activate-months').value) || 12;
    const price = parseFloat(document.getElementById('activate-price').value) || 8880;
    const notes = document.getElementById('activate-notes').value.trim();
    const resultEl = document.getElementById('activate-result');

    if (!phone) { resultEl.textContent = 'יש להזין טלפון'; resultEl.style.color = '#f85149'; return; }

    resultEl.textContent = 'מחפש משתמש...';
    resultEl.style.color = 'var(--text-secondary)';

    try {
        // Find user by phone
        const cleaned = phone.replace(/[-\s]/g, '');
        const { data: profiles, error: pErr } = await db.from('profiles')
            .select('id, full_name, phone, role')
            .ilike('phone', `%${cleaned}%`)
            .limit(1);

        if (pErr) throw pErr;
        if (!profiles || !profiles.length) {
            resultEl.textContent = 'משתמש לא נמצא — צריך להירשם לאתר קודם';
            resultEl.style.color = '#f85149';
            return;
        }

        const user = profiles[0];
        if (user.role === 'paid_customer') {
            resultEl.textContent = `${user.full_name} כבר לקוח משלם פעיל`;
            resultEl.style.color = '#f59e0b';
            return;
        }

        resultEl.textContent = `מפעיל גישה ל-${user.full_name}...`;

        // Create subscription
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + months);

        const { data: sub, error: sErr } = await db.from('subscriptions').insert({
            user_id: user.id,
            plan: 'master_course',
            price,
            start_date: new Date().toISOString(),
            end_date: endDate.toISOString(),
            activated_by: 'admin_dashboard',
            notes: notes || null,
            status: 'active'
        }).select().single();

        if (sErr) throw sErr;

        // Update role
        await db.from('profiles').update({ role: 'paid_customer' }).eq('id', user.id);

        resultEl.innerHTML = `<span style="color:#22c55e;">✅ ${user.full_name} — גישה הופעלה ל-${months} חודשים!</span>`;

        // Refresh table
        paidCache = null;
        paidCacheTime = 0;
        loadPaidCustomers();

        // Close modal after 2s
        setTimeout(closeActivateModal, 2000);
    } catch (err) {
        resultEl.textContent = 'שגיאה: ' + err.message;
        resultEl.style.color = '#f85149';
    }
}

// === Upload contract ===
async function uploadContract(subscriptionId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;

        const fileName = `contract_${subscriptionId}_${Date.now()}.pdf`;

        try {
            const { error: upErr } = await db.storage.from('contracts').upload(fileName, file, {
                contentType: 'application/pdf',
                upsert: true
            });
            if (upErr) throw upErr;

            const { data: urlData } = db.storage.from('contracts').getPublicUrl(fileName);
            const contractUrl = urlData?.publicUrl || fileName;

            await db.from('subscriptions').update({ contract_url: contractUrl }).eq('id', subscriptionId);

            paidCache = null;
            paidCacheTime = 0;
            loadPaidCustomers();
            alert('חוזה הועלה בהצלחה!');
        } catch (err) {
            alert('שגיאה בהעלאה: ' + err.message);
        }
    };
    input.click();
}

// === Deactivate subscription ===
async function deactivateSub(id) {
    if (!confirm('בטוח שרוצה לבטל את הגישה?')) return;
    try {
        const sub = paidCache?.find(s => s.id === id);
        await db.from('subscriptions').update({ status: 'cancelled' }).eq('id', id);

        if (sub) {
            const { data: otherActive } = await db.from('subscriptions')
                .select('id').eq('user_id', sub.user_id).eq('status', 'active').neq('id', id);
            if (!otherActive || !otherActive.length) {
                await db.from('profiles').update({ role: 'student_lead' }).eq('id', sub.user_id);
            }
        }

        paidCache = null;
        paidCacheTime = 0;
        loadPaidCustomers();
    } catch (err) {
        alert('שגיאה: ' + err.message);
    }
}

// === Edit subscription — full modal ===
function editSub(id) {
    const s = paidCache?.find(x => x.id === id);
    if (!s) return;
    const p = s.profiles || {};
    const fmtDate = d => d ? new Date(d).toISOString().split('T')[0] : '';

    const html = `
        <div class="modal-box" style="max-width:500px;background:var(--bg-card,#fff);border-radius:12px;padding:2rem;position:relative;">
            <button onclick="closeEditSubModal()" style="position:absolute;top:12px;left:12px;background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-secondary);">&times;</button>
            <h3 style="margin-bottom:1rem;color:var(--gold);"><i class="fa-solid fa-pen"></i> עריכת לקוח משלם</h3>
            <div style="display:flex;flex-direction:column;gap:0.7rem;">
                <label style="font-size:0.85rem;font-weight:600;">שם מלא
                    <input type="text" id="edit-sub-name" value="${p.full_name || ''}" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:0.95rem;margin-top:4px;">
                </label>
                <label style="font-size:0.85rem;font-weight:600;">טלפון
                    <input type="text" id="edit-sub-phone" value="${p.phone || ''}" dir="ltr" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:0.95rem;margin-top:4px;">
                </label>
                <label style="font-size:0.85rem;font-weight:600;">אימייל
                    <input type="email" id="edit-sub-email" value="${p.email || ''}" dir="ltr" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:0.95rem;margin-top:4px;">
                </label>
                <div style="display:flex;gap:0.7rem;">
                    <label style="font-size:0.85rem;font-weight:600;flex:1;">תוכנית
                        <select id="edit-sub-plan" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:0.95rem;margin-top:4px;">
                            <option value="master_course" ${s.plan==='master_course'?'selected':''}>קורס מאסטר NLP</option>
                            <option value="practitioner_course" ${s.plan==='practitioner_course'?'selected':''}>קורס פרקטישנר NLP</option>
                            <option value="bundle" ${s.plan==='bundle'?'selected':''}>חבילה מלאה</option>
                        </select>
                    </label>
                    <label style="font-size:0.85rem;font-weight:600;flex:1;">מחיר (₪)
                        <input type="number" id="edit-sub-price" value="${s.price||8880}" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:0.95rem;margin-top:4px;">
                    </label>
                </div>
                <div style="display:flex;gap:0.7rem;">
                    <label style="font-size:0.85rem;font-weight:600;flex:1;">תאריך התחלה
                        <input type="date" id="edit-sub-start" value="${fmtDate(s.start_date)}" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:0.95rem;margin-top:4px;">
                    </label>
                    <label style="font-size:0.85rem;font-weight:600;flex:1;">תאריך סיום
                        <input type="date" id="edit-sub-end" value="${fmtDate(s.end_date)}" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:0.95rem;margin-top:4px;">
                    </label>
                </div>
                <label style="font-size:0.85rem;font-weight:600;">סטטוס
                    <select id="edit-sub-status" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:0.95rem;margin-top:4px;">
                        <option value="active" ${s.status==='active'?'selected':''}>פעיל</option>
                        <option value="suspended" ${s.status==='suspended'?'selected':''}>מושהה</option>
                        <option value="cancelled" ${s.status==='cancelled'?'selected':''}>בוטל</option>
                        <option value="expired" ${s.status==='expired'?'selected':''}>פקע</option>
                    </select>
                </label>
                <label style="font-size:0.85rem;font-weight:600;">הערות
                    <textarea id="edit-sub-notes" rows="3" style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:6px;font-size:0.95rem;margin-top:4px;resize:vertical;">${s.notes||''}</textarea>
                </label>
                <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                    <button onclick="saveEditSub('${s.id}','${s.user_id}')" style="flex:1;padding:10px;background:var(--gold);color:#003B46;border:none;border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;font-family:inherit;">
                        <i class="fa-solid fa-check"></i> שמור
                    </button>
                    <button onclick="deleteSub('${s.id}','${(p.full_name||'').replace(/'/g,'')}')" style="padding:10px 16px;background:#f85149;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:0.9rem;cursor:pointer;font-family:inherit;">
                        <i class="fa-solid fa-trash"></i> מחק
                    </button>
                </div>
                <div id="edit-sub-result" style="font-size:0.85rem;text-align:center;min-height:1.2rem;"></div>
            </div>
        </div>`;

    let modal = document.getElementById('edit-sub-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'edit-sub-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
        modal.onclick = e => { if (e.target === modal) closeEditSubModal(); };
        document.body.appendChild(modal);
    }
    modal.innerHTML = html;
    modal.style.display = 'flex';
}

function closeEditSubModal() {
    const m = document.getElementById('edit-sub-modal');
    if (m) m.style.display = 'none';
}

async function saveEditSub(subId, userId) {
    const res = document.getElementById('edit-sub-result');
    res.textContent = 'שומר...'; res.style.color = 'var(--text-secondary)';

    try {
        await db.from('profiles').update({
            full_name: document.getElementById('edit-sub-name').value.trim(),
            phone: document.getElementById('edit-sub-phone').value.trim(),
            email: document.getElementById('edit-sub-email').value.trim(),
        }).eq('id', userId);

        const newStatus = document.getElementById('edit-sub-status').value;
        await db.from('subscriptions').update({
            plan: document.getElementById('edit-sub-plan').value,
            price: parseFloat(document.getElementById('edit-sub-price').value) || 8880,
            start_date: new Date(document.getElementById('edit-sub-start').value).toISOString(),
            end_date: new Date(document.getElementById('edit-sub-end').value).toISOString(),
            status: newStatus,
            notes: document.getElementById('edit-sub-notes').value.trim() || null,
        }).eq('id', subId);

        if (newStatus === 'active') {
            await db.from('profiles').update({ role: 'paid_customer' }).eq('id', userId);
        } else {
            const { data: oa } = await db.from('subscriptions').select('id').eq('user_id', userId).eq('status', 'active').neq('id', subId);
            if (!oa || !oa.length) await db.from('profiles').update({ role: 'student_lead' }).eq('id', userId);
        }

        res.innerHTML = '<span style="color:#22c55e;">✅ נשמר!</span>';
        paidCache = null; paidCacheTime = 0; loadPaidCustomers();
        setTimeout(closeEditSubModal, 1000);
    } catch (err) {
        res.textContent = 'שגיאה: ' + err.message; res.style.color = '#f85149';
    }
}

async function deleteSub(id, name) {
    if (!confirm(`למחוק לצמיתות את המנוי של ${name || 'לקוח זה'}?\n\nפעולה זו בלתי הפיכה.`)) return;
    try {
        const sub = paidCache?.find(s => s.id === id);
        await db.from('subscriptions').delete().eq('id', id);
        if (sub) {
            const { data: oa } = await db.from('subscriptions').select('id').eq('user_id', sub.user_id).eq('status', 'active');
            if (!oa || !oa.length) await db.from('profiles').update({ role: 'student_lead' }).eq('id', sub.user_id);
        }
        closeEditSubModal();
        paidCache = null; paidCacheTime = 0; loadPaidCustomers();
    } catch (err) { alert('שגיאה: ' + err.message); }
}

// === Extend subscription ===
async function extendSub(id) {
    const months = prompt('כמה חודשים להאריך?', '12');
    if (!months) return;
    const m = parseInt(months);
    if (!m || m < 1) return;

    try {
        const sub = paidCache?.find(s => s.id === id);
        if (!sub) return;

        const newEnd = new Date(sub.end_date);
        newEnd.setMonth(newEnd.getMonth() + m);

        await db.from('subscriptions').update({ end_date: newEnd.toISOString(), status: 'active' }).eq('id', id);
        await db.from('profiles').update({ role: 'paid_customer' }).eq('id', sub.user_id);

        paidCache = null;
        paidCacheTime = 0;
        loadPaidCustomers();
    } catch (err) {
        alert('שגיאה: ' + err.message);
    }
}
