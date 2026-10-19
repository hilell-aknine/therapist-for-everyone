-- =============================================================================
-- Sandbox per lesson — one practice scenario per course lesson, a training mode,
-- a learner-level difficulty, a pass mark, and the admin analytics behind it.
--
-- Extends the simulator from 20260919120000 instead of building a parallel one:
-- the engine, the RLS model (learners read, only service_role writes) and the
-- "spec never leaves the server" rule all stay exactly as they were.
--
-- ⚠️ Apply through the Management API in one transaction that also writes the
-- ledger row. NOT `db push --include-all` (it would re-run 23 old migrations).
-- =============================================================================

-- ── Scenarios: tie to a lesson, set a pass mark ──────────────────────────────
alter table public.sim_scenarios
  add column if not exists video_id      text,
  add column if not exists passing_score int not null default 75;

do $$ begin
  alter table public.sim_scenarios
    add constraint sim_scenarios_passing_score_range check (passing_score between 0 and 100);
exception when duplicate_object then null; end $$;

create index if not exists sim_scenarios_lesson_idx
  on public.sim_scenarios (course_type, module_id, lesson_id) where is_published;

-- ── Sessions: mode, level, score, pass ───────────────────────────────────────
alter table public.sim_sessions
  add column if not exists mode             text not null default 'train',
  add column if not exists difficulty       int,
  add column if not exists overall_score    int,
  add column if not exists passed           boolean,
  add column if not exists duration_seconds int;

