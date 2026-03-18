/**
 * Auth-aware navbar — shows "התחברות" for logged-out users,
 * "האזור שלי" for logged-in users, alongside the default CTA.
 *
 * Include this script (defer) on any page with .nav-cta in the navbar.
 * Requires supabase-client.js to be loaded first.
 */
(async function initNavAuth() {
    try {
        // Wait for Supabase to be ready
        const sb = window.supabaseClient
            || (window.SUPABASE_CONFIG && window.supabase?.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey))
            || null;
        if (!sb) return;

        const { data: { session } } = await sb.auth.getSession();
        const user = session?.user;

        const navCta = document.querySelector('.nav-cta');
        const mobileCta = document.querySelector('.mobile-cta.primary');

        // Determine correct path prefix (pages/ subdir or root)
        const isSubpage = window.location.pathname.includes('/pages/');
        const loginHref = isSubpage ? 'login.html' : 'pages/login.html';
        const profileHref = isSubpage ? 'profile.html' : 'pages/profile.html';

        if (user) {
            // Logged in → "האזור שלי"
            if (navCta) {
                navCta.href = profileHref;
                navCta.innerHTML = '<i class="fa-solid fa-user-circle"></i> האזור שלי';
            }
            if (mobileCta) {
                mobileCta.href = profileHref;
                mobileCta.innerHTML = '<i class="fa-solid fa-user-circle"></i> האזור שלי';
            }
        } else {
            // Not logged in → inject "התחברות" button before CTA
            if (navCta && !document.querySelector('.nav-login')) {
                const loginBtn = document.createElement('a');
                loginBtn.href = loginHref;
                loginBtn.className = 'nav-login';
                loginBtn.textContent = 'התחברות';
                navCta.parentElement.insertBefore(loginBtn, navCta);
            }
            // Mobile: add login option
            if (mobileCta) {
                const mobileLogin = document.createElement('a');
                mobileLogin.href = loginHref;
                mobileLogin.className = 'mobile-cta';
                mobileLogin.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> התחברות';
                mobileLogin.style.cssText = 'border:1px solid rgba(255,255,255,0.3);color:#E8F1F2;background:transparent;';
                mobileCta.parentElement.insertBefore(mobileLogin, mobileCta);
            }
        }
    } catch (e) {
        // Silently fail — don't break the page
    }
})();
