// ============================================================================
// Edge Function: get-lessons
// Returns all NLP Practitioner course lessons grouped by module
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
  '*',
]

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : '*'
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Parse optional body params
    let format = 'grouped' // 'grouped' | 'flat'
    let module_filter: string | null = null

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body.format) format = body.format
        if (body.module) module_filter = body.module
      } catch { /* empty body is fine */ }
    }

    // Query lessons
    let query = supabase
      .from('lessons')
      .select('id, title, description, video_url, section_name, order_index')
      .order('order_index', { ascending: true })

    if (module_filter) {
      query = query.eq('section_name', module_filter)
    }

    const { data: lessons, error } = await query

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let responseData: unknown

    if (format === 'flat') {
      // Flat array of all lessons
      responseData = {
        total: lessons.length,
        lessons,
      }
    } else {
      // Grouped by module (default)
      const modules: Record<string, { module_name: string; lesson_count: number; lessons: typeof lessons }> = {}
      const moduleOrder: string[] = []

      for (const lesson of lessons) {
        if (!modules[lesson.section_name]) {
          modules[lesson.section_name] = {
            module_name: lesson.section_name,
            lesson_count: 0,
            lessons: [],
          }
          moduleOrder.push(lesson.section_name)
        }
        modules[lesson.section_name].lessons.push(lesson)
        modules[lesson.section_name].lesson_count++
      }

      responseData = {
        total_lessons: lessons.length,
        total_modules: moduleOrder.length,
        modules: moduleOrder.map(name => modules[name]),
      }
    }

    return new Response(
      JSON.stringify(responseData),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
        },
      }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
