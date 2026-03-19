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
                    ${s.status === 'active' ? `<button onclick="deactivateSub('${s.id}')" class="btn-sm" style="font-size:0.65rem;padding:2px 6px;background:rgba(248,81,73,0.1);border:1px solid #f85149;border-radius:4px;cursor:pointer;color:#f85149;" title="ביטול">ביטול</button>` : ''}
                    ${s.status === 'active' ? `<button onclick="extendSub('${s.id}')" class="btn-sm" style="font-size:0.65rem;padding:2px 6px;background:rgba(212,175,55,0.1);border:1px solid var(--gold);border-radius:4px;cursor:pointer;color:var(--gold);" title="הארכה">+</button>` : ''}
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
