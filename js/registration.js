// ============================================================================
// Registration Page - Lead Capture + Simplified Questionnaire
// ============================================================================

(function() {
    'use strict';

    const db = window.supabase.createClient(
        window.SUPABASE_CONFIG.url,
        window.SUPABASE_CONFIG.anonKey
    );

    const functionsUrl = window.SUPABASE_CONFIG.functionsUrl;
    const phoneRegex = /^05\d{8}$|^0[2-489]\d{7}$/;

    let isLoggedIn = false;
    let userEmail = '';
    let leadData = {};

    // ========== Auth Detection ==========
    async function checkAuth() {
        try {
            const { data: { session } } = await db.auth.getSession();
            if (session && session.user) {
                isLoggedIn = true;
                userEmail = session.user.email || '';
                const userName = session.user.user_metadata?.full_name || '';

                // Show auth notice
                document.getElementById('auth-notice').classList.remove('section-hidden');
                document.getElementById('auth-notice').classList.add('section-visible');

                // Hide email field
                document.getElementById('lead-email-group').style.display = 'none';
                document.getElementById('lead_email').removeAttribute('required');

                // Pre-fill name if available from metadata
                if (userName) {
                    document.getElementById('lead_name').value = userName;
                }
            }
        } catch (e) {
            // Not logged in - show full form (default)
        }
    }

    // ========== Inline Validation ==========
    function setupValidation() {
        const rules = [
            { id: 'lead_name', errId: 'lead_name-error', test: v => v.length >= 2 },
            { id: 'lead_phone', errId: 'lead_phone-error', test: v => phoneRegex.test(v.replace(/[-\s]/g, '')) },
            { id: 'lead_email', errId: 'lead_email-error', test: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) }
        ];

        rules.forEach(rule => {
            const el = document.getElementById(rule.id);
            if (!el) return;
            el.addEventListener('blur', () => {
                const val = el.value.trim();
                const err = document.getElementById(rule.errId);
                if (val.length === 0) {
                    el.classList.remove('field-error', 'field-success');
                    err.classList.remove('show');
                    return;
                }
                if (rule.test(val)) {
                    el.classList.remove('field-error');
                    el.classList.add('field-success');
                    err.classList.remove('show');
                } else {
                    el.classList.remove('field-success');
                    el.classList.add('field-error');
                    err.classList.add('show');
                }
            });
        });
    }

    // ========== Lead Form Submission ==========
    document.getElementById('lead-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('lead_name').value.trim();
        const phone = document.getElementById('lead_phone').value.trim();
        const email = isLoggedIn ? userEmail : document.getElementById('lead_email').value.trim();

        // Validate
        if (!name || name.length < 2) {
            showToast('יש להזין שם מלא');
            return;
        }
        if (!phone || !phoneRegex.test(phone.replace(/[-\s]/g, ''))) {
            showToast('מספר טלפון לא תקין — יש להזין מספר ישראלי');
            return;
        }
        if (!isLoggedIn && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
            showToast('יש להזין כתובת אימייל תקינה');
            return;
        }

        const btn = document.getElementById('lead-submit-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> שומר...';

        try {
            // Save lead data
            leadData = {
                full_name: name,
                phone: phone.replace(/[-\s]/g, ''),
                email: email || null,
                source: 'registration_form',
                status: 'new'
            };

            // UTM data
            const utm = window.getUtmData ? window.getUtmData() : {};
            if (utm.utm_source) leadData.utm_source = utm.utm_source;
            if (utm.utm_medium) leadData.utm_medium = utm.utm_medium;
            if (utm.utm_campaign) leadData.utm_campaign = utm.utm_campaign;

            // Submit lead to contact_requests via Edge Function
            const res = await fetch(`${functionsUrl}/submit-lead`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: 'contact_requests',
                    data: leadData
                })
            });

            if (!res.ok) {
                const result = await res.json();
                throw new Error(result.error || 'שגיאה בשמירת הפרטים');
            }

            // Success - show questionnaire
            showQuestionnaire();

        } catch (error) {
            console.error('Lead save error:', error);
            // Even if save fails, let user proceed to questionnaire
            // (lead will be captured again with full submission)
            showQuestionnaire();
        }
    });

    // ========== Show Questionnaire ==========
    function showQuestionnaire() {
        // Hide lead section
        document.getElementById('lead-section').classList.remove('section-visible');
        document.getElementById('lead-section').classList.add('section-hidden');

        // Show questionnaire
        document.getElementById('questionnaire-section').classList.remove('section-hidden');
        document.getElementById('questionnaire-section').classList.add('section-visible');

        // Update progress bar
        document.getElementById('seg-2').classList.add('active');

        // Pre-fill readonly fields from lead data
        document.getElementById('q_name').value = leadData.full_name || '';
        document.getElementById('q_phone').value = leadData.phone || '';
        if (leadData.email) {
            document.getElementById('q_email').value = leadData.email;
        } else {
            // Hide email in questionnaire too if user is logged in without email
            document.getElementById('q-email-group').style.display = 'none';
        }

        // Scroll to top smoothly
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ========== Option Cards (Goals) ==========
    document.querySelectorAll('.option-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT') return; // Let checkbox handle itself
            const checkbox = card.querySelector('input[type="checkbox"]');
            checkbox.checked = !checkbox.checked;
            card.classList.toggle('selected', checkbox.checked);
        });
        const checkbox = card.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', () => {
            card.classList.toggle('selected', checkbox.checked);
        });
    });

    // ========== Radio Options (Ram content) ==========
    document.querySelectorAll('.radio-option input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('.radio-option').forEach(opt => opt.classList.remove('selected'));
            radio.closest('.radio-option').classList.add('selected');
        });
    });

    // ========== Turnstile ==========
    window.onloadTurnstileCallback = function() {
        const siteKey = window.SUPABASE_CONFIG?.turnstileSiteKey;
        if (!siteKey) {
            console.warn('Turnstile: site key not configured');
            return;
        }
        const container = document.getElementById('turnstile-container');
        if (container) {
            turnstile.render(container, { sitekey: siteKey, theme: 'light' });
        }
    };

    function getTurnstileToken() {
        if (typeof turnstile === 'undefined') return null;
        const container = document.getElementById('turnstile-container');
        if (!container) return null;
        return turnstile.getResponse(container);
    }

    // ========== Questionnaire Submission ==========
    document.getElementById('questionnaire-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = document.getElementById('questionnaire-submit-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> שולח...';

        // Collect goals
        const goals = [];
        document.querySelectorAll('input[name="goals"]:checked').forEach(cb => {
            goals.push(cb.value);
        });

        // Collect ram content answer
        const ramContentEl = document.querySelector('input[name="ram_content"]:checked');
        const ramContent = ramContentEl ? ramContentEl.value : '';

        // Get Turnstile token
        const turnstileToken = getTurnstileToken();

        // Build questionnaire data
        const questionnaire = {
            ram_content_exposed: ramContent,
            therapy_knowledge: document.getElementById('q_therapy_knowledge').value.trim(),
            motivation: document.getElementById('q_motivation').value.trim(),
            goals: goals,
            future_vision: document.getElementById('q_future_vision').value.trim()
        };

        // Build full patient data
        const utm = window.getUtmData ? window.getUtmData() : {};
        const data = {
            full_name: leadData.full_name,
            phone: leadData.phone,
            email: leadData.email || null,
            gender: document.getElementById('q_gender').value || null,
            birth_date: document.getElementById('q_birth_date').value || null,
            occupation: document.getElementById('q_occupation').value.trim() || null,
            city: document.getElementById('q_city').value.trim() || null,
            questionnaire: questionnaire,
            status: 'new',
            utm_source: utm.utm_source || null,
            utm_medium: utm.utm_medium || null,
            utm_campaign: utm.utm_campaign || null
        };

        try {
            const res = await fetch(`${functionsUrl}/submit-lead`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: 'patients',
                    data: data,
                    turnstileToken: turnstileToken || undefined
                })
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'שגיאה בשליחת השאלון');

            // Show success
            document.getElementById('questionnaire-section').classList.remove('section-visible');
            document.getElementById('questionnaire-section').classList.add('section-hidden');
            document.getElementById('progress-bar').style.display = 'none';
            document.getElementById('success-view').classList.remove('section-hidden');
            document.getElementById('success-view').classList.add('section-visible');

            showToast('השאלון נשלח בהצלחה!', 'success');

        } catch (error) {
            console.error('Questionnaire submit error:', error);
            showToast(error.message || 'שגיאה בשליחת השאלון. נסה שוב.');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> שליחת השאלון';

            // Reset Turnstile for retry
            if (typeof turnstile !== 'undefined') {
                const container = document.getElementById('turnstile-container');
                if (container) turnstile.reset(container);
            }
        }
    });

    // ========== Toast ==========
    function showToast(message, type = 'error') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // ========== Init ==========
    document.addEventListener('DOMContentLoaded', () => {
        checkAuth();
        setupValidation();

        // Render Turnstile if loaded before this script
        if (typeof turnstile !== 'undefined' && window.onloadTurnstileCallback) {
            window.onloadTurnstileCallback();
        }
    });

})();
