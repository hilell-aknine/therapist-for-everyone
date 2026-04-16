// admin-state.js — DB client, global state, DOMContentLoaded, logout, loadAllData, updateCounts

// Theme toggle handled by shared js/theme-toggle.js
// Old admin-theme key is auto-migrated to beit-theme

// Supabase Configuration — from centralized supabase-config.js
const SUPABASE_URL = window.SUPABASE_CONFIG.url;
const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG.anonKey;
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'public' } });

let patients = [];
let therapists = [];
let matches = [];
let leads = [];
let pipelineLeads = [];
let currentPipelineFilter = 'all';
let currentPipelineId = null;
let currentPatientFilter = 'all';
let currentTherapistFilter = 'all';
let currentViewedPatient = null;
let currentViewedTherapist = null;

const BOT_URL = 'https://crm-bot-hillel.fly.dev';

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof applySettingsOnLoad === 'function') applySettingsOnLoad();
    // Wait for auth guard to finish verifying role before loading any data
    if (window._authReady) await window._authReady;
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        document.getElementById('user-email').textContent = session.user.email;
        loadAllData();
    }
});

async function logout() {
    await db.auth.signOut();
    window.location.href = 'login.html';
}

async function loadAllData() {
    if (window._userProfileRole === 'sales_rep') {
        await loadPipeline();
    } else {
        const results = await Promise.allSettled([loadPatients(), loadTherapists(), loadMatches(), loadLeads(), loadContactLeads(), loadQuestionnaires(), loadPipeline(), loadPortalQuestionnaires()]);
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length > 0) {
            console.warn(`⚠️ ${failed.length}/${results.length} data loads failed:`, failed.map(r => r.reason?.message || r.reason));
        }
    }
    updateCounts();
}

function updateCounts() {
    // Sub-tab badges
    setText('patients-count', patients.length);
    setText('therapists-count', therapists.length);
    setText('matches-count', matches.length);
    setText('leads-count', leads.length);

    // Sidebar combined badges
    setText('mizum-count', patients.length + therapists.length + matches.length);
    const pActive = pipelineLeads.filter(l => !['closed_won','closed_lost'].includes(l.stage));
    setText('pipeline-count', pActive.length);
    // Use portal_questionnaires count (342) — the real number. Fallback to leads (profiles) only if empty.
    const pqLen = (typeof portalQuestionnaires !== 'undefined' && portalQuestionnaires.length > 0) ? portalQuestionnaires.length : leads.length;
    setText('learning-count', pqLen);

    // Stat cards
    setText('stat-new', patients.filter(p => p.status === 'new').length);
    setText('stat-waiting', patients.filter(p => p.status === 'waiting').length);
    setText('stat-in-treatment', patients.filter(p => p.status === 'in_treatment').length);
    setText('stat-total-leads', leads.length);
    setText('stat-google-leads', leads.filter(l => (l.utm_source || '').toLowerCase().includes('google')).length);
    setText('stat-email-leads', leads.filter(l => l.full_name === l.email?.split('@')[0]).length);

    // Update overview if visible
    if (typeof updateOverview === 'function') updateOverview();
}

// GA4 cache TTL — declared as var so admin-settings.js can reassign
var GA4_CACHE_TTL = 5 * 60 * 1000;
