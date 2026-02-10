// ============================================================================
// Supabase Client - מטפל לכל אחד
// ============================================================================

(function() {
    'use strict';

    // Prevent double initialization
    if (window._supabaseClientInitialized) {
        console.warn('supabase-client.js already loaded, skipping re-initialization');
        return;
    }
    window._supabaseClientInitialized = true;

    const SUPABASE_URL = 'https://eimcudmlfjlyxjyrdcgc.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpbWN1ZG1sZmpseXhqeXJkY2djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTA5MDYsImV4cCI6MjA4NDk4NjkwNn0.ESXViZ0DZxopHxHNuC6vRn3iIZz1KZkQcXwgLhK_nQw';

    // Initialize Supabase client (use existing or create new)
    // Note: window.supabase comes from the CDN script
    const supabaseClient = window.supabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabaseClient = supabaseClient;

    // ============================================================================
    // Authentication Functions
    // ============================================================================

    const Auth = {
        async signUp(email, password, fullName) {
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: fullName }
                }
            });
            if (error) throw error;
            return data;
        },

        async signIn(email, password) {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });
            if (error) throw error;
            return data;
        },

        async signInWithGoogle() {
            const { data, error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin }
            });
            if (error) throw error;
            return data;
        },

        async signOut() {
            const { error } = await supabaseClient.auth.signOut();
            if (error) throw error;
        },

        async getCurrentUser() {
            const { data: { user } } = await supabaseClient.auth.getUser();
            return user;
        },

        async getSession() {
            const { data: { session } } = await supabaseClient.auth.getSession();
            return session;
        },

        onAuthStateChange(callback) {
            return supabaseClient.auth.onAuthStateChange((event, session) => {
                callback(event, session);
            });
        },

        async resetPassword(email) {
            const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password'
            });
            if (error) throw error;
            return data;
        },

        async updatePassword(newPassword) {
            const { data, error } = await supabaseClient.auth.updateUser({
                password: newPassword
            });
            if (error) throw error;
            return data;
        }
    };

    // ============================================================================
    // Profile Functions
    // ============================================================================

    const Profiles = {
        async get(userId) {
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();
            if (error) throw error;
            return data;
        },

        async getCurrent() {
            const user = await Auth.getCurrentUser();
            if (!user) return null;
            return this.get(user.id);
        },

        async update(userId, updates) {
            const { data, error } = await supabaseClient
                .from('profiles')
                .update(updates)
                .eq('id', userId)
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async uploadAvatar(userId, file) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${userId}-${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            const { error: uploadError } = await supabaseClient.storage
                .from('avatars')
                .upload(filePath, file);
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabaseClient.storage
                .from('avatars')
                .getPublicUrl(filePath);

            await this.update(userId, { avatar_url: publicUrl });
            return publicUrl;
        }
    };

    // ============================================================================
    // Therapist Functions
    // ============================================================================

    const Therapists = {
        async getAll() {
            const { data, error } = await supabaseClient
                .from('therapists')
                .select(`*, profiles (full_name, avatar_url, email, phone)`)
                .eq('is_active', true)
                .order('rating', { ascending: false });
            if (error) throw error;
            return data;
        },

        async getById(id) {
            const { data, error } = await supabaseClient
                .from('therapists')
                .select(`*, profiles (full_name, avatar_url, email, phone)`)
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        },

        async getCurrent() {
            const user = await Auth.getCurrentUser();
            if (!user) return null;

            const { data, error } = await supabaseClient
                .from('therapists')
                .select('*')
                .eq('user_id', user.id)
                .single();
            if (error && error.code !== 'PGRST116') throw error;
            return data;
        },

        async register(therapistData) {
            const user = await Auth.getCurrentUser();
            if (!user) throw new Error('יש להתחבר תחילה');

            await Profiles.update(user.id, { role: 'therapist' });

            const { data, error } = await supabaseClient
                .from('therapists')
                .insert({ user_id: user.id, ...therapistData })
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async update(id, updates) {
            const { data, error } = await supabaseClient
                .from('therapists')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async getReviews(therapistId) {
            const { data, error } = await supabaseClient
                .from('reviews')
                .select(`*, patients (profiles (full_name))`)
                .eq('therapist_id', therapistId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        },

        async getAppointments(therapistId, status = null) {
            let query = supabaseClient
                .from('appointments')
                .select(`*, patients (user_id, profiles (full_name, phone))`)
                .eq('therapist_id', therapistId)
                .order('scheduled_at', { ascending: true });

            if (status) {
                query = query.eq('status', status);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data;
        }
    };

    // ============================================================================
    // Patient Functions
    // ============================================================================

    const Patients = {
        async getCurrent() {
            const user = await Auth.getCurrentUser();
            if (!user) return null;

            const { data, error } = await supabaseClient
                .from('patients')
                .select(`*, therapists (id, profiles (full_name, avatar_url))`)
                .eq('user_id', user.id)
                .single();
            if (error && error.code !== 'PGRST116') throw error;
            return data;
        },

        async register(patientData) {
            const user = await Auth.getCurrentUser();
            if (!user) throw new Error('יש להתחבר תחילה');

            await Profiles.update(user.id, { role: 'patient' });

            const { data, error } = await supabaseClient
                .from('patients')
                .insert({ user_id: user.id, ...patientData })
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async update(id, updates) {
            const { data, error } = await supabaseClient
                .from('patients')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async getAppointments(patientId) {
            const { data, error } = await supabaseClient
                .from('appointments')
                .select(`*, therapists (profiles (full_name, avatar_url, phone))`)
                .eq('patient_id', patientId)
                .order('scheduled_at', { ascending: false });
            if (error) throw error;
            return data;
        },

        async submitReview(reviewData) {
            const { data, error } = await supabaseClient
                .from('reviews')
                .insert(reviewData)
                .select()
                .single();
            if (error) throw error;
            return data;
        }
    };

    // ============================================================================
    // Appointments Functions
    // ============================================================================

    const Appointments = {
        async create(appointmentData) {
            const { data, error } = await supabaseClient
                .from('appointments')
                .insert(appointmentData)
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async update(id, updates) {
            const { data, error } = await supabaseClient
                .from('appointments')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async cancel(id) {
            return this.update(id, { status: 'cancelled' });
        },

        async complete(id) {
            return this.update(id, { status: 'completed' });
        }
    };

    // ============================================================================
    // Course Progress Functions
    // ============================================================================

    const CourseProgress = {
        async getAll(courseType = null) {
            const user = await Auth.getCurrentUser();
            if (!user) return [];

            let query = supabaseClient
                .from('course_progress')
                .select('*')
                .eq('user_id', user.id);

            if (courseType) {
                query = query.eq('course_type', courseType);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data;
        },

        async isVideoWatched(videoId) {
            const user = await Auth.getCurrentUser();
            if (!user) return false;

            const { data, error } = await supabaseClient
                .from('course_progress')
                .select('completed')
                .eq('user_id', user.id)
                .eq('video_id', videoId)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            return data?.completed || false;
        },

        async markVideoWatched(videoId, courseType, lessonNumber) {
            const user = await Auth.getCurrentUser();
            if (!user) throw new Error('יש להתחבר תחילה');

            const { data, error } = await supabaseClient
                .from('course_progress')
                .upsert({
                    user_id: user.id,
                    video_id: videoId,
                    course_type: courseType,
                    lesson_number: lessonNumber,
                    completed: true,
                    completed_at: new Date().toISOString()
                }, { onConflict: 'user_id,video_id' })
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async updateWatchTime(videoId, seconds) {
            const user = await Auth.getCurrentUser();
            if (!user) return;

            await supabaseClient
                .from('course_progress')
                .upsert({
                    user_id: user.id,
                    video_id: videoId,
                    watched_seconds: seconds
                }, { onConflict: 'user_id,video_id', ignoreDuplicates: false });
        },

        async getCourseCompletion(courseType, totalVideos) {
            const progress = await this.getAll(courseType);
            const completed = progress.filter(p => p.completed).length;
            return Math.round((completed / totalVideos) * 100);
        }
    };

    // ============================================================================
    // Contact Requests Functions
    // ============================================================================

    const ContactRequests = {
        async submit(requestData) {
            // Note: No .select() - anon users can INSERT but not SELECT
            const { error } = await supabaseClient
                .from('contact_requests')
                .insert(requestData);
            if (error) throw error;
            return { success: true };
        }
    };

    // ============================================================================
    // Certifications Functions
    // ============================================================================

    const Certifications = {
        async getAll() {
            const user = await Auth.getCurrentUser();
            if (!user) return [];

            const { data, error } = await supabaseClient
                .from('certifications')
                .select('*')
                .eq('user_id', user.id);
            if (error) throw error;
            return data;
        },

        async hasCertification(type) {
            const certs = await this.getAll();
            return certs.some(c => c.certification_type === type && c.passed);
        }
    };

    // ============================================================================
    // UI Helper Functions
    // ============================================================================

    const UI = {
        showSuccess(message) {
            this.showToast(message, 'success');
        },

        showError(message) {
            this.showToast(message, 'error');
        },

        showToast(message, type = 'info') {
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.textContent = message;
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 1rem 2rem;
                border-radius: 10px;
                color: white;
                font-weight: 500;
                z-index: 9999;
                animation: slideUp 0.3s ease-out;
                background: ${type === 'success' ? '#2F8592' : type === 'error' ? '#FF6F61' : '#00606B'};
            `;
            document.body.appendChild(toast);

            setTimeout(() => {
                toast.style.animation = 'slideDown 0.3s ease-out';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        },

        showLoading() {
            const loader = document.createElement('div');
            loader.id = 'global-loader';
            loader.innerHTML = `
                <div style="
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 59, 70, 0.9);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                ">
                    <div style="
                        width: 50px;
                        height: 50px;
                        border: 3px solid rgba(212, 175, 55, 0.3);
                        border-top-color: #D4AF37;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    "></div>
                </div>
            `;
            document.body.appendChild(loader);
        },

        hideLoading() {
            const loader = document.getElementById('global-loader');
            if (loader) loader.remove();
        },

        updateAuthUI(user) {
            const authButtons = document.getElementById('auth-buttons');
            const userMenu = document.getElementById('user-menu');

            if (user) {
                if (authButtons) authButtons.style.display = 'none';
                if (userMenu) {
                    userMenu.style.display = 'flex';
                    const userName = userMenu.querySelector('.user-name');
                    if (userName) userName.textContent = user.user_metadata?.full_name || user.email;
                }
            } else {
                if (authButtons) authButtons.style.display = 'flex';
                if (userMenu) userMenu.style.display = 'none';
            }
        }
    };

    // ============================================================================
    // Initialize
    // ============================================================================

    // CSS Animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { opacity: 0; transform: translate(-50%, 20px); }
            to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes slideDown {
            from { opacity: 1; transform: translate(-50%, 0); }
            to { opacity: 0; transform: translate(-50%, 20px); }
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    // ============================================================================
    // Ensure Profile Exists (CRM fallback — runs on every page)
    // ============================================================================

    async function ensureProfile(user) {
        if (!user) return;
        try {
            const { data: existing, error: fetchError } = await supabaseClient
                .from('profiles')
                .select('id, roles')
                .eq('id', user.id)
                .single();

            if (fetchError && fetchError.code !== 'PGRST116') {
                console.error('Profile fetch error:', fetchError);
                return;
            }

            if (!existing) {
                const fullName = user.user_metadata?.full_name ||
                                user.user_metadata?.name ||
                                user.email?.split('@')[0] ||
                                'משתמש חדש';

                const { error: insertError } = await supabaseClient
                    .from('profiles')
                    .insert([{
                        id: user.id,
                        email: user.email,
                        full_name: fullName,
                        roles: ['student_lead'],
                        created_at: new Date().toISOString()
                    }]);

                if (insertError) {
                    console.error('Profile create error:', insertError);
                } else {
                    console.log('Profile created for:', user.email);
                }
            }
        } catch (err) {
            console.error('ensureProfile error:', err);
        }
    }

    // Auth state change listener
    Auth.onAuthStateChange(async (event, session) => {
        console.log('Auth state changed:', event);
        UI.updateAuthUI(session?.user);
        if (event === 'SIGNED_IN' && session?.user) {
            await ensureProfile(session.user);
        }
    });

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', async () => {
        const session = await Auth.getSession();
        UI.updateAuthUI(session?.user);
        if (session?.user) {
            await ensureProfile(session.user);
        }
    });

    // ============================================================================
    // EXPORT TO WINDOW - Make all helpers globally accessible
    // ============================================================================

    // Attach all helpers directly to window for easy access
    window.Auth = Auth;
    window.Profiles = Profiles;
    window.Therapists = Therapists;
    window.Patients = Patients;
    window.Appointments = Appointments;
    window.CourseProgress = CourseProgress;
    window.ContactRequests = ContactRequests;
    window.Certifications = Certifications;
    window.UI = UI;

    // Also export as a namespace for backwards compatibility
    window.TherapistApp = {
        supabaseClient: supabaseClient,
        Auth: Auth,
        Profiles: Profiles,
        Therapists: Therapists,
        Patients: Patients,
        Appointments: Appointments,
        CourseProgress: CourseProgress,
        ContactRequests: ContactRequests,
        Certifications: Certifications,
        UI: UI
    };

    console.log('supabase-client.js loaded successfully');

})();
