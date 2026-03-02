// ============================================================================
// Therapist Step 4 - Agreement, signature, and form submission
// Extracted from pages/therapist-step4.html inline scripts
// ============================================================================

(function() {
    'use strict';

    // Supabase client
    const db = window.supabase.createClient(
        window.SUPABASE_CONFIG.url,
        window.SUPABASE_CONFIG.anonKey
    );

    const termsBox = document.getElementById('terms-box');
    const scrollHint = document.getElementById('scroll-hint');
    const submitBtn = document.getElementById('submit-btn');
    let hasScrolledToBottom = false;
    let hasSignature = false;

    // ========== Step Guard ==========
    document.addEventListener('DOMContentLoaded', () => {
        const saved = localStorage.getItem('therapist_form_data');
        if (!saved) {
            window.location.href = 'therapist-step1.html';
            return;
        }

        const data = JSON.parse(saved);
        if (!data.monthly_hours) {
            window.location.href = 'therapist-step3.html';
            return;
        }

        // Initialize canvas
        resizeCanvas();

        // Render Turnstile if it loaded before this script
        if (typeof turnstile !== 'undefined' && window.onloadTurnstileCallback) {
            window.onloadTurnstileCallback();
        }
    });

    // ========== Scroll-Lock Mechanism ==========
    termsBox.addEventListener('scroll', () => {
        const scrolledToBottom = termsBox.scrollHeight - termsBox.scrollTop <= termsBox.clientHeight + 15;
        if (scrolledToBottom && !hasScrolledToBottom) {
            hasScrolledToBottom = true;
            enableCheckboxes();
            scrollHint.classList.add('hidden');
        }
    });

    function enableCheckboxes() {
        ['insurance-group', 'responsibility-group', 'waiver-group'].forEach(id => {
            const group = document.getElementById(id);
            const checkbox = group.querySelector('input[type="checkbox"]');
            group.classList.remove('disabled');
            checkbox.disabled = false;
        });
    }

    // ========== Signature Canvas ==========
    const canvas = document.getElementById('signature-canvas');
    const ctx = canvas.getContext('2d');
    const placeholder = document.getElementById('signature-placeholder');
    let isDrawing = false;

    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        const tempData = hasSignature ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
        const oldWidth = canvas.width;
        const oldHeight = canvas.height;
        canvas.width = rect.width;
        canvas.height = 150;
        if (tempData && oldWidth > 0 && oldHeight > 0) {
            ctx.putImageData(tempData, 0, 0);
        }
    }
    window.addEventListener('resize', resizeCanvas);

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        if (e.touches) {
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top
            };
        }
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    function startDrawing(e) {
        isDrawing = true;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        placeholder.style.display = 'none';
        e.preventDefault();
    }

    function draw(e) {
        if (!isDrawing) return;
        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
        hasSignature = true;
        e.preventDefault();
    }

    function stopDrawing() {
        isDrawing = false;
        validateForm();
    }

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    canvas.addEventListener('touchstart', startDrawing);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDrawing);

    function clearSignature() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasSignature = false;
        placeholder.style.display = 'flex';
        validateForm();
    }

    // Clear signature button (replaces inline onclick)
    var clearBtn = document.getElementById('btn-clear-signature');
    if (clearBtn) clearBtn.addEventListener('click', clearSignature);

    // ========== Validation ==========
    function validateForm() {
        const insuranceChecked = document.getElementById('has_insurance').checked;
        const responsibilityChecked = document.getElementById('accepts_responsibility').checked;
        const waiverChecked = document.getElementById('waiver_confirmed').checked;

        const allChecked = insuranceChecked && responsibilityChecked && waiverChecked;
        const typedName = document.getElementById('typed-name')?.value.trim();
        const hasValidSignature = hasSignature || (typedName && typedName.length >= 2);
        const canSubmit = hasScrolledToBottom && allChecked && hasValidSignature;

        submitBtn.disabled = !canSubmit;
    }

    ['has_insurance', 'accepts_responsibility', 'waiver_confirmed'].forEach(id => {
        document.getElementById(id).addEventListener('change', validateForm);
    });
    document.getElementById('typed-name')?.addEventListener('input', validateForm);

    // ========== Turnstile ==========
    window.onloadTurnstileCallback = function() {
        const siteKey = window.SUPABASE_CONFIG?.turnstileSiteKey;
        if (!siteKey) {
            console.warn('Turnstile: site key not configured in supabase-config.js');
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

    // ========== Form Submission ==========
    document.getElementById('step4-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        // Clear previous errors
        document.querySelectorAll('.field-error').forEach(el => el.classList.remove('show'));
        document.querySelectorAll('.checkbox-group.error, .signature-canvas-container.error').forEach(el => el.classList.remove('error'));

        let hasErrors = false;

        if (!document.getElementById('has_insurance').checked) {
            document.getElementById('insurance-error').classList.add('show');
            document.getElementById('insurance-group').classList.add('error');
            hasErrors = true;
        }
        if (!document.getElementById('accepts_responsibility').checked) {
            document.getElementById('responsibility-error').classList.add('show');
            document.getElementById('responsibility-group').classList.add('error');
            hasErrors = true;
        }
        if (!document.getElementById('waiver_confirmed').checked) {
            document.getElementById('waiver-error').classList.add('show');
            document.getElementById('waiver-group').classList.add('error');
            hasErrors = true;
        }
        const typedNameVal = document.getElementById('typed-name')?.value.trim();
        if (!hasSignature && !(typedNameVal && typedNameVal.length >= 2)) {
            document.getElementById('signature-error').classList.add('show');
            document.querySelector('.signature-canvas-container').classList.add('error');
            hasErrors = true;
        }

        if (hasErrors) {
            showToast('יש למלא את כל השדות הנדרשים', 'error');
            return;
        }

        // Verify Turnstile
        const turnstileToken = getTurnstileToken();
        if (!turnstileToken) {
            showToast('אנא אשר שאתה לא רובוט', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> שולח...';

        try {
            const formData = JSON.parse(localStorage.getItem('therapist_form_data') || '{}');
            const typedName = document.getElementById('typed-name')?.value.trim();
            const signatureData = hasSignature ? canvas.toDataURL('image/png') : null;

            // Build questionnaire JSONB
            const questionnaire = {
                // Deep questions
                why_profession: formData.q_why_profession || '',
                why_join: formData.q_why_join || '',
                experience: formData.q_experience || '',
                case_study: formData.q_case_study || '',
                challenges: formData.q_challenges || '',

                // Health declarations
                health: {
                    has_medical_issues: formData.has_medical_issues === 'yes',
                    medical_issues_details: formData.medical_issues_details || '',
                    takes_psychiatric_meds: formData.takes_psychiatric_meds === 'yes',
                    in_personal_therapy: formData.in_personal_therapy === 'yes'
                },

                // Commitment
                commitment: {
                    monthly_hours: parseInt(formData.monthly_hours) || 10,
                    duration_months: formData.commitment_duration,
                    therapy_mode: formData.therapy_mode
                },

                // Practice info
                practice: {
                    total_patients_estimate: parseInt(formData.total_patients_estimate) || 0,
                    current_active_patients: parseInt(formData.current_active_patients) || 0
                },

                // Legal confirmations
                legal: {
                    has_insurance: document.getElementById('has_insurance').checked,
                    accepts_responsibility: document.getElementById('accepts_responsibility').checked,
                    waiver_confirmed: document.getElementById('waiver_confirmed').checked,
                    scrolled_terms: hasScrolledToBottom,
                    signed_at: new Date().toISOString()
                }
            };

            // Calculate experience years
            const practiceStartYear = parseInt(formData.practice_start_year);
            const currentYear = new Date().getFullYear();
            const experienceYears = practiceStartYear ? currentYear - practiceStartYear : 0;

            const utm = window.getUtmData ? window.getUtmData() : {};
            const data = {
                full_name: formData.full_name,
                email: formData.email || null,
                phone: formData.phone,
                city: formData.city || null,
                birth_date: formData.birth_date || null,
                gender: formData.gender || null,

                // Arrays for specialization and populations
                specializations: formData.specialization || [],
                target_populations: formData.target_population || [],
                academic_degrees: formData.academic_degree || [],
                therapy_methods: formData.therapy_methods || [],

                experience_years: experienceYears,
                license_number: formData.license_number || null,
                education_details: formData.education_details || null,
                works_online: formData.therapy_mode === 'zoom' || formData.therapy_mode === 'hybrid',
                works_in_person: formData.therapy_mode === 'clinic' || formData.therapy_mode === 'hybrid',
                available_hours_per_week: Math.ceil(parseInt(formData.monthly_hours || 10) / 4),
                social_link: formData.social_link || null,
                questionnaire: questionnaire,
                signature_data: signatureData,
                age_confirmed: true,
                terms_confirmed: true,
                documents_verified: false,
                status: 'new',
                utm_source: utm.utm_source || null,
                utm_medium: utm.utm_medium || null,
                utm_campaign: utm.utm_campaign || null
            };

            // Submit via Turnstile-protected Edge Function
            const functionsUrl = window.SUPABASE_CONFIG.functionsUrl;
            const res = await fetch(`${functionsUrl}/submit-lead`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: 'therapists',
                    data: data,
                    turnstileToken: turnstileToken
                })
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'שגיאה בשליחת הטופס');

            // Clear localStorage
            localStorage.removeItem('therapist_form_data');
            localStorage.removeItem('utm_data');

            // Show success
            document.getElementById('form-container').classList.add('hidden');
            document.getElementById('success-container').classList.remove('hidden');
            showToast('הבקשה נשלחה בהצלחה!', 'success');

        } catch (error) {
            console.error('Error:', error);
            showToast(error.message || 'שגיאה בשליחת הטופס. נסה שוב.', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> שליחת הבקשה';

            // Reset Turnstile for retry
            if (typeof turnstile !== 'undefined') {
                const container = document.getElementById('turnstile-container');
                if (container) turnstile.reset(container);
            }
        }
    });

    // ========== Toast ==========
    function showToast(message, type) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        setTimeout(() => toast.classList.remove('show'), 4000);
    }

    // ========== P3-17: Autosave form data every 30s ==========
    (function() {
        var key = 'autosave_' + location.pathname;
        var fields = document.querySelectorAll('input, select, textarea');
        if (!fields.length) return;
        try {
            var saved = JSON.parse(localStorage.getItem(key));
            if (saved) Object.keys(saved).forEach(function(k) {
                var el = document.querySelector('[name="' + k + '"]') || document.getElementById(k);
                if (!el || el.value) return;
                if (el.type === 'checkbox') el.checked = saved[k];
                else if (el.type === 'radio') { if (el.value === saved[k]) el.checked = true; }
                else el.value = saved[k];
            });
        } catch(e) {}
        setInterval(function() {
            var data = {};
            fields.forEach(function(el) {
                var k = el.name || el.id;
                if (!k || el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;
                if (el.type === 'checkbox') data[k] = el.checked;
                else if (el.type === 'radio') { if (el.checked) data[k] = el.value; }
                else if (el.value) data[k] = el.value;
            });
            if (Object.keys(data).length) localStorage.setItem(key, JSON.stringify(data));
        }, 30000);
        document.querySelectorAll('form').forEach(function(f) {
            f.addEventListener('submit', function() { localStorage.removeItem(key); });
        });
    })();

})();
