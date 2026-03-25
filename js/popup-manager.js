// ============================================================================
// PopupManager — Smart central popup/modal/toast orchestrator
// ============================================================================
// Categories:
//   critical  — auth, offline, cookie: bypass all limits, show immediately
//   engagement — questionnaire, share prompt: respect cooldown + daily limit
//   info       — toasts, notifications: lightweight, no queue limits
// ============================================================================

(function () {
    'use strict';

    const STORAGE_KEY = 'popup_history';
    const DAILY_RESET_KEY = 'popup_daily_reset';
    const DEFAULT_COOLDOWN_MS = 30 * 1000;      // 30s between non-critical popups
    const MAX_ENGAGEMENT_PER_DAY = 3;            // max engagement popups per day

    // --- Internal state ---
    const registry = {};       // { id: { priority, category, show, hide, condition, cooldownMs } }
    let activePopupId = null;  // currently showing popup id (or null)
    let queue = [];            // pending requests sorted by priority
    let processing = false;

    // --- LocalStorage helpers ---
    function loadHistory() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        } catch (e) { return {}; }
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

    // --- Queue processing ---
    function processQueue() {
        if (processing) return;
        processing = true;

        // Sort by priority (lower number = higher priority)
        queue.sort((a, b) => {
            const pa = registry[a]?.priority || 99;
            const pb = registry[b]?.priority || 99;
            return pa - pb;
        });

        while (queue.length > 0) {
            const id = queue[0];
            const reg = registry[id];
            if (!reg) { queue.shift(); continue; }

            // Critical popups can interrupt anything
            if (reg.category === 'critical') {
                // If another critical is active, wait
                if (activePopupId && registry[activePopupId]?.category === 'critical') {
                    break;
                }
                // Interrupt non-critical active popup
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

            // Check cooldown
            const cooldown = reg.cooldownMs || DEFAULT_COOLDOWN_MS;
            const timeSinceLast = Date.now() - getLastShownTime();
            if (timeSinceLast < cooldown) {
                // Schedule retry after cooldown
                setTimeout(() => processQueue(), cooldown - timeSinceLast + 50);
                break;
            }

            // Engagement: check daily limit
            if (reg.category === 'engagement') {
                const maxDay = reg.maxPerDay || MAX_ENGAGEMENT_PER_DAY;
                const h = loadHistory();
                const popupHistory = h[id] || {};

                // Per-popup daily limit
                if ((popupHistory.countToday || 0) >= maxDay) {
                    queue.shift();
                    continue;
                }

                // Global engagement daily limit
                if (getEngagementCountToday() >= MAX_ENGAGEMENT_PER_DAY) {
                    queue.shift();
                    continue;
                }

                // Was dismissed today? Skip
                if (popupHistory.dismissed) {
                    queue.shift();
                    continue;
                }
            }

            // Check custom condition
            if (reg.condition && typeof reg.condition === 'function') {
                try {
                    if (!reg.condition()) {
                        queue.shift();
                        continue;
                    }
                } catch (e) {
                    queue.shift();
                    continue;
                }
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
        // Log event to Supabase if available (async, fire-and-forget)
        logEvent(id, 'shown');
    }

    // --- Event logging (lightweight, async) ---
    function logEvent(popupId, eventType) {
        try {
            const sb = window.supabaseClient || window._supabaseClient;
            if (!sb) return;
            // Only log for authenticated users
            sb.auth.getUser().then(({ data }) => {
                if (!data?.user) return;
                sb.from('popup_events').insert([{
                    popup_id: popupId,
                    user_id: data.user.id,
                    event_type: eventType
                }]).then(() => {}).catch(() => {});
            }).catch(() => {});
        } catch (e) { /* silent */ }
    }

    // --- Public API ---
    window.PopupManager = {
        /**
         * Register a popup with the manager.
         * @param {string} id - Unique popup identifier
         * @param {Object} opts
         * @param {number} opts.priority - 1 (highest) to 5 (lowest)
         * @param {string} opts.category - 'critical' | 'engagement' | 'info'
         * @param {Function} opts.show - Function to display the popup
         * @param {Function} opts.hide - Function to hide the popup
         * @param {Function} [opts.condition] - Optional guard; return false to skip
         * @param {number} [opts.cooldownMs] - Custom cooldown in ms (default 30s)
         * @param {number} [opts.maxPerDay] - Max shows per day for this popup
         */
        register(id, opts) {
            registry[id] = {
                priority: opts.priority || 5,
                category: opts.category || 'info',
                show: opts.show,
                hide: opts.hide || function () {},
                condition: opts.condition || null,
                cooldownMs: opts.cooldownMs || null,
                maxPerDay: opts.maxPerDay || null
            };
        },

        /**
         * Request to show a popup. It enters the queue and is shown when rules allow.
         * @param {string} id - Registered popup id
         */
        request(id) {
            if (!registry[id]) {
                console.warn('PopupManager: unknown popup', id);
                return;
            }
            // Don't queue duplicates
            if (queue.includes(id)) return;
            // Don't re-request if already active
            if (activePopupId === id) return;

            resetDailyIfNeeded();
            queue.push(id);
            processQueue();
        },

        /**
         * Notify manager that user dismissed a popup.
         * @param {string} id
         */
        dismiss(id) {
            recordDismiss(id);
            logEvent(id, 'dismissed');
            if (activePopupId === id) {
                activePopupId = null;
                // Process next in queue after short delay
                setTimeout(() => processQueue(), 200);
            }
        },

        /**
         * Notify manager that a popup was closed (not by user dismiss, e.g., auto-close).
         * @param {string} id
         */
        close(id) {
            if (activePopupId === id) {
                activePopupId = null;
                setTimeout(() => processQueue(), 200);
            }
        },

        /**
         * Log a CTA click event for a popup.
         * @param {string} id
         */
        click(id) {
            logEvent(id, 'clicked');
        },

        /**
         * Check if any popup is currently showing.
         * @returns {boolean}
         */
        isActive() {
            return activePopupId !== null;
        },

        /**
         * Get the currently active popup id.
         * @returns {string|null}
         */
        getActiveId() {
            return activePopupId;
        },

        /**
         * Get show history for a popup.
         * @param {string} id
         * @returns {Object} { lastShown, countToday, totalShown, dismissed }
         */
        getHistory(id) {
            resetDailyIfNeeded();
            const h = loadHistory();
            return h[id] || { lastShown: 0, countToday: 0, totalShown: 0, dismissed: false };
        },

        /**
         * Clear all daily counters (for testing).
         */
        reset() {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(DAILY_RESET_KEY);
            activePopupId = null;
            queue = [];
        },

        /**
         * Force-set active popup (for existing popups that manage their own show/hide
         * but need to notify the manager of their state).
         * @param {string|null} id
         */
        setActive(id) {
            activePopupId = id;
        }
    };

    // Reset daily counters on load
    resetDailyIfNeeded();

})();
