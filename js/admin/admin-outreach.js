// admin-outreach.js — "פנייה מחדש" board
// Re-engage every prospect again, grouped by warmth, for the ₪1,900 Master course.
// Manual-fast outreach: one click opens WhatsApp with a ready message AND logs the contact.
// No bulk broadcast (Green API ban risk) — Hillel's hand stays on each send.

let obData = null;
let obCacheTime = 0;
let obShellBuilt = false;
let obHideContacted = true;   // hide people contacted in the last 7 days
let obSearch = '';
const OB_TTL = 2 * 60 * 1000;

// Warmth buckets (aligned with the old funnel warmth the user already knows)
const OB_WARMTH = {
    hot:  { key: 'hot',  label: '🔥 חם',   sub: 'השאירו פנייה / רותחים',  color: '#f87171' },
    warm: { key: 'warm', label: '🟡 חמים', sub: 'נרשמו / התחילו ללמוד',   color: '#fbbf24' },
    cold: { key: 'cold', label: '❄️ קר',   sub: 'נרשמו ולא נגעו',          color: '#60a5fa' },
};
const OB_ORDER = ['hot', 'warm', 'cold'];

// === Ready messages (editable, persisted to localStorage). {שם} = first name. ===
const OB_TPL_KEY = 'outreach_templates_1900_v1';
const OB_DEFAULT_TPL = {
    hot:  `היי {שם}, כאן הלל מבית המטפלים 🙏\nדיברנו בעבר על קורס המאסטר ב-NLP.\nפתחנו עכשיו מסלול חדש: כל הקורס + הסדנאות + הטכניקות של רם — ב-1,900 ₪ בלבד, גישה לכל החיים.\nרוצה שאשלח לך לינק להרשמה?\n(אם כבר לא רלוונטי — כתוב לי "להסיר" ולא אטריד שוב 🙏)`,
    warm: `היי {שם}, כאן הלל מבית המטפלים 🙂\nראיתי שהתחלת ללמוד אצלנו NLP — כל הכבוד!\nפתחנו את קורס המאסטר המלא של רם (קורס + סדנאות + טכניקות פרקטישנר) ב-1,900 ₪, גישה לכל החיים.\nמעניין אותך? אשמח לשלוח פרטים.\n(לא רלוונטי? כתוב "להסיר" 🙏)`,
    cold: `היי {שם}, כאן הלל מבית המטפלים 🙂\nנרשמת אלינו ל-NLP — מוזמן להתחיל מתי שנוח לך.\nולמי שרוצה להעמיק: פתחנו את קורס המאסטר המלא ב-1,900 ₪ (גישה לכל החיים).\nרוצה שאשלח לך לינק?\n(לא מעוניין? כתוב "להסיר" 🙏)`,
};

function obTemplates() {
    try { return { ...OB_DEFAULT_TPL, ...(JSON.parse(localStorage.getItem(OB_TPL_KEY) || '{}')) }; }
    catch (_) { return { ...OB_DEFAULT_TPL }; }
}
function obSaveTemplates() {
    const t = {
        hot:  document.getElementById('ob-tpl-hot')?.value || '',
        warm: document.getElementById('ob-tpl-warm')?.value || '',
        cold: document.getElementById('ob-tpl-cold')?.value || '',
    };
    localStorage.setItem(OB_TPL_KEY, JSON.stringify(t));
    showToast('ההודעות נשמרו', 'success');
}
function obResetTemplates() {
    localStorage.removeItem(OB_TPL_KEY);
    const t = obTemplates();
    OB_ORDER.forEach(k => { const el = document.getElementById('ob-tpl-' + k); if (el) el.value = t[k]; });
    showToast('שוחזרו הודעות ברירת מחדל', 'success');
}

