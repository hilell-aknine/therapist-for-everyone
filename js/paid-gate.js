/* ============================================================================
 * paid-gate.js — restricts a standalone page to paid_customer / admin only.
 *
 * Usage (in the page <head>, in THIS order, BEFORE any content):
 *   <style id="pg-hide">html{visibility:hidden!important}</style>
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="../../js/supabase-config.js"></script>
 *   <script src="../../js/paid-gate.js"></script>
 *
 * Fails CLOSED: no session / wrong role / any error → redirect to the portal.
 * The page stays hidden until a paid_customer/admin session is confirmed.
 * ========================================================================== */
(function () {
  'use strict';
  var PORTAL = '../course-library-v2.html#master';

  function deny() {
    try { location.replace(PORTAL); } catch (e) { location.href = PORTAL; }
  }
  function reveal() {
    var s = document.getElementById('pg-hide');
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  try {
    if (!window.supabase || !window.SUPABASE_CONFIG) { return deny(); }
    var client = window.supabase.createClient(
      window.SUPABASE_CONFIG.url,
      window.SUPABASE_CONFIG.anonKey
    );
    client.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session) return deny();
      client.from('profiles').select('role').eq('id', session.user.id).single()
        .then(function (r) {
          var role = r && r.data && r.data.role;
          if (role === 'paid_customer' || role === 'admin') { reveal(); }
          else { deny(); }
        })
        .catch(deny);
    }).catch(deny);
  } catch (e) { deny(); }
})();
