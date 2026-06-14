// admin-outreach.js — "פנייה מחדש" board (CRM-grade)
// Re-engage every prospect again, grouped by warmth, for the ₪1,900 Master course.
// Manual-fast outreach: one click opens WhatsApp with a ready message AND logs the contact.
// No bulk broadcast (Green API ban risk) — Hillel's hand stays on each send.
//
// Pro features: SVG/FA icons (no emoji chrome), daily momentum bar, "מצב ריצה" blitz mode
// with keyboard control + per-person editable message, undo after send, skeleton loading,
// polished cards, full a11y, dark+light, reduced-motion aware.

let obData = null;
let obCacheTime = 0;
let obShellBuilt = false;
let obHideContacted = true;   // hide people contacted in the last 7 days
let obSearch = '';
const OB_TTL = 2 * 60 * 1000;

// Warmth buckets (FA icon + label; aligned with the old funnel warmth)
const OB_WARMTH = {
    hot:  { key: 'hot',  label: 'חם',   sub: 'השאירו פנייה / רותחים', icon: 'fa-fire',      color: '#f87171' },
    warm: { key: 'warm', label: 'חמים', sub: 'נרשמו / התחילו ללמוד',  icon: 'fa-mug-hot',   color: '#fbbf24' },
    cold: { key: 'cold', label: 'קר',   sub: 'נרשמו ולא נגעו',         icon: 'fa-snowflake', color: '#60a5fa' },
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
function obInitials(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
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
function obContactLabel(p) {
    if (p.contactedNow) return 'נשלח עכשיו';
    const d = obDaysSince(p.lastContact);
    if (d === null) return 'לא פנית עדיין';
    const when = d === 0 ? 'היום' : (d === 1 ? 'אתמול' : `לפני ${d} ימים`);
    return `${when} · ${p.contactCount}×`;
}
function obHourIL() {
    return parseInt(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' }).format(new Date()), 10);
}
function obReachable() { return (obData || []).filter(p => p.warmth !== 'paid'); }

// === Load ===
async function loadOutreach() {
    obBuildShell();
    if (obData && (Date.now() - obCacheTime) < OB_TTL) { obRender(); return; }

    obRenderSkeleton();

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
                source: q?.how_found || '',
                warmth,
                contactedNow: false,
            };
        });

        obCacheTime = Date.now();
        obRender();
    } catch (err) {
        const b = document.getElementById('ob-columns');
        if (b) b.innerHTML = `<div class="ob-state ob-state-error" style="grid-column:1/-1;">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <div>שגיאה בטעינה</div>
            <small>${escapeHtml(err.message)}</small>
            <button class="ob-btn ob-btn-ghost" onclick="obRefresh()" style="margin-top:0.75rem;"><i class="fa-solid fa-rotate"></i> נסה שוב</button>
        </div>`;
    }
}

function obRefresh() { obData = null; obCacheTime = 0; loadOutreach(); }

