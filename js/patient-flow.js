// ============================================================================
// Patient Flow - Handles patient registration and form submission
// ============================================================================

(function() {
    'use strict';

    // ============================================================================
    // Initialization
    // ============================================================================

    document.addEventListener('DOMContentLoaded', async () => {
        // Wait for dependencies
        await waitForDependencies();

        // Check authentication and legal consent
        await checkAccess();

        // Setup form handlers
        setupFormHandlers();

        // Pre-fill user data if available
        await prefillUserData();
    });

    // Wait for Supabase and AuthGuard to load
    function waitForDependencies() {
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (window.supabaseClient && window.AuthGuard) {
                    clearInterval(check);
                    resolve();
                }
            }, 50);

            setTimeout(() => {
                clearInterval(check);
                resolve();
            }, 5000);
        });
    }

    // Check if user has access (logged in + legal consent)
    async function checkAccess() {
        const user = await AuthGuard.getCurrentUser();

        if (!user) {
            showToast('יש להתחבר תחילה', 'error');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
            return false;
        }

        // Check legal consent
        const hasConsent = await AuthGuard.hasLegalConsent(user.id);
        if (!hasConsent) {
            window.location.href = 'legal-gate.html';
            return false;
        }

        // Check if already registered as patient
        const existingPatient = await checkExistingPatient(user.id);
        if (existingPatient) {
            showToast('כבר נרשמת כמטופל, מעביר אותך...', 'success');
            setTimeout(() => {
                window.location.href = 'patient-dashboard.html';
            }, 1500);
            return false;
        }

        return true;
    }

    // Check if user already has a patient record
    async function checkExistingPatient(userId) {
        try {
            const { data, error } = await window.supabaseClient
                .from('patients')
                .select('id')
                .eq('user_id', userId)
                .maybeSingle();

            if (error) {
                console.error('Error checking existing patient:', error);
                return false;
            }

            return data !== null;
        } catch (error) {
            console.error('Error in checkExistingPatient:', error);
            return false;
        }
    }

    // Pre-fill form with user data from profile
    async function prefillUserData() {
        try {
            const user = await AuthGuard.getCurrentUser();
            if (!user) return;

            // Get profile data
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('full_name, phone')
                .eq('id', user.id)
                .single();

            if (profile) {
                if (profile.full_name) {
                    document.getElementById('full-name').value = profile.full_name;
                }
                if (profile.phone) {
                    document.getElementById('phone').value = profile.phone;
                }
            }
        } catch (error) {
            console.error('Error prefilling user data:', error);
        }
    }

    // ============================================================================
    // Form Handlers
    // ============================================================================

    function setupFormHandlers() {
        // City selection - show "other" field
        const citySelect = document.getElementById('city');
        const otherCityGroup = document.getElementById('other-city-group');

        citySelect.addEventListener('change', () => {
            if (citySelect.value === 'other') {
                otherCityGroup.style.display = 'block';
                document.getElementById('other-city').required = true;
            } else {
                otherCityGroup.style.display = 'none';
                document.getElementById('other-city').required = false;
            }
        });

        // Form submission
        const form = document.getElementById('patient-form');
        form.addEventListener('submit', handleFormSubmit);
    }

    async function handleFormSubmit(e) {
        e.preventDefault();

        const submitBtn = document.getElementById('submit-btn');

        // Prevent double submission
        if (submitBtn.classList.contains('loading')) return;

        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        try {
            const user = await AuthGuard.getCurrentUser();
            if (!user) throw new Error('משתמש לא מחובר');

            // Collect form data
            const formData = collectFormData();

            // Validate
            if (!validateFormData(formData)) {
                throw new Error('אנא מלאו את כל השדות הנדרשים');
            }

            // Step 1: Insert into patients table
            await insertPatientRecord(user.id, formData);

            // Step 2: Update profile role to 'patient'
            await updateProfileRole(user.id, 'patient');

            // Step 3: Update profile with name and phone if changed
            await updateProfileDetails(user.id, formData);

            // Success!
            showToast('הבקשה נשלחה בהצלחה! מעביר אותך...', 'success');

            setTimeout(() => {
                window.location.href = 'patient-dashboard.html';
            }, 2000);

        } catch (error) {
            console.error('Error submitting form:', error);
            showToast(error.message || 'שגיאה בשליחת הטופס', 'error');
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    }

    function collectFormData() {
        const citySelect = document.getElementById('city');
        let city = citySelect.value;

        // If "other" selected, use the custom city input
        if (city === 'other') {
            city = document.getElementById('other-city').value;
        }

        // Get therapy preference
        const therapyPref = document.querySelector('input[name="therapy_preference"]:checked');

        // Get therapist gender preference
        const genderPref = document.querySelector('input[name="therapist_gender"]:checked');

        return {
            full_name: document.getElementById('full-name').value.trim(),
            phone: document.getElementById('phone').value.trim(),
            city: city,
            therapy_preference: therapyPref ? therapyPref.value : null,
            therapist_gender: genderPref ? genderPref.value : 'any',
            main_concern: document.getElementById('main-concern').value.trim()
        };
    }

    function validateFormData(data) {
        if (!data.full_name || data.full_name.length < 2) {
            showToast('אנא הזינו שם מלא', 'error');
            return false;
        }

        if (!data.phone || data.phone.length < 9) {
            showToast('אנא הזינו מספר טלפון תקין', 'error');
            return false;
        }

        if (!data.city) {
            showToast('אנא בחרו עיר מגורים', 'error');
            return false;
        }

        if (!data.therapy_preference) {
            showToast('אנא בחרו העדפת טיפול', 'error');
            return false;
        }

        if (!data.main_concern || data.main_concern.length < 10) {
            showToast('אנא תארו בקצרה במה נוכל לעזור', 'error');
            return false;
        }

        return true;
    }

    // ============================================================================
    // Database Operations
    // ============================================================================

    async function insertPatientRecord(userId, formData) {
        const patientData = {
            user_id: userId,
            occupation: formData.city,  // Using occupation field for city
            main_concern: formData.main_concern,
            preferred_therapist_gender: formData.therapist_gender,
            availability: [formData.therapy_preference],  // Store preference in availability array
            status: 'pending',
            agreement_signed: true,  // They signed via legal-gate
            intake_completed: true
        };

        const { data, error } = await window.supabaseClient
            .from('patients')
            .insert(patientData)
            .select()
            .single();

        if (error) {
            console.error('Error inserting patient:', error);
            throw new Error('שגיאה בשמירת הפרטים');
        }

        console.log('Patient record created:', data);
        return data;
    }

    async function updateProfileRole(userId, role) {
        const { error } = await window.supabaseClient
            .from('profiles')
            .update({ role: role })
            .eq('id', userId);

        if (error) {
            console.error('Error updating profile role:', error);
            // Don't throw - patient was already created
        }
    }

    async function updateProfileDetails(userId, formData) {
        const { error } = await window.supabaseClient
            .from('profiles')
            .update({
                full_name: formData.full_name,
                phone: formData.phone
            })
            .eq('id', userId);

        if (error) {
            console.error('Error updating profile details:', error);
            // Don't throw - patient was already created
        }
    }

    // ============================================================================
    // UI Helpers
    // ============================================================================

    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }

    // Export for potential external use
    window.PatientFlow = {
        checkExistingPatient,
        showToast
    };

})();