// === Helpers ===
function obFirstName(name) {
    const n = (name || '').trim();
    return n ? n.split(/\s+/)[0] : 'שלום';
}
function obWaNumber(phone) {
    let p = (phone || '').replace(/\D/g, '');
    if (!p) return '';
    if (p.startsWith('972')) return p;
    if (p.startsWith('0')) return '972' + p.slice(1);
    if (p.length === 9) return '972' + p;   // missing leading 0
    return p;
}
function obDaysSince(iso) {
    if (!iso) return null;
    const d = new Date(iso).getTime();
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d) / 86400000);
}
function obHourIL() {
    return parseInt(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' }).format(new Date()), 10);
}

// === Load ===
async function loadOutreach() {
    obBuildShell();
    if (obData && (Date.now() - obCacheTime) < OB_TTL) { obRender(); return; }

    const body = document.getElementById('ob-columns');
    if (body) body.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">טוען...</div>`;

    try {
        const [profilesRes, qRes, progressRes, salesRes] = await Promise.all([
            db.from('profiles')
                .select('id, full_name, email, phone, role, created_at, sales_stage, sales_contact_count, sales_notes, sales_last_contact')
                .in('role', ['student_lead', 'student', 'paid_customer'])
                .order('created_at', { ascending: false }),
            db.rpc('admin_get_portal_questionnaires_full'),
            db.from('course_progress').select('user_id, completed'),
            db.from('contact_requests').select('full_name, phone, request_type, created_at').eq('request_type', 'training'),
        ]);

        const qMap = {};
        (qRes.data || []).forEach(q => { if (q.user_id) qMap[q.user_id] = q; });

        const progressMap = {};
        (progressRes.data || []).forEach(p => { if (p.user_id && p.completed) progressMap[p.user_id] = (progressMap[p.user_id] || 0) + 1; });

        const salesByPhone = {};
        (salesRes.data || []).forEach(l => { const p = (l.phone || '').replace(/[-\s]/g, ''); if (p) salesByPhone[p] = l; });

        obData = (profilesRes.data || []).map(p => {
            const q = qMap[p.id];
            const lessons = progressMap[p.id] || 0;
            const cleanPhone = (p.phone || '').replace(/[-\s]/g, '');
            const salesLead = salesByPhone[cleanPhone];

            let warmth;
            if (p.role === 'paid_customer') warmth = 'paid';
            else if (salesLead || q?.heat_level === 'hot') warmth = 'hot';
            else if (q || lessons > 0) warmth = 'warm';
            else warmth = 'cold';

            return {
                id: p.id,
                full_name: p.full_name,
                phone: p.phone,
                stage: p.sales_stage || 'new',
                contactCount: p.sales_contact_count || 0,
                notes: p.sales_notes || '',
                lastContact: p.sales_last_contact || null,
                created_at: p.created_at,
                role: p.role,
                lessons,
                warmth,
                contactedNow: false,
            };
        });

        obCacheTime = Date.now();
        obRender();
    } catch (err) {
        const b = document.getElementById('ob-columns');
        if (b) b.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--danger);padding:2rem;">${escapeHtml(err.message)}</div>`;
    }
}