// === Static shell (built once) ===
function obBuildShell() {
    if (obShellBuilt) return;
    const root = document.getElementById('outreach-view');
    if (!root) return;
    const t = obTemplates();

    root.innerHTML = `
    <style>
        #outreach-view{--ob-radius:14px;}
        .ob-head{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:1rem;margin-bottom:1.25rem;}
        .ob-head h1{font-family:'Frank Ruhl Libre',serif;font-size:1.6rem;margin:0;display:flex;align-items:center;gap:0.5rem;}
        .ob-head p{color:var(--text-secondary);font-size:0.9rem;margin:0.35rem 0 0;max-width:46ch;line-height:1.6;}
        .ob-banner{display:flex;align-items:center;gap:0.5rem;background:rgba(245,158,11,0.12);border:1px solid #f59e0b;color:#b45309;padding:0.6rem 1rem;border-radius:10px;margin-bottom:1rem;font-size:0.9rem;}

        /* momentum */
        .ob-momentum{background:var(--card);border:1px solid var(--border);border-radius:var(--ob-radius);padding:1rem 1.15rem;margin-bottom:1.25rem;}
        .ob-momentum .row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.6rem;font-size:0.9rem;}
        .ob-momentum .big{font-size:1.05rem;font-weight:700;}
        .ob-momentum .big b{color:var(--gold);font-size:1.3rem;}
        .ob-bar{height:10px;border-radius:99px;background:color-mix(in srgb,var(--text-secondary) 18%,transparent);overflow:hidden;}
        .ob-bar > i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--gold),#f0c75e);transition:width .4s ease;}

        /* kpis */
        .ob-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.75rem;margin-bottom:1.25rem;}
        .ob-kpi{display:flex;align-items:center;gap:0.75rem;background:var(--card);border:1px solid var(--border);border-radius:var(--ob-radius);padding:0.8rem 1rem;}
        .ob-kpi .ic{width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:1.05rem;flex-shrink:0;}
        .ob-kpi .v{font-size:1.45rem;font-weight:700;line-height:1;}
        .ob-kpi .l{font-size:0.76rem;color:var(--text-secondary);margin-top:0.2rem;}

        /* controls */
        .ob-controls{display:flex;flex-wrap:wrap;gap:0.6rem;align-items:center;margin-bottom:1.25rem;}
        .ob-controls .search-box{flex:1;min-width:200px;}
        .ob-toggle{display:inline-flex;align-items:center;gap:0.45rem;font-size:0.85rem;color:var(--text-secondary);cursor:pointer;user-select:none;}
        .ob-btn{display:inline-flex;align-items:center;gap:0.45rem;padding:0.5rem 0.95rem;border-radius:9px;font-family:inherit;font-size:0.85rem;font-weight:600;cursor:pointer;border:1px solid transparent;transition:background .18s,border-color .18s,color .18s,filter .18s;}
        .ob-btn:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
        .ob-btn-primary{background:var(--gold);color:#003B46;}
        .ob-btn-primary:hover{filter:brightness(1.06);}
        .ob-btn-ghost{background:transparent;border-color:var(--border);color:var(--text-secondary);}
        .ob-btn-ghost:hover{border-color:var(--gold);color:var(--gold);}
        .ob-btn-wa{background:#25D366;color:#fff;}
        .ob-btn-wa:hover{filter:brightness(1.05);}

        /* templates panel */
        .ob-tpl-panel{display:none;background:var(--card);border:1px solid var(--border);border-radius:var(--ob-radius);padding:1rem;margin-bottom:1.25rem;}
        .ob-tpl-panel.open{display:block;}
        .ob-tpl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0.75rem;}
        .ob-tpl-grid label{font-size:0.82rem;font-weight:700;display:flex;align-items:center;gap:0.4rem;margin-bottom:0.35rem;}
        .ob-tpl-grid textarea{width:100%;min-height:140px;padding:0.6rem;border:1px solid var(--border);border-radius:9px;font-family:inherit;font-size:0.82rem;resize:vertical;line-height:1.7;background:var(--bg);color:var(--text);}
        .ob-tpl-grid textarea:focus{outline:none;border-color:var(--gold);}

        /* columns */
        .ob-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem;align-items:start;}
        .ob-col{background:var(--card);border:1px solid var(--border);border-radius:var(--ob-radius);overflow:hidden;}
        .ob-col-head{position:sticky;top:0;z-index:1;display:flex;justify-content:space-between;align-items:center;gap:0.5rem;padding:0.85rem 0.9rem;background:var(--card);border-bottom:1px solid var(--border);}
        .ob-col-head .ti{display:flex;align-items:center;gap:0.55rem;}
        .ob-col-head .ti .badge-ic{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1rem;}
        .ob-col-head .t{font-weight:700;font-size:1rem;line-height:1.1;}
        .ob-col-head .s{font-size:0.7rem;color:var(--text-secondary);}
        .ob-col-head .c{font-size:1.3rem;font-weight:800;}
        .ob-col-run{font-size:0.72rem;padding:0.3rem 0.6rem;}
        .ob-list{display:flex;flex-direction:column;gap:0.5rem;padding:0.7rem;max-height:62vh;overflow-y:auto;}

        /* card */
        .ob-card{display:flex;flex-direction:column;gap:0.55rem;border:1px solid var(--border);border-radius:11px;padding:0.7rem;background:var(--bg);cursor:pointer;transition:border-color .18s,box-shadow .18s,background .18s;}
        .ob-card:hover{border-color:var(--gold);box-shadow:0 2px 12px rgba(0,0,0,0.08);}
        .ob-card:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
        .ob-card.sent{opacity:0.5;}
        .ob-card .who{display:flex;align-items:center;gap:0.6rem;min-width:0;}
        .ob-avatar{width:38px;height:38px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;color:#fff;}
        .ob-card .name{font-weight:700;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .ob-card .phone{direction:ltr;text-align:right;font-size:0.76rem;color:var(--text-secondary);}
        .ob-meta{display:flex;flex-wrap:wrap;gap:0.35rem;align-items:center;font-size:0.72rem;color:var(--text-secondary);}
        .ob-chip{display:inline-flex;align-items:center;gap:0.25rem;padding:0.1rem 0.45rem;border-radius:99px;font-size:0.68rem;font-weight:600;}
        .ob-actions{display:flex;gap:0.4rem;}
        .ob-actions .ob-btn{flex:1;justify-content:center;padding:0.45rem;}
        .ob-icon-btn{width:36px;flex:0 0 auto !important;}

        /* states */
        .ob-state{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2.5rem 1rem;color:var(--text-secondary);}
        .ob-state i{font-size:1.8rem;margin-bottom:0.6rem;opacity:0.7;}
        .ob-state-error i{color:var(--danger);}
        .ob-empty{padding:1.25rem 0.75rem;text-align:center;color:var(--text-secondary);font-size:0.85rem;}
        .ob-skel{height:96px;border-radius:11px;background:linear-gradient(90deg,color-mix(in srgb,var(--text-secondary) 10%,transparent) 25%,color-mix(in srgb,var(--text-secondary) 18%,transparent) 37%,color-mix(in srgb,var(--text-secondary) 10%,transparent) 63%);background-size:400% 100%;animation:ob-shimmer 1.4s ease infinite;}

        /* focus (blitz) mode */
        .ob-focus{position:fixed;inset:0;z-index:9998;background:rgba(0,30,36,0.62);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;padding:1rem;}
        .ob-focus.open{display:flex;}
        .ob-focus-box{width:100%;max-width:560px;background:var(--card);border:1px solid var(--border);border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,0.35);padding:1.4rem;max-height:92vh;overflow-y:auto;}
        .ob-focus-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;}
        .ob-focus-prog{font-size:0.82rem;color:var(--text-secondary);}
        .ob-focus-prog b{color:var(--gold);}
        .ob-focus-bar{height:6px;border-radius:99px;background:color-mix(in srgb,var(--text-secondary) 18%,transparent);overflow:hidden;margin-bottom:1.1rem;}
        .ob-focus-bar > i{display:block;height:100%;background:linear-gradient(90deg,var(--gold),#f0c75e);transition:width .35s ease;}
        .ob-focus-person{display:flex;align-items:center;gap:0.8rem;margin-bottom:1rem;}
        .ob-focus-person .name{font-size:1.25rem;font-weight:800;font-family:'Frank Ruhl Libre',serif;}
        .ob-focus-msg{width:100%;min-height:150px;padding:0.8rem;border:1px solid var(--border);border-radius:11px;font-family:inherit;font-size:0.92rem;line-height:1.7;resize:vertical;background:var(--bg);color:var(--text);}
        .ob-focus-msg:focus{outline:none;border-color:var(--gold);}
        .ob-focus-hint{font-size:0.72rem;color:var(--text-secondary);margin:0.5rem 0 1rem;display:flex;gap:0.8rem;flex-wrap:wrap;}
        .ob-focus-hint kbd{background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:0.05rem 0.4rem;font-family:monospace;font-size:0.72rem;}
        .ob-focus-actions{display:flex;gap:0.6rem;flex-wrap:wrap;}
        .ob-focus-actions .ob-btn{flex:1;justify-content:center;padding:0.7rem;font-size:0.92rem;}

        .ob-credit{text-align:center;color:var(--text-secondary);font-size:0.72rem;margin-top:1.75rem;}

        /* undo toast */
        .ob-undo{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(120%);z-index:9999;display:flex;align-items:center;gap:0.9rem;background:var(--deep-petrol,#003B46);color:#fff;padding:0.75rem 1.1rem;border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,0.4);font-size:0.9rem;transition:transform .3s ease;}
        .ob-undo.show{transform:translateX(-50%) translateY(0);}
        .ob-undo button{background:transparent;border:1px solid rgba(255,255,255,0.4);color:#fff;border-radius:8px;padding:0.35rem 0.8rem;font-weight:700;cursor:pointer;font-family:inherit;}
        .ob-undo button:hover{background:rgba(255,255,255,0.12);}

        @keyframes ob-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}
        @media (max-width:560px){ .ob-head h1{font-size:1.35rem;} .ob-list{max-height:none;} }
        @media (prefers-reduced-motion:reduce){ #outreach-view *{transition:none !important;animation:none !important;} }
    </style>

    <div class="ob-head">
        <div>
            <h1><i class="fa-solid fa-bullhorn" style="color:var(--gold);"></i> פנייה מחדש — מאסטר ₪1,900</h1>
            <p>כל מי שנרשם בעבר, מסודר לפי חום. "פנה" פותח וואטסאפ עם הודעה מוכנה ומסמן אוטומטית שנוצר קשר.</p>
        </div>
        <button class="ob-btn ob-btn-primary" onclick="obStartFocus()" aria-label="הפעל מצב ריצה מהיר">
            <i class="fa-solid fa-bolt"></i> מצב ריצה
        </button>
    </div>

    <div id="ob-time-banner"></div>

    <div class="ob-momentum">
        <div class="row">
            <span class="big">פניות היום: <b id="ob-today">0</b></span>
            <span id="ob-remaining" style="color:var(--text-secondary);font-size:0.85rem;"></span>
        </div>
        <div class="ob-bar"><i id="ob-progress" style="width:0%"></i></div>
    </div>

    <div class="ob-kpis">
        <div class="ob-kpi"><div class="ic" style="background:rgba(212,175,55,0.15);color:var(--gold);"><i class="fa-solid fa-users"></i></div><div><div class="v" id="ob-kpi-total">-</div><div class="l">סה"כ לפנייה</div></div></div>
        <div class="ob-kpi"><div class="ic" style="background:rgba(96,165,250,0.15);color:#60a5fa;"><i class="fa-solid fa-user-plus"></i></div><div><div class="v" id="ob-kpi-fresh">-</div><div class="l">עוד לא פנית</div></div></div>
        <div class="ob-kpi"><div class="ic" style="background:rgba(37,211,102,0.15);color:#25D366;"><i class="fa-brands fa-whatsapp"></i></div><div><div class="v" id="ob-kpi-today">-</div><div class="l">פנית היום</div></div></div>
        <div class="ob-kpi"><div class="ic" style="background:rgba(34,197,94,0.15);color:#22c55e;"><i class="fa-solid fa-crown"></i></div><div><div class="v" id="ob-kpi-paid">-</div><div class="l">כבר קנו</div></div></div>
    </div>

    <div class="ob-controls">
        <div class="search-box">
            <i class="fa-solid fa-search"></i>
            <input type="text" placeholder="חיפוש שם / טלפון..." id="ob-search" aria-label="חיפוש" oninput="obOnSearch(this.value)">
        </div>
        <label class="ob-toggle"><input type="checkbox" id="ob-hide" checked onchange="obToggleHide(this.checked)"> הסתר מי שפניתי אליו בשבוע האחרון</label>
        <button class="ob-btn ob-btn-ghost" onclick="obToggleTemplates()"><i class="fa-solid fa-pen"></i> עריכת ההודעות</button>
        <button class="ob-btn ob-btn-ghost" onclick="obRefresh()" aria-label="רענן"><i class="fa-solid fa-rotate"></i> רענן</button>
    </div>

    <div class="ob-tpl-panel" id="ob-tpl-panel">
        <div class="ob-tpl-grid">
            <div><label><i class="fa-solid fa-fire" style="color:#f87171;"></i> חם</label><textarea id="ob-tpl-hot">${escapeHtml(t.hot)}</textarea></div>
            <div><label><i class="fa-solid fa-mug-hot" style="color:#fbbf24;"></i> חמים</label><textarea id="ob-tpl-warm">${escapeHtml(t.warm)}</textarea></div>
            <div><label><i class="fa-solid fa-snowflake" style="color:#60a5fa;"></i> קר</label><textarea id="ob-tpl-cold">${escapeHtml(t.cold)}</textarea></div>
        </div>
        <p style="font-size:0.75rem;color:var(--text-secondary);margin:0.6rem 0;"><code>{שם}</code> יוחלף אוטומטית בשם הפרטי של הנמען.</p>
        <button class="ob-btn ob-btn-primary" onclick="obSaveTemplates()">שמור</button>
        <button class="ob-btn ob-btn-ghost" onclick="obResetTemplates()">אפס לברירת מחדל</button>
    </div>

    <div class="ob-columns" id="ob-columns"></div>
    <div class="ob-credit">נבנה ע"י הלל</div>

    <!-- Focus (blitz) mode -->
    <div class="ob-focus" id="ob-focus" role="dialog" aria-modal="true" aria-label="מצב ריצה">
        <div class="ob-focus-box" id="ob-focus-box"></div>
    </div>

    <!-- Undo toast -->
    <div class="ob-undo" id="ob-undo"><span id="ob-undo-text"></span><button type="button" id="ob-undo-btn">ביטול</button></div>
    `;
    obShellBuilt = true;
}

