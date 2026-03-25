// admin-referrals.js — Referral/Ambassador program analytics

let refCache = null;
let refCacheTime = 0;
const REF_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadReferralAnalytics() {
    if (refCache && (Date.now() - refCacheTime) < REF_CACHE_TTL) {
        renderReferralData(refCache);
        return;
    }

    try {
        const [allReferrals, leaderboard] = await Promise.all([
            db.from('referrals').select('id, referrer_id, referred_user_id, created_at'),
            db.from('referral_leaderboard').select('*')
        ]);

        // Get profile names for all involved users
        const allUserIds = new Set();
        (allReferrals.data || []).forEach(r => {
            allUserIds.add(r.referrer_id);
            allUserIds.add(r.referred_user_id);
        });

        let nameMap = {};
        if (allUserIds.size > 0) {
            const { data: profiles } = await db.from('profiles')
                .select('id, full_name, email')
                .in('id', [...allUserIds]);
            (profiles || []).forEach(p => {
                nameMap[p.id] = p.full_name || p.email || p.id.slice(0, 8);
            });
        }

        refCache = {
            referrals: allReferrals.data || [],
            leaderboard: leaderboard.data || [],
            nameMap
        };
        refCacheTime = Date.now();
        renderReferralData(refCache);
    } catch (err) {
        console.error('Referral analytics error:', err);
    }
}

function renderReferralData({ referrals, leaderboard, nameMap }) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);

    const total = referrals.length;
    const last30 = referrals.filter(r => new Date(r.created_at) >= thirtyDaysAgo).length;
    const last7 = referrals.filter(r => new Date(r.created_at) >= sevenDaysAgo).length;
    const today = referrals.filter(r => r.created_at.slice(0, 10) === todayStr).length;
    const uniqueReferrers = new Set(referrals.map(r => r.referrer_id)).size;

    setText('ref-total', total);
    setText('ref-30d', last30);
    setText('ref-7d', last7);
    setText('ref-today', today);
    setText('ref-unique', uniqueReferrers);

    // Update sidebar badge
    const badge = document.getElementById('ref-total-badge');
    if (badge) {
        badge.textContent = total;
        badge.style.display = total > 0 ? '' : 'none';
    }

    // Render leaderboard
    renderRefLeaderboard(leaderboard, nameMap);

    // Render recent referrals
    renderRecentReferrals(referrals, nameMap);
}

function renderRefLeaderboard(leaderboard, nameMap) {
    const container = document.getElementById('ref-leaderboard-table');
    if (!container) return;

    if (!leaderboard || leaderboard.length === 0) {
        container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:1rem;">עדיין אין נתונים — היו הראשונים!</p>';
        return;
    }

    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    let html = `<table style="width:100%;border-collapse:collapse;">
        <thead>
            <tr style="border-bottom:2px solid var(--border);">
                <th style="text-align:right;padding:0.6rem;color:var(--text-secondary);font-weight:600;">#</th>
                <th style="text-align:right;padding:0.6rem;color:var(--text-secondary);font-weight:600;">שם</th>
                <th style="text-align:center;padding:0.6rem;color:var(--text-secondary);font-weight:600;">הפניות</th>
                <th style="text-align:right;padding:0.6rem;color:var(--text-secondary);font-weight:600;">אחרון</th>
            </tr>
        </thead>
        <tbody>`;

    leaderboard.forEach((row, i) => {
        const medal = i < 3 ? medals[i] : (i + 1);
        const name = row.referrer_name || nameMap[row.referrer_id] || row.referrer_id?.slice(0, 8);
        const lastDate = row.last_referral_at ? formatDate(row.last_referral_at) : '-';
        const bgStyle = i < 3 ? 'background:rgba(212,175,55,0.06);' : '';

        html += `<tr style="border-bottom:1px solid var(--border);${bgStyle}">
            <td style="padding:0.6rem;font-size:1.1rem;">${medal}</td>
            <td style="padding:0.6rem;font-weight:${i < 3 ? '700' : '400'};">${escapeHtml(name)}</td>
            <td style="padding:0.6rem;text-align:center;font-weight:700;color:var(--gold);">${row.referral_count}</td>
            <td style="padding:0.6rem;font-size:0.85rem;color:var(--text-secondary);">${lastDate}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderRecentReferrals(referrals, nameMap) {
    const container = document.getElementById('ref-recent-list');
    if (!container) return;

    if (!referrals || referrals.length === 0) {
        container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:1rem;">אין הפניות עדיין</p>';
        return;
    }

    // Sort by date descending
    const sorted = [...referrals].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Group by date
    const groups = groupByDate(sorted);
    let html = '';

    for (const [groupName, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        const icon = dateGroupIcons[groupName] || 'fa-calendar';
        html += `<div style="margin-bottom:0.5rem;">
            <div style="font-weight:600;font-size:0.85rem;color:var(--text-secondary);padding:0.4rem 0;display:flex;align-items:center;gap:0.4rem;">
                <i class="fa-solid ${icon}" style="color:var(--gold);"></i> ${groupName} (${items.length})
            </div>`;

        items.forEach(r => {
            const referrerName = nameMap[r.referrer_id] || r.referrer_id?.slice(0, 8);
            const referredName = nameMap[r.referred_user_id] || r.referred_user_id?.slice(0, 8);
            const time = new Date(r.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

            html += `<div style="padding:0.5rem 0.8rem;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0.6rem;font-size:0.88rem;">
                <i class="fa-solid fa-arrow-right-arrow-left" style="color:var(--gold);font-size:0.75rem;"></i>
                <span style="font-weight:600;">${escapeHtml(referrerName)}</span>
                <span style="color:var(--text-secondary);">\u2192</span>
                <span>${escapeHtml(referredName)}</span>
                <span style="margin-right:auto;font-size:0.8rem;color:var(--text-secondary);">${time}</span>
            </div>`;
        });

        html += '</div>';
    }

    container.innerHTML = html;
}
