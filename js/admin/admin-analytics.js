// admin-analytics.js — GA4 Analytics: load, render, cache

async function loadGA4Analytics() {
    // Use cache if fresh
    if (ga4Cache && (Date.now() - ga4CacheTime) < GA4_CACHE_TTL) {
        renderGA4Data(ga4Cache);
        return;
    }

    try {
        const { data: { session } } = await db.auth.getSession();
        const token = session?.access_token;
        if (!token) {
            showGA4Error('לא מחובר — יש להתחבר מחדש');
            return;
        }

        const functionsUrl = window.SUPABASE_CONFIG?.functionsUrl || 'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1';
        const res = await fetch(`${functionsUrl}/ga4-analytics`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(15000)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        ga4Cache = data;
        ga4CacheTime = Date.now();
        renderGA4Data(data);
    } catch (err) {
        /* GA4 load error handled by UI */
        showGA4Error(err.message);
    }
}

function renderGA4Data(data) {
    // Top stat cards
    const u = data.users;
    setText('ga4-active-today', u.today.activeUsers);
    setText('ga4-new-today', u.today.newUsers);
    setText('ga4-active-30d', u.last30days.activeUsers.toLocaleString());
    setText('ga4-new-30d', u.last30days.newUsers.toLocaleString());

    // Free content
    const fc = data.free_content;
    setText('ga4-content-views', fc.totalViews.toLocaleString());

    // Total sessions
    const ts = data.traffic_sources;
    setText('ga4-total-sessions', ts.totalSessions.toLocaleString());

    // Traffic sources table
    const channelsTbody = document.getElementById('ga4-channels-table');
    if (ts.channels.length === 0) {
        channelsTbody.innerHTML = '<tr><td colspan="4" class="empty-state">אין נתוני תנועה</td></tr>';
    } else {
        const channelMap = {
            'Organic Search':  { name: 'חיפוש בגוגל',         color: '#22c55e', tip: 'מישהו חיפש בגוגל ומצא את האתר' },
            'Direct':          { name: 'ישיר (הקלידו כתובת)', color: '#ef4444', tip: 'נכנסו ישירות — או שהקישור לא מסומן' },
            'Organic Social':  { name: 'רשתות חברתיות',       color: '#3b82f6', tip: 'הגיעו מפייסבוק, אינסטגרם, טיקטוק וכו\'' },
            'Referral':        { name: 'קישור מאתר אחר',      color: '#a855f7', tip: 'לחצו על קישור באתר אחר שמפנה לכאן' },
            'Paid Search':     { name: 'פרסום בגוגל (ממומן)',  color: '#f59e0b', tip: 'לחצו על מודעה ממומנת בגוגל' },
            'Paid Social':     { name: 'פרסום ברשתות (ממומן)', color: '#ec4899', tip: 'לחצו על מודעה ממומנת ברשתות חברתיות' },
            'Email':           { name: 'אימייל',              color: '#06b6d4', tip: 'לחצו על קישור בתוך אימייל' },
            'Unassigned':      { name: 'לא ידוע',             color: '#6b7280', tip: 'גוגל לא הצליח לזהות את המקור' },
        };
        channelsTbody.innerHTML = ts.channels.map(ch => {
            const info = channelMap[ch.channel] || { name: ch.channel, color: 'var(--text-secondary)', tip: '' };
            return `<tr title="${info.tip}">
                <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${info.color};margin-left:0.5rem;"></span>${info.name}</td>
                <td><strong>${ch.sessions.toLocaleString()}</strong></td>
                <td>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <div style="flex:1;background:var(--bg);border-radius:4px;height:6px;overflow:hidden;">
                            <div style="height:100%;width:${ch.percentage}%;background:${info.color};border-radius:4px;"></div>
                        </div>
                        <span style="font-size:0.8rem;min-width:30px;">${ch.percentage}%</span>
                    </div>
                </td>
                <td>${ch.newUsers}</td>
            </tr>`;
        }).join('');

        // Show Direct/Unassigned tip if needed
        const directPct = ts.channels
            .filter(c => c.channel === 'Direct' || c.channel === 'Unassigned')
            .reduce((sum, c) => sum + c.percentage, 0);
        const directThreshold = parseInt(getDashboardSettings().directWarning) || 50;
        const tipEl = document.getElementById('ga4-direct-tip');
        if (tipEl) tipEl.style.display = directPct >= directThreshold ? 'block' : 'none';
    }

    // Detailed sources table
    const ds = data.detailed_sources;
    const sourcesTbody = document.getElementById('ga4-sources-table');
    if (ds && ds.sources && ds.sources.length > 0) {
        const sourceNameMap = {
            'google': { name: 'גוגל', icon: 'fa-brands fa-google', color: '#4285F4' },
            'youtube': { name: 'יוטיוב', icon: 'fa-brands fa-youtube', color: '#FF0000' },
            'youtube.com': { name: 'יוטיוב', icon: 'fa-brands fa-youtube', color: '#FF0000' },
            'facebook': { name: 'פייסבוק', icon: 'fa-brands fa-facebook', color: '#1877F2' },
            'facebook.com': { name: 'פייסבוק', icon: 'fa-brands fa-facebook', color: '#1877F2' },
            'instagram': { name: 'אינסטגרם', icon: 'fa-brands fa-instagram', color: '#E4405F' },
            'l.facebook.com': { name: 'פייסבוק (קישור)', icon: 'fa-brands fa-facebook', color: '#1877F2' },
            'l.instagram.com': { name: 'אינסטגרם (קישור)', icon: 'fa-brands fa-instagram', color: '#E4405F' },
            'whatsapp': { name: 'ווטסאפ', icon: 'fa-brands fa-whatsapp', color: '#25D366' },
            'linkedin': { name: 'לינקדאין', icon: 'fa-brands fa-linkedin', color: '#0A66C2' },
            'tiktok': { name: 'טיקטוק', icon: 'fa-brands fa-tiktok', color: '#000000' },
            't.co': { name: 'טוויטר/X', icon: 'fa-brands fa-x-twitter', color: '#000000' },
            '(direct)': { name: 'ישיר', icon: 'fa-solid fa-link', color: '#6b7280' },
            '(not set)': { name: 'לא ידוע', icon: 'fa-solid fa-question', color: '#9ca3af' },
        };
        const mediumMap = {
            'organic': 'אורגני',
            'social': 'רשת חברתית',
            'cpc': 'ממומן (קליק)',
            'cpm': 'ממומן (חשיפות)',
            'referral': 'הפניה',
            'email': 'אימייל',
            '(none)': 'ישיר',
            '(not set)': '—',
        };
        sourcesTbody.innerHTML = ds.sources.map(s => {
            const info = sourceNameMap[s.source.toLowerCase()] || { name: s.source, icon: 'fa-solid fa-globe', color: 'var(--text-secondary)' };
            const mediumHe = mediumMap[s.medium] || s.medium;
            return `<tr>
                <td><i class="${info.icon}" style="color:${info.color};margin-left:0.4rem;font-size:0.9rem;"></i> ${info.name}</td>
                <td><span style="font-size:0.75rem;background:var(--bg);padding:2px 8px;border-radius:10px;">${mediumHe}</span></td>
                <td><strong>${s.sessions.toLocaleString()}</strong></td>
                <td>${s.users.toLocaleString()}</td>
            </tr>`;
        }).join('');
    } else if (sourcesTbody) {
        sourcesTbody.innerHTML = '<tr><td colspan="4" class="empty-state">אין נתונים מפורטים</td></tr>';
    }

    // Page path → Hebrew name mapping
    const pageNameMap = {
        '/': 'דף הבית',
        '/index.html': 'דף הבית',
        '/landing-patient.html': 'נחיתה — מטופלים',
        '/landing-therapist.html': 'נחיתה — הכשרת מטפלים',
        '/patient-onboarding.html': 'הרשמת מטופל',
        '/therapist-onboarding.html': 'הרשמת מטפל',
        '/patient-dashboard.html': 'אזור אישי — מטופל',
        '/therapist-dashboard.html': 'אזור אישי — מטפל',
        '/legal-gate.html': 'שער משפטי',
        '/thank-you.html': 'דף תודה',
        '/privacy-policy.html': 'מדיניות פרטיות',
        '/catalog.html': 'קטלוג',
        '/pages/admin.html': 'פאנל ניהול',
        '/pages/login.html': 'התחברות',
        '/pages/course-library.html': 'ספריית הקורסים',
        '/pages/free-portal.html': 'פורטל חינמי',
        '/pages/learning-master.html': 'פורטל הלמידה',
        '/pages/profile.html': 'אזור אישי',
        '/pages/about.html': 'המיזם החברתי',
        '/pages/patient-step1.html': 'הרשמת מטופל — שלב 1',
        '/pages/patient-step2.html': 'הרשמת מטופל — שלב 2',
        '/pages/patient-step3.html': 'הרשמת מטופל — שלב 3',
        '/pages/patient-step4.html': 'הרשמת מטופל — שלב 4',
        '/pages/therapist-step1.html': 'הרשמת מטפל — שלב 1',
        '/pages/therapist-step2.html': 'הרשמת מטפל — שלב 2',
        '/pages/therapist-step3.html': 'הרשמת מטפל — שלב 3',
        '/pages/therapist-step4.html': 'הרשמת מטפל — שלב 4',
    };

    function getPageHebrew(path, title) {
        return pageNameMap[path] || pageNameMap[path.replace(/\/$/, '')] || title || path;
    }

    // Free content pages table
    const pagesTbody = document.getElementById('ga4-pages-table');
    if (fc.pages.length === 0) {
        pagesTbody.innerHTML = '<tr><td colspan="3" class="empty-state">אין נתוני צפיות</td></tr>';
    } else {
        pagesTbody.innerHTML = fc.pages.map(p => {
            return `<tr>
                <td title="${p.path}">${getPageHebrew(p.path, p.title)}</td>
                <td><strong>${p.views.toLocaleString()}</strong></td>
                <td>${p.users}</td>
            </tr>`;
        }).join('');
    }

    // All pages table
    const allPages = data.all_pages || { pages: [] };
    const allPagesTbody = document.getElementById('ga4-all-pages-table');
    if (allPages.pages.length === 0) {
        allPagesTbody.innerHTML = '<tr><td colspan="4" class="empty-state">אין נתוני צפיות</td></tr>';
    } else {
        const maxPages = parseInt(getDashboardSettings().maxPages) || 20;
        allPagesTbody.innerHTML = allPages.pages.slice(0, maxPages).map(p => {
            const shortPath = p.path.length > 30 ? '...' + p.path.slice(-27) : p.path;
            return `<tr>
                <td><strong>${getPageHebrew(p.path, p.title)}</strong></td>
                <td style="font-size:0.8rem;color:var(--text-secondary);direction:ltr;text-align:right;" title="${p.path}">${shortPath}</td>
                <td><strong>${p.views.toLocaleString()}</strong></td>
                <td>${p.users}</td>
            </tr>`;
        }).join('');
    }

    // Daily trend table
    const dailyTbody = document.getElementById('ga4-daily-table');
    const trendDays = parseInt(getDashboardSettings().trendDays) || 7;
    const daily = (u.daily || []).slice(0, trendDays);
    if (daily.length === 0) {
        dailyTbody.innerHTML = '<tr><td colspan="4" class="empty-state">אין נתונים יומיים</td></tr>';
    } else {
        dailyTbody.innerHTML = daily.map((d, i) => {
            const prev = daily[i + 1];
            let trend = '';
            if (prev) {
                const diff = d.activeUsers - prev.activeUsers;
                if (diff > 0) trend = `<span style="color:var(--success);"><i class="fa-solid fa-arrow-up"></i> +${diff}</span>`;
                else if (diff < 0) trend = `<span style="color:var(--danger);"><i class="fa-solid fa-arrow-down"></i> ${diff}</span>`;
                else trend = `<span style="color:var(--text-secondary);">—</span>`;
            }
            const dayName = new Date(d.date).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' });
            return `<tr>
                <td>${dayName}</td>
                <td><strong>${d.activeUsers}</strong></td>
                <td>${d.newUsers}</td>
                <td>${trend}</td>
            </tr>`;
        }).join('');
    }
}

function showGA4Error(msg) {
    const tables = ['ga4-channels-table', 'ga4-sources-table', 'ga4-pages-table', 'ga4-all-pages-table', 'ga4-daily-table'];
    const cols = [4, 3, 4, 4];
    tables.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<tr><td colspan="${cols[i]}" style="text-align:center;padding:2rem;color:var(--danger);">
            <i class="fa-solid fa-circle-exclamation"></i> ${msg}
        </td></tr>`;
    });
}
