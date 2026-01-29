/**
 * Marketing Tools - Central Management for Tracking & Legal Compliance
 * =====================================================================
 *
 * INSTRUCTIONS - Replace these placeholder IDs with your real ones:
 *
 * 1. Google Analytics (GA4):
 *    - Go to: https://analytics.google.com
 *    - Find your Measurement ID (looks like: G-XXXXXXXXXX)
 *    - Replace 'G-XXXXXXXXXX' below with your real ID
 *
 * 2. Meta (Facebook) Pixel:
 *    - Go to: https://business.facebook.com/events_manager
 *    - Find your Pixel ID (looks like: 123456789012345)
 *    - Replace '123456789' below with your real ID
 *
 * 3. Privacy Policy:
 *    - Replace '#' in PRIVACY_POLICY_URL with your real privacy policy page
 */

// ============================================================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================================================

const MARKETING_CONFIG = {
    // Google Analytics 4 Measurement ID
    GA4_ID: 'G-XXXXXXXXXX',  // <-- Replace with your real GA4 ID

    // Meta (Facebook) Pixel ID
    META_PIXEL_ID: '123456789',  // <-- Replace with your real Pixel ID

    // Privacy Policy URL
    PRIVACY_POLICY_URL: '#',  // <-- Replace with your privacy policy page URL

    // Cookie consent key in localStorage
    CONSENT_KEY: 'cookie_consent_approved',

    // Enable/disable tracking (set to false to disable all tracking)
    TRACKING_ENABLED: true
};

// ============================================================================
// COOKIE CONSENT MANAGEMENT
// ============================================================================

function hasUserConsented() {
    return localStorage.getItem(MARKETING_CONFIG.CONSENT_KEY) === 'true';
}

function setUserConsent() {
    localStorage.setItem(MARKETING_CONFIG.CONSENT_KEY, 'true');
}

// ============================================================================
// TRACKING PIXEL INJECTION
// ============================================================================

function injectGoogleAnalytics() {
    if (MARKETING_CONFIG.GA4_ID === 'G-XXXXXXXXXX') {
        console.log('[Marketing] GA4: Using placeholder ID - replace with real ID');
        return;
    }

    // Google Analytics 4 Script
    const gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${MARKETING_CONFIG.GA4_ID}`;
    document.head.appendChild(gaScript);

    // GA4 Configuration
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', MARKETING_CONFIG.GA4_ID);

    console.log('[Marketing] GA4 initialized:', MARKETING_CONFIG.GA4_ID);
}

function injectMetaPixel() {
    if (MARKETING_CONFIG.META_PIXEL_ID === '123456789') {
        console.log('[Marketing] Meta Pixel: Using placeholder ID - replace with real ID');
        return;
    }

    // Meta (Facebook) Pixel
    !function(f,b,e,v,n,t,s) {
        if(f.fbq) return;
        n = f.fbq = function() {
            n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if(!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = !0;
        n.version = '2.0';
        n.queue = [];
        t = b.createElement(e);
        t.async = !0;
        t.src = v;
        s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    fbq('init', MARKETING_CONFIG.META_PIXEL_ID);
    fbq('track', 'PageView');

    console.log('[Marketing] Meta Pixel initialized:', MARKETING_CONFIG.META_PIXEL_ID);
}

function initializeTracking() {
    if (!MARKETING_CONFIG.TRACKING_ENABLED) {
        console.log('[Marketing] Tracking is disabled');
        return;
    }

    if (!hasUserConsented()) {
        console.log('[Marketing] Waiting for user consent...');
        return;
    }

    injectGoogleAnalytics();
    injectMetaPixel();
}

// ============================================================================
// COOKIE CONSENT BANNER
// ============================================================================

function createConsentBanner() {
    // Don't show if already consented
    if (hasUserConsented()) {
        return;
    }

    // Create banner container
    const banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.innerHTML = `
        <div class="cookie-consent-content">
            <div class="cookie-consent-text">
                <i class="fa-solid fa-cookie-bite"></i>
                <span>אנחנו משתמשים בעוגיות כדי לשפר את החוויה באתר.</span>
            </div>
            <div class="cookie-consent-buttons">
                <a href="${MARKETING_CONFIG.PRIVACY_POLICY_URL}" class="cookie-btn-link">קרא עוד</a>
                <button id="cookie-accept-btn" class="cookie-btn-accept">אשר הכל</button>
            </div>
        </div>
    `;

    // Add styles
    const styles = document.createElement('style');
    styles.textContent = `
        #cookie-consent-banner {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: #ffffff;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
            z-index: 99999;
            padding: 1rem 1.5rem;
            font-family: 'Heebo', sans-serif;
            direction: rtl;
            animation: slideUp 0.4s ease-out;
        }

        @keyframes slideUp {
            from {
                transform: translateY(100%);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }

        .cookie-consent-content {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1.5rem;
            flex-wrap: wrap;
        }

        .cookie-consent-text {
            display: flex;
            align-items: center;
            gap: 0.8rem;
            color: #333;
            font-size: 0.95rem;
        }

        .cookie-consent-text i {
            color: #D4AF37;
            font-size: 1.3rem;
        }

        .cookie-consent-buttons {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .cookie-btn-link {
            color: #2F8592;
            text-decoration: none;
            font-size: 0.9rem;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            transition: background 0.2s;
        }

        .cookie-btn-link:hover {
            background: rgba(47, 133, 146, 0.1);
        }

        .cookie-btn-accept {
            background: linear-gradient(135deg, #D4AF37, #c9a227);
            color: #003B46;
            border: none;
            padding: 0.7rem 1.5rem;
            border-radius: 8px;
            font-family: inherit;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .cookie-btn-accept:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(212, 175, 55, 0.4);
        }

        @media (max-width: 600px) {
            #cookie-consent-banner {
                padding: 1rem;
            }

            .cookie-consent-content {
                flex-direction: column;
                text-align: center;
                gap: 1rem;
            }

            .cookie-consent-text {
                flex-direction: column;
                gap: 0.5rem;
            }

            .cookie-consent-buttons {
                width: 100%;
                justify-content: center;
            }
        }
    `;

    document.head.appendChild(styles);
    document.body.appendChild(banner);

    // Handle accept button click
    document.getElementById('cookie-accept-btn').addEventListener('click', function() {
        setUserConsent();
        banner.style.animation = 'slideUp 0.3s ease-out reverse';
        setTimeout(() => {
            banner.remove();
            // Now initialize tracking after consent
            initializeTracking();
        }, 300);
    });
}

// ============================================================================
// TRACKING EVENT HELPERS
// ============================================================================

// Helper function to track custom events
window.trackEvent = function(eventName, eventParams = {}) {
    if (!hasUserConsented() || !MARKETING_CONFIG.TRACKING_ENABLED) {
        console.log('[Marketing] Event not tracked (no consent):', eventName);
        return;
    }

    // Google Analytics
    if (window.gtag && MARKETING_CONFIG.GA4_ID !== 'G-XXXXXXXXXX') {
        gtag('event', eventName, eventParams);
    }

    // Meta Pixel
    if (window.fbq && MARKETING_CONFIG.META_PIXEL_ID !== '123456789') {
        fbq('trackCustom', eventName, eventParams);
    }

    console.log('[Marketing] Event tracked:', eventName, eventParams);
};

// Pre-defined tracking events
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
    console.log('[Marketing Tools] Initializing...');

    // Show consent banner (if not already consented)
    createConsentBanner();

    // Initialize tracking (if already consented)
    initializeTracking();

    console.log('[Marketing Tools] Ready');
});
