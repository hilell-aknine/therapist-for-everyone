/**
 * Admin Email Module
 * Shared "שלח מייל" compose modal for the admin dashboard.
 * Sends through the send-email Edge Function (admin-JWT gated, branded
 * template applied server-side, Gmail Apps Script delivery, audited in
 * crm_activity_log). The Gmail token never reaches the browser.
 *
 * Usage from any admin module:
 *   openEmailCompose({ to: 'user@example.com', name: 'שם הנמען' })
 */

const EMAIL_MAX_MESSAGE = 2000;

function _ensureEmailModal() {
    if (document.getElementById('admin-email-modal')) return;

    const wrap = document.createElement('div');
    wrap.id = 'admin-email-modal';
    wrap.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000;align-items:center;justify-content:center;padding:16px;';
    wrap.innerHTML = `
        <div style="background:var(--card-bg,#fff);color:var(--text,#1f2d30);width:100%;max-width:520px;border-radius:14px;padding:22px;position:relative;box-shadow:0 18px 50px rgba(0,0,0,0.35);">
            <button onclick="closeEmailCompose()" style="position:absolute;top:12px;left:12px;background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-secondary,#5b7177);">&times;</button>
            <h3 style="margin:0 0 4px;font-size:1.15rem;"><i class="fa-solid fa-envelope" style="color:var(--gold,#D4AF37);margin-left:6px;"></i> שליחת מייל</h3>
            <p id="email-compose-recipient-name" style="margin:0 0 14px;font-size:0.85rem;color:var(--text-secondary,#5b7177);"></p>

            <label style="display:block;font-size:0.8rem;font-weight:600;margin-bottom:4px;">אל</label>
            <input type="email" id="email-compose-to" dir="ltr" style="width:100%;padding:9px;border:1px solid var(--border,#ddd);border-radius:8px;font-size:0.95rem;font-family:inherit;background:var(--bg,#fff);color:inherit;">

            <label style="display:block;font-size:0.8rem;font-weight:600;margin:12px 0 4px;">נושא</label>
            <input type="text" id="email-compose-subject" maxlength="200" style="width:100%;padding:9px;border:1px solid var(--border,#ddd);border-radius:8px;font-size:0.95rem;font-family:inherit;background:var(--bg,#fff);color:inherit;">

            <label style="display:block;font-size:0.8rem;font-weight:600;margin:12px 0 4px;">תוכן ההודעה</label>
            <textarea id="email-compose-message" rows="7" maxlength="${EMAIL_MAX_MESSAGE}" style="width:100%;padding:9px;border:1px solid var(--border,#ddd);border-radius:8px;font-size:0.95rem;font-family:inherit;background:var(--bg,#fff);color:inherit;resize:vertical;line-height:1.6;"></textarea>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
                <span style="font-size:0.72rem;color:var(--text-secondary,#5b7177);">המייל יישלח בעיצוב ממותג של בית המטפלים</span>
                <span id="email-compose-counter" style="font-size:0.72rem;color:var(--text-secondary,#5b7177);direction:ltr;">0 / ${EMAIL_MAX_MESSAGE}</span>
            </div>

            <button id="email-compose-send" onclick="sendComposedEmail()" style="width:100%;margin-top:16px;padding:11px;background:var(--gold,#D4AF37);color:#003B46;border:none;border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;font-family:inherit;">
                <i class="fa-solid fa-paper-plane"></i> שלח מייל
            </button>
        </div>`;
    document.body.appendChild(wrap);

    // Close on backdrop click + live char counter
    wrap.addEventListener('click', (e) => { if (e.target === wrap) closeEmailCompose(); });
    wrap.querySelector('#email-compose-message').addEventListener('input', (e) => {
        document.getElementById('email-compose-counter').textContent = `${e.target.value.length} / ${EMAIL_MAX_MESSAGE}`;
    });
}

function openEmailCompose({ to = '', name = '' } = {}) {
    _ensureEmailModal();
    document.getElementById('email-compose-to').value = to;
    document.getElementById('email-compose-subject').value = '';
    document.getElementById('email-compose-message').value = '';
    document.getElementById('email-compose-counter').textContent = `0 / ${EMAIL_MAX_MESSAGE}`;
    document.getElementById('email-compose-recipient-name').textContent = name ? `נמען: ${name}` : '';
    const btn = document.getElementById('email-compose-send');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> שלח מייל';
    document.getElementById('admin-email-modal').style.display = 'flex';
    document.getElementById(to ? 'email-compose-subject' : 'email-compose-to').focus();
}

function closeEmailCompose() {
    const modal = document.getElementById('admin-email-modal');
    if (modal) modal.style.display = 'none';
}

async function sendComposedEmail() {
    const to = document.getElementById('email-compose-to').value.trim();
    const subject = document.getElementById('email-compose-subject').value.trim();
    const message = document.getElementById('email-compose-message').value.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { showToast('כתובת מייל לא תקינה', 'error'); return; }
    if (!subject) { showToast('חסר נושא למייל', 'error'); return; }
    if (!message) { showToast('חסר תוכן להודעה', 'error'); return; }

    const btn = document.getElementById('email-compose-send');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> שולח...';

    try {
        const { data: { session } } = await db.auth.getSession();
        const token = session?.access_token;
        if (!token) { showToast('לא מחובר — יש להתחבר מחדש', 'error'); return; }

        const functionsUrl = window.SUPABASE_CONFIG?.functionsUrl || 'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1';
        const res = await fetch(`${functionsUrl}/send-email`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, subject, message }),
            signal: AbortSignal.timeout(30000)
        });
        const result = await res.json().catch(() => ({}));

        if (!res.ok || !result.success) {
            showToast(`שליחת המייל נכשלה (${result.error || `HTTP ${res.status}`})`, 'error');
            return;
        }

        closeEmailCompose();
        showToast(`המייל נשלח אל ${to}`, 'success');
    } catch (err) {
        console.error('sendComposedEmail error:', err);
        showToast('שגיאה בשליחת המייל', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> שלח מייל';
    }
}
