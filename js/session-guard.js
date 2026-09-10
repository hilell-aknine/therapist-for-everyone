/* ============================================================
   בית המטפלים · Session Guard — ניתוק אוטומטי אחרי חוסר-פעילות
   לפי מפרט security-hardener.md, בדיקה קבועה #2 (כבר בפרודקשן
   אצל לקוחות אחרים, ובתבנית-האם של פורטלי הלקוח). מטמיעים רק על
   מסכי אדמין/מטפל/מטופל — לעולם לא על עמודי נחיתה ציבוריים.

   טעינה: אחרי CDN → supabase-config.js → קליינט Supabase כלשהו
   שחושף את עצמו כ-window.supabaseClient (js/supabase-client.js
   עושה את זה אוטומטית; admin-v2.html ו-admin-auth.js מוסיפים
   שורת alias יחידה לשם כך — ראה primer.md 2026-08-24).
   ============================================================ */

(function () {
  'use strict';

  // ── קבועים (לשינוי זמני בבדיקה — להחזיר לפני commit) ──────────
  const WARNING_MS = 13 * 60 * 1000; // 13 דקות — מציג אזהרה
  const LOGOUT_MS  = 15 * 60 * 1000; // 15 דקות — מנתק בפועל

  if (window._sessionGuardInitialized) return;
  window._sessionGuardInitialized = true;

  let warningTimer = null;
  let logoutTimer = null;
  let warningBanner = null;
  let guardActive = false;

  function clearTimers() {
    if (warningTimer) { clearTimeout(warningTimer); warningTimer = null; }
    if (logoutTimer) { clearTimeout(logoutTimer); logoutTimer = null; }
  }

  function removeWarningBanner() {
    if (warningBanner && warningBanner.parentNode) warningBanner.remove();
    warningBanner = null;
  }

  function showWarningBanner() {
    if (warningBanner) return;
    warningBanner = document.createElement('div');
    warningBanner.id = 'session-guard-warning';
    warningBanner.setAttribute('role', 'alert');
    warningBanner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0;
      background: #B45309; color: white;
      text-align: center; padding: 10px 16px;
      font-family: 'Heebo', sans-serif; font-weight: 600;
      font-size: 0.9rem; z-index: 10050;
    `;
    warningBanner.textContent = 'עוד 2 דקות תנותק בשל חוסר פעילות. הזז את העכבר כדי להישאר מחובר.';
    document.body.appendChild(warningBanner);
  }

  async function doLogout() {
    clearTimers();
    removeWarningBanner();
    try {
      const client = window.supabaseClient;
      if (client && client.auth && typeof client.auth.signOut === 'function') {
        await client.auth.signOut();
      }
    } catch (e) {
      console.error('session-guard: signOut error', e);
    } finally {
      // חזרה למסך כניסה. רענון הדף מפעיל מחדש כל guard כניסה קיים
      // (auth-guard.js / admin-auth.js / הבדיקה הפנימית של admin-v2),
      // שיזהו שאין session ויפנו ל-login.html בעצמם.
      window.location.reload();
    }
  }

  function resetTimers() {
    if (!guardActive) return;
    clearTimers();
    removeWarningBanner();
    warningTimer = setTimeout(showWarningBanner, WARNING_MS);
    logoutTimer = setTimeout(doLogout, LOGOUT_MS);
  }

  const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'touchstart', 'scroll'];

  function startGuard() {
    if (guardActive) return;
    guardActive = true;
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, resetTimers, { passive: true }));
    resetTimers();
  }

  function stopGuard() {
    guardActive = false;
    clearTimers();
    removeWarningBanner();
    ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, resetTimers));
  }

  async function init() {
    const client = window.supabaseClient;
    // בלי קליינט Supabase חשוף (עמוד ציבורי/מצב preview) — אין מה לנתק, אל תפיל דף.
    if (!client || !client.auth || typeof client.auth.getSession !== 'function') return;

    try {
      const { data } = await client.auth.getSession();
      if (data && data.session) startGuard();
    } catch (e) {
      // אין session תקף — לא מפעילים טיימר, לא מפילים את הדף.
      console.warn('session-guard: getSession failed, guard not started', e);
      return;
    }

    // אם המשתמש מתנתק/מתחבר בדף פתוח — עדכן את מצב הטיימר בהתאם.
    if (typeof client.auth.onAuthStateChange === 'function') {
      client.auth.onAuthStateChange((event, session) => {
        if (session) startGuard();
        else stopGuard();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
