/**
 * NLP Game Leaderboard Module
 * Self-contained IIFE — exports window.NLPLeaderboard
 */
(function () {
    'use strict';

    // ─── Style Injection ───────────────────────────────────────
    let stylesInjected = false;

    function injectStyles() {
        if (stylesInjected) return;
        stylesInjected = true;

        const css = `
        /* ── Leaderboard Modal ── */
        .lb-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 20, 30, 0.7);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
            direction: rtl;
            font-family: 'Heebo', sans-serif;
        }
        .lb-overlay.lb-visible {
            opacity: 1;
            visibility: visible;
        }
        .lb-modal {
            background: #E8F1F2;
            border-radius: 16px;
            width: 94%;
            max-width: 500px;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0,0,0,0.4);
            transform: translateY(30px) scale(0.95);
            transition: transform 0.3s ease;
            overflow: hidden;
        }
        .lb-overlay.lb-visible .lb-modal {
            transform: translateY(0) scale(1);
        }

        /* Header */
        .lb-header {
            background: linear-gradient(135deg, #003B46 0%, #00606B 100%);
            padding: 1.2rem 1.5rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            color: #E8F1F2;
        }
        .lb-header-title {
            font-size: 1.3rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .lb-close-btn {
            background: rgba(255,255,255,0.15);
            border: none;
            color: #E8F1F2;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            font-size: 1.2rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        .lb-close-btn:hover {
            background: rgba(255,255,255,0.3);
        }

        /* Period Toggle */
        .lb-toggle-bar {
            display: flex;
            gap: 0;
            padding: 0.8rem 1rem 0;
            background: #E8F1F2;
        }
        .lb-toggle-btn {
            flex: 1;
            padding: 0.55rem 0.8rem;
            border: 2px solid #003B46;
            background: transparent;
            color: #003B46;
            font-family: 'Heebo', sans-serif;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .lb-toggle-btn:first-child {
            border-radius: 0 8px 8px 0;
            border-left: 1px solid #003B46;
        }
        .lb-toggle-btn:last-child {
            border-radius: 8px 0 0 8px;
            border-right: 1px solid #003B46;
        }
        .lb-toggle-btn.lb-active {
            background: #003B46;
            color: #E8F1F2;
        }

        /* Table Container */
        .lb-table-wrap {
            flex: 1;
            overflow-y: auto;
            padding: 0.5rem 1rem 1rem;
        }
        .lb-table {
            width: 100%;
            border-collapse: collapse;
        }
        .lb-table th {
            background: #003B46;
            color: #E8F1F2;
            padding: 0.6rem 0.5rem;
            font-size: 0.8rem;
            font-weight: 600;
            text-align: center;
            position: sticky;
            top: 0;
            z-index: 2;
        }
        .lb-table th:first-child { border-radius: 0 8px 0 0; }
        .lb-table th:last-child { border-radius: 8px 0 0 0; }

        .lb-table td {
            padding: 0.6rem 0.5rem;
            text-align: center;
            font-size: 0.85rem;
            border-bottom: 1px solid rgba(0,59,70,0.1);
            color: #003B46;
        }
        .lb-table tr {
            transition: background 0.15s;
        }
        .lb-table tbody tr:hover {
            background: rgba(0,59,70,0.05);
        }

        /* Rank column styling */
        .lb-rank { font-weight: 700; font-size: 1rem; min-width: 40px; }
        .lb-name { text-align: right !important; font-weight: 500; }
        .lb-xp { font-weight: 700; color: #D4AF37; }

        /* Top 3 */
        .lb-row-1 {
            background: linear-gradient(90deg, rgba(212,175,55,0.15) 0%, rgba(212,175,55,0.05) 100%) !important;
        }
        .lb-row-1 .lb-rank { color: #D4AF37; }
        .lb-row-2 {
            background: rgba(192,192,192,0.1) !important;
        }
        .lb-row-2 .lb-rank { color: #8e8e8e; }
        .lb-row-3 {
            background: rgba(176,141,87,0.08) !important;
        }
        .lb-row-3 .lb-rank { color: #b08d57; }

        /* Current user highlight */
        .lb-row-me {
            background: linear-gradient(90deg, rgba(212,175,55,0.25) 0%, rgba(212,175,55,0.1) 100%) !important;
            border: 2px solid #D4AF37;
            border-radius: 8px;
        }
        .lb-row-me td { font-weight: 700; }

        /* My rank footer */
        .lb-my-rank {
            background: #003B46;
            color: #E8F1F2;
            padding: 0.8rem 1.2rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 0.9rem;
            font-weight: 600;
        }
        .lb-my-rank-num {
            color: #D4AF37;
            font-size: 1.1rem;
            font-weight: 700;
        }

        /* Empty state */
        .lb-empty {
            text-align: center;
            padding: 3rem 1rem;
            color: #003B46;
        }
        .lb-empty-icon { font-size: 3rem; margin-bottom: 1rem; }
        .lb-empty-text { font-size: 1rem; font-weight: 500; }

        /* Loading */
        .lb-loading {
            text-align: center;
            padding: 3rem 1rem;
            color: #00606B;
            font-size: 0.95rem;
        }
        .lb-spinner {
            width: 36px; height: 36px;
            border: 3px solid rgba(0,59,70,0.2);
            border-top-color: #D4AF37;
            border-radius: 50%;
            animation: lb-spin 0.8s linear infinite;
            margin: 0 auto 1rem;
        }
        @keyframes lb-spin { to { transform: rotate(360deg); } }

        /* ── Floating Button ── */
        .lb-fab {
            position: fixed;
            bottom: 24px;
            left: 24px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, #D4AF37 0%, #E8C84A 100%);
            border: none;
            box-shadow: 0 4px 16px rgba(212,175,55,0.4);
            cursor: pointer;
            z-index: 9000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.6rem;
            transition: transform 0.2s, box-shadow 0.2s;
            animation: lb-pulse 2s ease-in-out infinite;
        }
        .lb-fab:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 24px rgba(212,175,55,0.6);
        }
        @keyframes lb-pulse {
            0%, 100% { box-shadow: 0 4px 16px rgba(212,175,55,0.4); }
            50% { box-shadow: 0 4px 24px rgba(212,175,55,0.7); }
        }

        /* Rank badge on FAB */
        .lb-fab-badge {
            position: absolute;
            top: -4px;
            right: -4px;
            background: #003B46;
            color: #E8F1F2;
            font-size: 0.65rem;
            font-weight: 700;
            min-width: 22px;
            height: 22px;
            border-radius: 11px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 4px;
            border: 2px solid #D4AF37;
            font-family: 'Heebo', sans-serif;
        }

        /* Toast for rank improvement */
        .lb-toast {
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            background: linear-gradient(135deg, #003B46 0%, #00606B 100%);
            color: #E8F1F2;
            padding: 0.7rem 1.4rem;
            border-radius: 12px;
            font-size: 0.9rem;
            font-weight: 600;
            font-family: 'Heebo', sans-serif;
            z-index: 10001;
            opacity: 0;
            transition: all 0.3s ease;
            pointer-events: none;
            white-space: nowrap;
            border: 1px solid #D4AF37;
            direction: rtl;
        }
        .lb-toast.lb-toast-show {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        /* Responsive */
        @media (max-width: 640px) {
            .lb-modal { width: 100%; max-width: 100%; border-radius: 16px 16px 0 0; max-height: 90vh; }
            .lb-overlay { align-items: flex-end; }
            .lb-fab { bottom: 16px; left: 16px; width: 52px; height: 52px; font-size: 1.3rem; }
            .lb-table td, .lb-table th { padding: 0.5rem 0.3rem; font-size: 0.78rem; }
        }
        `;

        const style = document.createElement('style');
        style.id = 'nlp-leaderboard-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ─── Leaderboard Manager ───────────────────────────────────
    const LeaderboardManager = {
        _overlay: null,
        _fab: null,
        _toast: null,
        _currentPeriod: 'all',
        _currentUserId: null,
        _cachedRank: null,
        _isOpen: false,

        init() {
            injectStyles();

            // Build overlay
            this._overlay = document.createElement('div');
            this._overlay.className = 'lb-overlay';
            this._overlay.innerHTML = `
                <div class="lb-modal">
                    <div class="lb-header">
                        <div class="lb-header-title"><span>&#127942;</span> טבלת המובילים</div>
                        <button class="lb-close-btn" aria-label="סגור">&#10005;</button>
                    </div>
                    <div class="lb-toggle-bar">
                        <button class="lb-toggle-btn lb-active" data-period="all">כל הזמנים</button>
                        <button class="lb-toggle-btn" data-period="weekly">השבוע האחרון</button>
                    </div>
                    <div class="lb-table-wrap">
                        <div class="lb-body"></div>
                    </div>
                    <div class="lb-my-rank" style="display:none;"></div>
                </div>
            `;
            document.body.appendChild(this._overlay);

            // Build FAB
            this._fab = document.createElement('button');
            this._fab.className = 'lb-fab';
            this._fab.setAttribute('aria-label', 'טבלת המובילים');
            this._fab.innerHTML = '&#127942;<span class="lb-fab-badge" style="display:none;"></span>';
            document.body.appendChild(this._fab);

            // Build toast
            this._toast = document.createElement('div');
            this._toast.className = 'lb-toast';
            document.body.appendChild(this._toast);

            // Events
            this._fab.addEventListener('click', () => this.show());
            this._overlay.querySelector('.lb-close-btn').addEventListener('click', () => this.hide());
            this._overlay.addEventListener('click', (e) => {
                if (e.target === this._overlay) this.hide();
            });
            this._overlay.querySelectorAll('.lb-toggle-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._overlay.querySelectorAll('.lb-toggle-btn').forEach(b => b.classList.remove('lb-active'));
                    btn.classList.add('lb-active');
                    this._currentPeriod = btn.dataset.period;
                    this._loadAndRender();
                });
            });

            // Detect current user
            this._detectUser();

            // Initial rank fetch (silent)
            setTimeout(() => this._updateFabBadge(), 2000);
        },

        async _detectUser() {
            try {
                if (!window.supabaseClient) return;
                const { data } = await window.supabaseClient.auth.getUser();
                if (data && data.user) {
                    this._currentUserId = data.user.id;
                }
            } catch (_) { /* guest mode */ }
        },

        // ─── Sync Score ───
        async syncScore(playerData) {
            if (!window.supabaseClient || !this._currentUserId) return;

            try {
                const lessonsCount = playerData.completedLessons
                    ? Object.keys(playerData.completedLessons).length
                    : 0;

                // Get display name from profile or email
                let displayName = 'שחקן אנונימי';
                try {
                    const { data: profile } = await window.supabaseClient
                        .from('profiles')
                        .select('full_name')
                        .eq('id', this._currentUserId)
                        .single();
                    if (profile && profile.full_name) {
                        displayName = profile.full_name;
                    }
                } catch (_) { /* use default */ }

                const row = {
                    user_id: this._currentUserId,
                    display_name: displayName,
                    total_xp: playerData.xp || 0,
                    level: playerData.level || 1,
                    lessons_completed: lessonsCount,
                    current_streak: playerData.streak || 0,
                    best_streak: playerData.bestStreak || 0,
                    last_active: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

                await window.supabaseClient
                    .from('nlp_game_leaderboard')
                    .upsert(row, { onConflict: 'user_id' });
            } catch (err) {
                console.warn('[Leaderboard] syncScore error:', err);
            }
        },

        // ─── Fetch Leaderboard ───
        async fetchLeaderboard(period) {
            if (!window.supabaseClient) return [];
            try {
                let query = window.supabaseClient
                    .from('nlp_game_leaderboard')
                    .select('*')
                    .order('total_xp', { ascending: false })
                    .limit(20);

                if (period === 'weekly') {
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    query = query.gte('updated_at', weekAgo.toISOString());
                }

                const { data, error } = await query;
                if (error) throw error;

                return (data || []).map((row, i) => ({
                    ...row,
                    rank: i + 1
                }));
            } catch (err) {
                console.warn('[Leaderboard] fetch error:', err);
                return [];
            }
        },

        // ─── Get Player Rank ───
        async getPlayerRank(userId) {
            if (!window.supabaseClient || !userId) return null;
            try {
                // Get user's XP
                const { data: me } = await window.supabaseClient
                    .from('nlp_game_leaderboard')
                    .select('total_xp')
                    .eq('user_id', userId)
                    .single();

                if (!me) return null;

                // Count how many have higher XP
                const { count } = await window.supabaseClient
                    .from('nlp_game_leaderboard')
                    .select('*', { count: 'exact', head: true })
                    .gt('total_xp', me.total_xp);

                return (count || 0) + 1;
            } catch (_) {
                return null;
            }
        },

        // ─── Render Leaderboard ───
        renderLeaderboard(data, currentUserId) {
            const body = this._overlay.querySelector('.lb-body');
            const footer = this._overlay.querySelector('.lb-my-rank');

            if (!data || data.length === 0) {
                body.innerHTML = `
                    <div class="lb-empty">
                        <div class="lb-empty-icon">&#127942;</div>
                        <div class="lb-empty-text">היה הראשון בטבלת המובילים!</div>
                    </div>
                `;
                footer.style.display = 'none';
                return;
            }

            const rankIcon = (r) => {
                if (r === 1) return '&#128081;'; // crown
                if (r === 2) return '&#129352;'; // silver medal
                if (r === 3) return '&#129353;'; // bronze medal
                return r;
            };

            const userInTop = data.some(row => row.user_id === currentUserId);

            let rows = data.map(row => {
                const isMe = row.user_id === currentUserId;
                let rowClass = '';
                if (row.rank <= 3) rowClass = `lb-row-${row.rank}`;
                if (isMe) rowClass += ' lb-row-me';

                return `<tr class="${rowClass}">
                    <td class="lb-rank">${rankIcon(row.rank)}</td>
                    <td class="lb-name">${this._escapeHtml(row.display_name || 'שחקן אנונימי')}</td>
                    <td class="lb-xp">${(row.total_xp || 0).toLocaleString()}</td>
                    <td>${row.level || 1}</td>
                    <td>${row.current_streak || 0} &#128293;</td>
                </tr>`;
            }).join('');

            body.innerHTML = `
                <table class="lb-table">
                    <thead>
                        <tr>
                            <th>דירוג</th>
                            <th>שם</th>
                            <th>XP</th>
                            <th>רמה</th>
                            <th>רצף</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            `;

            // Show user's rank at bottom if not in top 20
            if (currentUserId && !userInTop) {
                this.getPlayerRank(currentUserId).then(rank => {
                    if (rank) {
                        footer.style.display = 'flex';
                        footer.innerHTML = `
                            <span>המיקום שלך:</span>
                            <span class="lb-my-rank-num">#${rank}</span>
                        `;
                    } else {
                        footer.style.display = 'none';
                    }
                });
            } else {
                footer.style.display = 'none';
            }
        },

        // ─── Show / Hide ───
        show() {
            this._isOpen = true;
            this._overlay.classList.add('lb-visible');
            this._loadAndRender();
        },

        hide() {
            this._isOpen = false;
            this._overlay.classList.remove('lb-visible');
        },

        async _loadAndRender() {
            const body = this._overlay.querySelector('.lb-body');
            body.innerHTML = '<div class="lb-loading"><div class="lb-spinner"></div>טוען טבלה...</div>';

            await this._detectUser();
            const data = await this.fetchLeaderboard(this._currentPeriod);
            this.renderLeaderboard(data, this._currentUserId);
        },

        // ─── FAB Badge ───
        async _updateFabBadge() {
            await this._detectUser();
            if (!this._currentUserId) return;

            const rank = await this.getPlayerRank(this._currentUserId);
            const badge = this._fab.querySelector('.lb-fab-badge');
            if (rank) {
                badge.textContent = '#' + rank;
                badge.style.display = 'flex';
                this._cachedRank = rank;
            }
        },

        // ─── Toast ───
        _showToast(msg) {
            this._toast.textContent = msg;
            this._toast.classList.add('lb-toast-show');
            setTimeout(() => this._toast.classList.remove('lb-toast-show'), 3500);
        },

        // ─── Utils ───
        _escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    };

    // ─── Public API ────────────────────────────────────────────

    async function onLessonComplete(playerData) {
        const oldRank = LeaderboardManager._cachedRank;

        await LeaderboardManager.syncScore(playerData);

        // Refresh leaderboard if open
        if (LeaderboardManager._isOpen) {
            LeaderboardManager._loadAndRender();
        }

        // Update badge and check for rank improvement
        await LeaderboardManager._updateFabBadge();
        const newRank = LeaderboardManager._cachedRank;

        if (oldRank && newRank && newRank < oldRank) {
            LeaderboardManager._showToast(`&#127881; עלית למקום #${newRank} בטבלת המובילים!`);
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => LeaderboardManager.init());
    } else {
        LeaderboardManager.init();
    }

    // Export
    window.NLPLeaderboard = {
        show: () => LeaderboardManager.show(),
        hide: () => LeaderboardManager.hide(),
        onLessonComplete: onLessonComplete,
        syncScore: (pd) => LeaderboardManager.syncScore(pd),
        getPlayerRank: (uid) => LeaderboardManager.getPlayerRank(uid),
        fetchLeaderboard: (p) => LeaderboardManager.fetchLeaderboard(p)
    };

})();
