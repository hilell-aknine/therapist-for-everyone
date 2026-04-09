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
    applySettingsOnLoad();
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
        // Sales rep: only load pipeline (RLS filters by assigned_to)
        await loadPipeline();
    } else {
        await Promise.all([loadPatients(), loadTherapists(), loadMatches(), loadLeads(), loadContactLeads(), loadQuestionnaires(), loadPipeline(), loadPortalQuestionnaires()]);
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
    const clLen = typeof contactLeads !== 'undefined' ? contactLeads.length : 0;
    const qLen = typeof questionnaires !== 'undefined' ? questionnaires.length : 0;
    const pActive = pipelineLeads.filter(l => !['closed_won','closed_lost'].includes(l.stage));
    setText('sales-count', clLen + qLen + pActive.length);
    setText('learning-count', leads.length);
    setText('pipeline-count', pActive.length);

    // Stat cards
    setText('stat-new', patients.filter(p => p.status === 'new').length);
    setText('stat-waiting', patients.filter(p => p.status === 'waiting').length);
    setText('stat-in-treatment', patients.filter(p => p.status === 'in_treatment').length);
    setText('stat-total-leads', leads.length);
    setText('stat-google-leads', leads.filter(l => !l.email || l.full_name !== l.email?.split('@')[0]).length);
    setText('stat-email-leads', leads.filter(l => l.full_name === l.email?.split('@')[0]).length);

    // Update overview if visible
    if (typeof updateOverview === 'function') updateOverview();
}

// GA4 cache TTL — declared as var so admin-settings.js can reassign
var GA4_CACHE_TTL = 5 * 60 * 1000;
