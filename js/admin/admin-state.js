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
        await Promise.all([loadPatients(), loadTherapists(), loadMatches(), loadLeads(), loadContactLeads(), loadQuestionnaires(), loadPipeline()]);
    }
    updateCounts();
}

function updateCounts() {
    document.getElementById('patients-count').textContent = patients.length;
    document.getElementById('therapists-count').textContent = therapists.length;
    document.getElementById('matches-count').textContent = matches.length;
    document.getElementById('leads-count').textContent = leads.length;
    document.getElementById('stat-new').textContent = patients.filter(p => p.status === 'new').length;
    document.getElementById('stat-waiting').textContent = patients.filter(p => p.status === 'waiting').length;
    document.getElementById('stat-in-treatment').textContent = patients.filter(p => p.status === 'in_treatment').length;
    document.getElementById('stat-total-leads').textContent = leads.length;
    document.getElementById('stat-google-leads').textContent = leads.filter(l => !l.email || l.full_name !== l.email?.split('@')[0]).length;
    document.getElementById('stat-email-leads').textContent = leads.filter(l => l.full_name === l.email?.split('@')[0]).length;
    // Pipeline counts
    const pActive = pipelineLeads.filter(l => !['closed_won','closed_lost'].includes(l.stage));
    document.getElementById('pipeline-count').textContent = pActive.length;
}

// GA4 cache TTL — declared as var so admin-settings.js can reassign
var GA4_CACHE_TTL = 5 * 60 * 1000;
