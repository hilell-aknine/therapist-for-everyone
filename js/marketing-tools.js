// ============================================================================
// ATTRIBUTION CAPTURE — Professional traffic-source tracking
// ----------------------------------------------------------------------------
// Captures on EVERY page load:
//   - All 5 UTM params (source/medium/campaign/term/content)
//   - Click IDs: gclid (Google), fbclid (Meta), ttclid (TikTok), msclkid (Bing)
//   - document.referrer (domain only)
//   - landing page (pathname + query)
//   - FIRST touch (persistent — never overwritten after first capture)
//   - LAST touch (overwritten on every visit that has any signal)
//   - Session id (sessionStorage, per-tab)
//   - Device type + OS + browser + viewport + language + timezone
// ----------------------------------------------------------------------------
// Storage keys:
//   localStorage('attribution_first_touch')  — persistent, first known source
//   localStorage('attribution_last_touch')   — overwritten per visit
//   sessionStorage('attribution_session_id') — per tab/session
//   localStorage('utm_data')                 — LEGACY, still written for
//                                              backwards compat with old code
// ============================================================================

// Lightweight device parser — no external library
function parseDeviceFromUa(ua) {
    if (!ua) return { type: 'unknown', os: null, browser: null };
    const lower = ua.toLowerCase();

    // Device type
    let type = 'desktop';
    if (/ipad|tablet|playbook|silk/.test(lower)) type = 'tablet';
    else if (/mobi|iphone|ipod|android.*mobile|opera mini|windows phone|blackberry/.test(lower)) type = 'mobile';
    else if (/android/.test(lower)) type = 'tablet'; // Android without "Mobile" → tablet

    // OS
    let os = null;
    if (/windows nt/.test(lower)) os = 'Windows';
    else if (/iphone|ipad|ipod/.test(lower)) os = 'iOS';
    else if (/mac os x/.test(lower)) os = 'macOS';
    else if (/android/.test(lower)) os = 'Android';
    else if (/linux/.test(lower)) os = 'Linux';

    // Browser
    let browser = null;
    if (/edg\//.test(lower)) browser = 'Edge';
    else if (/opr\/|opera/.test(lower)) browser = 'Opera';
    else if (/firefox/.test(lower)) browser = 'Firefox';
    else if (/chrome|crios/.test(lower)) browser = 'Chrome';
    else if (/safari/.test(lower)) browser = 'Safari';

    return { type, os, browser };
}

function _extractDomain(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        const u = new URL(url);
        return u.hostname.replace(/^www\./, '') || null;
    } catch (e) { return null; }
}

// Build the "this touch" object from the current page load
// Normalize UTM source to consistent values (fb→facebook, ig→instagram)
function _normalizeSource(raw) {
    if (!raw) return null;
    const s = raw.toLowerCase().trim();
    const map = { 'fb': 'facebook', 'ig': 'instagram', 'meta': 'facebook' };
    return map[s] || s;
}

function _captureThisTouch() {
    const params = new URLSearchParams(window.location.search);
    return {
        utm_source:   _normalizeSource(params.get('utm_source')),
        utm_medium:   params.get('utm_medium')   || null,
        utm_campaign: params.get('utm_campaign') || null,
        utm_term:     params.get('utm_term')     || null,
        utm_content:  params.get('utm_content')  || null,
        gclid:        params.get('gclid')        || null,
        fbclid:       params.get('fbclid')       || null,
        ttclid:       params.get('ttclid')       || null,
        msclkid:      params.get('msclkid')      || null,
        referrer_domain: _extractDomain(document.referrer),
        landing_url: window.location.pathname + (window.location.search || ''),
        at: new Date().toISOString()
    };
}

function _touchHasAnySignal(t) {
    if (!t) return false;
    return !!(t.utm_source || t.utm_medium || t.utm_campaign || t.utm_term || t.utm_content ||
              t.gclid || t.fbclid || t.ttclid || t.msclkid || t.referrer_domain);
}

