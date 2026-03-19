// admin-paid.js — Paid customers dashboard tab

let paidCache = null;
let paidCacheTime = 0;
const PAID_CACHE_TTL = 5 * 60 * 1000;

const PLAN_LABELS = {
    'master_course': 'קורס מאסטר NLP',
    'practitioner_course': 'קורס פרקטישנר NLP',
    'bundle': 'חבילה מלאה'
};

const STATUS_LABELS = {
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
            `<tr><td colspan="9" style="text-align:center;color:var(--danger);padding:2rem;"><i class="fa-solid fa-circle-exclamation"></i> ${err.message}</td></tr>`;
    }
}

function renderPaidCustomers(subs) {
    const active = subs.filter(s => s.status === 'active');
    const d30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const expiringSoon = active.filter(s => new Date(s.end_date) <= d30);
    const totalRevenue = active.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);

    // Stats
    setText('paid-active-count', active.length);
    setText('paid-total-revenue', totalRevenue.toLocaleString() + ' ₪');
    setText('paid-expiring-count', expiringSoon.length);
    setText('paid-total-count', subs.length);

    // Badge
    const badge = document.getElementById('paid-count-badge');
    if (badge) {
        badge.textContent = active.length;
        badge.style.display = active.length > 0 ? '' : 'none';
    }

    // Table
    const tbody = document.getElementById('paid-customers-table');
    if (!subs.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">אין לקוחות משלמים עדיין</td></tr>';
        return;
    }

    tbody.innerHTML = subs.map(s => {
        const profile = s.profiles || {};
        const days = daysRemaining(s.end_date);
        const status = STATUS_LABELS[s.status] || { text: s.status, color: '#6b7280' };
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
            <td>${s.contract_url ? `<a href="${s.contract_url}" target="_blank" style="color:var(--gold);"><i class="fa-solid fa-file-contract"></i></a>` : '—'}</td>
        </tr>`;
    }).join('');
}
