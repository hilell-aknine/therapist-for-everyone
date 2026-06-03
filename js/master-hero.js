/* master-hero.js — premium scroll-scrub video + 3D parallax hero for the Master experience.
   Vanilla, no deps. Canvas image-sequence scrubbing (Apple-style), mobile tier, prefers-reduced-motion
   fallback, and CSS-scroll-timeline reveals with IntersectionObserver fallback.
   Contract: a <section class="master-hero" data-mode="scroll|static" ...> with data attributes:
     data-frames-desktop, data-frames-mobile, data-path-desktop, data-path-mobile, data-ext, data-pad
   containing .master-hero__sticky > (.master-hero__3d, .master-hero__canvas, .master-hero__scrim,
   .master-hero__overlay, .master-hero__loader). */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;

  function pad(n, len) { n = String(n); while (n.length < len) n = '0' + n; return n; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function initHero(hero) {
    var mode = hero.getAttribute('data-mode') || 'scroll';
    var sticky = hero.querySelector('.master-hero__sticky');
    var canvas = hero.querySelector('.master-hero__canvas');
    var img3d = hero.querySelector('.master-hero__3d');
    var loader = hero.querySelector('.master-hero__loader');

    // STATIC mode (single-screen, e.g. game welcome gate): 3D still + subtle pointer tilt only.
    if (mode === 'static' || reduce || !canvas) {
      hero.classList.add('is-static-fallback', 'is-ready');
      if (img3d && !reduce && sticky) {
        sticky.addEventListener('pointermove', function (e) {
          var r = sticky.getBoundingClientRect();
          var dx = (e.clientX - r.left) / r.width - 0.5;
          var dy = (e.clientY - r.top) / r.height - 0.5;
          img3d.style.transform = 'translateZ(0) scale(1.08) rotateY(' + (dx * 5).toFixed(2) +
            'deg) rotateX(' + (-dy * 5).toFixed(2) + 'deg) translate(' + (dx * -14).toFixed(1) + 'px,' + (dy * -14).toFixed(1) + 'px)';
        });
        sticky.addEventListener('pointerleave', function () { img3d.style.transform = ''; });
      }
      return;
    }

    // SCROLL mode: preload frame sequence + scrub on scroll.
    var count = parseInt(hero.getAttribute(isMobile ? 'data-frames-mobile' : 'data-frames-desktop'), 10) || 0;
    var base = hero.getAttribute(isMobile ? 'data-path-mobile' : 'data-path-desktop') || '';
    var ext = hero.getAttribute('data-ext') || '.webp';
    var padLen = parseInt(hero.getAttribute('data-pad'), 10) || 3;
    if (!count || !base) { hero.classList.add('is-static-fallback', 'is-ready'); return; }

    var ctx = canvas.getContext('2d', { alpha: false });
    var frames = new Array(count);
    var loaded = 0, current = 0, target = 0, raf = 0, lastDrawn = -1;

    function sizeCanvas() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = sticky.clientWidth, h = sticky.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lastDrawn = -1;
    }

    function draw(i) {
      var im = frames[i];
      if (!im || !im.complete || !im.naturalWidth) return;
      var cw = sticky.clientWidth, ch = sticky.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      var s = Math.max(cw / im.naturalWidth, ch / im.naturalHeight);
      var dw = im.naturalWidth * s, dh = im.naturalHeight * s;
      ctx.drawImage(im, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      lastDrawn = i;
    }

    function progress() {
      var r = hero.getBoundingClientRect();
      var range = hero.offsetHeight - sticky.offsetHeight;
      if (range <= 0) return 0;
      return clamp(-r.top / range, 0, 1);
    }

    function tick() {
      var r = hero.getBoundingClientRect();
      var visible = r.bottom > 0 && r.top < (window.innerHeight || 800);
      if (visible) {
        target = progress() * (count - 1);
        current += (target - current) * 0.18;            // lerp smoothing
        if (Math.abs(target - current) < 0.05) current = target;
        var idx = Math.round(current);
        if (idx !== lastDrawn) draw(idx);
        if (img3d) img3d.style.transform = 'translateZ(0) scale(1.08) translateY(' + (progress() * -28).toFixed(1) + 'px)';
      }
      raf = requestAnimationFrame(tick);
    }

    function start() {
      sizeCanvas();
      if (frames[0]) draw(0);
      if (!raf) raf = requestAnimationFrame(tick);
    }

    // The master view may be hidden (display:none) at load → sticky size is 0.
    // Re-size + redraw whenever it gains real dimensions (i.e. when shown).
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function () {
        if (sticky.clientWidth > 0 && sticky.clientHeight > 0) { sizeCanvas(); draw(lastDrawn < 0 ? 0 : lastDrawn); }
      });
      ro.observe(sticky);
    }

    // Preload: load frame 0 first (instant first paint), then the rest; reveal when ~30% ready.
    function load(i) {
      var im = new Image();
      im.decoding = 'async';
      im.onload = im.onerror = function () {
        loaded++;
        if (i === 0) start();
        if (loaded >= Math.ceil(count * 0.3)) hero.classList.add('is-ready');
        if (loaded >= count) hero.classList.add('is-ready');
      };
      im.src = base + pad(i + 1, padLen) + ext;
      frames[i] = im;
    }
    load(0);
    for (var i = 1; i < count; i++) load(i);

    var resizeT;
    window.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(sizeCanvas, 150); }, { passive: true });
  }

  function initReveals() {
    var els = document.querySelectorAll('[data-mh-reveal]');
    if (!els.length) return;
    var cssOK = window.CSS && CSS.supports && CSS.supports('animation-timeline: view()');
    if (cssOK || reduce) return; // CSS handles it (or motion reduced)
    for (var i = 0; i < els.length; i++) els[i].classList.add('mh-js-reveal');
    if (!('IntersectionObserver' in window)) {
      for (var j = 0; j < els.length; j++) els[j].classList.add('is-visible');
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    els.forEach(function (el) { io.observe(el); });
  }

  function boot() {
    var heroes = document.querySelectorAll('.master-hero');
    for (var i = 0; i < heroes.length; i++) initHero(heroes[i]);
    initReveals();
    var ctas = document.querySelectorAll('.master-hero__cta');
    for (var k = 0; k < ctas.length; k++) {
      ctas[k].addEventListener('click', function () {
        var h = this.closest ? this.closest('.master-hero') : null;
        var to = h ? (h.getBoundingClientRect().bottom + (window.pageYOffset || 0)) : 0;
        try { window.scrollTo({ top: Math.max(0, to - 8), behavior: 'smooth' }); }
        catch (e) { window.scrollTo(0, Math.max(0, to - 8)); }
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Re-init if the master view is shown later (SPA-style toggle in course-library).
  window.MasterHero = { init: boot };
})();