(function captureAttribution() {
    try {
        const touch = _captureThisTouch();

        // First-touch — write once, never overwrite (captures "where did they originally come from")
        let first = null;
        const firstRaw = localStorage.getItem('attribution_first_touch');
        if (firstRaw) {
            try { first = JSON.parse(firstRaw); } catch (e) { first = null; }
        }
        if (!first && _touchHasAnySignal(touch)) {
            localStorage.setItem('attribution_first_touch', JSON.stringify(touch));
        }

        // Last-touch — overwrite if this visit has any new signal,
        // otherwise leave the previous last-touch in place
        if (_touchHasAnySignal(touch)) {
            localStorage.setItem('attribution_last_touch', JSON.stringify(touch));
        }

        // Session id (per-tab)
        if (!sessionStorage.getItem('attribution_session_id')) {
            const sid = (crypto && crypto.randomUUID)
                ? crypto.randomUUID()
                : 'sid-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
            sessionStorage.setItem('attribution_session_id', sid);
        }

        // ─── LEGACY utm_data key — kept for backwards compat with old form code ──
        if (touch.utm_source || touch.utm_medium || touch.utm_campaign || touch.utm_content || touch.utm_term) {
            localStorage.setItem('utm_data', JSON.stringify({
                utm_source: touch.utm_source,
                utm_medium: touch.utm_medium,
                utm_campaign: touch.utm_campaign,
                utm_content: touch.utm_content,
                utm_term: touch.utm_term,
                captured_at: Date.now()
            }));
        } else {
            const existing = localStorage.getItem('utm_data');
            if (existing) {
                try {
                    const parsed = JSON.parse(existing);
                    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
                    if (Date.now() - parsed.captured_at > thirtyDays) {
                        localStorage.removeItem('utm_data');
                    }
                } catch (e) { /* ignore */ }
            }
        }

        // Referral link param (ambassador system — unchanged)
        const refParam = new URLSearchParams(window.location.search).get('ref');
        if (refParam && refParam.length > 10) {
            localStorage.setItem('referrer_data', JSON.stringify({
                referrer_id: refParam,
                captured_at: Date.now()
            }));
        }
    } catch (e) { /* Silent fail */ }
})();

// Return the full attribution payload for form submits.
// Shape matches what submit-lead Edge Function expects.
window.getFullAttribution = function () {
    try {
        let first = null, last = null;
        try { first = JSON.parse(localStorage.getItem('attribution_first_touch') || 'null'); } catch (e) {}
        try { last  = JSON.parse(localStorage.getItem('attribution_last_touch')  || 'null'); } catch (e) {}

        const device = parseDeviceFromUa(navigator.userAgent || '');
        const session_id = sessionStorage.getItem('attribution_session_id') || null;

        return {
            session_id,
            first: first || null,
            last:  last  || null,
            device_type:  device.type,
            os_name:      device.os,
            browser_name: device.browser,
            viewport_w:   window.innerWidth  || null,
            viewport_h:   window.innerHeight || null,
            language:     navigator.language || null,
            timezone:     (Intl && Intl.DateTimeFormat && Intl.DateTimeFormat().resolvedOptions().timeZone) || null,
            raw_ua:       navigator.userAgent || null
        };
    } catch (e) { return null; }
};

window.getReferrerId = function () {
    try {
        const raw = localStorage.getItem('referrer_data');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        if (Date.now() - parsed.captured_at > thirtyDays) {
            localStorage.removeItem('referrer_data');
            return null;
        }
        return parsed.referrer_id || null;
    } catch (e) { return null; }
};

window.clearReferrerId = function () {
    try { localStorage.removeItem('referrer_data'); } catch (e) { /* silent */ }
};