function obToggleTemplates() { document.getElementById('ob-tpl-panel')?.classList.toggle('open'); }
function obToggleHide(v) { obHideContacted = v; obRender(); }
function obOnSearch(v) { obSearch = (v || '').toLowerCase(); obRender(); }

function obRenderSkeleton() {
    const cols = document.getElementById('ob-columns');
    if (!cols) return;
    const skelCol = `<div class="ob-col"><div class="ob-list">${'<div class="ob-skel"></div>'.repeat(3)}</div></div>`;
    cols.innerHTML = skelCol.repeat(3);
}

// === Sort/filter within a warmth bucket ===
function obColumnList(key) {
    let list = (obData || []).filter(p => p.warmth === key);
    if (obSearch) {
        list = list.filter(p =>
            (p.full_name || '').toLowerCase().includes(obSearch) ||
            (p.phone || '').includes(obSearch));
    }
    return list;
}
function obSortForOutreach(list) {
    return list.slice().sort((a, b) => {
        if (a.contactedNow !== b.contactedNow) return a.contactedNow ? 1 : -1;
        const da = obDaysSince(a.lastContact), dbb = obDaysSince(b.lastContact);
        if (da === null && dbb !== null) return -1;
        if (dbb === null && da !== null) return 1;
        if (da !== null && dbb !== null && da !== dbb) return dbb - da; // oldest contact first
        return new Date(b.created_at) - new Date(a.created_at);
    });
}
function obVisible(p) {
    if (!obHideContacted) return true;
    if (p.contactedNow) return true;
    const d = obDaysSince(p.lastContact);
    return d === null || d >= 7;
}

