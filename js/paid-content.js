/* ============================================================================
 * paid-content.js — serves paid page content from private Storage, not from HTML.
 *
 * Replaces paid-gate.js for the master summaries. paid-gate.js only HID the page
 * with CSS after the server had already sent the full text, so `curl` returned
 * the paid content to anyone. Here the HTML shell is empty: the body is fetched
 * from the private `workbooks` bucket via a signed URL, which Storage RLS grants
 * only to paid_customer/admin. An anonymous request gets an empty shell.
 *
 * Usage (page <head>, in THIS order):
 *   <style id="pg-hide">html{visibility:hidden!important}</style>
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="../../js/supabase-config.js"></script>
 *   <script src="../../js/paid-content.js" defer></script>
 * Page <body> needs: <div id="pc-content"></div>
 *
 * Fails CLOSED: no session / wrong role / any error → redirect to the portal.
 * ========================================================================== */
(function () {
  'use strict';

  var PORTAL = '../course-library-v2.html#master';
  var BUCKET = 'workbooks';
  var PREFIX = 'summaries-master/';
  var TTL = 300;

  function deny() {
    try { location.replace(PORTAL); } catch (e) { location.href = PORTAL; }
  }

  function reveal() {
    var s = document.getElementById('pg-hide');
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  function currentFile() {
    var path = location.pathname.replace(/\/+$/, '');
    var name = path.substring(path.lastIndexOf('/') + 1);
    return name || 'index.html';
  }

  function render(html) {
    var target = document.getElementById('pc-content');
    if (!target) return deny();
    target.innerHTML = html;
    reveal();
    if (location.hash) {
      var el = document.getElementById(location.hash.slice(1));
      if (el) el.scrollIntoView();
    }
  }

  function load() {
    if (!window.supabase || !window.SUPABASE_CONFIG) return deny();

    var client = window.supabase.createClient(
      window.SUPABASE_CONFIG.url,
      window.SUPABASE_CONFIG.anonKey
    );

    client.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session) return deny();

      return client.from('profiles').select('role').eq('id', session.user.id).single()
        .then(function (r) {
          var role = r && r.data && r.data.role;
          if (role !== 'paid_customer' && role !== 'admin') return deny();

          return client.storage.from(BUCKET)
            .createSignedUrl(PREFIX + currentFile(), TTL)
            .then(function (s) {
              if (s.error || !s.data || !s.data.signedUrl) return deny();
              return fetch(s.data.signedUrl).then(function (resp) {
                if (!resp.ok) return deny();
                return resp.text().then(render);
              });
            });
        });
    }).catch(deny);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
