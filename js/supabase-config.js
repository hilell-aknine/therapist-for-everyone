// ============================================================================
// Supabase Configuration - SINGLE SOURCE OF TRUTH
// ============================================================================
// Supabase anon key is designed to be public (protected by Row Level Security).
// This file centralizes the config so it's maintained in one place only.
// All other files should reference window.SUPABASE_CONFIG instead of hardcoding.
// ============================================================================

window.SUPABASE_CONFIG = {
    url: 'https://eimcudmlfjlyxjyrdcgc.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpbWN1ZG1sZmpseXhqeXJkY2djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTA5MDYsImV4cCI6MjA4NDk4NjkwNn0.ESXViZ0DZxopHxHNuC6vRn3iIZz1KZkQcXwgLhK_nQw',
    functionsUrl: 'https://eimcudmlfjlyxjyrdcgc.supabase.co/functions/v1',
    turnstileSiteKey: '0x4AAAAAACo3dGvBMD84eXWh',
    // Google Apps Script API (admin-only, used for Sheets sync)
    sheetsApiUrl: 'https://script.google.com/macros/s/AKfycbxtH1yYVyv8j561ztm1EJ0fIal9DD75wT9JFUokTh0jPkwc06yzlL_b9v7cCFgL3kXT/exec',
    sheetsApiToken: '2fe00f3e650c58464562b19187dec038'
};