// === Build the static shell once ===
function obBuildShell() {
    if (obShellBuilt) return;
    const root = document.getElementById('outreach-view');
    if (!root) return;
    const t = obTemplates();

    root.innerHTML = `
    <style>
        .ob-banner{background:rgba(245,158,11,0.12);border:1px solid #f59e0b;color:#b45309;padding:0.6rem 1rem;border-radius:10px;margin-bottom:1rem;font-size:0.9rem;}
        .ob-controls{display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center;margin-bottom:1rem;}
        .ob-controls .search-box{flex:1;min-width:200px;}
        .ob-toggle{display:flex;align-items:center;gap:0.4rem;font-size:0.85rem;color:var(--text-secondary);cursor:pointer;user-select:none;}
        .ob-kpis{display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:1rem;}
        .ob-kpi{background:var(--card);border:1px solid var(--border,#e5e7eb);border-radius:12px;padding:0.75rem 1.1rem;min-width:120px;}
        .ob-kpi .v{font-size:1.5rem;font-weight:700;color:var(--gold);}
        .ob-kpi .l{font-size:0.78rem;color:var(--text-secondary);}
        .ob-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;align-items:start;}
        .ob-col{background:var(--card);border:1px solid var(--border,#e5e7eb);border-radius:14px;padding:0.75rem;}
        .ob-col-head{display:flex;justify-content:space-between;align-items:baseline;padding:0.25rem 0.4rem 0.6rem;border-bottom:2px solid var(--border,#eee);margin-bottom:0.6rem;}
        .ob-col-head .t{font-size:1.05rem;font-weight:700;}
        .ob-col-head .s{font-size:0.72rem;color:var(--text-secondary);}
        .ob-col-head .c{font-size:1.2rem;font-weight:700;}
        .ob-list{display:flex;flex-direction:column;gap:0.5rem;max-height:60vh;overflow-y:auto;}
        .ob-card{border:1px solid var(--border,#e5e7eb);border-radius:10px;padding:0.6rem 0.7rem;background:var(--bg,#fafafa);}
        .ob-card-top{display:flex;justify-content:space-between;align-items:baseline;gap:0.5rem;}
        .ob-card-top strong{font-size:0.95rem;}
        .ob-phone{direction:ltr;font-size:0.78rem;color:var(--text-secondary);}
        .ob-card-meta{font-size:0.72rem;margin:0.3rem 0 0.5rem;}
        .ob-send{width:100%;padding:0.45rem;background:#25D366;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:0.85rem;cursor:pointer;font-family:inherit;}
        .ob-send:hover{filter:brightness(1.05);}
        .ob-paid{font-size:0.82rem;color:var(--text-secondary);margin-top:0.75rem;}
        .ob-tpl-panel{display:none;background:var(--card);border:1px solid var(--border,#e5e7eb);border-radius:12px;padding:1rem;margin-bottom:1rem;}
        .ob-tpl-panel.open{display:block;}
        .ob-tpl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0.75rem;}
        .ob-tpl-grid label{font-size:0.8rem;font-weight:600;display:block;margin-bottom:0.3rem;}
        .ob-tpl-grid textarea{width:100%;min-height:130px;padding:0.5rem;border:1px solid var(--border,#ddd);border-radius:8px;font-family:inherit;font-size:0.82rem;resize:vertical;line-height:1.6;}
        .ob-credit{text-align:center;color:var(--text-secondary);font-size:0.72rem;margin-top:1.5rem;}
    </style>

    <h1 class="page-title"><i class="fa-solid fa-bullhorn" style="color:var(--gold);margin-left:0.5rem;"></i> פנייה מחדש — מאסטר ₪1,900</h1>
    <p style="color:var(--text-secondary);margin:-1rem 0 1.5rem;font-size:0.9rem;">כל מי שנרשם בעבר, מסודר לפי חום. לחיצה על "פנה" פותחת וואטסאפ עם הודעה מוכנה ומסמנת אוטומטית שנוצר קשר.</p>

    <div id="ob-time-banner"></div>

    <div class="ob-kpis">
        <div class="ob-kpi"><div class="v" id="ob-kpi-total">-</div><div class="l">סה"כ לפנייה</div></div>
        <div class="ob-kpi"><div class="v" id="ob-kpi-fresh">-</div><div class="l">עוד לא פנית</div></div>
        <div class="ob-kpi"><div class="v" id="ob-kpi-today">-</div><div class="l">פנית היום</div></div>
        <div class="ob-kpi"><div class="v" id="ob-kpi-paid">-</div><div class="l">כבר קנו ✅</div></div>
    </div>

    <div class="ob-controls">
        <div class="search-box">
            <i class="fa-solid fa-search"></i>
            <input type="text" placeholder="חיפוש שם / טלפון..." id="ob-search" oninput="obOnSearch(this.value)">
        </div>
        <label class="ob-toggle"><input type="checkbox" id="ob-hide" checked onchange="obToggleHide(this.checked)"> הסתר מי שפניתי אליו בשבוע האחרון</label>
        <button class="btn" onclick="obToggleTemplates()" style="padding:0.45rem 0.9rem;border:1px solid var(--gold);background:transparent;color:var(--gold);border-radius:8px;cursor:pointer;font-family:inherit;"><i class="fa-solid fa-pen"></i> עריכת ההודעות</button>
        <button class="btn" onclick="obData=null;loadOutreach()" style="padding:0.45rem 0.9rem;border:1px solid var(--border,#ddd);background:transparent;color:var(--text-secondary);border-radius:8px;cursor:pointer;font-family:inherit;"><i class="fa-solid fa-rotate"></i> רענן</button>
    </div>

    <div class="ob-tpl-panel" id="ob-tpl-panel">
        <div class="ob-tpl-grid">
            <div><label>🔥 חם</label><textarea id="ob-tpl-hot">${escapeHtml(t.hot)}</textarea></div>
            <div><label>🟡 חמים</label><textarea id="ob-tpl-warm">${escapeHtml(t.warm)}</textarea></div>
            <div><label>❄️ קר</label><textarea id="ob-tpl-cold">${escapeHtml(t.cold)}</textarea></div>
        </div>
        <p style="font-size:0.75rem;color:var(--text-secondary);margin:0.6rem 0;"><code>{שם}</code> יוחלף אוטומטית בשם הפרטי של הנמען.</p>
        <button onclick="obSaveTemplates()" style="padding:0.45rem 1rem;background:var(--gold);color:#003B46;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-family:inherit;">שמור</button>
        <button onclick="obResetTemplates()" style="padding:0.45rem 1rem;background:transparent;border:1px solid var(--border,#ddd);color:var(--text-secondary);border-radius:8px;cursor:pointer;font-family:inherit;">אפס לברירת מחדל</button>
    </div>

    <div class="ob-columns" id="ob-columns"></div>
    <div class="ob-credit">נבנה ע"י הלל</div>
    `;
    obShellBuilt = true;
}

