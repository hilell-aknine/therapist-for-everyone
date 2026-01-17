// ============================================================================
// Supabase Client - מטפל לכל אחד
// ============================================================================

const SUPABASE_URL = 'https://vhzdrywvpgaqyivprbds.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoemRyeXd2cGdhcXlpdnByYmRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2NjkwMTksImV4cCI6MjA4NDI0NTAxOX0.h0fCrmenxcXFhtFO0UtqYVMqyl0EAjGt5g7OY1FZ9-I';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================================
// Authentication Functions
// ============================================================================

const Auth = {
    // הרשמה עם אימייל וסיסמה
    async signUp(email, password, fullName) {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName
                }
            }
        });
        if (error) throw error;
        return data;
    },

    // התחברות
    async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;
        return data;
    },

    // התחברות עם Google
    async signInWithGoogle() {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        if (error) throw error;
        return data;
    },

    // התנתקות
    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },

    // קבלת המשתמש הנוכחי
    async getCurrentUser() {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    },

    // קבלת הסשן הנוכחי
    async getSession() {
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    },

    // מעקב אחרי שינויים באימות
    onAuthStateChange(callback) {
        return supabase.auth.onAuthStateChange((event, session) => {
            callback(event, session);
        });
    },

    // איפוס סיסמה
    async resetPassword(email) {
        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password'
        });
        if (error) throw error;
        return data;
    },

    // עדכון סיסמה
    async updatePassword(newPassword) {
        const { data, error } = await supabase.auth.updateUser({
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
    // קבלת פרופיל משתמש
    async get(userId) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        if (error) throw error;
        return data;
    },

    // קבלת הפרופיל של המשתמש הנוכחי
    async getCurrent() {
        const user = await Auth.getCurrentUser();
        if (!user) return null;
        return this.get(user.id);
    },

    // עדכון פרופיל
    async update(userId, updates) {
        const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // העלאת תמונת פרופיל
    async uploadAvatar(userId, file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}-${Date.now()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
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
    // קבלת כל המטפלים הפעילים
    async getAll() {
        const { data, error } = await supabase
            .from('therapists')
            .select(`
                *,
                profiles (full_name, avatar_url, email, phone)
            `)
            .eq('is_active', true)
            .order('rating', { ascending: false });
        if (error) throw error;
        return data;
    },

    // קבלת מטפל לפי ID
    async getById(id) {
        const { data, error } = await supabase
            .from('therapists')
            .select(`
                *,
                profiles (full_name, avatar_url, email, phone)
            `)
            .eq('id', id)
            .single();
        if (error) throw error;
        return data;
    },

    // קבלת פרופיל מטפל של המשתמש הנוכחי
    async getCurrent() {
        const user = await Auth.getCurrentUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('therapists')
            .select('*')
            .eq('user_id', user.id)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    // הרשמה כמטפל
    async register(therapistData) {
        const user = await Auth.getCurrentUser();
        if (!user) throw new Error('יש להתחבר תחילה');

        // עדכון תפקיד בפרופיל
        await Profiles.update(user.id, { role: 'therapist' });

        const { data, error } = await supabase
            .from('therapists')
            .insert({
                user_id: user.id,
                ...therapistData
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // עדכון פרופיל מטפל
    async update(id, updates) {
        const { data, error } = await supabase
            .from('therapists')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // קבלת ביקורות של מטפל
    async getReviews(therapistId) {
        const { data, error } = await supabase
            .from('reviews')
            .select(`
                *,
                patients (
                    profiles (full_name)
                )
            `)
            .eq('therapist_id', therapistId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    // קבלת הפגישות של המטפל
    async getAppointments(therapistId, status = null) {
        let query = supabase
            .from('appointments')
            .select(`
                *,
                patients (
                    user_id,
                    profiles (full_name, phone)
                )
            `)
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
    // קבלת פרופיל מטופל של המשתמש הנוכחי
    async getCurrent() {
        const user = await Auth.getCurrentUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('patients')
            .select(`
                *,
                therapists (
                    id,
                    profiles (full_name, avatar_url)
                )
            `)
            .eq('user_id', user.id)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    // הרשמה כמטופל (מילוי שאלון)
    async register(patientData) {
        const user = await Auth.getCurrentUser();
        if (!user) throw new Error('יש להתחבר תחילה');

        // עדכון תפקיד בפרופיל
        await Profiles.update(user.id, { role: 'patient' });

        const { data, error } = await supabase
            .from('patients')
            .insert({
                user_id: user.id,
                ...patientData
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // עדכון פרטי מטופל
    async update(id, updates) {
        const { data, error } = await supabase
            .from('patients')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // קבלת הפגישות של המטופל
    async getAppointments(patientId) {
        const { data, error } = await supabase
            .from('appointments')
            .select(`
                *,
                therapists (
                    profiles (full_name, avatar_url, phone)
                )
            `)
            .eq('patient_id', patientId)
            .order('scheduled_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    // כתיבת ביקורת
    async submitReview(reviewData) {
        const { data, error } = await supabase
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
    // יצירת פגישה חדשה
    async create(appointmentData) {
        const { data, error } = await supabase
            .from('appointments')
            .insert(appointmentData)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // עדכון פגישה
    async update(id, updates) {
        const { data, error } = await supabase
            .from('appointments')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // ביטול פגישה
    async cancel(id) {
        return this.update(id, { status: 'cancelled' });
    },

    // סימון פגישה כהושלמה
    async complete(id) {
        return this.update(id, { status: 'completed' });
    }
};

// ============================================================================
// Course Progress Functions
// ============================================================================

const CourseProgress = {
    // קבלת כל ההתקדמות של המשתמש
    async getAll(courseType = null) {
        const user = await Auth.getCurrentUser();
        if (!user) return [];

        let query = supabase
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

    // בדיקה אם סרטון נצפה
    async isVideoWatched(videoId) {
        const user = await Auth.getCurrentUser();
        if (!user) return false;

        const { data, error } = await supabase
            .from('course_progress')
            .select('completed')
            .eq('user_id', user.id)
            .eq('video_id', videoId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data?.completed || false;
    },

    // סימון סרטון כנצפה
    async markVideoWatched(videoId, courseType, lessonNumber) {
        const user = await Auth.getCurrentUser();
        if (!user) throw new Error('יש להתחבר תחילה');

        const { data, error } = await supabase
            .from('course_progress')
            .upsert({
                user_id: user.id,
                video_id: videoId,
                course_type: courseType,
                lesson_number: lessonNumber,
                completed: true,
                completed_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,video_id'
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // עדכון זמן צפייה
    async updateWatchTime(videoId, seconds) {
        const user = await Auth.getCurrentUser();
        if (!user) return;

        await supabase
            .from('course_progress')
            .upsert({
                user_id: user.id,
                video_id: videoId,
                watched_seconds: seconds
            }, {
                onConflict: 'user_id,video_id',
                ignoreDuplicates: false
            });
    },

    // חישוב אחוז השלמה של קורס
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
    // שליחת בקשת קשר
    async submit(requestData) {
        const { data, error } = await supabase
            .from('contact_requests')
            .insert(requestData)
            .select()
            .single();
        if (error) throw error;
        return data;
    }
};

// ============================================================================
// Certifications Functions
// ============================================================================

const Certifications = {
    // קבלת תעודות המשתמש
    async getAll() {
        const user = await Auth.getCurrentUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('certifications')
            .select('*')
            .eq('user_id', user.id);
        if (error) throw error;
        return data;
    },

    // בדיקה אם יש תעודה
    async hasCertification(type) {
        const certs = await this.getAll();
        return certs.some(c => c.certification_type === type && c.passed);
    }
};

// ============================================================================
// UI Helper Functions
// ============================================================================

const UI = {
    // הצגת הודעת הצלחה
    showSuccess(message) {
        this.showToast(message, 'success');
    },

    // הצגת הודעת שגיאה
    showError(message) {
        this.showToast(message, 'error');
    },

    // הצגת Toast
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

    // הצגת מסך טעינה
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

    // הסתרת מסך טעינה
    hideLoading() {
        const loader = document.getElementById('global-loader');
        if (loader) loader.remove();
    },

    // עדכון ממשק לפי מצב התחברות
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

// מעקב אחרי שינויים באימות
Auth.onAuthStateChange((event, session) => {
    console.log('Auth state changed:', event);
    UI.updateAuthUI(session?.user);
});

// אתחול בטעינת הדף
document.addEventListener('DOMContentLoaded', async () => {
    const session = await Auth.getSession();
    UI.updateAuthUI(session?.user);
});

// Export for use
window.TherapistApp = {
    supabase,
    Auth,
    Profiles,
    Therapists,
    Patients,
    Appointments,
    CourseProgress,
    ContactRequests,
    Certifications,
    UI
};
