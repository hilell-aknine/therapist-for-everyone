// ============================================================================
// Patient Step 4 - Legal consent, signature, and form submission
// Extracted from pages/patient-step4.html inline scripts
// ============================================================================

(function() {
    'use strict';

    // Supabase client
    const db = window.supabase.createClient(
        window.SUPABASE_CONFIG.url,
        window.SUPABASE_CONFIG.anonKey
    );

    let formData = {};
    let hasSignature = false;

    // ========== Signature Canvas Setup ==========
    const canvas = document.getElementById('signature-canvas');
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    function resizeCanvas() {
        const container = document.getElementById('signature-container');
        const tempData = hasSignature ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = 150;
        if (tempData) {
            ctx.putImageData(tempData, 0, 0);
        }
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }

    function getCoords(e) {
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
        const coords = getCoords(e);
        lastX = coords.x;
        lastY = coords.y;
    }

    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();
        const coords = getCoords(e);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
        lastX = coords.x;
        lastY = coords.y;

        if (!hasSignature) {
            hasSignature = true;
            document.getElementById('signature-container').classList.add('has-signature');
            updateSubmitButton();
        }
    }

    function stopDrawing() {
        isDrawing = false;
    }

    function clearSignature() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasSignature = false;
        document.getElementById('signature-container').classList.remove('has-signature');
        updateSubmitButton();
    }

    // Canvas event listeners
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    canvas.addEventListener('touchstart', startDrawing);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDrawing);

    // Clear signature button (replaces inline onclick)
    var clearBtn = document.getElementById('btn-clear-signature');
    if (clearBtn) clearBtn.addEventListener('click', clearSignature);

    // ========== Scroll Detection for Moral Box ==========
    let hasScrolledToBottom = false;

    function checkMoralBoxScroll() {
        const moralBox = document.getElementById('moral-box');
        const scrollTop = moralBox.scrollTop;
        const scrollHeight = moralBox.scrollHeight;
        const clientHeight = moralBox.clientHeight;

        if (scrollTop + clientHeight >= scrollHeight - 10) {
            if (!hasScrolledToBottom) {
                hasScrolledToBottom = true;
                unlockCheckboxes();
            }
        }
    }

    function unlockCheckboxes() {
        document.getElementById('terms-checkbox').classList.remove('locked');
        document.getElementById('age-checkbox').classList.remove('locked');
        document.getElementById('scroll-hint').classList.add('hidden');
    }

    document.getElementById('moral-box').addEventListener('scroll', checkMoralBoxScroll);

    function checkIfScrollNeeded() {
        const moralBox = document.getElementById('moral-box');
        if (moralBox.scrollHeight <= moralBox.clientHeight) {
            hasScrolledToBottom = true;
            unlockCheckboxes();
        }
    }

    // ========== Checkbox Handlers ==========
    function updateSubmitButton() {
        const termsConfirmed = document.getElementById('terms_confirmed').checked;
        const ageConfirmed = document.getElementById('age_confirmed').checked;
        const typedName = document.getElementById('typed-name')?.value.trim();
        const hasValidSignature = hasSignature || (typedName && typedName.length >= 2);
        const canSubmit = termsConfirmed && ageConfirmed && hasValidSignature;
        document.getElementById('submit-btn').disabled = !canSubmit;
    }

    document.querySelectorAll('.checkbox-item input').forEach(input => {
        input.addEventListener('change', function() {
            this.closest('.checkbox-item').classList.toggle('checked', this.checked);
            updateSubmitButton();
        });
    });

    document.getElementById('typed-name')?.addEventListener('input', updateSubmitButton);

    document.querySelectorAll('.checkbox-item').forEach(item => {
        item.addEventListener('click', function(e) {
            if (e.target === this) {
                const checkbox = this.querySelector('input[type="checkbox"]');
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });
    });

    // ========== Turnstile ==========
    window.onloadTurnstileCallback = function() {
        const siteKey = window.SUPABASE_CONFIG?.turnstileSiteKey;
        if (!siteKey) {
            console.warn('Turnstile: site key not configured in supabase-config.js');
            return;
        }
        const container = document.getElementById('turnstile-container');
        if (container) {
            turnstile.render(container, { sitekey: siteKey, appearance: 'interaction-only', theme: 'light' });
        }
    };

    function getTurnstileToken() {
        if (typeof turnstile === 'undefined') return null;
        const container = document.getElementById('turnstile-container');
        if (!container) return null;
        return turnstile.getResponse(container);
    }

    // ========== Step Guard + Init ==========
    document.addEventListener('DOMContentLoaded', () => {
        formData = JSON.parse(localStorage.getItem('patientForm') || '{}');

        if (!formData.full_name || !formData.therapy_type || !formData.mother_relationship) {
            window.location.href = 'patient-step1.html';
            return;
        }

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        checkIfScrollNeeded();

        // Render Turnstile if it loaded before this script
        if (typeof turnstile !== 'undefined' && window.onloadTurnstileCallback) {
            window.onloadTurnstileCallback();
        }
    });

    // ========== Form Submission ==========
    document.getElementById('step4-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const termsConfirmed = document.getElementById('terms_confirmed').checked;
        const ageConfirmed = document.getElementById('age_confirmed').checked;

        // Clear previous errors
        document.querySelectorAll('.field-error').forEach(el => el.classList.remove('show'));
        document.querySelectorAll('.checkbox-item.error, .signature-canvas-container.error').forEach(el => el.classList.remove('error'));

        let hasErrors = false;

        if (!termsConfirmed) {
            document.getElementById('terms-error').classList.add('show');
            document.getElementById('terms-checkbox')?.classList.add('error');
            hasErrors = true;
        }
        if (!ageConfirmed) {
            document.getElementById('age-error').classList.add('show');
            document.getElementById('age-checkbox')?.classList.add('error');
            hasErrors = true;
        }

        const typedNameVal = document.getElementById('typed-name')?.value.trim();
        if (!hasSignature && !(typedNameVal && typedNameVal.length >= 2)) {
            document.getElementById('signature-error').classList.add('show');
            document.getElementById('signature-container')?.classList.add('error');
            hasErrors = true;
        }

        if (hasErrors) {
            showToast('יש למלא את כל השדות הנדרשים');
            return;
        }

        // Verify Turnstile
        const turnstileToken = getTurnstileToken();
        if (!turnstileToken) {
            showToast('אנא אשר שאתה לא רובוט');
            return;
        }

        const submitBtn = document.getElementById('submit-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> שולח...';

        try {
            const typedName = document.getElementById('typed-name')?.value.trim();
            const signatureData = hasSignature ? canvas.toDataURL('image/png') : null;

            // Build questionnaire object
            const questionnaire = {
                main_reason: formData.main_reason || '',
                previous_therapy_history: formData.previous_therapy_history || '',
                expectations: formData.expectations || '',
                why_now: formData.why_now || '',
                fears: formData.fears || '',
                medical_background: {
                    chronic_issues: formData.chronic_issues || '',
                    medications: formData.medications || '',
                    other_treatment: formData.other_treatment || false,
                    other_treatment_details: formData.other_treatment_details || ''
                },
                family_dynamics: {
                    mother_name: formData.mother_name || '',
                    mother_relationship: formData.mother_relationship || '',
                    father_name: formData.father_name || '',
                    father_relationship: formData.father_relationship || '',
                    siblings_count: formData.siblings_count || 0,
                    siblings_details: formData.siblings_details || []
                },
                inner_world: {
                    early_memory: formData.early_memory || '',
                    open_space: formData.open_space || ''
                },
                marketing_consent: document.getElementById('marketing_consent').checked
            };

            // Build final data object
            const utm = window.getUtmData ? window.getUtmData() : {};
            const data = {
                full_name: formData.full_name,
                email: formData.email,
                phone: formData.phone,
                city: formData.city || null,
                birth_date: formData.birth_date || null,
                gender: formData.gender || null,
                marital_status: formData.marital_status || null,
                occupation: formData.occupation || null,
                military_service: formData.military_service || null,
                social_link: formData.social_link || null,
                therapy_type: formData.therapy_type,
                therapist_gender_preference: formData.therapist_gender_preference || 'any',
                questionnaire: questionnaire,
                signature_data: signatureData,
                legal_consent_date: new Date().toISOString(),
                agreement_signed_at: new Date().toISOString(),
                status: 'new',
                terms_confirmed: termsConfirmed,
                age_confirmed: ageConfirmed,
                utm_source: utm.utm_source || null,
                utm_medium: utm.utm_medium || null,
                utm_campaign: utm.utm_campaign || null,
                utm_content: utm.utm_content || null,
                utm_term: utm.utm_term || null
            };

            // Submit via Turnstile-protected Edge Function
            const functionsUrl = window.SUPABASE_CONFIG.functionsUrl;
            const attribution = window.getFullAttribution ? window.getFullAttribution() : null;
            const res = await fetch(`${functionsUrl}/submit-lead`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: 'patients',
                    data: data,
                    turnstileToken: turnstileToken,
                    attribution: attribution
                })
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'שגיאה בשליחת הטופס');

            // Clear localStorage
            localStorage.removeItem('patientForm');
            localStorage.removeItem('utm_data');

            // Show success
            document.getElementById('form-view').classList.add('hidden');
            document.getElementById('progress-bar').classList.add('hidden');
            document.getElementById('success-view').classList.remove('hidden');
            showToast('הבקשה נשלחה בהצלחה!', 'success');
            if (window.trackFormSubmission) window.trackFormSubmission('patient_intake');

            // Server-side Meta CAPI for better Event Match Quality
            if (window.sendEventToCAPI) {
                var capiEventId = window.newCapiEventId ? window.newCapiEventId() : null;
                if (window.fbq && capiEventId) {
                    fbq('track', 'CompleteRegistration',
                        { content_name: 'patient_intake' },
                        { eventID: capiEventId });
                }
                window.sendEventToCAPI('CompleteRegistration', {
                    email: data.email || null,
                    phone: data.phone || null,
                    first_name: (data.full_name || '').split(' ')[0] || null,
                    last_name: (data.full_name || '').split(' ').slice(1).join(' ') || null
                }, {
                    content_name: 'patient_intake',
                    event_id: capiEventId
                });
            }

        } catch (error) {
            console.error('Error:', error);
            showToast(error.message || 'שגיאה בשליחת הטופס. נסה שוב.');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> שליחת הבקשה';

            // Reset Turnstile widget for retry
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
