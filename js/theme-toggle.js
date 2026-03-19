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

    // --- Apply theme to <html> + swap logos ---
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        swapLogos(theme);
    }

    // --- Swap logo images for dark/light mode ---
    function swapLogos(theme) {
        var logos = document.querySelectorAll('.logo-img, .footer-logo-img');
        logos.forEach(function (img) {
            var src = img.getAttribute('src') || '';
            if (theme === 'dark') {
                img.setAttribute('src', src.replace('logo.png', 'logo-light.png').replace('logo-square.png', 'logo-light.png'));
            } else {
                // Restore original — logo-light back to logo
                if (src.indexOf('logo-light') !== -1) {
                    // Determine original: footer uses square, nav uses regular
                    var original = img.classList.contains('footer-logo-img') ? 'logo-square.png' : 'logo.png';
                    img.setAttribute('src', src.replace('logo-light.png', original));
                }
            }
        });
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

    // --- Create toggle button element ---
    function createToggleBtn() {
        var btn = document.createElement('button');
        btn.className = 'theme-toggle-btn';
        btn.setAttribute('aria-label', 'החלף מצב תצוגה בהיר/כהה');
        btn.setAttribute('title', 'מצב בהיר / כהה');
        btn.innerHTML =
            '<span class="icon-sun" aria-hidden="true">&#9728;</span>' +
            '<span class="icon-moon" aria-hidden="true">&#9790;</span>';
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleTheme();
        });
        return btn;
    }

    // --- Inject toggle button into the nav/header ---
    function injectToggleButton() {
        // Don't double-inject
        if (document.querySelector('.theme-toggle-btn')) return;

        var btn = createToggleBtn();
        var injected = false;

        // Strategy 1: Public pages — .navbar (insert before mobile-menu-btn)
        var navbar = document.querySelector('nav.navbar, .navbar');
        if (navbar) {
            var mobileBtn = navbar.querySelector('.mobile-menu-btn');
            if (mobileBtn) {
                navbar.insertBefore(btn, mobileBtn);
            } else {
                navbar.appendChild(btn);
            }
            injected = true;
        }

        // Strategy 2: Dark app pages — .header .header-actions
        if (!injected) {
            var headerActions = document.querySelector('.header .header-actions');
            if (headerActions) {
                headerActions.insertBefore(btn, headerActions.firstChild);
                injected = true;
            }
        }

        // Strategy 3: Admin — .header .user-info
        if (!injected) {
            var userInfo = document.querySelector('.header .user-info');
            if (userInfo) {
                userInfo.insertBefore(btn, userInfo.firstChild);
                injected = true;
            }
        }

        // Strategy 4: Course portal — .course-header .header-left
        if (!injected) {
            var headerLeft = document.querySelector('.course-header .header-left');
            if (headerLeft) {
                headerLeft.insertBefore(btn, headerLeft.firstChild);
                injected = true;
            }
        }

        // Strategy 5: Any generic <header> element
        if (!injected) {
            var header = document.querySelector('header, .header');
            if (header) {
                header.appendChild(btn);
                injected = true;
            }
        }

        // Strategy 6: Fallback — fixed position (pages with no nav like summaries)
        if (!injected) {
            btn.classList.add('theme-toggle-btn--fixed');
            document.body.appendChild(btn);
        }
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

    // --- Learning pages only ---
    function isLearningPage() {
        var path = window.location.pathname.toLowerCase();
        var learningPages = [
            'course-library', 'learning-summaries', 'learning-booklets',
            'learning-master', 'profile', 'login', 'admin'
        ];
        return learningPages.some(function (p) { return path.indexOf(p) !== -1; });
    }

    // --- Init on DOMContentLoaded ---
    function init() {
        if (isLearningPage()) {
            var theme = getPreferredTheme();
            applyTheme(theme);
            injectToggleButton();
            listenOSChange();
            // Ensure logos are swapped after DOM is fully ready
            swapLogos(theme);
        } else {
            // Marketing pages — always light, no toggle
            document.documentElement.removeAttribute('data-theme');
        }
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
