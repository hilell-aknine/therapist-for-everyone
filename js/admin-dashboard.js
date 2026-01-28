/**
 * Admin Dashboard Module
 * Handles all dashboard data loading and interactions
 */

// ============================================================================
// STATE
// ============================================================================
let currentUser = null;
let allTherapists = [];
let allPatients = [];
let allLeads = [];
let currentView = 'therapists';
let currentTherapistFilter = 'all';
let currentPatientFilter = 'waiting_for_match';

// Email configuration
const SUPABASE_FUNCTIONS_URL = 'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1';
const SITE_URL = 'https://hilell-aknine.github.io/therapist-for-everyone';

// ============================================================================
// EMAIL HELPER
// ============================================================================

async function sendEmail(type, to, data) {
    try {
        const session = await window.supabaseClient.auth.getSession();
        const token = session?.data?.session?.access_token;

        const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/send-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ type, to, data })
        });

        const result = await response.json();

        if (!result.success) {
            console.error('Email send failed:', result.error);
            return false;
        }

        console.log(`Email sent successfully: ${type} to ${to}`);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initDashboard() {
    console.log('Initializing Admin Dashboard...');

    await waitForDependencies();

    const user = await window.AuthGuard?.getCurrentUser();
    if (!user) {
        showAccessDenied();
        return;
    }

    // Check admin role
    const isAdmin = await window.AuthGuard?.isAdmin(user.id);
    if (!isAdmin) {
        console.log('Access denied: Not an admin');
        showAccessDenied();
        return;
    }

    currentUser = user;
    showDashboard();
    await loadDashboardData();
}

function waitForDependencies() {
    return new Promise((resolve) => {
        const check = () => {
            if (window.supabaseClient && window.AuthGuard) {
                resolve();
            } else {
                setTimeout(check, 50);
            }
        };
        check();
        setTimeout(resolve, 5000); // Timeout fallback
    });
}

function showAccessDenied() {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('access-denied').style.display = 'flex';
}

function showDashboard() {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('dashboard-container').style.display = 'block';

    // Set admin info
    const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Admin';
    const adminNameEl = document.getElementById('admin-name');
    const adminAvatarEl = document.getElementById('admin-avatar');

    if (adminNameEl) adminNameEl.textContent = name;
    if (adminAvatarEl) adminAvatarEl.textContent = name.charAt(0).toUpperCase();
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadDashboardData() {
    console.log('Loading dashboard data...');

    try {
        // Load all data in parallel
        await Promise.all([
            loadTherapists(),
            loadPatients(),
            loadLeads()
        ]);

        updateAllStats();

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showToast('שגיאה בטעינת נתונים', 'error');
    }
}

async function loadTherapists() {
    try {
        // Simple query - no joins for now
        const { data, error } = await window.supabaseClient
            .from('therapists')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        allTherapists = data || [];
        console.log(`Loaded ${allTherapists.length} therapists`, allTherapists);

        renderTherapists();

    } catch (error) {
        console.error('Error loading therapists:', error);
        allTherapists = [];
    }
}

async function loadPatients() {
    try {
        // Simple query without complex joins
        const { data, error } = await window.supabaseClient
            .from('patients')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        allPatients = data || [];
        console.log(`Loaded ${allPatients.length} patients`, allPatients);

        renderPatients();

    } catch (error) {
        console.error('Error loading patients:', error);
        allPatients = [];
    }
}

async function loadLeads() {
    try {
        const { data, error } = await window.supabaseClient
            .from('contact_requests')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        allLeads = data || [];
        console.log(`Loaded ${allLeads.length} leads`);

        renderLeads();

    } catch (error) {
        console.error('Error loading leads:', error);
        allLeads = [];
    }
}

// ============================================================================
// STATS UPDATES
// ============================================================================

function updateAllStats() {
    // Main stats cards (requested IDs)
    const totalPatientsEl = document.getElementById('total-patients-count');
    const activeTherapistsEl = document.getElementById('active-therapists-count');
    const pendingMatchesEl = document.getElementById('pending-matches-count');

    if (totalPatientsEl) totalPatientsEl.textContent = allPatients.length;
    if (activeTherapistsEl) activeTherapistsEl.textContent = allTherapists.filter(t => t.status === 'active').length;
    if (pendingMatchesEl) pendingMatchesEl.textContent = allPatients.filter(p => p.status === 'waiting_for_match').length;

    // Therapist stats (matching seeded data statuses)
    const pendingInterview = allTherapists.filter(t => t.status === 'pending_interview').length;
    const active = allTherapists.filter(t => t.status === 'active').length;
    const newTherapists = allTherapists.filter(t => t.status === 'new').length;

    safeSetText('stat-pending', newTherapists);
    safeSetText('stat-interview', pendingInterview);
    safeSetText('stat-active', active);
    safeSetText('stat-rejected', allTherapists.filter(t => t.status === 'rejected').length);

    safeSetText('filter-count-pending', newTherapists);
    safeSetText('filter-count-interview', pendingInterview);
    safeSetText('filter-count-active', active);

    // Patient stats (matching seeded data statuses)
    const waitingForMatch = allPatients.filter(p => p.status === 'waiting_for_match').length;
    const matched = allPatients.filter(p => p.status === 'matched').length;
    const intake = allPatients.filter(p => p.status === 'intake').length;

    safeSetText('stat-patients-pending', waitingForMatch);
    safeSetText('stat-patients-matched', matched);
    safeSetText('stat-patients-treatment', intake);

    safeSetText('filter-patients-pending', waitingForMatch);
    safeSetText('filter-patients-matched', matched);
    safeSetText('filter-patients-treatment', intake);

    // Badge counts
    safeSetText('patients-badge', waitingForMatch);
    safeSetText('leads-badge', allLeads.filter(l => l.status !== 'converted').length);
}

function safeSetText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? 0;
}

// ============================================================================
// VIEW SWITCHING
// ============================================================================

function switchView(view) {
    currentView = view;

    // Update view tabs
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === view);
    });

    // Update sidebar
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        const linkView = link.getAttribute('onclick')?.match(/switchView\('(\w+)'\)/)?.[1];
        link.classList.toggle('active', linkView === view);
    });

    // Show/hide view content
    document.querySelectorAll('.view-content').forEach(content => {
        content.classList.remove('active');
    });

    const viewEl = document.getElementById(`${view}-view`);
    if (viewEl) viewEl.classList.add('active');
}

