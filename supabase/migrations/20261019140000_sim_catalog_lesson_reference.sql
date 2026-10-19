-- The practice card sits under each lesson (in "חומרי עזר"), so it has to say
-- what the lesson taught before it asks the learner to practise it. The lesson
-- reference is what the lesson teaches, not part of the answer key, so it is
-- safe to return alongside the briefing. Return type changed → drop first.
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
  passed        boolean,
  lesson_reference text
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
               where ss.scenario_id = s.id and ss.user_id = auth.uid()), false),
    s.spec->>'lesson_reference'
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
