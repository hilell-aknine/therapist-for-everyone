/**
 * Auth-aware navbar — default shows "התחברות" (login.html).
 * When logged in, changes to "האזור שלי" (profile.html).
 */
(async function initNavAuth() {
    try {
        const sb = window.supabaseClient
            || (window.SUPABASE_CONFIG && window.supabase?.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey))
            || null;
        if (!sb) return;

        const { data: { session } } = await sb.auth.getSession();
        if (!session?.user) return; // Not logged in — keep default "התחברות"

        // Logged in → change to "האזור שלי"
        const isSubpage = window.location.pathname.includes('/pages/');
        const profileHref = isSubpage ? 'profile.html' : 'pages/profile.html';

        const navCta = document.querySelector('.nav-cta');
        if (navCta) {
            navCta.href = profileHref;
            navCta.innerHTML = '<i class="fa-solid fa-user-circle"></i> האזור שלי';
        }

        const mobileCta = document.querySelector('.mobile-cta.primary');
        if (mobileCta) {
            mobileCta.href = profileHref;
            mobileCta.innerHTML = '<i class="fa-solid fa-user-circle"></i> האזור שלי';
        }
    } catch (e) {
        // Silently fail
    }
})();