// ============================================================================
// THERAPISTS RENDERING
// ============================================================================

function filterTherapists(filter) {
    currentTherapistFilter = filter;

    document.querySelectorAll('[data-filter]').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === filter);
    });

    renderTherapists();
}

function renderTherapists() {
    const container = document.getElementById('candidates-list');
    if (!container) return;

    const searchTerm = document.getElementById('search-input')?.value?.toLowerCase() || '';

    let filtered = allTherapists;

    // Filter by status
    if (currentTherapistFilter !== 'all') {
        // Map filter names to actual DB statuses
        const statusMap = {
            'pending': 'pending',
            'screening_submitted': 'screening_submitted',
            'pending_interview': 'pending_interview',
            'active': 'active',
            'rejected': 'rejected',
            'new': 'pending'
        };
        const dbStatus = statusMap[currentTherapistFilter] || currentTherapistFilter;
        filtered = filtered.filter(t => t.status === dbStatus);
    }

    // Search filter
    if (searchTerm) {
        filtered = filtered.filter(t => {
            const name = t.profiles?.full_name || t.full_name || '';
            const email = t.profiles?.email || t.email || '';
            return name.toLowerCase().includes(searchTerm) || email.toLowerCase().includes(searchTerm);
        });
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-inbox"></i>
                <h3>אין מועמדים</h3>
                <p>לא נמצאו מועמדים בקטגוריה זו</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(t => renderTherapistCard(t)).join('');
}

function renderTherapistCard(therapist) {
    const name = therapist.profiles?.full_name || therapist.full_name || 'מטפל';
    const email = therapist.profiles?.email || therapist.email || '';
    const phone = therapist.phone || '';
    const city = therapist.city || therapist.location || '';
    const status = therapist.status || 'new';
    const createdAt = therapist.created_at ? new Date(therapist.created_at).toLocaleDateString('he-IL') : '-';

    const statusLabels = {
        'pending': 'ממתין לבדיקה',
        'pending_interview': 'ממתין לראיון',
        'approved': 'מאושר',
        'active': 'פעיל',
        'inactive': 'מושהה',
        'rejected': 'נדחה'
    };

    const statusClasses = {
        'pending': 'pending',
        'pending_interview': 'interview',
        'approved': 'approved',
        'active': 'active',
        'inactive': 'inactive',
        'rejected': 'rejected'
    };

    return `
        <div class="candidate-card" data-id="${therapist.id}">
            <div class="candidate-header">
                <div class="candidate-info">
                    <div class="candidate-avatar">${name.charAt(0)}</div>
                    <div>
                        <div class="candidate-name">${name}</div>
                        <div class="candidate-meta">
                            ${email ? `<span><i class="fa-solid fa-envelope"></i> ${email}</span>` : ''}
                            ${phone ? `<span><i class="fa-solid fa-phone"></i> ${phone}</span>` : ''}
                        </div>
                    </div>
                </div>
                <span class="status-badge ${statusClasses[status] || status}">${statusLabels[status] || status}</span>
            </div>
            <div class="candidate-details">
                <div class="detail-item">
                    <div class="detail-label">עיר</div>
                    <div class="detail-value">${city || '-'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">תאריך הרשמה</div>
                    <div class="detail-value">${createdAt}</div>
                </div>
            </div>
            <div class="candidate-actions">
                ${renderTherapistActions(therapist)}
            </div>
        </div>
    `;
}

function renderTherapistActions(therapist) {
    const status = therapist.status;
    let buttons = `
        <button class="btn btn-view" onclick="viewTherapist('${therapist.id}')">
            <i class="fa-solid fa-eye"></i>
            צפה בפרטים
        </button>
    `;

    switch(status) {
        case 'pending':
            // ממתין לבדיקה → העבר לראיון או דחה
            buttons += `
                <button class="btn btn-interview" onclick="updateTherapistStatus('${therapist.id}', 'pending_interview')">
                    <i class="fa-solid fa-calendar-check"></i>
                    העבר לראיון
                </button>
                <button class="btn btn-reject" onclick="rejectTherapist('${therapist.id}')">
                    <i class="fa-solid fa-times"></i>
                    דחה
                </button>
            `;
            break;

        case 'pending_interview':
            // ממתין לראיון → אשר או דחה
            buttons += `
                <button class="btn btn-approve" onclick="updateTherapistStatus('${therapist.id}', 'approved')">
                    <i class="fa-solid fa-check"></i>
                    אשר לאחר ראיון
                </button>
                <button class="btn btn-reject" onclick="rejectTherapist('${therapist.id}')">
                    <i class="fa-solid fa-times"></i>
                    דחה
                </button>
            `;
            break;

        case 'approved':
            // מאושר → הפעל
            buttons += `
                <button class="btn btn-approve" onclick="updateTherapistStatus('${therapist.id}', 'active')">
                    <i class="fa-solid fa-play"></i>
                    הפעל
                </button>
            `;
            break;

        case 'active':
            // פעיל → השהה
            buttons += `
                <button class="btn btn-pause" onclick="updateTherapistStatus('${therapist.id}', 'inactive')">
                    <i class="fa-solid fa-pause"></i>
                    השהה
                </button>
            `;
            break;

        case 'inactive':
            // מושהה → הפעל מחדש
            buttons += `
                <button class="btn btn-approve" onclick="updateTherapistStatus('${therapist.id}', 'active')">
                    <i class="fa-solid fa-play"></i>
                    הפעל מחדש
                </button>
            `;
            break;

        case 'rejected':
            // נדחה → שחזר
            buttons += `
                <button class="btn btn-interview" onclick="updateTherapistStatus('${therapist.id}', 'pending')">
                    <i class="fa-solid fa-undo"></i>
                    שחזר לבדיקה
                </button>
            `;
            break;
    }

    return buttons;
}

// ============================================================================
// THERAPIST ACTIONS
// ============================================================================

async function approveTherapist(id) {
    try {
        // Get therapist details before update
        const therapist = allTherapists.find(t => t.id === id);
        if (!therapist) throw new Error('Therapist not found');

        const therapistEmail = therapist.email || therapist.profiles?.email;
        const therapistName = therapist.full_name || therapist.profiles?.full_name || 'מטפל/ת';

        // Update therapist status
        const { error } = await window.supabaseClient
            .from('therapists')
            .update({
                status: 'active',
                is_active: true,
                is_verified: true
            })
            .eq('id', id);

        if (error) throw error;

        // Generate password reset link for the therapist
        let passwordResetLink = `${SITE_URL}/login.html?reset=true`;

        if (therapist.user_id) {
            // If therapist has user_id, try to generate actual reset link
            // Note: This requires admin privileges or service role
            try {
                const { data: resetData, error: resetError } = await window.supabaseClient.auth.admin.generateLink({
                    type: 'recovery',
                    email: therapistEmail
                });

                if (!resetError && resetData?.properties?.action_link) {
                    passwordResetLink = resetData.properties.action_link;
                }
            } catch (e) {
                // Fallback to manual reset - use Supabase resetPasswordForEmail
                console.log('Using standard password reset flow');
                if (therapistEmail) {
                    await window.supabaseClient.auth.resetPasswordForEmail(therapistEmail, {
                        redirectTo: `${SITE_URL}/login.html`
                    });
                }
            }
        }

        // Send approval email to therapist
        if (therapistEmail) {
            const emailSent = await sendEmail('therapist_approved', therapistEmail, {
                recipientName: therapistName,
                passwordResetLink: passwordResetLink,
                loginUrl: `${SITE_URL}/login.html`
            });

            if (emailSent) {
                showToast('המטפל אושר ונשלח מייל עם לינק סיסמה!', 'success');
            } else {
                showToast('המטפל אושר, אך שליחת המייל נכשלה', 'warning');
            }
        } else {
            showToast('המטפל אושר בהצלחה! (לא נמצא אימייל לשליחה)', 'success');
        }

        await loadTherapists();
        updateAllStats();

    } catch (error) {
        console.error('Error approving therapist:', error);
        showToast('שגיאה באישור המטפל', 'error');
    }
}

async function updateTherapistStatus(id, newStatus) {
    try {
        const updateData = { status: newStatus };

        if (newStatus === 'active') {
            updateData.is_active = true;
            updateData.is_verified = true;
        } else {
            updateData.is_active = false;
        }

        const { error } = await window.supabaseClient
            .from('therapists')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        showToast('הסטטוס עודכן בהצלחה!', 'success');
        await loadTherapists();
        updateAllStats();

    } catch (error) {
        console.error('Error updating therapist status:', error);
        showToast('שגיאה בעדכון הסטטוס', 'error');
    }
}

async function rejectTherapist(id) {
    if (!confirm('האם אתה בטוח שברצונך לדחות את המטפל?')) {
        return;
    }

    try {
        const { error } = await window.supabaseClient
            .from('therapists')
            .update({
                status: 'rejected',
                is_active: false,
                is_verified: false
            })
            .eq('id', id);

        if (error) throw error;

        showToast('המטפל נדחה', 'success');
        closeModal();
        await loadTherapists();
        updateAllStats();

    } catch (error) {
        console.error('Error rejecting therapist:', error);
        showToast('שגיאה בדחיית המטפל', 'error');
    }
}

async function updatePatientStatus(id, newStatus) {
    try {
        const updateData = { status: newStatus };

        // Clear therapist assignment if rejected/archived
        if (newStatus === 'rejected' || newStatus === 'archived') {
            updateData.assigned_therapist_id = null;
        }

        const { error } = await window.supabaseClient
            .from('patients')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        const statusMessages = {
            'waiting_for_match': 'המטופל אושר לשיבוץ!',
            'matched': 'המטופל שובץ!',
            'in_treatment': 'הטיפול החל!',
            'completed': 'הטיפול הסתיים בהצלחה!',
            'rejected': 'המטופל נדחה',
            'new': 'המטופל שוחזר לבדיקה'
        };

        showToast(statusMessages[newStatus] || 'הסטטוס עודכן בהצלחה!', 'success');
        await loadPatients();
        updateAllStats();

    } catch (error) {
        console.error('Error updating patient status:', error);
        showToast('שגיאה בעדכון הסטטוס', 'error');
    }
}

function viewTherapist(id) {
    const therapist = allTherapists.find(t => t.id === id);
    if (!therapist) return;

    // Open modal with therapist details
    const modal = document.getElementById('candidate-modal');
    if (!modal) return;

    const name = therapist.profiles?.full_name || therapist.full_name || 'מטפל';
    const questionnaire = therapist.questionnaire_data || {};

    document.getElementById('modal-candidate-name').textContent = `תיק מטפל: ${name}`;

    let modalContent = `
        <div class="questionnaire-section">
            <h3 class="section-title"><i class="fa-solid fa-user"></i> פרטים אישיים</h3>
            <div class="questionnaire-answer">
                <strong>שם:</strong> ${name}<br>
                <strong>אימייל:</strong> ${therapist.profiles?.email || therapist.email || '-'}<br>
                <strong>טלפון:</strong> ${therapist.phone || '-'}<br>
                <strong>עיר:</strong> ${therapist.city || therapist.location || '-'}<br>
                <strong>התמחויות:</strong> ${(therapist.specializations || []).join(', ') || '-'}<br>
                <strong>שנות ניסיון:</strong> ${therapist.experience_years || 0}<br>
                <strong>מחיר לפגישה:</strong> ${therapist.price_per_session || 'התנדבות'} ₪<br>
                <strong>עובד בזום:</strong> ${therapist.works_online ? 'כן' : 'לא'}<br>
                <strong>סטטוס:</strong> ${therapist.status || '-'}
            </div>
        </div>
    `;

    if (therapist.bio) {
        modalContent += `
        <div class="questionnaire-section">
            <h3 class="section-title"><i class="fa-solid fa-file-lines"></i> אודות</h3>
            <div class="questionnaire-answer">${therapist.bio}</div>
        </div>
        `;
    }

    if (therapist.resume_url) {
        modalContent += `
        <div class="questionnaire-section">
            <h3 class="section-title"><i class="fa-solid fa-file-pdf"></i> קורות חיים / תעודות</h3>
            <div class="questionnaire-answer">
                <a href="${therapist.resume_url}" target="_blank" class="btn btn-view">
                    <i class="fa-solid fa-download"></i> פתח מסמך
                </a>
            </div>
        </div>
        `;
    }

    // Questionnaire answers
    if (questionnaire.case_study) {
        modalContent += `
        <div class="questionnaire-section">
            <h3 class="section-title"><i class="fa-solid fa-brain"></i> שאלון מקצועי</h3>

            <div class="questionnaire-answer">
                <strong>מקרה מורכב:</strong><br>
                ${questionnaire.case_study || '-'}
            </div>

            <div class="questionnaire-answer">
                <strong>טכניקות לטיפול בטראומה:</strong><br>
                ${questionnaire.trauma_techniques || '-'}
            </div>

            <div class="questionnaire-answer">
                <strong>התמודדות עם התנגדויות:</strong><br>
                ${questionnaire.handling_resistance || '-'}
            </div>

            <div class="questionnaire-answer">
                <strong>למה בחרת להיות מטפל:</strong><br>
                ${questionnaire.why_therapist || '-'}
            </div>

            <div class="questionnaire-answer">
                <strong>חזון ותפקיד:</strong><br>
                ${questionnaire.role_vision || '-'}
            </div>
        </div>
        `;
    }

    // AI Analysis
    if (therapist.ai_score !== null || therapist.ai_summary) {
        modalContent += `
        <div class="questionnaire-section">
            <h3 class="section-title"><i class="fa-solid fa-robot"></i> ניתוח AI</h3>
            <div class="questionnaire-answer">
                <strong>ציון:</strong> ${therapist.ai_score || '-'}/100<br>
                <strong>סיכום:</strong> ${therapist.ai_summary || '-'}<br>
                <strong>תגיות:</strong> ${(therapist.ai_tags || []).join(', ') || '-'}
            </div>
        </div>
        `;
    }

    document.getElementById('modal-body').innerHTML = modalContent;

    document.getElementById('modal-footer').innerHTML = `
        <button class="btn btn-view" onclick="closeModal()">
            <i class="fa-solid fa-times"></i>
            סגור
        </button>
        ${renderTherapistActions(therapist)}
    `;

    modal.classList.add('active');
}

// ============================================================================
// PATIENTS RENDERING
// ============================================================================

function filterPatients(filter) {
    currentPatientFilter = filter;

    document.querySelectorAll('[data-patient-filter]').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.patientFilter === filter);
    });

    renderPatients();
}

