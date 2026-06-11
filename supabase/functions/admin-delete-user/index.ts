// ============================================================================
// Edge Function: admin-delete-user
// Permanently deletes a portal user (auth.users + profiles + all owned data)
// or an anonymous questionnaire row. Admin-only — the service-role key never
// reaches the browser; the dashboard calls this with the admin's own JWT.
//
// Accepts ONE OF:
//   { user_id }            → full user deletion (auth + profile + data)
//   { questionnaire_id }   → deletes a single anonymous portal_questionnaires row
//   { contact_request_id } → deletes a single contact_requests lead row
//
// Deletion order matters (FK delete rules as deployed 2026-06):
//   - automation_rules.created_by / retention_messages.approved_by are
//     NO ACTION FKs to auth.users → nulled first so they never block.
//   - portal_questionnaires.user_id is SET NULL → deleted explicitly so the
//     lead actually disappears from the dashboard instead of going anonymous.
//   - profiles → auth.users is NO ACTION → profile deleted explicitly
//     (cascades subscriptions).
//   - auth.admin.deleteUser() last — cascades course_progress, game tables,
//     notes, referrals, consents, sessions, etc.
//
// Safety: refuses to delete any profile with role='admin' (covers self-delete).
// Every deletion is audited in crm_activity_log.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALLOWED_ORIGINS = [
  'https://www.therapist-home.com',
  'https://therapist-home.com',
  'https://therapist-for-everyone.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || req.headers.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function jsonResponse(payload: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, cors)

  try {
    // ── Caller must be a logged-in admin ──
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401, cors)

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: authError } = await db.auth.getUser(token)
    if (authError || !caller) return jsonResponse({ error: 'invalid_token' }, 401, cors)

    const { data: callerProfile } = await db
      .from('profiles')
      .select('role, email, phone')
      .eq('id', caller.id)
      .single()
    if (callerProfile?.role !== 'admin') return jsonResponse({ error: 'admin_only' }, 403, cors)

    const body = await req.json().catch(() => ({}))
    const user_id = typeof body?.user_id === 'string' ? body.user_id : null
    const questionnaire_id = typeof body?.questionnaire_id === 'string' ? body.questionnaire_id : null
    const contact_request_id = typeof body?.contact_request_id === 'string' ? body.contact_request_id : null
    if (!user_id && !questionnaire_id && !contact_request_id) return jsonResponse({ error: 'missing_id' }, 400, cors)

    const audit = async (action: string, entityId: string | null, details: Record<string, unknown>) => {
      await db.from('crm_activity_log').insert({
        actor_phone: callerProfile?.phone || caller.email || 'admin-dashboard',
        actor_name: callerProfile?.email || caller.email || null,
        action,
        entity_type: 'user',
        entity_id: entityId,
        details,
      })
    }

    // ── Contact-form lead row (contact_requests) ──
    if (!user_id && contact_request_id) {
      const { data: cr } = await db
        .from('contact_requests')
        .select('id, phone, full_name')
        .eq('id', contact_request_id)
        .maybeSingle()
      if (!cr) return jsonResponse({ deleted: false, reason: 'not_found' }, 404, cors)

      const { error: delErr } = await db.from('contact_requests').delete().eq('id', contact_request_id)
      if (delErr) throw delErr
      await audit('admin_delete_contact_request', contact_request_id, { phone: cr.phone || null, full_name: cr.full_name || null })
      return jsonResponse({ deleted: true, kind: 'contact_request' }, 200, cors)
    }

    // ── Anonymous questionnaire row (no auth user attached) ──
    if (!user_id && questionnaire_id) {
      const { data: q } = await db
        .from('portal_questionnaires')
        .select('id, user_id, phone')
        .eq('id', questionnaire_id)
        .maybeSingle()
      if (!q) return jsonResponse({ deleted: false, reason: 'not_found' }, 404, cors)
      // If it actually belongs to a user, require the explicit user_id path
      if (q.user_id) return jsonResponse({ deleted: false, reason: 'has_user_use_user_id', user_id: q.user_id }, 409, cors)

      const { error: delErr } = await db.from('portal_questionnaires').delete().eq('id', questionnaire_id)
      if (delErr) throw delErr
      await audit('admin_delete_questionnaire', questionnaire_id, { phone: q.phone || null })
      return jsonResponse({ deleted: true, kind: 'questionnaire' }, 200, cors)
    }

    // ── Full user deletion ──
    const { data: target } = await db
      .from('profiles')
      .select('id, email, full_name, phone, role')
      .eq('id', user_id)
      .maybeSingle()

    if (target?.role === 'admin') {
      return jsonResponse({ deleted: false, reason: 'cannot_delete_admin' }, 403, cors)
    }

    // Null out NO ACTION references that would block the auth deletion.
    await db.from('automation_rules').update({ created_by: null }).eq('created_by', user_id)
    await db.from('retention_messages').update({ approved_by: null }).eq('approved_by', user_id)

    // Delete the lead's questionnaire rows (FK is SET NULL — without this the
    // row would linger as an anonymous lead in the dashboard).
    await db.from('portal_questionnaires').delete().eq('user_id', user_id)

    // Profile (NO ACTION FK) — cascades subscriptions.
    if (target) {
      const { error: profErr } = await db.from('profiles').delete().eq('id', user_id)
      if (profErr) throw profErr
    }

    // Auth user last — cascades everything else (progress, game, notes, referrals...).
    const { error: authDelErr } = await db.auth.admin.deleteUser(user_id!)
    if (authDelErr && !/not.*found/i.test(authDelErr.message || '')) {
      // Profile is already gone at this point; surface the error for retry.
      console.error('auth.admin.deleteUser failed:', authDelErr.message)
      return jsonResponse({ deleted: false, reason: 'auth_delete_failed', detail: authDelErr.message }, 500, cors)
    }

    await audit('admin_delete_user', user_id, {
      email: target?.email || null,
      full_name: target?.full_name || null,
      phone: target?.phone || null,
    })

    return jsonResponse({ deleted: true, kind: 'user' }, 200, cors)
  } catch (e) {
    console.error('admin-delete-user unhandled error:', e)
    return jsonResponse({ error: 'internal_error', detail: e instanceof Error ? e.message : String(e) }, 500, cors)
  }
})