function obToggleTemplates() { document.getElementById('ob-tpl-panel')?.classList.toggle('open'); }
function obToggleHide(v) { obHideContacted = v; obRender(); }
function obOnSearch(v) { obSearch = (v || '').toLowerCase(); obRender(); }

// === Render ===
function obRender() {
    if (!obData) return;

    // Time guard (outbound rule: 08:00–20:00)
    const h = obHourIL();
    const banner = document.getElementById('ob-time-banner');
    if (banner) {
        banner.innerHTML = (h < 8 || h >= 20)
            ? `<div class="ob-banner"><i class="fa-solid fa-moon"></i> שים לב — מחוץ לשעות השליחה המומלצות (08:00–20:00). עדיף לחכות לבוקר.</div>`
            : '';
    }

    const paid = obData.filter(p => p.warmth === 'paid').length;
    const reachable = obData.filter(p => p.warmth !== 'paid');
    const fresh = reachable.filter(p => p.contactCount === 0 && !p.contactedNow).length;
    const today = reachable.filter(p => p.contactedNow || obDaysSince(p.lastContact) === 0).length;

    setText('ob-kpi-total', reachable.length);
    setText('ob-kpi-fresh', fresh);
    setText('ob-kpi-today', today);
    setText('ob-kpi-paid', paid);

    const nav = document.getElementById('outreach-count');
    if (nav) { nav.textContent = fresh; nav.style.display = fresh > 0 ? '' : 'none'; }

    const cols = document.getElementById('ob-columns');
    if (!cols) return;

    cols.innerHTML = OB_ORDER.map(key => {
        const meta = OB_WARMTH[key];
        let list = obData.filter(p => p.warmth === key);

        if (obSearch) {
            list = list.filter(p =>
                (p.full_name || '').toLowerCase().includes(obSearch) ||
                (p.phone || '').includes(obSearch));
        }
        const total = list.length;

        // Hide recently-contacted (but always keep this-session sends visible as feedback)
        if (obHideContacted) {
            list = list.filter(p => {
                if (p.contactedNow) return true;
                const d = obDaysSince(p.lastContact);
                return d === null || d >= 7;
            });
        }

        // Sort: un-contacted first, then oldest contact; this-session sends sink to bottom
        list.sort((a, b) => {
            if (a.contactedNow !== b.contactedNow) return a.contactedNow ? 1 : -1;
            const da = obDaysSince(a.lastContact), dbb = obDaysSince(b.lastContact);
            if (da === null && dbb !== null) return -1;
            if (dbb === null && da !== null) return 1;
            if (da !== null && dbb !== null && da !== dbb) return dbb - da; // oldest contact first
            return new Date(b.created_at) - new Date(a.created_at);
        });

        const cards = list.length
            ? list.map(obCard).join('')
            : `<div class="empty-state" style="padding:1rem;font-size:0.85rem;">אין כאן אף אחד 🎉</div>`;

        return `<div class="ob-col" style="border-top:3px solid ${meta.color};">
            <div class="ob-col-head">
                <div><div class="t">${meta.label}</div><div class="s">${meta.sub}</div></div>
                <div class="c" style="color:${meta.color};">${total}</div>
            </div>
            <div class="ob-list">${cards}</div>
        </div>`;
    }).join('');
}

