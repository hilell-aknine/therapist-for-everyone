/**
 * Beit HaMetaplim — Global Theme Toggle
 * Handles light/dark mode switching across all pages.
 *
 * Features:
 * - FOUC prevention (inline script in <head> sets data-theme before paint)
 * - localStorage persistence (key: 'beit-theme')
 * - OS prefers-color-scheme fallback
 * - Auto-injects toggle button into page
 * - Migrates old admin-theme key
 * - Exposes window.ThemeToggle API
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'beit-theme';
    var OLD_ADMIN_KEY = 'admin-theme';

    // --- Migrate old admin key ---
    function migrateOldKey() {
        var old = localStorage.getItem(OLD_ADMIN_KEY);
        if (old && !localStorage.getItem(STORAGE_KEY)) {
            // admin used "light"/"dark" — map directly
            localStorage.setItem(STORAGE_KEY, old === 'light' ? 'light' : 'dark');
            localStorage.removeItem(OLD_ADMIN_KEY);
        }
    }

    // --- Resolve current theme ---
    function getPreferredTheme() {
        migrateOldKey();
        var stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'dark' || stored === 'light') return stored;
        // OS preference fallback
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    // --- Apply theme to <html> ---
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }

    // --- Toggle ---
    function toggleTheme() {
        var current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        var next = current === 'dark' ? 'light' : 'dark';

        // Smooth transition class
        document.documentElement.classList.add('theme-transitioning');
        applyTheme(next);
        localStorage.setItem(STORAGE_KEY, next);

        // Remove transition class after animation
        setTimeout(function () {
            document.documentElement.classList.remove('theme-transitioning');
        }, 350);
    }

    // --- Inject toggle button ---
    function injectToggleButton() {
        // Don't double-inject
        if (document.querySelector('.theme-toggle-btn')) return;

        var btn = document.createElement('button');
        btn.className = 'theme-toggle-btn';
        btn.setAttribute('aria-label', 'החלף מצב תצוגה בהיר/כהה');
        btn.setAttribute('title', 'מצב בהיר / כהה');
        btn.innerHTML =
            '<span class="icon-sun" aria-hidden="true">&#9728;</span>' +
            '<span class="icon-moon" aria-hidden="true">&#9790;</span>';

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            toggleTheme();
        });

        document.body.appendChild(btn);
    }

    // --- Listen for OS preference changes ---
    function listenOSChange() {
        if (!window.matchMedia) return;
        try {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
                // Only react if user hasn't explicitly set a preference
                if (!localStorage.getItem(STORAGE_KEY)) {
                    applyTheme(e.matches ? 'dark' : 'light');
                }
            });
        } catch (err) {
            // Safari < 14 fallback
        }
    }

    // --- Init on DOMContentLoaded ---
    function init() {
        // Theme should already be set by inline FOUC script,
        // but ensure it's correct
        applyTheme(getPreferredTheme());
        injectToggleButton();
        listenOSChange();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // --- Public API ---
    window.ThemeToggle = {
        toggle: toggleTheme,
        set: function (theme) {
            applyTheme(theme);
            localStorage.setItem(STORAGE_KEY, theme);
        },
        get: function () {
            return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        }
    };
})();
