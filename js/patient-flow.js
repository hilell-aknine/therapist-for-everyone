// ============================================================================
// Patient Flow - Handles patient registration and form submission
// ============================================================================

(function() {
    'use strict';

    // Email notification configuration
    const SUPABASE_FUNCTIONS_URL = 'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpbWN1ZG1sZmpseXhqeXJkY2djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTA5MDYsImV4cCI6MjA4NDk4NjkwNn0.ESXViZ0DZxopHxHNuC6vRn3iIZz1KZkQcXwgLhK_nQw';
    const ADMIN_DASHBOARD_URL = 'https://hilell-aknine.github.io/therapist-for-everyone/admin-dashboard.html';

    // Send admin notification for new patient registration
    async function sendAdminNotification(formData, userEmail = null) {
        try {
            const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/send-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    type: 'new_patient_admin',
                    to: 'admin@therapist-for-everyone.com', // Will be overridden by ADMIN_EMAIL env var
                    data: {
                        patientName: formData.full_name,
                        patientEmail: userEmail,
                        patientPhone: formData.phone,
                        mainConcern: formData.main_concern,
                        dashboardUrl: ADMIN_DASHBOARD_URL
                    }
                })
            });

            const result = await response.json();
            if (result.success) {
                console.log('Admin notification sent for new patient');
            } else {
                console.error('Admin notification failed:', result.error);
            }
        } catch (error) {
            console.error('Error sending admin notification:', error);
        }
    }

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

    // Check if user has access
    // NOTE: Auth is NOT required for lead capture - forms work for everyone
    async function checkAccess() {
        // Check if user is logged in (optional - for prefill and duplicate check)
        const user = window.AuthGuard ? await AuthGuard.getCurrentUser() : null;

        if (user) {
            // If logged in, check if already registered as patient
            const existingPatient = await checkExistingPatient(user.id);
            if (existingPatient) {
                showToast('כבר נרשמת כמטופל, מעביר אותך...', 'success');
                setTimeout(() => {
                    window.location.href = 'patient-dashboard.html';
                }, 1500);
                return false;
            }
        }

        // No login required - anyone can fill the form
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

    // Pre-fill form with user data from profile (if logged in)
    async function prefillUserData() {
        try {
            // Only prefill if user is logged in
            if (!window.AuthGuard) return;

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
            // Collect form data
            const formData = collectFormData();

            // Validate
            if (!validateFormData(formData)) {
                throw new Error('אנא מלאו את כל השדות הנדרשים');
            }

            // Check if user is logged in (optional)
            const user = window.AuthGuard ? await AuthGuard.getCurrentUser() : null;

            if (user) {
                // Logged in user - save to patients table
                await insertPatientRecord(user.id, formData);
                await updateProfileRole(user.id, 'patient');
                await updateProfileDetails(user.id, formData);

                // Send admin notification (background)
                sendAdminNotification(formData, user.email);

                showToast('הבקשה נשלחה בהצלחה! מעביר אותך...', 'success');
                setTimeout(() => {
                    window.location.href = 'patient-dashboard.html';
                }, 2000);
            } else {
                // Anonymous user - save as lead to contact_requests
                await insertContactRequest(formData);

                // Send admin notification (background)
                sendAdminNotification(formData);

                showToast('הפרטים נשלחו בהצלחה! ניצור איתך קשר בהקדם', 'success');
                setTimeout(() => {
                    window.location.href = 'thank-you.html';
                }, 2000);
            }

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

    // Insert anonymous patient directly to patients table
    async function insertContactRequest(formData) {
        // For anonymous users - save directly to patients table
        const patientData = {
            full_name: formData.full_name,
            phone: formData.phone,
            email: formData.email || null,
            city: formData.city,
            main_concern: formData.main_concern,
            status: 'new'
        };

        const { error } = await window.supabaseClient
            .from('patients')
            .insert(patientData);

        if (error) {
            console.error('Error inserting patient:', error);
            throw new Error('שגיאה בשמירת הפרטים');
        }

        console.log('Anonymous patient created');
        return { success: true };
    }

    async function insertPatientRecord(userId, formData) {
        const patientData = {
            user_id: userId,
            full_name: formData.full_name,
            phone: formData.phone,
            email: null,
            city: formData.city,
            main_concern: formData.main_concern,
            status: 'new'
        };

        const { error } = await window.supabaseClient
            .from('patients')
            .insert(patientData);

        if (error) {
            console.error('Error inserting patient:', error);
            throw new Error('שגיאה בשמירת הפרטים');
        }

        console.log('Patient record created');
        return { success: true };
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