window.getUtmData = function () {
    try {
        const raw = localStorage.getItem('utm_data');
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        if (Date.now() - parsed.captured_at > thirtyDays) {
            localStorage.removeItem('utm_data');
            return {};
        }
        return {
            utm_source: parsed.utm_source || null,
            utm_medium: parsed.utm_medium || null,
            utm_campaign: parsed.utm_campaign || null,
            utm_content: parsed.utm_content || null,
            utm_term: parsed.utm_term || null
        };
    } catch (e) { return {}; }
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const MARKETING_CONFIG = {
    GA4_ID: 'G-6YN94QMSH1',
    META_PIXEL_ID: '1039436226809281',
    PRIVACY_POLICY_URL: 'privacy-policy.html',
    CONSENT_KEY: 'cookie_consent_v2',       // v2: stores consent level, not just boolean
    TRACKING_ENABLED: true
};

// ============================================================================
// COOKIE CONSENT MANAGEMENT (v2 — granular: 'all' | 'essential' | null)
// ============================================================================

function getConsentLevel() {
    return localStorage.getItem(MARKETING_CONFIG.CONSENT_KEY); // 'all', 'essential', or null
}

function hasUserConsented() {
    return getConsentLevel() === 'all';
}

function setUserConsent(level) {
    localStorage.setItem(MARKETING_CONFIG.CONSENT_KEY, level);
}

// Migrate v1 consent (boolean 'true') → v2 ('all')
(function migrateV1Consent() {
    if (localStorage.getItem('cookie_consent_approved') === 'true' && !localStorage.getItem(MARKETING_CONFIG.CONSENT_KEY)) {
        localStorage.setItem(MARKETING_CONFIG.CONSENT_KEY, 'all');
        localStorage.removeItem('cookie_consent_approved');
    }
})();

// ============================================================================
// TRACKING PIXEL INJECTION
// ============================================================================

function injectGoogleAnalytics() {
    if (MARKETING_CONFIG.GA4_ID === 'G-XXXXXXXXXX') return;
    const gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${MARKETING_CONFIG.GA4_ID}`;
    document.head.appendChild(gaScript);
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', MARKETING_CONFIG.GA4_ID);
}

function injectMetaPixel() {
    if (MARKETING_CONFIG.META_PIXEL_ID === '123456789') return;
    !function(f,b,e,v,n,t,s) {
        if(f.fbq) return;
        n = f.fbq = function() { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if(!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v;
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', MARKETING_CONFIG.META_PIXEL_ID);
    fbq('track', 'PageView');
}

function initializeTracking() {
    if (!MARKETING_CONFIG.TRACKING_ENABLED || !hasUserConsented()) return;
    injectGoogleAnalytics();
    injectMetaPixel();
}

// ============================================================================
// COOKIE CONSENT BANNER — Israeli law compliant (accept all / essential only)
// ============================================================================

function createConsentBanner() {
    if (getConsentLevel()) return;

    const banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'עוגיות');
    banner.innerHTML = `
        <span class="cc-text">האתר משתמש בעוגיות. <a href="${MARKETING_CONFIG.PRIVACY_POLICY_URL}" class="cc-link">פרטים</a></span>
        <div class="cc-btns">
            <button id="cookie-accept-all" class="cc-btn cc-yes">אישור</button>
            <button id="cookie-essential-only" class="cc-btn cc-no">ללא מעקב</button>
        </div>
    `;

    const styles = document.createElement('style');
    styles.id = 'cookie-consent-styles';
    styles.textContent = `
        #cookie-consent-banner {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            background: rgba(0,59,70,0.95);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 9999;
            padding: 8px 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            font-family: 'Heebo', sans-serif;
            font-size: 12px;
            direction: rtl;
            transform: translateY(0);
            transition: transform 0.3s ease-out;
        }
        #cookie-consent-banner.hiding { transform: translateY(100%); }
        .cc-text { color: rgba(255,255,255,0.8); }
        .cc-link { color: #D4AF37; text-decoration: none; }
        .cc-link:hover { text-decoration: underline; }
        .cc-btns { display: flex; gap: 6px; flex-shrink: 0; }
        .cc-btn {
            border: none;
            padding: 5px 14px;
            border-radius: 4px;
            font-family: inherit;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            white-space: nowrap;
            transition: opacity 0.2s;
        }
        .cc-btn:hover { opacity: 0.85; }
        .cc-yes { background: #D4AF37; color: #003B46; }
        .cc-no { background: transparent; color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.3); }
        @media (max-width: 480px) {
            #cookie-consent-banner { font-size: 11px; gap: 8px; padding: 7px 12px; }
            .cc-btn { padding: 4px 10px; font-size: 10px; }
        }
    `;

    document.head.appendChild(styles);
    document.body.appendChild(banner);

    function dismissBanner() {
        banner.classList.add('hiding');
        setTimeout(() => {
            banner.remove();
            document.getElementById('cookie-consent-styles')?.remove();
        }, 300);
    }

    document.getElementById('cookie-accept-all').addEventListener('click', function() {
        setUserConsent('all');
        dismissBanner();
        if (window.PopupManager) window.PopupManager.dismiss('cookie_consent');
        initializeTracking();
    });

    document.getElementById('cookie-essential-only').addEventListener('click', function() {
        setUserConsent('essential');
        dismissBanner();
        if (window.PopupManager) window.PopupManager.dismiss('cookie_consent');
        // No tracking initialized — essential cookies only
    });
}

// ============================================================================
// COOKIE SETTINGS RESET — floating button at bottom of every page
// ============================================================================

function createCookieSettingsButton() {
    if (!getConsentLevel()) return;
    // No floating button — users can reset via privacy policy page or browser settings.
    // This keeps the UI completely clean after the one-time choice.
}

// ============================================================================
// TRACKING EVENT HELPERS
// ============================================================================

window.trackEvent = function(eventName, eventParams = {}) {
    if (!hasUserConsented() || !MARKETING_CONFIG.TRACKING_ENABLED) return;
    if (window.gtag && MARKETING_CONFIG.GA4_ID !== 'G-XXXXXXXXXX') {
        gtag('event', eventName, eventParams);
    }
    if (window.fbq && MARKETING_CONFIG.META_PIXEL_ID !== '123456789') {
        fbq('trackCustom', eventName, eventParams);
    }
};

window.trackFormSubmission = function(formName) {
    trackEvent('form_submission', { form_name: formName });
    if (window.fbq) fbq('track', 'Lead');
};

window.trackSignup = function(userType) {
    trackEvent('sign_up', { user_type: userType });
    if (window.fbq) fbq('track', 'CompleteRegistration', { content_name: userType });
};

window.trackButtonClick = function(buttonName) {
    trackEvent('button_click', { button_name: buttonName });
};

// ============================================================================
// META CONVERSIONS API (server-side) — pairs with browser pixel via event_id
// ============================================================================

function _getCookie(name) {
    try {
        const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
        return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
}

// Synthesize _fbc from URL fbclid if the pixel hasn't set the cookie yet
function _buildFbc() {
    const cookie = _getCookie('_fbc');
    if (cookie) return cookie;
    try {
        const fbclid = new URLSearchParams(window.location.search).get('fbclid');
        if (fbclid) return 'fb.1.' + Date.now() + '.' + fbclid;
    } catch (e) { /* ignore */ }
    return null;
}

// Returns a UUID suitable for pairing browser pixel + CAPI events
window.newCapiEventId = function () {
    try {
        if (crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) { /* ignore */ }
    return 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
};

// Fire one event to the server-side Meta CAPI Edge Function.
// Non-blocking — failures are logged and swallowed so UX never breaks.
//
// Usage:
//   const eventID = window.newCapiEventId();
//   fbq('track', 'CompleteRegistration', {}, { eventID });  // browser pixel
//   await window.sendEventToCAPI('CompleteRegistration', { email, phone }, { event_id: eventID });
window.sendEventToCAPI = async function (eventName, userData, customData) {
    userData = userData || {};
    customData = customData || {};

    if (!MARKETING_CONFIG.TRACKING_ENABLED || !hasUserConsented()) return null;

    const eventId = customData.event_id || window.newCapiEventId();
    const eventSourceUrl = customData.event_source_url || window.location.href;

    // Strip our internal keys out of custom_data before sending
    const metaCustomData = {};
    for (const k in customData) {
        if (k === 'event_id' || k === 'event_source_url') continue;
        metaCustomData[k] = customData[k];
    }

    const payload = {
        event_name: eventName,
        event_id: eventId,
        event_source_url: eventSourceUrl,
        user_data: {
            email: userData.email || null,
            phone: userData.phone || null,
            first_name: userData.first_name || null,
            last_name: userData.last_name || null,
            external_id: userData.external_id || null,
            fbp: _getCookie('_fbp'),
            fbc: _buildFbc()
        },
        custom_data: metaCustomData
    };

    try {
        const functionsUrl = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.functionsUrl) ||
            'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1';
        const res = await fetch(functionsUrl + '/meta-capi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok || result.success === false) {
            console.warn('[CAPI]', eventName, 'failed:', result.error || res.status);
        }
        return result;
    } catch (err) {
        console.warn('[CAPI]', eventName, 'network error:', err && err.message);
        return null;
    }
};

// ============================================================================
// FULL ATTRIBUTION SAVE — PATCH lead_attribution with complete browser-side data
// ----------------------------------------------------------------------------
// Why this exists: portal-questionnaire.html and signup flows do direct INSERTs
// and rely on a DB trigger to create the lead_attribution row. The trigger only
// has access to columns the table itself stores (utm_*, how_found) — it cannot
// see fbclid, landing_url, device, browser, or session_id which live in
// localStorage on the client. Without this PATCH those fields stay NULL, and
// any lead whose UTM was stripped en route (iOS in-app browser, ITP) shows up
// with zero technical fingerprint and is misclassified as "organic".
// ============================================================================
// Get an authenticated bearer token if a Supabase session exists, else fall
// back to the anonKey. Only the authenticated path can PATCH lead_attribution
// (RLS denies anon UPDATE).
async function _getBearerToken(anonKey) {
    try {
        if (window.supabaseClient && window.supabaseClient.auth && window.supabaseClient.auth.getSession) {
            const { data } = await window.supabaseClient.auth.getSession();
            const t = data && data.session && data.session.access_token;
            if (t) return t;
        }
    } catch (e) { /* fall through */ }
    return anonKey;
}

window.saveFullAttribution = async function (linkedTable, linkedId) {
    try {
        if (!window.SUPABASE_CONFIG || !linkedTable || !linkedId) return;
        const supabaseUrl = window.SUPABASE_CONFIG.url;
        const anonKey = window.SUPABASE_CONFIG.anonKey;
        const attribution = window.getFullAttribution ? window.getFullAttribution() : null;
        if (!attribution) return;

        const f = attribution.first || {};
        const l = attribution.last  || {};
        const fbc = _buildFbc();
        const fbp = _getCookie('_fbp');

        const body = {
            session_id: attribution.session_id || null,

            first_utm_source:   f.utm_source   || null,
            first_utm_medium:   f.utm_medium   || null,
            first_utm_campaign: f.utm_campaign || null,
            first_utm_term:     f.utm_term     || null,
            first_utm_content:  f.utm_content  || null,
            first_gclid:        f.gclid        || null,
            first_fbclid:       f.fbclid       || null,
            first_ttclid:       f.ttclid       || null,
            first_msclkid:      f.msclkid      || null,
            first_referrer_domain: f.referrer_domain || null,
            first_landing_url:  f.landing_url  || null,
            first_at:           f.at           || null,

            last_utm_source:   l.utm_source   || null,
            last_utm_medium:   l.utm_medium   || null,
            last_utm_campaign: l.utm_campaign || null,
            last_utm_term:     l.utm_term     || null,
            last_utm_content:  l.utm_content  || null,
            last_gclid:        l.gclid        || null,
            last_fbclid:       l.fbclid       || null,
            last_ttclid:       l.ttclid       || null,
            last_msclkid:      l.msclkid      || null,
            last_referrer_domain: l.referrer_domain || null,
            last_landing_url:  l.landing_url  || null,
            last_at:           l.at           || null,

            device_type:  attribution.device_type  || null,
            os_name:      attribution.os_name      || null,
            browser_name: attribution.browser_name || null,
            viewport_w:   attribution.viewport_w   || null,
            viewport_h:   attribution.viewport_h   || null,
            language:     attribution.language     || null,
            timezone:     attribution.timezone     || null,
            raw_ua:       attribution.raw_ua       || null,

            meta_fbc: fbc || null,
            meta_fbp: fbp || null,
        };

        // Strip nulls so PATCH doesn't overwrite existing data
        const filtered = {};
        for (const k in body) if (body[k] !== null && body[k] !== '') filtered[k] = body[k];
        if (Object.keys(filtered).length === 0) return;

        const bearer = await _getBearerToken(anonKey);
        const filter = `linked_id=eq.${linkedId}&linked_table=eq.${linkedTable}`;
        const baseHeaders = {
            'apikey': anonKey,
            'Authorization': `Bearer ${bearer}`,
            'Content-Type': 'application/json',
            'Accept-Profile': 'public',
            'Content-Profile': 'public',
        };

        // UPSERT pattern — try PATCH first (returns the affected row).
        // If no row exists yet (signup before any form trigger fires), INSERT.
        const patchRes = await fetch(`${supabaseUrl}/rest/v1/lead_attribution?${filter}&order=created_at.desc&limit=1`, {
            method: 'PATCH',
            headers: { ...baseHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify(filtered)
        });

        let updated = [];
        try { updated = await patchRes.json(); } catch (e) {}
        if (!Array.isArray(updated) || updated.length === 0) {
            // No row to update — INSERT instead. Required fields per RLS auth_insert_own:
            // linked_table='profiles' AND linked_id=auth.uid(). For other tables we rely
            // on the auth_update_own_q_attr policy (UPDATE only — INSERT may 401 here).
            const insertBody = { ...filtered, linked_table: linkedTable, linked_id: linkedId };
            await fetch(`${supabaseUrl}/rest/v1/lead_attribution`, {
                method: 'POST',
                headers: { ...baseHeaders, 'Prefer': 'return=minimal' },
                body: JSON.stringify(insertBody)
            });
        }
    } catch (e) {
        // Non-critical — main lead INSERT already succeeded, this is enrichment only
    }
};

// ============================================================================
// CAPI BROWSER DATA — Save fbc/fbp to lead_attribution for server-side firing
// ============================================================================
window.saveCapiBrowserData = async function (linkedTable, linkedId, email, eventId) {
    try {
        if (!window.SUPABASE_CONFIG) return;
        const supabaseUrl = window.SUPABASE_CONFIG.url;
        const anonKey = window.SUPABASE_CONFIG.anonKey;
        const fbc = _buildFbc();
        const fbp = _getCookie('_fbp');

        // Update the lead_attribution row that matches this submission
        const filter = linkedId
            ? `linked_id=eq.${linkedId}&linked_table=eq.${linkedTable}`
            : `email=eq.${encodeURIComponent(email)}&linked_table=eq.${linkedTable}`;

        const body = {
            meta_fbc: fbc || null,
            meta_fbp: fbp || null,
        };
        // Store event_id for dedup between browser pixel and server-side CAPI
        if (eventId) body.capi_event_id = eventId;

        const bearer = await _getBearerToken(anonKey);
        await fetch(`${supabaseUrl}/rest/v1/lead_attribution?${filter}&order=created_at.desc&limit=1`, {
            method: 'PATCH',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${bearer}`,
                'Content-Type': 'application/json',
                'Accept-Profile': 'public',
                'Content-Profile': 'public',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(body)
        });
    } catch (e) {
        // Non-critical — the browser CAPI call is the backup anyway
    }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    // Register cookie consent with PopupManager if available
    if (window.PopupManager && !getConsentLevel()) {
        window.PopupManager.register('cookie_consent', {
            priority: 1,
            category: 'critical',
            show: function () { createConsentBanner(); },
            hide: function () {
                var b = document.getElementById('cookie-consent-banner');
                if (b) { b.classList.add('hiding'); setTimeout(function() { b.remove(); }, 300); }
            }
        });
        window.PopupManager.request('cookie_consent');
    } else {
        createConsentBanner();
    }
    initializeTracking();
    createCookieSettingsButton();
});
