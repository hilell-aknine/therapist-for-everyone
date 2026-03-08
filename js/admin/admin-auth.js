// admin-auth.js — Auth guard & permission state
// Global permissions state
window._userCategoryAccess = null; // null = all access (superadmin / no row)
window._userBotRole = 'admin';
window._userProfileRole = 'admin'; // profiles.role: 'admin' or 'sales_rep'
window._userProfileId = null;

// AUTH GUARD - Redirect if not authenticated or not admin/sales_rep
(async function() {
    const tempClient = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
    const { data: { session } } = await tempClient.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return;
    }
    window._userProfileId = session.user.id;
    // Verify admin or sales_rep role
    const { data: profile } = await tempClient
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
    if (!profile || !['admin', 'sales_rep'].includes(profile.role)) {
        window.location.href = 'course-library.html';
        return;
    }
    window._userProfileRole = profile.role;
    // If sales_rep: hide non-pipeline sidebar tabs
    if (profile.role === 'sales_rep') {
        document.querySelectorAll('.sidebar .nav-item').forEach(item => {
            const onclick = item.getAttribute('onclick') || '';
            const allowed = ["switchView('pipeline')", "switchView('settings')"];
            if (!allowed.some(a => onclick.includes(a))) {
                item.style.display = 'none';
            }
        });
        // Hide admin-only elements
        document.querySelectorAll('[data-admin-only]').forEach(el => el.style.display = 'none');
        // Auto-switch to pipeline view
        setTimeout(() => {
            const pipelineTab = document.querySelector('.sidebar .nav-item[onclick*="pipeline"]');
            if (pipelineTab) pipelineTab.click();
        }, 100);
    }
    // Load category permissions
    const { data: access } = await tempClient
        .from('crm_bot_access')
        .select('role, category_access')
        .eq('user_id', session.user.id)
        .single();
    if (access) {
        window._userBotRole = access.role || 'admin';
        window._userCategoryAccess = access.category_access || null;
    }
})();