// === Render ===
function obRender() {
    if (!obData) return;

    // Time guard (outbound rule: 08:00–20:00)
    const h = obHourIL();
    const banner = document.getElementById('ob-time-banner');
    if (banner) {
        banner.innerHTML = (h < 8 || h >= 20)
            ? `<div class="ob-banner"><i class="fa-solid fa-moon"></i> מחוץ לשעות השליחה המומלצות (08:00–20:00). עדיף לחכות לבוקר.</div>`
            : '';
    }

    const reachable = obReachable();
    const paid = (obData.length - reachable.length);
    const fresh = reachable.filter(p => p.contactCount === 0 && !p.contactedNow).length;
    const today = reachable.filter(p => p.contactedNow || obDaysSince(p.lastContact) === 0).length;

    setText('ob-kpi-total', reachable.length);
    setText('ob-kpi-fresh', fresh);
    setText('ob-kpi-today', today);
    setText('ob-kpi-paid', paid);
    setText('ob-today', today);

    // momentum bar — today's reach out of the total reachable
    const pct = reachable.length ? Math.round((today / reachable.length) * 100) : 0;
    const bar = document.getElementById('ob-progress'); if (bar) bar.style.width = pct + '%';
    setText('ob-remaining', reachable.length ? `${reachable.length - today} נשארו · ${pct}%` : '');

    const nav = document.getElementById('outreach-count');
    if (nav) { nav.textContent = fresh; nav.style.display = fresh > 0 ? '' : 'none'; }

    const cols = document.getElementById('ob-columns');
    if (!cols) return;

    cols.innerHTML = OB_ORDER.map(key => {
        const meta = OB_WARMTH[key];
        const all = obColumnList(key);
        const list = obSortForOutreach(all).filter(obVisible);
        const cards = list.length
            ? list.map(obCard).join('')
            : `<div class="ob-empty"><i class="fa-solid fa-check" style="color:#22c55e;"></i> אין כאן אף אחד לפנייה</div>`;

        return `<section class="ob-col" aria-label="${meta.label}">
            <div class="ob-col-head">
                <div class="ti">
                    <span class="badge-ic" style="background:${meta.color}22;color:${meta.color};"><i class="fa-solid ${meta.icon}"></i></span>
                    <div><div class="t">${meta.label}</div><div class="s">${meta.sub}</div></div>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    ${list.length ? `<button class="ob-btn ob-btn-ghost ob-col-run" onclick="obStartFocus('${key}')" title="רוץ על כל ה${meta.label}"><i class="fa-solid fa-bolt"></i> רוץ</button>` : ''}
                    <span class="c" style="color:${meta.color};">${all.length}</span>
                </div>
            </div>
            <div class="ob-list">${cards}</div>
        </section>`;
    }).join('');
}

