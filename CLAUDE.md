# CLAUDE.md - Project Context & Guidelines
**Project Name:** Therapists for Everyone (פורטל מטפלים לכולם)
**Tech Stack:** Vanilla JS, HTML, CSS (Tailwind via CDN), Supabase (Auth, DB, Edge Functions).
**Environment:** Localhost development, Deploy to Vercel (Future).

## 1. Project Vision & Core Principles
* **Purpose:** A community portal for high-quality therapists offering subsidized/free mental health support.
* **Key Distinction:** Not just a directory. A managed community with AI screening and strict quality control.
* **The "Iron Rule" (Critical):** **NO ACTION without Legal Consent.**
    * No user (Therapist or Patient) can access the dashboard or view data without a valid, signed record in the `legal_consents` table.
    * This check must happen on *every* page load (Middleware/Auth Guard).

## 2. User Roles & Permissions (Supabase RLS)
* **Admin ("God Mode"):**
    * Can view all data.
    * Identification: MUST be checked via `profiles.role = 'admin'` (NOT hardcoded emails).
* **Therapist:**
    * Can only see their own profile (`auth.uid()`).
    * Can see patients assigned specifically to them.
* **Patient:**
    * Can only see their own profile.
    * Can see details of their assigned therapist.

## 3. Architecture & File Structure
* **Frontend:** Keep HTML files clean. Move complex logic to `/js` modules.
    * `js/supabase-client.js`: The ONLY place for Supabase initialization.
    * `js/auth-guard.js`: New file needed for role & legal checks.
* **Database (Supabase):**
    * Always use RLS (Row Level Security).
    * New Table Required: `legal_consents` (user_id, ip_address, agreed_version, signed_at).

## 4. Coding Standards
* **Secrets:** NEVER hardcode API keys (except Supabase Anon Key). Use `.env` or Supabase Secrets.
* **Style:** Use descriptive variable names (`isTherapistApproved` vs `approved`).
* **Language:** UI in Hebrew (RTL), Code/Comments in English.
* **Error Handling:** Always wrap Supabase calls in `try/catch` and show user-friendly errors (alert/toast).

## 5. Immediate Roadmap (Priority Order)
1.  **Legal Gate:** Create `legal_consents` table & `legal-gate.html`. Implement redirection logic.
2.  **Refactor Auth:** Move hardcoded admin emails to DB check.
3.  **Patient Flow:** Build the missing Patient Onboarding form.
