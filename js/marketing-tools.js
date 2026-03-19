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
    if (getConsentLevel()) return; // Already chose

    const banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'הגדרות עוגיות');
    banner.innerHTML = `
        <div class="cookie-content">
            <span class="cookie-text">
                אתר זה משתמש בעוגיות הכרחיות לתפעול האתר, ובעוגיות אנליטיות ושיווקיות (Google Analytics, Meta Pixel) לשיפור השירות.
                <a href="${MARKETING_CONFIG.PRIVACY_POLICY_URL}" class="cookie-link">מדיניות פרטיות מלאה</a>
            </span>
            <div class="cookie-buttons">
                <button id="cookie-accept-all" class="cookie-btn cookie-btn-primary">אישור הכל</button>
                <button id="cookie-essential-only" class="cookie-btn cookie-btn-secondary">הכרחיות בלבד</button>
            </div>
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
            background: #ffffff;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.12);
            z-index: 9999;
            padding: 16px 24px;
            font-family: 'Heebo', sans-serif;
            font-size: 13px;
            direction: rtl;
            transform: translateY(0);
            transition: transform 0.3s ease-out;
            border-top: 3px solid #2F8592;
        }
        #cookie-consent-banner.hiding { transform: translateY(100%); }
        .cookie-content {
            max-width: 900px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            gap: 16px;
        }
        .cookie-text { color: #444; flex: 1; line-height: 1.6; }
        .cookie-link {
            color: #2F8592;
            text-decoration: underline;
            white-space: nowrap;
        }
        .cookie-buttons {
            display: flex;
            gap: 8px;
            flex-shrink: 0;
        }
        .cookie-btn {
            border: none;
            padding: 8px 18px;
            border-radius: 6px;
            font-family: inherit;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s;
        }
        .cookie-btn-primary {
            background: #2F8592;
            color: #fff;
        }
        .cookie-btn-primary:hover { background: #247580; }
        .cookie-btn-secondary {
            background: transparent;
            color: #2F8592;
            border: 2px solid #2F8592;
        }
        .cookie-btn-secondary:hover { background: rgba(47,133,146,0.08); }
        @media (max-width: 600px) {
            .cookie-content {
                flex-direction: column;
                gap: 12px;
                text-align: center;
            }
            .cookie-text { font-size: 12px; }
            .cookie-buttons { width: 100%; }
            .cookie-btn { flex: 1; padding: 10px 12px; font-size: 13px; }
        }
        /* Dark mode */
        [data-theme="dark"] #cookie-consent-banner {
            background: #1a2332;
            border-top-color: #D4AF37;
        }
        [data-theme="dark"] .cookie-text { color: #ccc; }
        [data-theme="dark"] .cookie-link { color: #D4AF37; }
        [data-theme="dark"] .cookie-btn-secondary { color: #D4AF37; border-color: #D4AF37; }
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
        initializeTracking();
    });

    document.getElementById('cookie-essential-only').addEventListener('click', function() {
        setUserConsent('essential');
        dismissBanner();
        // No tracking initialized — essential cookies only
    });
}

// ============================================================================
// COOKIE SETTINGS RESET — floating button at bottom of every page
// ============================================================================

function createCookieSettingsButton() {
    if (!getConsentLevel()) return; // Banner still showing

    const btn = document.createElement('button');
    btn.id = 'cookie-settings-btn';
    btn.setAttribute('aria-label', 'הגדרות עוגיות');
    btn.title = 'הגדרות עוגיות';
    btn.textContent = '🍪';
    btn.style.cssText = 'position:fixed;bottom:12px;left:12px;width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid #ddd;box-shadow:0 2px 8px rgba(0,0,0,0.1);cursor:pointer;font-size:18px;z-index:9998;display:flex;align-items:center;justify-content:center;transition:transform 0.2s;';
    btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.1)');
    btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');
    btn.addEventListener('click', function() {
        localStorage.removeItem(MARKETING_CONFIG.CONSENT_KEY);
        btn.remove();
        createConsentBanner();
    });
    document.body.appendChild(btn);
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
    createConsentBanner();
    initializeTracking();
    createCookieSettingsButton();
});
