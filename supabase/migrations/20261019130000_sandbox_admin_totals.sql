-- Distinct learners across every scenario. The per-lesson stats cannot give this
-- (a learner who practised three lessons would be counted three times).
create or replace function public.admin_sandbox_totals()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'learners',    (select count(distinct user_id) from public.sim_sessions),
    'learners_7d', (select count(distinct user_id) from public.sim_sessions
                     where started_at >= now() - interval '7 days')
  );
end $$;

revoke all on function public.admin_sandbox_totals() from public, anon;
grant execute on function public.admin_sandbox_totals() to authenticated;