function obCard(p) {
    const meta = OB_WARMTH[p.warmth] || OB_WARMTH.cold;
    const sent = p.contactedNow ? ' sent' : '';
    const noPhone = !obWaNumber(p.phone);
    const lessons = p.lessons > 0 ? `<span class="ob-chip" style="background:rgba(212,175,55,0.14);color:var(--gold);"><i class="fa-solid fa-book"></i> ${p.lessons}</span>` : '';
    const contactIcon = p.contactedNow ? 'fa-circle-check' : (p.contactCount ? 'fa-clock-rotate-left' : 'fa-circle-dot');
    const contactColor = p.contactedNow ? '#22c55e' : 'inherit';

    return `<div class="ob-card${sent}" tabindex="0" role="button" onclick="obOpenFocusFor('${p.id}')" onkeydown="if(event.key==='Enter'){event.preventDefault();obOpenFocusFor('${p.id}')}" aria-label="כרטיס של ${escapeHtml(p.full_name || 'ללא שם')}">
        <div class="who">
            <span class="ob-avatar" style="background:${meta.color};">${escapeHtml(obInitials(p.full_name))}</span>
            <div style="min-width:0;flex:1;">
                <div class="name">${escapeHtml(p.full_name || 'ללא שם')}</div>
                <div class="phone">${escapeHtml(p.phone || 'אין טלפון')}</div>
            </div>
        </div>
        <div class="ob-meta">
            <span style="color:${contactColor};"><i class="fa-solid ${contactIcon}"></i> ${obContactLabel(p)}</span>
            ${lessons}
            ${p.source ? `<span class="ob-chip" style="background:color-mix(in srgb,var(--text-secondary) 14%,transparent);">${escapeHtml(p.source)}</span>` : ''}
        </div>
        <div class="ob-actions">
            <button class="ob-btn ob-btn-wa" onclick="event.stopPropagation();doOutreach('${p.id}')" ${noPhone ? 'disabled style="background:#9ca3af;cursor:not-allowed;"' : ''} aria-label="פנה בוואטסאפ">
                <i class="fa-brands fa-whatsapp"></i> ${noPhone ? 'אין טלפון' : (p.contactedNow ? 'שלח שוב' : 'פנה')}
            </button>
            <button class="ob-btn ob-btn-ghost ob-icon-btn" onclick="event.stopPropagation();obCopyPhone('${p.id}')" title="העתק טלפון" aria-label="העתק טלפון"><i class="fa-solid fa-copy"></i></button>
        </div>
    </div>`;
}