do $$ begin
  alter table public.sim_sessions
    add constraint sim_sessions_mode_check check (mode in ('train', 'exam'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.sim_sessions
    add constraint sim_sessions_difficulty_check check (difficulty is null or difficulty between 1 and 3);
exception when duplicate_object then null; end $$;

create index if not exists sim_sessions_scenario_idx on public.sim_sessions (scenario_id, started_at desc);

-- ── "תורגל ✓" lands in the shared completion log, not in course_progress ────
-- course_progress means "watched the video"; the progress bar and the streak read
-- it. A passed drill is its own event with its own source.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.lesson_completion_events'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%source%'
  loop
    execute format('alter table public.lesson_completion_events drop constraint %I', c);
  end loop;
end $$;

alter table public.lesson_completion_events
  add constraint lesson_completion_events_source_check
  check (source in ('video', 'game', 'sandbox'));

-- =============================================================================
-- Learner RPCs
-- =============================================================================

-- The catalog now carries the lesson it belongs to and whether the caller passed
-- it, so the course page can place a card on each lesson and a ✓ in the menu
-- with one call. Return type changed → drop first.
drop function if exists public.sim_catalog();

create function public.sim_catalog()
returns table (
  scenario_id   uuid,
  slug          text,
  title         text,
  primary_skill text,
  difficulty    int,
  turn_budget   int,
  briefing      jsonb,
  patient_name  text,
  patient_gender text,
  attempts      int,
  best_outcome  text,
  course_type   text,
  module_id     int,
  lesson_id     int,
  video_id      text,
  passing_score int,
  best_score    int,
  passed        boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id,
    s.slug,
    s.title,
    s.primary_skill,
    s.difficulty,
    s.turn_budget,
    s.spec->'briefing',
    s.spec->'patient'->>'name',
    coalesce(s.spec->'patient'->>'gender', 'f'),
    coalesce((select count(*)::int from public.sim_sessions ss
              where ss.scenario_id = s.id and ss.user_id = auth.uid()), 0),
    (select ss.outcome from public.sim_sessions ss
      where ss.scenario_id = s.id and ss.user_id = auth.uid() and ss.outcome is not null
      order by (ss.outcome = 'success') desc, ss.started_at desc limit 1),
    s.course_type,
    s.module_id,
    s.lesson_id,
    s.video_id,
    s.passing_score,
    (select max(ss.overall_score) from public.sim_sessions ss
      where ss.scenario_id = s.id and ss.user_id = auth.uid()),
    coalesce((select bool_or(ss.passed) from public.sim_sessions ss
               where ss.scenario_id = s.id and ss.user_id = auth.uid()), false)
  from public.sim_scenarios s
  where s.is_published
    and auth.uid() is not null
    -- Only the newest published version of each slug.
    and s.version = (select max(s2.version) from public.sim_scenarios s2
                      where s2.slug = s.slug and s2.is_published)
    -- Scalar subquery, not a join: a learner with no profiles row must still see
    -- the practitioner scenarios. A CROSS JOIN here would return nothing at all.
    and (s.course_type = 'practitioner'
         or coalesce((select p.role from public.profiles p where p.id = auth.uid()), '')
            in ('paid_customer','admin'))
  order by s.course_type, s.module_id nulls last, s.lesson_id nulls last, s.difficulty, s.created_at;
$$;

revoke all on function public.sim_catalog() from public, anon;
grant execute on function public.sim_catalog() to authenticated;

-- =============================================================================
-- Admin RPCs — sim_sessions/sim_turns are owner-read only, so analytics goes
-- through SECURITY DEFINER functions that refuse anyone but an admin.
-- =============================================================================

-- Per-lesson funnel.
create or replace function public.admin_sandbox_lesson_stats()
returns table (
  scenario_id   uuid,
  slug          text,
  title         text,
  course_type   text,
  module_id     int,
  lesson_id     int,
  primary_skill text,
  is_published  boolean,
  learners      int,
  sessions      int,
  passed        int,
  failed        int,
  abandoned     int,
  in_progress   int,
  avg_score     numeric,
  avg_turns     numeric,
  avg_duration  numeric,
  last_at       timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
  select
    s.id, s.slug, s.title, s.course_type, s.module_id, s.lesson_id, s.primary_skill, s.is_published,
    count(distinct ss.user_id)::int,
    count(ss.id)::int,
    count(ss.id) filter (where ss.passed)::int,
    count(ss.id) filter (where ss.outcome in ('budget', 'collapse')
                           or (ss.status = 'debriefed' and ss.passed is false and ss.outcome = 'success'))::int,
    count(ss.id) filter (where ss.outcome = 'abandoned')::int,
    count(ss.id) filter (where ss.status = 'in_session')::int,
    round(avg(ss.overall_score) filter (where ss.overall_score is not null and ss.turn_count > 0), 1),
    round(avg(ss.turn_count) filter (where ss.status <> 'in_session'), 1),
    round(avg(ss.duration_seconds) filter (where ss.duration_seconds is not null), 0),
    max(ss.started_at)
  from public.sim_scenarios s
  left join public.sim_sessions ss on ss.scenario_id = s.id
  where s.version = (select max(s2.version) from public.sim_scenarios s2 where s2.slug = s.slug)
  group by s.id
  order by s.course_type, s.module_id nulls last, s.lesson_id nulls last;
end $$;

-- Recent sessions feed.
create or replace function public.admin_sandbox_recent(p_limit int default 50)
returns table (
  session_id    uuid,
  user_id       uuid,
  learner_name  text,
  learner_email text,
  scenario_title text,
  module_id     int,
  lesson_id     int,
  mode          text,
  difficulty    int,
  status        text,
  outcome       text,
  overall_score int,
  passed        boolean,
  turn_count    int,
  duration_seconds int,
  started_at    timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
  select ss.id, ss.user_id, p.full_name, p.email, sc.title, sc.module_id, sc.lesson_id,
         ss.mode, ss.difficulty, ss.status, ss.outcome, ss.overall_score, ss.passed,
         ss.turn_count, ss.duration_seconds, ss.started_at
  from public.sim_sessions ss
  join public.sim_scenarios sc on sc.id = ss.scenario_id
  left join public.profiles p on p.id = ss.user_id
  order by ss.started_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- One session in full: the debrief plus every turn with its judgement.
create or replace function public.admin_sandbox_transcript(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'debrief', ss.debrief,
    'metrics', ss.metrics,
    'turns', coalesce((
      select jsonb_agg(jsonb_build_object(
               'turn_index', t.turn_index,
               'student_text', t.student_text,
               'patient_text', t.patient_text,
               'move', t.evaluation->>'move',
               'confidence', t.evaluation->'confidence',
               'note', t.evaluation->>'one_line_note',
               'metrics_after', t.metrics_after)
             order by t.turn_index)
      from public.sim_turns t where t.session_id = ss.id), '[]'::jsonb)
  )
  into result
  from public.sim_sessions ss
  where ss.id = p_session;
  return result;
end $$;

-- Month-to-date simulator spend, same pricing as the shared ₪ ceiling in llm.ts.
create or replace function public.admin_sandbox_cost_month()
returns table (source text, prompt_tokens bigint, completion_tokens bigint, est_ils numeric)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
  select u.source,
         sum(coalesce(u.prompt_tokens, 0))::bigint,
         sum(coalesce(u.completion_tokens, 0))::bigint,
         -- Haiku-priced sources are counted at Sonnet rates on purpose: that is
         -- how the shared ceiling counts them, and the panel must agree with it.
         round(((sum(coalesce(u.prompt_tokens, 0)) * 3 + sum(coalesce(u.completion_tokens, 0)) * 15)
                / 1000000.0) * 3.8, 2)
  from public.ai_chat_usage u
  where u.source like 'sim-%'
    and u.date >= date_trunc('month', (now() at time zone 'Asia/Jerusalem'))::date
  group by u.source
  order by 4 desc;
end $$;

revoke all on function public.admin_sandbox_lesson_stats()      from public, anon;
revoke all on function public.admin_sandbox_recent(int)         from public, anon;
revoke all on function public.admin_sandbox_transcript(uuid)    from public, anon;
revoke all on function public.admin_sandbox_cost_month()        from public, anon;
grant execute on function public.admin_sandbox_lesson_stats()   to authenticated;
grant execute on function public.admin_sandbox_recent(int)      to authenticated;
grant execute on function public.admin_sandbox_transcript(uuid) to authenticated;
grant execute on function public.admin_sandbox_cost_month()     to authenticated;