function obCard(p) {
    const d = obDaysSince(p.lastContact);
    let badge;
    if (p.contactedNow) badge = `<span style="color:#22c55e;font-weight:600;">✓ נשלח עכשיו</span>`;
    else if (d === null) badge = `<span style="color:var(--text-secondary);">לא פנית עדיין</span>`;
    else badge = `<span style="color:var(--text-secondary);">פנית ${d === 0 ? 'היום' : 'לפני ' + d + ' ימים'} · ${p.contactCount}×</span>`;

    const dim = p.contactedNow ? 'opacity:0.55;' : '';
    const lessons = p.lessons > 0 ? ` · 📚 ${p.lessons}` : '';
    const noPhone = !obWaNumber(p.phone);

    return `<div class="ob-card" style="${dim}">
        <div class="ob-card-top">
            <strong>${escapeHtml(p.full_name || 'ללא שם')}</strong>
            <span class="ob-phone">${escapeHtml(p.phone || '—')}</span>
        </div>
        <div class="ob-card-meta">${badge}${lessons}</div>
        <button class="ob-send" onclick="doOutreach('${p.id}')" ${noPhone ? 'disabled style="background:#9ca3af;cursor:not-allowed;"' : ''}>
            <i class="fa-brands fa-whatsapp"></i> ${noPhone ? 'אין טלפון' : (p.contactedNow ? 'שלח שוב' : 'פנה')}
        </button>
    </div>`;
}

function obBuildMessage(p) {
    const t = obTemplates();
    const tpl = t[p.warmth] || t.cold;
    return tpl.replace(/\{שם\}/g, obFirstName(p.full_name));
}

// === The action: open WhatsApp (ready message) + log the contact ===
function doOutreach(userId) {
    const p = obData?.find(x => x.id === userId);
    if (!p) return;
    const num = obWaNumber(p.phone);
    if (!num) { showToast('אין מספר טלפון תקין', 'error'); return; }

    // Open WhatsApp synchronously (avoids popup blocker), then log.
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(obBuildMessage(p))}`, '_blank');
    obLogContact(userId);
}

async function obLogContact(userId) {
    const p = obData?.find(x => x.id === userId);
    if (!p) return;
    const newCount = (p.contactCount || 0) + 1;
    const nowIso = new Date().toISOString();
    const dateStr = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });

    const updates = {
        sales_contact_count: newCount,
        sales_last_contact: nowIso,
        sales_updated_at: nowIso,
        sales_notes: `[${dateStr}] פנייה מחדש — מאסטר 1,900\n${p.notes || ''}`,
    };
    if (p.stage === 'new') updates.sales_stage = 'contacted';

    // Optimistic UI
    p.contactCount = newCount; p.lastContact = nowIso; p.notes = updates.sales_notes;
    p.contactedNow = true; if (updates.sales_stage) p.stage = updates.sales_stage;
    obRender();

    try {
        const { error } = await db.from('profiles').update(updates).eq('id', userId);
        if (error) throw error;
    } catch (err) {
        showToast('נשלח, אך לא נרשם במערכת: ' + err.message, 'error');
    }
}