function renderPatients() {
    const container = document.getElementById('patients-list');
    if (!container) return;

    const searchTerm = document.getElementById('patient-search-input')?.value?.toLowerCase() || '';

    let filtered = allPatients;

    // Filter by status
    if (currentPatientFilter !== 'all') {
        // Map filter names to actual DB statuses
        const statusMap = {
            'pending': 'waiting_for_match',
            'matched': 'matched',
            'in_treatment': 'intake'
        };
        const dbStatus = statusMap[currentPatientFilter] || currentPatientFilter;
        filtered = filtered.filter(p => p.status === dbStatus);
    }

    // Search filter
    if (searchTerm) {
        filtered = filtered.filter(p => {
            const name = p.profiles?.full_name || '';
            const email = p.profiles?.email || '';
            return name.toLowerCase().includes(searchTerm) || email.toLowerCase().includes(searchTerm);
        });
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-user-injured"></i>
                <h3>אין מטופלים</h3>
                <p>לא נמצאו מטופלים בקטגוריה זו</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(p => renderPatientCard(p)).join('');
}

function renderPatientCard(patient) {
    const name = patient.full_name || patient.profiles?.full_name || 'מטופל';
    const email = patient.email || patient.profiles?.email || '';
    const phone = patient.phone || '';
    const city = patient.city || '';
    const status = patient.status || 'new';
    const concern = patient.main_concern || '';
    const createdAt = patient.created_at ? new Date(patient.created_at).toLocaleDateString('he-IL') : '-';

    // Find assigned therapist name from allTherapists
    let therapistName = null;
    if (patient.assigned_therapist_id) {
        const therapist = allTherapists.find(t => t.id === patient.assigned_therapist_id);
        therapistName = therapist?.full_name || 'מטפל משובץ';
    }

    const statusLabels = {
        'new': 'ממתין לבדיקה',
        'waiting_for_match': 'ממתין לשיבוץ',
        'matched': 'שודך למטפל',
        'in_treatment': 'בטיפול פעיל',
        'completed': 'סיים טיפול',
        'rejected': 'נדחה',
        'archived': 'בארכיון'
    };

    const statusClasses = {
        'new': 'pending',
        'waiting_for_match': 'waiting',
        'matched': 'matched',
        'in_treatment': 'active',
        'completed': 'completed',
        'rejected': 'rejected',
        'archived': 'archived'
    };

    return `
        <div class="patient-card" data-id="${patient.id}">
            <div class="patient-header">
                <div class="patient-info">
                    <div class="patient-avatar">${name.charAt(0)}</div>
                    <div>
                        <div class="patient-name">${name}</div>
                        <div class="patient-meta">
                            ${email ? `<span><i class="fa-solid fa-envelope"></i> ${email}</span>` : ''}
                        </div>
                    </div>
                </div>
                <span class="status-badge ${statusClasses[status] || 'pending'}">${statusLabels[status] || status}</span>
            </div>
            <div class="patient-details">
                <div class="detail-item patient-reason">
                    <div class="detail-label">סיבת פנייה</div>
                    <div class="detail-value">${concern ? (concern.length > 100 ? concern.substring(0, 100) + '...' : concern) : '-'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">תאריך פנייה</div>
                    <div class="detail-value">${createdAt}</div>
                </div>
                ${therapistName ? `
                <div class="detail-item">
                    <div class="detail-label">מטפל משובץ</div>
                    <div class="detail-value">${therapistName}</div>
                </div>
                ` : ''}
            </div>
            <div class="patient-actions">
                <button class="btn btn-view" onclick="viewPatient('${patient.id}')">
                    <i class="fa-solid fa-eye"></i>
                    צפה בפרטים
                </button>
                ${renderPatientActions(patient)}
            </div>
        </div>
    `;
}

function renderPatientActions(patient) {
    const status = patient.status;
    let buttons = '';

    switch(status) {
        case 'new':
            // ממתין לבדיקה → אשר לשיבוץ או דחה
            buttons = `
                <button class="btn btn-approve" onclick="updatePatientStatus('${patient.id}', 'waiting_for_match')">
                    <i class="fa-solid fa-check"></i>
                    אשר לשיבוץ
                </button>
                <button class="btn btn-reject" onclick="updatePatientStatus('${patient.id}', 'rejected')">
                    <i class="fa-solid fa-times"></i>
                    דחה
                </button>
            `;
            break;

        case 'waiting_for_match':
            // ממתין לשיבוץ → שבץ מטפל
            buttons = `
                <button class="btn btn-approve" onclick="openMatchingModal('${patient.id}')">
                    <i class="fa-solid fa-handshake"></i>
                    שבץ מטפל
                </button>
            `;
            break;

        case 'matched':
            // שודך → התחל טיפול
            buttons = `
                <button class="btn btn-approve" onclick="updatePatientStatus('${patient.id}', 'in_treatment')">
                    <i class="fa-solid fa-play"></i>
                    התחל טיפול
                </button>
            `;
            break;

        case 'in_treatment':
            // בטיפול → סיים טיפול
            buttons = `
                <button class="btn btn-complete" onclick="updatePatientStatus('${patient.id}', 'completed')">
                    <i class="fa-solid fa-flag-checkered"></i>
                    סיים טיפול
                </button>
            `;
            break;

        case 'rejected':
        case 'archived':
            // נדחה/בארכיון → שחזר
            buttons = `
                <button class="btn btn-interview" onclick="updatePatientStatus('${patient.id}', 'new')">
                    <i class="fa-solid fa-undo"></i>
                    שחזר
                </button>
            `;
            break;
    }

    return buttons;
}

function viewPatient(id) {
    const patient = allPatients.find(p => p.id === id);
    if (!patient) return;

    const modal = document.getElementById('patient-modal');
    if (!modal) return;

    const name = patient.full_name || 'מטופל';

    // Find assigned therapist
    let therapistName = null;
    if (patient.assigned_therapist_id) {
        const therapist = allTherapists.find(t => t.id === patient.assigned_therapist_id);
        therapistName = therapist?.full_name;
    }

    document.getElementById('modal-patient-name').textContent = `פרטי מטופל: ${name}`;

    document.getElementById('patient-modal-body').innerHTML = `
        <div class="questionnaire-section">
            <h3 class="section-title"><i class="fa-solid fa-user"></i> פרטים</h3>
            <div class="questionnaire-answer">
                <strong>שם:</strong> ${name}<br>
                <strong>אימייל:</strong> ${patient.email || '-'}<br>
                <strong>טלפון:</strong> ${patient.phone || '-'}<br>
                ${patient.identifier ? `<strong>מזהה:</strong> ${patient.identifier}<br>` : ''}
                <strong>עיר:</strong> ${patient.city || '-'}<br>
                <strong>סטטוס:</strong> ${patient.status || '-'}<br>
                ${patient.source ? `<strong>מקור:</strong> ${patient.source === 'lead_conversion' ? 'הומר מליד' : patient.source}<br>` : ''}
                ${therapistName ? `<strong>מטפל משובץ:</strong> ${therapistName}<br>` : ''}
                ${patient.matched_at ? `<strong>תאריך שיבוץ:</strong> ${new Date(patient.matched_at).toLocaleDateString('he-IL')}<br>` : ''}
            </div>
        </div>
        ${patient.main_concern ? `
        <div class="questionnaire-section">
            <h3 class="section-title"><i class="fa-solid fa-heart-crack"></i> סיבת פנייה</h3>
            <div class="questionnaire-answer">${patient.main_concern || patient.intake_summary}</div>
        </div>
        ` : ''}
    `;

    const canMatch = ['new', 'waiting_for_match', 'intake'].includes(patient.status);
    document.getElementById('patient-modal-footer').innerHTML = `
        <button class="btn btn-view" onclick="closePatientModal()">סגור</button>
        ${canMatch ? `
        <button class="btn btn-approve" onclick="closePatientModal(); openMatchingModal('${patient.id}');">
            <i class="fa-solid fa-handshake"></i>
            שבץ מטפל
        </button>
        ` : ''}
    `;

    modal.classList.add('active');
}

function closePatientModal() {
    document.getElementById('patient-modal')?.classList.remove('active');
}

// ============================================================================
// MATCHING
// ============================================================================

async function openMatchingModal(patientId) {
    const patient = allPatients.find(p => p.id === patientId);
    if (!patient) return;

    const modal = document.getElementById('matching-modal');
    if (!modal) return;

    // Fill patient summary
    const name = patient.full_name || 'מטופל';
    document.getElementById('matching-patient-summary').innerHTML = `
        <h4><i class="fa-solid fa-user-injured"></i> ${name}</h4>
        <p><strong>עיר:</strong> ${patient.city || '-'}</p>
        <p><strong>סיבת פנייה:</strong> ${patient.main_concern || 'לא צוין'}</p>
    `;

    // Show loading
    document.getElementById('therapists-match-list').innerHTML = `
        <div style="text-align:center;padding:2rem;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;color:var(--gold);"></i>
            <p>טוען מטפלים...</p>
        </div>
    `;

    modal.classList.add('active');

    // Get approved/active therapists
    const availableTherapists = allTherapists.filter(t => t.status === 'active' || t.status === 'approved');

    document.getElementById('available-therapists-count').textContent = `${availableTherapists.length} מטפלים`;

    if (availableTherapists.length === 0) {
        document.getElementById('therapists-match-list').innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-user-doctor"></i>
                <h3>אין מטפלים פעילים</h3>
                <p>יש לאשר מטפלים תחילה</p>
            </div>
        `;
        return;
    }

    document.getElementById('therapists-match-list').innerHTML = availableTherapists.map(t => `
        <div class="therapist-match-card">
            <div class="therapist-match-info">
                <div class="therapist-match-avatar">${(t.full_name || 'מ').charAt(0)}</div>
                <div class="therapist-match-details">
                    <h5>${t.full_name || 'מטפל'}</h5>
                    <p><strong>עיר:</strong> ${t.city || t.location || '-'}</p>
                    <p><strong>התמחות:</strong> ${(t.specializations || []).join(', ') || t.specialization || '-'}</p>
                </div>
            </div>
            <button class="btn-assign" onclick="assignTherapist('${patientId}', '${t.id}')">
                <i class="fa-solid fa-check"></i>
                שבץ
            </button>
        </div>
    `).join('');
}

async function assignTherapist(patientId, therapistId) {
    try {
        // Get patient and therapist details
        const patient = allPatients.find(p => p.id === patientId);
        const therapist = allTherapists.find(t => t.id === therapistId);

        if (!patient || !therapist) throw new Error('Patient or therapist not found');

        // Update patient record with assignment
        const { error } = await window.supabaseClient
            .from('patients')
            .update({
                assigned_therapist_id: therapistId,
                status: 'matched',
                matched_at: new Date().toISOString()
            })
            .eq('id', patientId);

        if (error) throw error;

        // Prepare contact info (using direct fields)
        const patientName = patient.full_name || 'מטופל/ת';
        const patientEmail = patient.email || null;
        const patientPhone = patient.phone || 'לא צוין';

        const therapistName = therapist.full_name || 'מטפל/ת';
        const therapistEmail = therapist.email || null;
        const therapistSpecialization = (therapist.specializations || []).join(', ') || therapist.specialization || 'מטפל/ת רגשי/ת';

        let emailsSent = 0;

        // Send email to therapist with patient details
        if (therapistEmail) {
            const therapistEmailSent = await sendEmail('patient_assigned_therapist', therapistEmail, {
                recipientName: therapistName,
                patientName: patientName,
                patientPhone: patientPhone,
                patientEmail: patientEmail,
                mainConcern: patient.main_concern || patient.intake_summary || 'לא צוין',
                preferredGender: patient.preferred_therapist_gender,
                availability: patient.availability,
                dashboardUrl: `${SITE_URL}/therapist-dashboard.html`
            });
            if (therapistEmailSent) emailsSent++;
        }

        // Send email to patient that therapist was found
        if (patientEmail) {
            const patientEmailSent = await sendEmail('patient_assigned_patient', patientEmail, {
                recipientName: patientName,
                therapistName: therapistName,
                therapistSpecialization: therapistSpecialization,
                contactMessage: 'המטפל/ת ייצור/תיצור איתך קשר בקרוב לקביעת פגישה ראשונית.'
            });
            if (patientEmailSent) emailsSent++;
        }

        // Show appropriate message
        if (emailsSent === 2) {
            showToast('המטופל שובץ ונשלחו מיילים לשני הצדדים!', 'success');
        } else if (emailsSent === 1) {
            showToast('המטופל שובץ, נשלח מייל אחד (חלק מהפרטים חסרים)', 'success');
        } else {
            showToast('המטופל שובץ בהצלחה! (לא נמצאו אימיילים לשליחה)', 'success');
        }

        closeMatchingModal();
        await loadPatients();
        updateAllStats();

    } catch (error) {
        console.error('Error assigning therapist:', error);
        showToast('שגיאה בשיבוץ', 'error');
    }
}

function closeMatchingModal() {
    document.getElementById('matching-modal')?.classList.remove('active');
}

// ============================================================================
// LEADS RENDERING
// ============================================================================

function renderLeads() {
    const container = document.getElementById('leads-list');
    if (!container) return;

    const searchTerm = document.getElementById('lead-search-input')?.value?.toLowerCase() || '';

    let filtered = allLeads;

    if (searchTerm) {
        filtered = filtered.filter(l => {
            const name = l.name || l.full_name || '';
            const message = l.message || '';
            return name.toLowerCase().includes(searchTerm) || message.toLowerCase().includes(searchTerm);
        });
    }

    // Update leads stats
    const newLeads = allLeads.filter(l => l.status !== 'converted').length;
    const convertedLeads = allLeads.filter(l => l.status === 'converted').length;
    safeSetText('stat-leads-new', newLeads);
    safeSetText('stat-leads-converted', convertedLeads);

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-envelope-open"></i>
                <h3>אין לידים</h3>
                <p>לא נמצאו פניות</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(l => `
        <div class="lead-card">
            <div class="lead-header">
                <div class="lead-info">
                    <div class="lead-avatar">${(l.name || l.full_name || 'א').charAt(0)}</div>
                    <div>
                        <div class="patient-name">${l.name || l.full_name || 'אנונימי'}</div>
                        <div class="patient-meta">
                            ${l.phone ? `<span><i class="fa-solid fa-phone"></i> ${l.phone}</span>` : ''}
                            ${l.email ? `<span><i class="fa-solid fa-envelope"></i> ${l.email}</span>` : ''}
                        </div>
                    </div>
                </div>
                <span class="status-badge ${l.status === 'converted' ? 'active' : 'pending'}">
                    ${l.status === 'converted' ? 'הומר למטופל' : 'חדש'}
                </span>
            </div>
            ${l.message ? `<div class="lead-message">${l.message}</div>` : ''}
            <div class="lead-actions">
                ${l.phone ? `<a href="tel:${l.phone}" class="btn btn-view"><i class="fa-solid fa-phone"></i> התקשר</a>` : ''}
                ${l.status !== 'converted' ? `
                    <button class="btn btn-convert" onclick="openConvertModal('${l.id}')">
                        <i class="fa-solid fa-user-plus"></i>
                        המר למטופל
                    </button>
                ` : ''}
                ${l.status !== 'converted' ? `
                    <button class="btn btn-reject" onclick="deleteLead('${l.id}')">
                        <i class="fa-solid fa-trash"></i>
                        מחק
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// ============================================================================
// LEAD CONVERSION
// ============================================================================

function openConvertModal(leadId) {
    const lead = allLeads.find(l => l.id === leadId);
    if (!lead) return;

    const modal = document.getElementById('convert-lead-modal');
    if (!modal) return;

    // Pre-fill form with lead data
    document.getElementById('convert-lead-id').value = leadId;
    document.getElementById('convert-full-name').value = lead.name || lead.full_name || '';
    document.getElementById('convert-phone').value = lead.phone || '';
    document.getElementById('convert-email').value = lead.email || '';
    document.getElementById('convert-city').value = lead.city || '';
    document.getElementById('convert-notes').value = lead.message || '';
    document.getElementById('convert-id-number').value = '';

    modal.classList.add('active');
}

function closeConvertModal() {
    document.getElementById('convert-lead-modal')?.classList.remove('active');
}

async function submitConvertLead() {
    const leadId = document.getElementById('convert-lead-id').value;
    if (!leadId) return;

    const patientData = {
        full_name: document.getElementById('convert-full-name').value.trim(),
        phone: document.getElementById('convert-phone').value.trim(),
        email: document.getElementById('convert-email').value.trim() || null,
        identifier: document.getElementById('convert-id-number').value.trim() || null,
        city: document.getElementById('convert-city').value.trim() || null,
        main_concern: document.getElementById('convert-notes').value.trim() || null,
        status: 'waiting_for_match',
        source: 'lead_conversion',
        converted_from_lead_id: leadId
    };

    // Validate required fields
    if (!patientData.full_name || !patientData.phone) {
        showToast('נא למלא שם וטלפון', 'error');
        return;
    }

    try {
        // Create new patient
        const { data: newPatient, error: patientError } = await window.supabaseClient
            .from('patients')
            .insert(patientData)
            .select()
            .single();

        if (patientError) throw patientError;

        // Mark lead as converted
        const { error: leadError } = await window.supabaseClient
            .from('contact_requests')
            .update({
                status: 'converted',
                converted_to_patient_id: newPatient.id,
                converted_at: new Date().toISOString()
            })
            .eq('id', leadId);

        if (leadError) {
            console.error('Error updating lead status:', leadError);
            // Don't throw - patient was created successfully
        }

        showToast('הליד הומר למטופל בהצלחה!', 'success');
        closeConvertModal();

        // Reload data
        await Promise.all([loadLeads(), loadPatients()]);
        updateAllStats();

    } catch (error) {
        console.error('Error converting lead:', error);
        showToast('שגיאה בהמרת הליד', 'error');
    }
}

async function deleteLead(leadId) {
    if (!confirm('האם למחוק את הליד הזה?')) return;

    try {
        const { error } = await window.supabaseClient
            .from('contact_requests')
            .delete()
            .eq('id', leadId);

        if (error) throw error;

        showToast('הליד נמחק', 'success');
        await loadLeads();
        updateAllStats();

    } catch (error) {
        console.error('Error deleting lead:', error);
        showToast('שגיאה במחיקת הליד', 'error');
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

function closeModal() {
    document.getElementById('candidate-modal')?.classList.remove('active');
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) {
        alert(message);
        return;
    }

    toast.textContent = message;
    toast.className = `toast ${type} active`;

    setTimeout(() => {
        toast.classList.remove('active');
    }, 3000);
}

function searchCandidates() {
    renderTherapists();
}

function searchPatients() {
    renderPatients();
}

function searchLeads() {
    renderLeads();
}

// Alias for compatibility
function filterCandidates(filter) {
    filterTherapists(filter);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        closePatientModal();
        closeMatchingModal();
    }
});

// Close modals when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        closeModal();
        closePatientModal();
        closeMatchingModal();
    }
});

// ============================================================================
// INIT ON LOAD
// ============================================================================

document.addEventListener('DOMContentLoaded', initDashboard);

// Export for global access
window.AdminDashboard = {
    loadDashboardData,
    switchView,
    filterTherapists,
    filterPatients,
    approveTherapist,
    updateTherapistStatus,
    rejectTherapist,
    updatePatientStatus,
    viewTherapist,
    viewPatient,
    openMatchingModal,
    assignTherapist,
    searchCandidates,
    searchPatients,
    searchLeads,
    filterCandidates,
    closeModal,
    closePatientModal,
    closeMatchingModal,
    showToast
};

// Also expose functions directly on window for onclick handlers
window.updateTherapistStatus = updateTherapistStatus;
window.rejectTherapist = rejectTherapist;
window.updatePatientStatus = updatePatientStatus;
window.viewTherapist = viewTherapist;
window.viewPatient = viewPatient;
window.openMatchingModal = openMatchingModal;
window.assignTherapist = assignTherapist;
window.closeModal = closeModal;
window.closePatientModal = closePatientModal;
window.closeMatchingModal = closeMatchingModal;
window.switchView = switchView;
window.filterTherapists = filterTherapists;
window.filterPatients = filterPatients;
window.filterCandidates = filterCandidates;
window.searchCandidates = searchCandidates;
window.searchPatients = searchPatients;
window.searchLeads = searchLeads;
// Lead conversion
window.openConvertModal = openConvertModal;
window.closeConvertModal = closeConvertModal;
window.submitConvertLead = submitConvertLead;
window.deleteLead = deleteLead;

// ============================================================================
// EXCEL EXPORT FUNCTIONS
// ============================================================================

/**
 * Get date filter range from inputs
 */
function getDateFilterRange() {
    const fromDate = document.getElementById('export-date-from')?.value;
    const toDate = document.getElementById('export-date-to')?.value;
    return { fromDate, toDate };
}

/**
 * Filter data by date range
 */
function filterByDateRange(data, fromDate, toDate) {
    if (!fromDate && !toDate) return data;

    return data.filter(item => {
        const createdAt = item.created_at ? new Date(item.created_at) : null;
        if (!createdAt) return true;

        const itemDate = createdAt.toISOString().split('T')[0];

        if (fromDate && toDate) {
            return itemDate >= fromDate && itemDate <= toDate;
        } else if (fromDate) {
            return itemDate >= fromDate;
        } else if (toDate) {
            return itemDate <= toDate;
        }
        return true;
    });
}

/**
 * Clear date filter inputs
 */
function clearDateFilters() {
    document.getElementById('export-date-from').value = '';
    document.getElementById('export-date-to').value = '';
    showToast('פילטר התאריכים נוקה', 'info');
}

/**
 * Format date for Excel
 */
function formatDateHebrew(dateStr) {
    if (!dateStr) return '-';
    try {
        return new Date(dateStr).toLocaleDateString('he-IL');
    } catch {
        return dateStr;
    }
}

/**
 * Translate status to Hebrew
 */
function translateStatus(status, type) {
    const therapistStatuses = {
        'pending': 'ממתין לבדיקה',
        'pending_interview': 'ממתין לראיון',
        'approved': 'מאושר',
        'active': 'פעיל',
        'inactive': 'מושהה',
        'rejected': 'נדחה'
    };

    const patientStatuses = {
        'new': 'חדש',
        'waiting_for_match': 'ממתין לשיבוץ',
        'matched': 'שובץ למטפל',
        'in_treatment': 'בטיפול',
        'intake': 'בקליטה',
        'completed': 'סיים טיפול',
        'rejected': 'נדחה',
        'archived': 'בארכיון'
    };

    const leadStatuses = {
        'new': 'חדש',
        'contacted': 'נוצר קשר',
        'converted': 'הומר למטופל'
    };

    if (type === 'therapists') return therapistStatuses[status] || status;
    if (type === 'patients') return patientStatuses[status] || status;
    if (type === 'leads') return leadStatuses[status] || status;
    return status;
}

/**
 * Prepare therapists data for export
 */
function prepareTherapistsData(data) {
    return data.map(t => ({
        'שם מלא': t.full_name || t.profiles?.full_name || '-',
        'אימייל': t.email || t.profiles?.email || '-',
        'טלפון': t.phone || '-',
        'עיר': t.city || t.location || '-',
        'התמחויות': (t.specializations || []).join(', ') || '-',
        'שנות ניסיון': t.experience_years || 0,
        'מחיר לפגישה': t.price_per_session || 'התנדבות',
        'עובד בזום': t.works_online ? 'כן' : 'לא',
        'סטטוס': translateStatus(t.status, 'therapists'),
        'תאריך הרשמה': formatDateHebrew(t.created_at),
        'ציון AI': t.ai_score || '-'
    }));
}

/**
 * Prepare patients data for export
 */
function preparePatientsData(data) {
    return data.map(p => {
        // Find assigned therapist name
        let therapistName = '-';
        if (p.assigned_therapist_id) {
            const therapist = allTherapists.find(t => t.id === p.assigned_therapist_id);
            therapistName = therapist?.full_name || 'מטפל משובץ';
        }

        return {
            'שם מלא': p.full_name || p.profiles?.full_name || '-',
            'אימייל': p.email || p.profiles?.email || '-',
            'טלפון': p.phone || '-',
            'עיר': p.city || '-',
            'מזהה': p.identifier || '-',
            'סיבת פנייה': p.main_concern || '-',
            'סטטוס': translateStatus(p.status, 'patients'),
            'מטפל משובץ': therapistName,
            'תאריך פנייה': formatDateHebrew(p.created_at),
            'תאריך שיבוץ': formatDateHebrew(p.matched_at),
            'מקור': p.source === 'lead_conversion' ? 'הומר מליד' : (p.source || '-')
        };
    });
}

/**
 * Prepare leads data for export
 */
function prepareLeadsData(data) {
    return data.map(l => ({
        'שם': l.name || l.full_name || '-',
        'טלפון': l.phone || '-',
        'אימייל': l.email || '-',
        'עיר': l.city || '-',
        'הודעה': l.message || '-',
        'סטטוס': translateStatus(l.status, 'leads'),
        'תאריך פנייה': formatDateHebrew(l.created_at)
    }));
}

/**
 * Export data to Excel file
 */
function exportToExcel(type) {
    const { fromDate, toDate } = getDateFilterRange();
    let data, preparedData, fileName, sheetName;

    switch (type) {
        case 'therapists':
            data = filterByDateRange(allTherapists, fromDate, toDate);
            preparedData = prepareTherapistsData(data);
            fileName = 'מטפלים';
            sheetName = 'מטפלים';
            break;
        case 'patients':
            data = filterByDateRange(allPatients, fromDate, toDate);
            preparedData = preparePatientsData(data);
            fileName = 'מטופלים';
            sheetName = 'מטופלים';
            break;
        case 'leads':
            data = filterByDateRange(allLeads, fromDate, toDate);
            preparedData = prepareLeadsData(data);
            fileName = 'לידים';
            sheetName = 'לידים';
            break;
        default:
            showToast('סוג נתונים לא תקין', 'error');
            return;
    }

    if (preparedData.length === 0) {
        showToast('אין נתונים לייצוא בטווח התאריכים שנבחר', 'error');
        return;
    }

    try {
        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(preparedData);

        // Set RTL and column widths
        ws['!cols'] = Object.keys(preparedData[0] || {}).map(() => ({ wch: 20 }));

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        // Generate filename with date
        const dateStr = new Date().toISOString().split('T')[0];
        const fullFileName = `${fileName}_${dateStr}.xlsx`;

        // Download file
        XLSX.writeFile(wb, fullFileName);

        showToast(`יוצאו ${preparedData.length} רשומות בהצלחה!`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('שגיאה בייצוא הנתונים', 'error');
    }
}

/**
 * Export all data to a single Excel file with multiple sheets
 */
function exportAllToExcel() {
    const { fromDate, toDate } = getDateFilterRange();

    const therapistsData = filterByDateRange(allTherapists, fromDate, toDate);
    const patientsData = filterByDateRange(allPatients, fromDate, toDate);
    const leadsData = filterByDateRange(allLeads, fromDate, toDate);

    const totalRecords = therapistsData.length + patientsData.length + leadsData.length;

    if (totalRecords === 0) {
        showToast('אין נתונים לייצוא בטווח התאריכים שנבחר', 'error');
        return;
    }

    try {
        // Create workbook
        const wb = XLSX.utils.book_new();

        // Add therapists sheet
        if (therapistsData.length > 0) {
            const wsTherapists = XLSX.utils.json_to_sheet(prepareTherapistsData(therapistsData));
            wsTherapists['!cols'] = Object.keys(prepareTherapistsData(therapistsData)[0] || {}).map(() => ({ wch: 20 }));
            XLSX.utils.book_append_sheet(wb, wsTherapists, 'מטפלים');
        }

        // Add patients sheet
        if (patientsData.length > 0) {
            const wsPatients = XLSX.utils.json_to_sheet(preparePatientsData(patientsData));
            wsPatients['!cols'] = Object.keys(preparePatientsData(patientsData)[0] || {}).map(() => ({ wch: 20 }));
            XLSX.utils.book_append_sheet(wb, wsPatients, 'מטופלים');
        }

        // Add leads sheet
        if (leadsData.length > 0) {
            const wsLeads = XLSX.utils.json_to_sheet(prepareLeadsData(leadsData));
            wsLeads['!cols'] = Object.keys(prepareLeadsData(leadsData)[0] || {}).map(() => ({ wch: 20 }));
            XLSX.utils.book_append_sheet(wb, wsLeads, 'לידים');
        }

        // Generate filename with date
        const dateStr = new Date().toISOString().split('T')[0];
        const fullFileName = `דוח_מלא_${dateStr}.xlsx`;

        // Download file
        XLSX.writeFile(wb, fullFileName);

        showToast(`יוצאו ${totalRecords} רשומות בהצלחה!`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('שגיאה בייצוא הנתונים', 'error');
    }
}

// Export functions to window
window.exportToExcel = exportToExcel;
window.exportAllToExcel = exportAllToExcel;
window.clearDateFilters = clearDateFilters;