function obBuildMessage(p) {
    const t = obTemplates();
    const tpl = t[p.warmth] || t.cold;
    return tpl.replace(/\{שם\}/g, obFirstName(p.full_name));
}

async function obCopyPhone(userId) {
    const p = obData?.find(x => x.id === userId);
    if (!p?.phone) { showToast('אין טלפון', 'error'); return; }
    try { await navigator.clipboard.writeText(p.phone); showToast('הטלפון הועתק', 'success'); }
    catch (_) { showToast(p.phone, 'success'); }
}

// === The action: open WhatsApp (ready message) + log the contact ===
function doOutreach(userId, customMsg) {
    const p = obData?.find(x => x.id === userId);
    if (!p) return;
    const num = obWaNumber(p.phone);
    if (!num) { showToast('אין מספר טלפון תקין', 'error'); return; }
    const msg = (customMsg != null) ? customMsg : obBuildMessage(p);
    // Open WhatsApp synchronously (avoids popup blocker), then log.
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
    obLogContact(userId, { undo: true });
}

async function obLogContact(userId, opts = {}) {
    const p = obData?.find(x => x.id === userId);
    if (!p) return;

    const prev = { contactCount: p.contactCount, lastContact: p.lastContact, stage: p.stage, notes: p.notes, contactedNow: p.contactedNow };
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

    if (opts.undo) obShowUndo(userId, prev, p.full_name);

    try {
        const { error } = await db.from('profiles').update(updates).eq('id', userId);
        if (error) throw error;
    } catch (err) {
        showToast('נשלח, אך לא נרשם במערכת: ' + err.message, 'error');
    }
}

