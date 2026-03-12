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

    const SUPABASE_URL = window.SUPABASE_CONFIG?.url || 'https://eimcudmlfjlyxjyrdcgc.supabase.co';
    const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.anonKey || '';

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
                options: { redirectTo: 'https://www.therapist-home.com/pages/course-library.html' }
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
                redirectTo: 'https://www.therapist-home.com/reset-password'
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
        },

        async saveLastWatched(courseType, moduleIndex, lessonIndex) {
            const user = await Auth.getCurrentUser();
            if (!user) return;

            // Note: watched_seconds is repurposed to store moduleIndex for last_watched records.
            // lesson_number stores the lessonIndex within that module.
            await supabaseClient
                .from('course_progress')
                .upsert({
                    user_id: user.id,
                    video_id: `last_watched_${courseType}`,
                    course_type: courseType,
                    lesson_number: lessonIndex,
                    watched_seconds: moduleIndex,
                    completed: false
                }, { onConflict: 'user_id,video_id', ignoreDuplicates: false });
        },

        async getLastWatched(courseType) {
            const user = await Auth.getCurrentUser();
            if (!user) return null;

            const { data, error } = await supabaseClient
                .from('course_progress')
                .select('lesson_number, watched_seconds')
                .eq('user_id', user.id)
                .eq('video_id', `last_watched_${courseType}`)
                .single();

            if (error && error.code !== 'PGRST116') return null;
            if (!data) return null;
            // watched_seconds = moduleIndex, lesson_number = lessonIndex
            return { moduleIndex: data.watched_seconds, lessonIndex: data.lesson_number };
        },

        async getCompletedVideoIds(courseType) {
            const user = await Auth.getCurrentUser();
            if (!user) return [];

            const { data, error } = await supabaseClient
                .from('course_progress')
                .select('video_id')
                .eq('user_id', user.id)
                .eq('course_type', courseType)
                .eq('completed', true);

            if (error) return [];
            return (data || [])
                .map(p => p.video_id)
                .filter(id => !id.startsWith('last_watched_'));
        }
    };

    // ============================================================================
    // User Notes Functions (Supabase-synced lesson notes)
    // ============================================================================

    const UserNotes = {
        async save(videoId, content, metadata = {}) {
            const user = await Auth.getCurrentUser();
            if (!user) return null;

            const { data, error } = await supabaseClient
                .from('user_notes')
                .upsert({
                    user_id: user.id,
                    video_id: videoId,
                    content: content,
                    course_type: metadata.courseType || 'nlp-practitioner',
                    lesson_title: metadata.lessonTitle || null,
                    module_title: metadata.moduleTitle || null,
                    lesson_number: metadata.lessonNumber || null,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,video_id' })
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async get(videoId) {
            const user = await Auth.getCurrentUser();
            if (!user) return null;

            const { data, error } = await supabaseClient
                .from('user_notes')
                .select('*')
                .eq('user_id', user.id)
                .eq('video_id', videoId)
                .single();
            if (error && error.code !== 'PGRST116') throw error;
            return data;
        },

        async getAll(courseType) {
            const user = await Auth.getCurrentUser();
            if (!user) return [];

            let query = supabaseClient
                .from('user_notes')
                .select('*')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false });

            if (courseType) {
                query = query.eq('course_type', courseType);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        },

        async delete(videoId) {
            const user = await Auth.getCurrentUser();
            if (!user) return;

            const { error } = await supabaseClient
                .from('user_notes')
                .delete()
                .eq('user_id', user.id)
                .eq('video_id', videoId);
            if (error) throw error;
        }
    };

    // ============================================================================
    // Contact Requests Functions
    // ============================================================================

    const ContactRequests = {
        /**
         * Submit a lead via the Turnstile-protected Edge Function.
         * Falls back to direct insert for authenticated users if Edge Function is unreachable.
         * @param {object} requestData - The lead data to insert
         * @param {string} [turnstileToken] - Cloudflare Turnstile token from the DOM widget
         * @param {string} [table='contact_requests'] - Target table
         */
        async submit(requestData, turnstileToken = null, table = 'contact_requests') {
            const functionsUrl = window.SUPABASE_CONFIG?.functionsUrl ||
                'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1';

            // Always route through Edge Function (uses service_role, bypasses RLS)
            // Turnstile token is optional — Edge Function skips verification when not configured
            try {
                const res = await fetch(`${functionsUrl}/submit-lead`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: table,
                        data: requestData,
                        turnstileToken: turnstileToken || undefined
                    })
                });

                const result = await res.json();
                if (!res.ok) {
                    throw new Error(result.error || 'שגיאה בשליחת הטופס');
                }
                return { success: true };
            } catch (fetchErr) {
                // Fallback: direct insert (only works for authenticated users)
                const { error } = await supabaseClient
                    .from(table)
                    .insert(requestData);
                if (error) throw error;
                return { success: true };
            }
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

    // Hebrew translation map for common Supabase / Auth errors
    const ERROR_TRANSLATIONS = {
        'Invalid login credentials': 'אימייל או סיסמה שגויים',
        'Email not confirmed': 'יש לאשר את כתובת האימייל לפני התחברות',
        'User already registered': 'כתובת האימייל כבר רשומה במערכת',
        'Password should be at least 6 characters': 'הסיסמה חייבת להכיל לפחות 6 תווים',
        'Signup requires a valid password': 'יש להזין סיסמה תקינה',
        'Unable to validate email address: invalid format': 'כתובת האימייל אינה תקינה',
        'Token has expired or is invalid': 'פג תוקף ההתחברות. יש להתחבר מחדש',
        'New password should be different from the old password': 'הסיסמה החדשה חייבת להיות שונה מהקודמת',
        'For security purposes, you can only request this once every 60 seconds': 'מטעמי אבטחה, ניתן לשלוח בקשה זו פעם ב-60 שניות',
        'User not found': 'המשתמש לא נמצא במערכת',
        'Rate limit exceeded': 'יותר מדי ניסיונות. נסו שוב בעוד מספר דקות',
        'Email rate limit exceeded': 'נשלחו יותר מדי אימיילים. נסו שוב מאוחר יותר',
    };

    function translateError(errorMessage) {
        if (!errorMessage) return 'אירעה שגיאה. נסו שוב מאוחר יותר';
        return ERROR_TRANSLATIONS[errorMessage] || errorMessage;
    }

    const UI = {
        showSuccess(message) {
            this.showToast(message, 'success');
        },

        showError(message) {
            this.showToast(translateError(message), 'error');
        },

        showToast(message, type = 'info') {
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.setAttribute('role', 'alert');
            toast.setAttribute('aria-live', 'polite');
            toast.setAttribute('aria-atomic', 'true');

            const msg = document.createElement('span');
            msg.textContent = message;

            const dismiss = document.createElement('button');
            dismiss.textContent = '\u2715';
            dismiss.setAttribute('aria-label', 'סגור הודעה');
            dismiss.style.cssText = 'background:none;border:none;color:white;font-size:1.1rem;cursor:pointer;margin-right:12px;padding:0 4px;opacity:0.8;';
            dismiss.addEventListener('click', () => { toast.style.animation = 'slideDown 0.3s ease-out'; setTimeout(() => toast.remove(), 300); });

            toast.appendChild(msg);
            toast.appendChild(dismiss);
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 1rem 1.2rem 1rem 2rem;
                border-radius: 10px;
                color: white;
                font-weight: 500;
                z-index: 9999;
                animation: slideUp 0.3s ease-out;
                display: flex;
                align-items: center;
                gap: 8px;
                background: ${type === 'success' ? '#2F8592' : type === 'error' ? '#FF6F61' : '#00606B'};
            `;
            document.body.appendChild(toast);

            setTimeout(() => {
                if (toast.parentNode) {
                    toast.style.animation = 'slideDown 0.3s ease-out';
                    setTimeout(() => toast.remove(), 300);
                }
            }, 4000);
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

        /**
         * Trap focus inside a modal element. Returns a cleanup function.
         * @param {HTMLElement} modal - The modal container element
         * @returns {Function} Call to remove the trap
         */
        trapFocus(modal) {
            const focusable = modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
            if (!focusable.length) return () => {};
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            first.focus();
            function handler(e) {
                if (e.key !== 'Tab') return;
                if (e.shiftKey) {
                    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
                } else {
                    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
            }
            modal.addEventListener('keydown', handler);
            return () => modal.removeEventListener('keydown', handler);
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
            // Clear auth-pending state (prevents UI flicker)
            document.querySelectorAll('[data-auth-pending]').forEach(el => el.removeAttribute('data-auth-pending'));
        }
    };

    // ============================================================================
    // P3-17: Form Autosave (localStorage, 30s interval)
    // ============================================================================

    const FormAutosave = {
        _key: null,
        _interval: null,

        init(containerSelector) {
            const container = containerSelector
                ? document.querySelector(containerSelector)
                : document.querySelector('form') || document.querySelector('main') || document.body;
            const inputs = container.querySelectorAll('input, select, textarea');
            if (!inputs.length) return;

            this._key = 'autosave_' + location.pathname;
            this._container = container;
            this._restore();
            this._interval = setInterval(() => this._save(), 30000);

            // Clear on form submit
            const form = container.closest('form') || container.querySelector('form');
            if (form) form.addEventListener('submit', () => this.clear());
        },

        _save() {
            if (!this._container) return;
            const data = {};
            this._container.querySelectorAll('input, select, textarea').forEach(el => {
                const key = el.name || el.id;
                if (!key || el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;
                if (el.type === 'checkbox') data[key] = el.checked;
                else if (el.type === 'radio') { if (el.checked) data[key] = el.value; }
                else if (el.value) data[key] = el.value;
            });
            if (Object.keys(data).length) {
                localStorage.setItem(this._key, JSON.stringify(data));
            }
        },

        _restore() {
            const saved = localStorage.getItem(this._key);
            if (!saved) return;
            try {
                const data = JSON.parse(saved);
                let restored = 0;
                Object.entries(data).forEach(([key, value]) => {
                    const el = this._container.querySelector(`[name="${key}"], #${CSS.escape(key)}`);
                    if (!el || el.value) return; // don't overwrite already-filled fields
                    if (el.type === 'checkbox') { el.checked = value; restored++; }
                    else if (el.type === 'radio') { if (el.value === value) { el.checked = true; restored++; } }
                    else { el.value = value; restored++; }
                });
                if (restored > 0) {
                    UI.showToast('שוחזרו נתונים שנשמרו אוטומטית', 'info');
                }
            } catch (e) { /* ignore corrupt data */ }
        },

        clear() {
            if (this._key) localStorage.removeItem(this._key);
            if (this._interval) clearInterval(this._interval);
        }
    };

    // ============================================================================
    // P3-18: Retry wrapper for network operations
    // ============================================================================

    async function withRetry(fn, maxRetries = 3) {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (err) {
                const isNetworkError = !navigator.onLine ||
                    (err.message && (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed')));
                if (!isNetworkError || attempt === maxRetries) throw err;
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
            }
        }
    }

    // ============================================================================
    // P3-20: Offline Detection Banner
    // ============================================================================

    function initOfflineDetection() {
        let banner = null;

        function showOfflineBanner() {
            if (banner) return;
            banner = document.createElement('div');
            banner.id = 'offline-banner';
            banner.setAttribute('role', 'alert');
            banner.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0;
                background: #FF6F61; color: white;
                text-align: center; padding: 10px 16px;
                font-family: 'Heebo', sans-serif; font-weight: 600;
                font-size: 0.9rem; z-index: 10001;
                animation: slideFromTop 0.3s ease-out;
            `;
            banner.textContent = 'אין חיבור לאינטרנט — ננסה שוב אוטומטית';
            document.body.prepend(banner);
        }

        function hideOfflineBanner() {
            if (!banner) return;
            banner.style.animation = 'slideFromTopOut 0.3s ease-out';
            setTimeout(() => { if (banner) { banner.remove(); banner = null; } }, 300);
        }

        window.addEventListener('offline', showOfflineBanner);
        window.addEventListener('online', () => {
            hideOfflineBanner();
            UI.showToast('החיבור חזר', 'success');
        });

        // Check on init
        if (!navigator.onLine) showOfflineBanner();
    }

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
        @keyframes slideFromTop {
            from { transform: translateY(-100%); }
            to { transform: translateY(0); }
        }
        @keyframes slideFromTopOut {
            from { transform: translateY(0); }
            to { transform: translateY(-100%); }
        }
        @keyframes flashSuccess {
            0% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.6); }
            50% { box-shadow: 0 0 20px 4px rgba(76, 175, 80, 0.4); }
            100% { box-shadow: none; }
        }
        .flash-success {
            animation: flashSuccess 0.8s ease-out;
        }
    `;
    document.head.appendChild(style);

    // Initialize offline detection
    initOfflineDetection();

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

            let isNewProfile = false;
            if (!existing) {
                isNewProfile = true;
                const fullName = user.user_metadata?.full_name ||
                                user.user_metadata?.name ||
                                user.email?.split('@')[0] ||
                                'משתמש חדש';
                const phone = user.user_metadata?.phone || null;

                const profileData = {
                    id: user.id,
                    email: user.email,
                    full_name: fullName,
                    roles: ['student_lead'],
                    created_at: new Date().toISOString()
                };
                if (phone) profileData.phone = phone;

                const { error: insertError } = await supabaseClient
                    .from('profiles')
                    .insert([profileData]);

                if (insertError) {
                    console.error('Profile create error:', insertError);
                }
            }

            // Ambassador Program: save referral for any user with pending ref data
            // (not just new profiles — existing users clicking a ref link also count)
            if (typeof window.getReferrerId === 'function') {
                const referrerId = window.getReferrerId();
                if (referrerId && referrerId !== user.id) {
                    const saved = await saveReferral(referrerId, user.id);
                    if (saved && typeof window.clearReferrerId === 'function') {
                        window.clearReferrerId();
                    }
                }
            }
        } catch (err) {
            console.error('ensureProfile error:', err);
        }
    }

    // Save referral record (Ambassador Program). Returns true on success.
    async function saveReferral(referrerId, referredUserId) {
        try {
            const { error } = await supabaseClient
                .from('referrals')
                .insert([{
                    referrer_id: referrerId,
                    referred_user_id: referredUserId
                }]);
            if (error) {
                // Duplicate or invalid referrer — silent fail (constraint handles it)
                console.warn('Referral save skipped:', error.message);
                return false;
            }
            return true;
        } catch (err) {
            console.error('saveReferral error:', err);
            return false;
        }
    }

    // Auth state change listener
    Auth.onAuthStateChange(async (event, session) => {
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
    // Referrals Module (Ambassador Program)
    // ============================================================================

    const Referrals = {
        /** Get referral link for the current user */
        getLink(userId) {
            return `https://www.therapist-home.com/pages/free-portal.html?ref=${userId}`;
        },

        /** Get current user's referral count (last 30 days) */
        async getMyCount(userId) {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const { count, error } = await supabaseClient
                .from('referrals')
                .select('*', { count: 'exact', head: true })
                .eq('referrer_id', userId)
                .gte('created_at', thirtyDaysAgo);
            if (error) { console.error('Referral count error:', error); return 0; }
            return count || 0;
        },

        /** Get leaderboard: top referrers in the last 30 days */
        async getLeaderboard(limit = 10) {
            const { data, error } = await supabaseClient
                .from('referral_leaderboard')
                .select('*')
                .limit(limit);
            if (error) { console.error('Leaderboard error:', error); return []; }
            return data || [];
        },

        /** Get all referrals made by a user (last 30 days) */
        async getMyReferrals(userId) {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const { data, error } = await supabaseClient
                .from('referrals')
                .select('referred_user_id, created_at')
                .eq('referrer_id', userId)
                .gte('created_at', thirtyDaysAgo)
                .order('created_at', { ascending: false });
            if (error) { console.error('My referrals error:', error); return []; }
            return data || [];
        }
    };

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
    window.UserNotes = UserNotes;
    window.Referrals = Referrals;
    window.UI = UI;
    window.translateError = translateError;
    window.FormAutosave = FormAutosave;
    window.withRetry = withRetry;

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
        UserNotes: UserNotes,
        Referrals: Referrals,
        UI: UI
    };

})();
