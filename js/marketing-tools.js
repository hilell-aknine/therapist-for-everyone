// ============================================================================
// UTM CAPTURE — Runs immediately on every page load
// ============================================================================
(function captureUtm() {
    try {
        const params = new URLSearchParams(window.location.search);
        const utm_source = params.get('utm_source');
        const utm_medium = params.get('utm_medium');
        const utm_campaign = params.get('utm_campaign');

        if (utm_source || utm_medium || utm_campaign) {
            localStorage.setItem('utm_data', JSON.stringify({
                utm_source: utm_source || null,
                utm_medium: utm_medium || null,
                utm_campaign: utm_campaign || null,
                captured_at: Date.now()
            }));
        } else {
            const existing = localStorage.getItem('utm_data');
            if (existing) {
                const parsed = JSON.parse(existing);
                const thirtyDays = 30 * 24 * 60 * 60 * 1000;
                if (Date.now() - parsed.captured_at > thirtyDays) {
                    localStorage.removeItem('utm_data');
                }
            }
        }
        const refParam = params.get('ref');
        if (refParam && refParam.length > 10) {
            localStorage.setItem('referrer_data', JSON.stringify({
                referrer_id: refParam,
                captured_at: Date.now()
            }));
        }
    } catch (e) { /* Silent fail */ }
})();

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
            utm_campaign: parsed.utm_campaign || null
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