// === Undo ===
let _obUndoTimer = null;
function obShowUndo(userId, prev, name) {
    const el = document.getElementById('ob-undo');
    const txt = document.getElementById('ob-undo-text');
    const btn = document.getElementById('ob-undo-btn');
    if (!el || !btn) return;
    txt.textContent = `נרשמה פנייה ל${obFirstName(name)}`;
    btn.onclick = () => { obUndoContact(userId, prev); obHideUndo(); };
    el.classList.add('show');
    clearTimeout(_obUndoTimer);
    _obUndoTimer = setTimeout(obHideUndo, 7000);
}
function obHideUndo() { document.getElementById('ob-undo')?.classList.remove('show'); }

async function obUndoContact(userId, prev) {
    const p = obData?.find(x => x.id === userId);
    if (!p) return;
    p.contactCount = prev.contactCount; p.lastContact = prev.lastContact;
    p.stage = prev.stage; p.notes = prev.notes; p.contactedNow = prev.contactedNow;
    obRender();
    try {
        await db.from('profiles').update({
            sales_contact_count: prev.contactCount,
            sales_last_contact: prev.lastContact,
            sales_stage: prev.stage,
            sales_notes: prev.notes,
            sales_updated_at: new Date().toISOString(),
        }).eq('id', userId);
        showToast('הפנייה בוטלה', 'success');
    } catch (err) { showToast('שגיאה בביטול: ' + err.message, 'error'); }
}

// ============================================================
// Focus (blitz) mode — run through prospects one at a time
// ============================================================
let obFocusQueue = [];
let obFocusIdx = 0;
let obFocusSent = 0;

function obStartFocus(warmthKey) {
    if (!obData) return;
    let pool = [];
    const keys = warmthKey ? [warmthKey] : OB_ORDER;
    keys.forEach(k => { pool = pool.concat(obSortForOutreach(obColumnList(k)).filter(obVisible)); });
    pool = pool.filter(p => obWaNumber(p.phone)); // need a phone to outreach
    if (!pool.length) { showToast('אין למי לפנות בקבוצה הזו 🎉', 'success'); return; }

    obFocusQueue = pool.map(p => p.id);
    obFocusIdx = 0;
    obFocusSent = 0;
    document.getElementById('ob-focus')?.classList.add('open');
    document.addEventListener('keydown', obFocusKeys);
    obRenderFocus();
}

function obCloseFocus() {
    document.getElementById('ob-focus')?.classList.remove('open');
    document.removeEventListener('keydown', obFocusKeys);
    obRender();
}

function obFocusCurrent() {
    while (obFocusIdx < obFocusQueue.length) {
        const p = obData.find(x => x.id === obFocusQueue[obFocusIdx]);
        if (p) return p;
        obFocusIdx++;
    }
    return null;
}

