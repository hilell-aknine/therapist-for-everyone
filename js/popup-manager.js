// ============================================================================
// PopupManager — Smart central popup/modal/toast orchestrator
// ============================================================================
// Categories:
//   critical  — auth, offline, cookie: bypass all limits, show immediately
//   engagement — questionnaire, share prompt: respect cooldown + daily limit
//   info       — toasts, notifications: lightweight, no queue limits
// ============================================================================
// v2 (migration 054-057):
//   - Anonymous event logging via session_id (unlocks guest popup analytics)
//   - trigger_event scanning: page_load, lesson_complete, login, signup
//   - trigger_min_lessons enforcement (from DB config, not hardcoded)
//   - A/B variant selection (sticky per session, via variant_group)
//   - Cross-device dismissal sync from popup_dismissals table
// ============================================================================

(function () {
    'use strict';

    const STORAGE_KEY = 'popup_history';
    const DAILY_RESET_KEY = 'popup_daily_reset';
    const SESSION_ID_KEY = 'popup_session_id';
    const VARIANT_KEY = 'popup_variant_choice';
    const DEFAULT_COOLDOWN_MS = 30 * 1000;      // 30s between non-critical popups
    const MAX_ENGAGEMENT_PER_DAY = 3;            // max engagement popups per day

    // --- Internal state ---
    const registry = {};       // { id: { priority, category, show, hide, condition, ... } }
    let activePopupId = null;  // currently showing popup id (or null)
    let queue = [];            // pending requests sorted by priority
    let processing = false;

    // Server-side popup config (loaded from popup_configs table)
    // Keyed by popup_id, merged with client registry at decision time
    let serverConfigs = {};
    let serverConfigsLoaded = false;

    // User context — set via setUser() when auth resolves
    let userContext = {
        isAuthenticated: false,
        role: null,        // e.g. 'admin', 'student_lead', 'paid_customer', 'therapist'
        lessonCount: 0     // number of completed lessons (populated from course_progress)
    };

    // --- Session ID for anonymous event logging ---
    function getOrCreateSessionId() {
        try {
            let sid = sessionStorage.getItem(SESSION_ID_KEY);
            if (!sid) {
                // Simple UUID v4 generator (no crypto dependency required but uses it if available)
                if (window.crypto && crypto.randomUUID) {
                    sid = crypto.randomUUID();
                } else {
                    sid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                        const r = Math.random() * 16 | 0;
                        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                    });
                }
                sessionStorage.setItem(SESSION_ID_KEY, sid);
            }
            return sid;
        } catch (e) {
            return null;
        }
    }

    // --- Audience matching ---
    function matchesAudience(targetAudience) {
        if (!targetAudience || targetAudience === 'all') return true;
        if (targetAudience === 'unauthenticated') return !userContext.isAuthenticated;
        if (targetAudience === 'authenticated') return userContext.isAuthenticated;
        if (targetAudience === 'free_user') return userContext.isAuthenticated && userContext.role !== 'paid_customer' && userContext.role !== 'admin';
        if (targetAudience === 'paid_customer') return userContext.role === 'paid_customer';
        if (targetAudience === 'admin') return userContext.role === 'admin';
        return true;
    }

    // --- Server config helpers ---
    function getServerConfig(popupId) {
        return serverConfigs[popupId] || null;
    }

    // Merge client registry with server config (server wins for trigger_event,
    // trigger_min_lessons, target_audience, status; client wins for show/hide funcs).
    function getMergedConfig(popupId) {
        const client = registry[popupId];
        const server = serverConfigs[popupId];
        if (!client && !server) return null;
        if (!server) return client;
        if (!client) return null; // server-only: no show func, cannot display
        return {
            ...client,
            serverStatus: server.status || (server.is_active ? 'live' : 'paused'),
            serverAudience: server.target_audience || client.targetAudience,
            cooldownMs: (server.cooldown_minutes > 0) ? server.cooldown_minutes * 60000 : client.cooldownMs,
            maxPerDay: server.max_per_day || client.maxPerDay,
            triggerEvent: server.trigger_event || 'manual',
            triggerMinLessons: server.trigger_min_lessons || 0,
            variantGroup: server.variant_group || null,
            variantLabel: server.variant_label || null,
            startDate: server.start_date || null,
            endDate: server.end_date || null
        };
    }

    // Check if schedule window allows display
    function inScheduleWindow(merged) {
        const now = Date.now();
        if (merged.startDate && new Date(merged.startDate).getTime() > now) return false;
        if (merged.endDate && new Date(merged.endDate).getTime() < now) return false;
        return true;
    }

    // --- LocalStorage helpers ---
    function loadHistory() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
        catch (e) { return {}; }
    }

    function saveHistory(h) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(h)); } catch (e) { /* full */ }
    }

    function getTodayStr() {
        return new Date().toISOString().slice(0, 10);
    }

    function resetDailyIfNeeded() {
        const today = getTodayStr();
        if (localStorage.getItem(DAILY_RESET_KEY) !== today) {
            const h = loadHistory();
            for (const id in h) {
                h[id].countToday = 0;
                h[id].dismissed = false;
            }
            saveHistory(h);
            localStorage.setItem(DAILY_RESET_KEY, today);
        }
    }

    function recordShow(id) {
        const h = loadHistory();
        if (!h[id]) h[id] = { lastShown: 0, countToday: 0, totalShown: 0, dismissed: false };
        h[id].lastShown = Date.now();
        h[id].countToday = (h[id].countToday || 0) + 1;
        h[id].totalShown = (h[id].totalShown || 0) + 1;
        saveHistory(h);
    }

    function recordDismiss(id) {
        const h = loadHistory();
        if (!h[id]) h[id] = { lastShown: 0, countToday: 0, totalShown: 0, dismissed: false };
        h[id].dismissed = true;
        h[id].lastDismissed = Date.now();
        saveHistory(h);
    }

    function getLastShownTime() {
        const h = loadHistory();
        let latest = 0;
        for (const id in h) {
            if (h[id].lastShown > latest) latest = h[id].lastShown;
        }
        return latest;
    }

    function getEngagementCountToday() {
        const h = loadHistory();
        let count = 0;
        for (const id in h) {
            const reg = registry[id];
            if (reg && reg.category === 'engagement') {
                count += (h[id].countToday || 0);
            }
        }
        return count;
    }

    // --- A/B variant selection (sticky per session) ---
    function loadVariantChoices() {
        try { return JSON.parse(sessionStorage.getItem(VARIANT_KEY)) || {}; }
        catch (e) { return {}; }
    }

    function saveVariantChoices(v) {
        try { sessionStorage.setItem(VARIANT_KEY, JSON.stringify(v)); } catch (e) { /* */ }
    }

    // For a popup requested to show, check if it belongs to a variant_group.
    // If yes, pick one popup from that group (sticky per session).
    // Returns the popup_id to actually show (may be different from requested id).
    function resolveVariant(popupId) {
        const merged = getMergedConfig(popupId);
        if (!merged || !merged.variantGroup) return popupId;

        const variantGroup = merged.variantGroup;
        const choices = loadVariantChoices();

        // Already picked for this group? Return the sticky choice.
        if (choices[variantGroup]) return choices[variantGroup];

        // Pick among all registered + server-active popups in this group
        const candidates = Object.keys(registry).filter(id => {
            const m = getMergedConfig(id);
            return m && m.variantGroup === variantGroup && m.serverStatus === 'live';
        });

        if (candidates.length === 0) return popupId;

        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        choices[variantGroup] = chosen;
        saveVariantChoices(choices);
        return chosen;
    }

    // --- Event logging (anonymous-friendly, async) ---
    function logEvent(popupId, eventType) {
        try {
            const sb = window.supabaseClient || window._supabaseClient;
            if (!sb) return;

            const merged = getMergedConfig(popupId);
            const variant = merged?.variantLabel || null;

            sb.auth.getUser().then(({ data }) => {
                const payload = {
                    popup_id: popupId,
                    event_type: eventType,
                    variant: variant
                };
                if (data?.user) {
                    payload.user_id = data.user.id;
                } else {
                    // Anonymous: attach session_id
                    const sid = getOrCreateSessionId();
                    if (!sid) return; // cannot log without session_id under new RLS
                    payload.session_id = sid;
                }
                sb.from('popup_events').insert([payload]).then(() => {}).catch(() => {});
            }).catch(() => {});
        } catch (e) { /* silent */ }
    }

    // --- Server config loading ---
    async function loadServerConfigs() {
        try {
            const sb = window.supabaseClient || window._supabaseClient;
            if (!sb) return;
            const { data, error } = await sb.from('popup_configs').select('*');
            if (error) return;
            const map = {};
            (data || []).forEach(c => { map[c.popup_id] = c; });
            serverConfigs = map;
            serverConfigsLoaded = true;

            // After load, scan for page_load triggered popups
            scanTriggered('page_load');
        } catch (e) { /* silent */ }
    }

    // --- Cross-device dismissal sync ---
    async function syncDismissalsFromServer() {
        try {
            const sb = window.supabaseClient || window._supabaseClient;
            if (!sb) return;
            const { data: userData } = await sb.auth.getUser();
            if (!userData?.user) return;

            // Fetch today's dismissals (Israel timezone via generated column)
            const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

            const { data, error } = await sb.from('popup_dismissals')
                .select('popup_id, dismissed_at')
                .eq('user_id', userData.user.id)
                .eq('dismissal_date', todayStr);
            if (error || !data) return;

            const h = loadHistory();
            data.forEach(row => {
                if (!h[row.popup_id]) h[row.popup_id] = { lastShown: 0, countToday: 0, totalShown: 0, dismissed: false };
                h[row.popup_id].dismissed = true;
                h[row.popup_id].lastDismissed = new Date(row.dismissed_at).getTime();
            });
            saveHistory(h);
        } catch (e) { /* silent */ }
    }

    async function persistDismissal(popupId) {
        try {
            const sb = window.supabaseClient || window._supabaseClient;
            if (!sb) return;
            const { data: userData } = await sb.auth.getUser();
            if (!userData?.user) return;
            sb.from('popup_dismissals').insert([{
                user_id: userData.user.id,
                popup_id: popupId
            }]).then(() => {}).catch(() => {});
        } catch (e) { /* silent */ }
    }

    // --- Queue processing ---
    function processQueue() {
        if (processing) return;
        processing = true;

        queue.sort((a, b) => {
            const pa = registry[a]?.priority || 99;
            const pb = registry[b]?.priority || 99;
            return pa - pb;
        });

        while (queue.length > 0) {
            const id = queue[0];
            const reg = registry[id];
            if (!reg) { queue.shift(); continue; }

            const merged = getMergedConfig(id) || reg;

            // Server status check (draft/paused/archived never show)
            if (merged.serverStatus && !['live', 'scheduled'].includes(merged.serverStatus)) {
                queue.shift();
                continue;
            }

            // Schedule window
            if (merged.startDate || merged.endDate) {
                if (!inScheduleWindow(merged)) {
                    queue.shift();
                    continue;
                }
            }

            // Audience check (server overrides client)
            const audience = merged.serverAudience || reg.targetAudience;
            if (!matchesAudience(audience)) {
                queue.shift();
                continue;
            }

            // trigger_min_lessons gating
            if (merged.triggerMinLessons > 0 && userContext.lessonCount < merged.triggerMinLessons) {
                queue.shift();
                continue;
            }

            // Critical popups can interrupt anything
            if (reg.category === 'critical') {
                if (activePopupId && registry[activePopupId]?.category === 'critical') break;
                if (activePopupId && registry[activePopupId]?.category !== 'critical') {
                    const activeReg = registry[activePopupId];
                    if (activeReg?.hide) { try { activeReg.hide(); } catch (e) { /* */ } }
                    activePopupId = null;
                }
                queue.shift();
                showPopup(id, reg);
                continue;
            }

            // Non-critical: wait if any popup is active
            if (activePopupId) break;

            // Cooldown
            const cooldown = reg.cooldownMs || DEFAULT_COOLDOWN_MS;
            const timeSinceLast = Date.now() - getLastShownTime();
            if (timeSinceLast < cooldown) {
                setTimeout(() => processQueue(), cooldown - timeSinceLast + 50);
                break;
            }

            // Engagement: daily limits
            if (reg.category === 'engagement') {
                const maxDay = reg.maxPerDay || MAX_ENGAGEMENT_PER_DAY;
                const h = loadHistory();
                const popupHistory = h[id] || {};

                if ((popupHistory.countToday || 0) >= maxDay) {
                    queue.shift();
                    continue;
                }
                if (getEngagementCountToday() >= MAX_ENGAGEMENT_PER_DAY) {
                    queue.shift();
                    continue;
                }
                if (popupHistory.dismissed) {
                    queue.shift();
                    continue;
                }
            }

            // Custom condition
            if (reg.condition && typeof reg.condition === 'function') {
                try {
                    if (!reg.condition()) { queue.shift(); continue; }
                } catch (e) { queue.shift(); continue; }
            }

            queue.shift();
            showPopup(id, reg);
        }

        processing = false;
    }

    function showPopup(id, reg) {
        activePopupId = id;
        recordShow(id);
        try {
            reg.show();
        } catch (e) {
            console.error('PopupManager: show() error for', id, e);
            activePopupId = null;
        }
        logEvent(id, 'shown');
    }

    // --- Trigger scanning ---
    // Called on lifecycle events (page_load, lesson_complete, login, signup).
    // Iterates server configs matching the event, requests eligible ones.
    function scanTriggered(triggerEvent) {
        if (!serverConfigsLoaded) return;
        Object.keys(serverConfigs).forEach(popupId => {
            const cfg = serverConfigs[popupId];
            if (!cfg.is_active) return;
            if ((cfg.status || 'live') !== 'live') return;
            if ((cfg.trigger_event || 'manual') !== triggerEvent) return;
            // Only request if client registered a show function for it
            if (!registry[popupId]) return;
            // Let normal queue processing enforce audience + min_lessons + cooldown
            publicRequest(popupId);
        });
    }

    function publicRequest(id) {
        if (!registry[id]) {
            console.warn('PopupManager: unknown popup', id);
            return;
        }
        if (queue.includes(id)) return;
        if (activePopupId === id) return;

        // Variant resolution: if the requested popup is in a variant_group,
        // swap to the sticky choice for this session.
        const resolvedId = resolveVariant(id);

        resetDailyIfNeeded();
        queue.push(resolvedId);
        processQueue();
    }

    // --- Public API ---
    window.PopupManager = {
        register(id, opts) {
            registry[id] = {
                priority: opts.priority || 5,
                category: opts.category || 'info',
                show: opts.show,
                hide: opts.hide || function () {},
                condition: opts.condition || null,
                cooldownMs: opts.cooldownMs || null,
                maxPerDay: opts.maxPerDay || null,
                targetAudience: opts.targetAudience || 'all'
            };
        },

        setUser(ctx) {
            const wasAuthenticated = userContext.isAuthenticated;
            userContext.isAuthenticated = !!ctx.isAuthenticated;
            userContext.role = ctx.role || null;
            if (typeof ctx.lessonCount === 'number') {
                userContext.lessonCount = ctx.lessonCount;
            }

            // Lifecycle hooks: on login transition, scan login triggers + sync dismissals
            if (!wasAuthenticated && userContext.isAuthenticated) {
                syncDismissalsFromServer().then(() => scanTriggered('login'));
            }
        },

        setLessonCount(n) {
            userContext.lessonCount = n || 0;
        },

        getUser() {
            return { ...userContext };
        },

        request: publicRequest,

        // Admin/programmatic hooks for lifecycle events
        notifyLessonComplete() {
            scanTriggered('lesson_complete');
        },

        notifySignup() {
            scanTriggered('signup');
        },

        dismiss(id) {
            recordDismiss(id);
            persistDismissal(id);
            logEvent(id, 'dismissed');
            if (activePopupId === id) {
                activePopupId = null;
                setTimeout(() => processQueue(), 200);
            }
        },

        close(id) {
            if (activePopupId === id) {
                activePopupId = null;
                setTimeout(() => processQueue(), 200);
            }
        },

        click(id) {
            logEvent(id, 'clicked');
        },

        isActive() {
            return activePopupId !== null;
        },

        getActiveId() {
            return activePopupId;
        },

        getHistory(id) {
            resetDailyIfNeeded();
            const h = loadHistory();
            return h[id] || { lastShown: 0, countToday: 0, totalShown: 0, dismissed: false };
        },

        reset() {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(DAILY_RESET_KEY);
            try { sessionStorage.removeItem(VARIANT_KEY); } catch (e) { /* */ }
            activePopupId = null;
            queue = [];
        },

        setActive(id) {
            activePopupId = id;
        },

        // Expose session id for debug/testing
        getSessionId() {
            return getOrCreateSessionId();
        },

        // Force a reload of server configs (admin dashboard triggers after edit)
        reloadServerConfigs() {
            return loadServerConfigs();
        }
    };

    // Init
    resetDailyIfNeeded();
    getOrCreateSessionId();

    // Defer server config load until supabase client is ready
    function initServerLoad() {
        if (window.supabaseClient || window._supabaseClient) {
            loadServerConfigs();
        } else {
            setTimeout(initServerLoad, 200);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initServerLoad);
    } else {
        initServerLoad();
    }

})();
