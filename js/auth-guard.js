// ============================================================================
// Auth Guard - The Bouncer
// Handles authentication, role verification, and legal consent checks
// ============================================================================

(function() {
    'use strict';

    // Prevent double initialization
    if (window._authGuardInitialized) {
        console.warn('auth-guard.js already loaded, skipping re-initialization');
        return;
    }
    window._authGuardInitialized = true;

    // Current legal agreement version - UPDATE THIS when terms change
    const CURRENT_LEGAL_VERSION = '1.0';

    // Pages that don't require legal consent (public pages)
    const PUBLIC_PAGES = [
        'index.html',
        'legal-gate.html',
        'landing-patient.html',
        'landing-therapist.html',
        ''  // Root path
    ];

    // ============================================================================
    // Core Guard Functions
    // ============================================================================

    const AuthGuard = {
        /**
         * Check if user is logged in
         * @returns {Promise<Object|null>} User object or null
         */
        async getCurrentUser() {
            try {
                const { data: { user } } = await window.supabaseClient.auth.getUser();
                return user;
            } catch (error) {
                console.error('Error getting current user:', error);
                return null;
            }
        },

        /**
         * Check if user has signed the current legal agreement
         * @param {string} userId - User ID to check
         * @returns {Promise<boolean>} True if consent exists
         */
        async hasLegalConsent(userId) {
            try {
                const { data, error } = await window.supabaseClient
                    .from('legal_consents')
                    .select('id, agreed_version')
                    .eq('user_id', userId)
                    .eq('agreed_version', CURRENT_LEGAL_VERSION)
                    .maybeSingle();

                if (error) {
                    console.error('Error checking legal consent:', error);
                    return false;
                }

                return data !== null;
            } catch (error) {
                console.error('Error in hasLegalConsent:', error);
                return false;
            }
        },

        /**
         * Get user's role from profiles table
         * @param {string} userId - User ID
         * @returns {Promise<string|null>} Role or null
         */
        async getUserRole(userId) {
            try {
                console.log('AuthGuard: Getting role for user:', userId);

                const { data, error } = await window.supabaseClient
                    .from('profiles')
                    .select('role')
                    .eq('id', userId)
                    .single();

                console.log('AuthGuard: Profile query result:', { data, error });

                if (error) {
                    console.error('Error getting user role:', error);
                    return null;
                }

                const role = data?.role || 'student';
                console.log('AuthGuard: User role is:', role);
                return role;
            } catch (error) {
                console.error('Error in getUserRole:', error);
                return null;
            }
        },

        /**
         * Check if user is admin (via DB, NOT hardcoded emails)
         * @param {string} userId - User ID
         * @returns {Promise<boolean>}
         */
        async isAdmin(userId) {
            const role = await this.getUserRole(userId);
            return role === 'admin';
        },

        /**
         * Main guard function - checks auth and legal consent
         * Redirects to legal-gate.html if consent is missing
         * @param {Object} options - Configuration options
         * @param {boolean} options.requireAuth - Require authentication (default: true)
         * @param {boolean} options.requireConsent - Require legal consent (default: true)
         * @param {string} options.requiredRole - Require specific role (optional)
         * @returns {Promise<Object|null>} User object if all checks pass, null otherwise
         */
        async checkAccess(options = {}) {
            const {
                requireAuth = true,
                requireConsent = true,
                requiredRole = null
            } = options;

            // Get current page
            const currentPage = window.location.pathname.split('/').pop() || '';

            // Skip checks for public pages
            if (PUBLIC_PAGES.includes(currentPage)) {
                const user = await this.getCurrentUser();
                return { user, role: null, hasConsent: null };
            }

            // Step 1: Check authentication
            const user = await this.getCurrentUser();

            if (requireAuth && !user) {
                console.log('AuthGuard: User not logged in, redirecting to index');
                window.location.href = 'index.html';
                return null;
            }

            if (!user) {
                return { user: null, role: null, hasConsent: null };
            }

            // Step 2: Check legal consent
            if (requireConsent) {
                const hasConsent = await this.hasLegalConsent(user.id);

                if (!hasConsent) {
                    console.log('AuthGuard: No legal consent, redirecting to legal-gate');
                    window.location.href = 'legal-gate.html';
                    return null;
                }
            }

            // Step 3: Check role if required
            const role = await this.getUserRole(user.id);

            if (requiredRole && role !== requiredRole) {
                console.log(`AuthGuard: Role mismatch. Required: ${requiredRole}, Got: ${role}`);
                // Redirect based on actual role
                this.redirectByRole(role);
                return null;
            }

            return { user, role, hasConsent: true };
        },

        /**
         * Shortcut: Check only legal consent and redirect if missing
         * Use this at the top of protected pages
         * @returns {Promise<boolean>} True if consent exists
         */
        async checkLegalConsent() {
            const user = await this.getCurrentUser();

            if (!user) {
                console.log('AuthGuard: Not logged in');
                window.location.href = 'index.html';
                return false;
            }

            const hasConsent = await this.hasLegalConsent(user.id);

            if (!hasConsent) {
                console.log('AuthGuard: No legal consent found, redirecting...');
                window.location.href = 'legal-gate.html';
                return false;
            }

            return true;
        },

        /**
         * Sign legal agreement and store consent
         * @returns {Promise<Object>} Result object
         */
        async signLegalAgreement() {
            try {
                const user = await this.getCurrentUser();

                if (!user) {
                    throw new Error('User must be logged in to sign agreement');
                }

                // Get IP address (via free API)
                let ipAddress = 'unknown';
                try {
                    const ipResponse = await fetch('https://api.ipify.org?format=json');
                    const ipData = await ipResponse.json();
                    ipAddress = ipData.ip;
                } catch (e) {
                    console.warn('Could not fetch IP address:', e);
                }

                // Insert consent record
                const { data, error } = await window.supabaseClient
                    .from('legal_consents')
                    .insert({
                        user_id: user.id,
                        agreed_version: CURRENT_LEGAL_VERSION,
                        ip_address: ipAddress,
                        user_agent: navigator.userAgent
                    })
                    .select()
                    .single();

                if (error) {
                    // Check if it's a duplicate (already signed)
                    if (error.code === '23505') {
                        console.log('User already signed this version');
                        return { success: true, alreadySigned: true };
                    }
                    throw error;
                }

                console.log('Legal consent recorded:', data);
                return { success: true, data };

            } catch (error) {
                console.error('Error signing legal agreement:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Redirect user based on their role
         * @param {string} role - User's role
         */
        redirectByRole(role) {
            switch (role) {
                case 'admin':
                    window.location.href = 'admin-dashboard.html';
                    break;
                case 'therapist':
                    window.location.href = 'therapist-dashboard.html';
                    break;
                case 'patient':
                    window.location.href = 'patient-dashboard.html';
                    break;
                default:
                    window.location.href = 'index.html';
            }
        },

        /**
         * Get current legal version
         * @returns {string}
         */
        getLegalVersion() {
            return CURRENT_LEGAL_VERSION;
        }
    };

    // ============================================================================
    // Auto-initialization for protected pages
    // ============================================================================

    // Wait for supabase-client.js to initialize
    const waitForSupabase = () => {
        return new Promise((resolve) => {
            if (window.supabaseClient) {
                resolve();
            } else {
                const checkInterval = setInterval(() => {
                    if (window.supabaseClient) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 50);

                // Timeout after 5 seconds
                setTimeout(() => {
                    clearInterval(checkInterval);
                    console.error('AuthGuard: Supabase client not found after 5s');
                    resolve();
                }, 5000);
            }
        });
    };

    // ============================================================================
    // Export to Window
    // ============================================================================

    window.AuthGuard = AuthGuard;

    // Convenience function for quick access
    window.checkLegalConsent = () => AuthGuard.checkLegalConsent();

    console.log('auth-guard.js loaded successfully');

})();