function obRenderFocus() {
    const box = document.getElementById('ob-focus-box');
    if (!box) return;
    const p = obFocusCurrent();
    const total = obFocusQueue.length;

    if (!p) {
        box.innerHTML = `<div class="ob-state" style="padding:2.5rem 1rem;">
            <i class="fa-solid fa-circle-check" style="color:#22c55e;font-size:2.5rem;"></i>
            <h2 style="font-family:'Frank Ruhl Libre',serif;margin:0.5rem 0 0.25rem;">סיימת את הרשימה!</h2>
            <p style="margin:0;">פנית ל-${obFocusSent} אנשים בריצה הזו. כל הכבוד.</p>
            <button class="ob-btn ob-btn-primary" onclick="obCloseFocus()" style="margin-top:1.1rem;">סגור</button>
        </div>`;
        return;
    }

    const meta = OB_WARMTH[p.warmth] || OB_WARMTH.cold;
    const done = obFocusIdx;
    const pct = total ? Math.round((done / total) * 100) : 0;

    box.innerHTML = `
        <div class="ob-focus-top">
            <div class="ob-focus-prog">פנייה <b>${done + 1}</b> מתוך ${total} · נשלחו ${obFocusSent}</div>
            <button class="ob-btn ob-btn-ghost ob-icon-btn" onclick="obCloseFocus()" aria-label="סגור"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="ob-focus-bar"><i style="width:${pct}%"></i></div>
        <div class="ob-focus-person">
            <span class="ob-avatar" style="background:${meta.color};width:46px;height:46px;font-size:1.05rem;">${escapeHtml(obInitials(p.full_name))}</span>
            <div style="min-width:0;">
                <div class="name">${escapeHtml(p.full_name || 'ללא שם')}</div>
                <div class="ob-meta">
                    <span class="ob-chip" style="background:${meta.color}22;color:${meta.color};"><i class="fa-solid ${meta.icon}"></i> ${meta.label}</span>
                    <span class="phone" style="direction:ltr;">${escapeHtml(p.phone || '')}</span>
                    <span><i class="fa-solid fa-clock-rotate-left"></i> ${obContactLabel(p)}</span>
                </div>
            </div>
        </div>
        <textarea class="ob-focus-msg" id="ob-focus-msg" aria-label="תוכן ההודעה">${escapeHtml(obBuildMessage(p))}</textarea>
        <div class="ob-focus-hint">
            <span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> שלח והמשך</span>
            <span><kbd>S</kbd> דלג</span>
            <span><kbd>Esc</kbd> סגור</span>
        </div>
        <div class="ob-focus-actions">
            <button class="ob-btn ob-btn-wa" onclick="obFocusSend()"><i class="fa-brands fa-whatsapp"></i> שלח ופנה לבא</button>
            <button class="ob-btn ob-btn-ghost" onclick="obFocusSkip()"><i class="fa-solid fa-forward"></i> דלג</button>
            <button class="ob-btn ob-btn-ghost" onclick="obFocusNotRelevant()" title="סמן כלא רלוונטי"><i class="fa-solid fa-ban"></i></button>
        </div>
    `;
}

function obFocusSend() {
    const p = obFocusCurrent();
    if (!p) return;
    const msg = document.getElementById('ob-focus-msg')?.value ?? obBuildMessage(p);
    const num = obWaNumber(p.phone);
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
    obLogContact(p.id, { undo: false });   // no undo toast inside blitz (keeps flow clean)
    obFocusSent++;
    obFocusIdx++;
    obRenderFocus();
}
function obFocusSkip() { obFocusIdx++; obRenderFocus(); }
async function obFocusNotRelevant() {
    const p = obFocusCurrent();
    if (p) {
        p.stage = 'not_relevant';
        try { await db.from('profiles').update({ sales_stage: 'not_relevant', sales_updated_at: new Date().toISOString() }).eq('id', p.id); } catch (_) {}
    }
    obFocusIdx++;
    obRenderFocus();
}

function obFocusKeys(e) {
    if (e.key === 'Escape') { e.preventDefault(); obCloseFocus(); return; }
    const inMsg = document.activeElement?.id === 'ob-focus-msg';
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); obFocusSend(); return; }
    if (!inMsg && (e.key === 's' || e.key === 'S')) { e.preventDefault(); obFocusSkip(); }
}

// Open focus mode positioned on a single person (from a card click)
function obOpenFocusFor(userId) {
    if (!obData) return;
    obFocusQueue = [userId];
    obFocusIdx = 0;
    obFocusSent = 0;
    document.getElementById('ob-focus')?.classList.add('open');
    document.addEventListener('keydown', obFocusKeys);
    obRenderFocus();
}
