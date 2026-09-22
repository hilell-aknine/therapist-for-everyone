-- =============================================================================
-- Sandbox — סימולטור מטופל אינטראקטיבי
-- Spec: docs/specs/sandbox-patient-simulator.md
--
-- Three tables + three read-only RPCs. The whole point of the design is that
-- THE STATE LIVES IN CODE, NOT IN THE MODEL: metrics, fact unlocks and terminal
-- conditions are decided by the Edge Function under service_role and written
-- here. A client that could UPDATE sim_sessions could declare itself successful,
-- so `authenticated` gets SELECT and nothing else — there is deliberately no
-- INSERT/UPDATE policy on any of these tables.
-- =============================================================================

-- ── scenarios ────────────────────────────────────────────────────────────────
create table if not exists public.sim_scenarios (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null,
  version        int  not null default 1,
  course_type    text not null check (course_type in ('practitioner','master')),
  module_id      int,
  lesson_id      int,
  title          text not null,
  primary_skill  text not null,
  difficulty     int  not null check (difficulty between 1 and 3),
  turn_budget    int  not null default 12 check (turn_budget between 4 and 30),
  spec           jsonb not null,
  is_published   boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (slug, version)
);

-- ── sessions ─────────────────────────────────────────────────────────────────
create table if not exists public.sim_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  scenario_id      uuid not null references public.sim_scenarios(id),
  scenario_version int  not null,          -- frozen: editing a scenario never rewrites history
  status           text not null default 'in_session'
                   check (status in ('in_session','ended','debriefed')),
  outcome          text check (outcome in ('success','budget','collapse','abandoned')),
  metrics          jsonb not null,
  unlocked_facts   text[] not null default '{}',
  flags            jsonb not null default '{}'::jsonb,
  rolling_summary  text not null default '',
  turn_count       int  not null default 0,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  debrief          jsonb,
  tokens_in        int not null default 0,
  tokens_out       int not null default 0
);

-- ── turns (append only) ──────────────────────────────────────────────────────
create table if not exists public.sim_turns (
  id            bigserial primary key,
  session_id    uuid not null references public.sim_sessions(id) on delete cascade,
  turn_index    int  not null,
  student_text  text not null,
  patient_text  text not null,
  evaluation    jsonb not null,
  metrics_after jsonb not null,
  latency_ms    int,
  created_at    timestamptz not null default now(),
  unique (session_id, turn_index)
);

create index if not exists idx_sim_sessions_user on public.sim_sessions (user_id, started_at desc);
create index if not exists idx_sim_sessions_day  on public.sim_sessions (user_id, started_at);
create index if not exists idx_sim_turns_session on public.sim_turns (session_id, turn_index);
create index if not exists idx_sim_scenarios_pub on public.sim_scenarios (is_published, course_type);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.sim_scenarios enable row level security;
alter table public.sim_sessions  enable row level security;
alter table public.sim_turns     enable row level security;

drop policy if exists sim_scenarios_admin on public.sim_scenarios;
create policy sim_scenarios_admin on public.sim_scenarios
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- NOTE: no scenario SELECT policy for regular learners on purpose.
-- `spec` contains gated_facts, scoring_rules and success conditions — handing the
-- row to the browser would put the answer key in DevTools. Learners reach the
-- catalogue through sim_catalog() below, which returns the briefing only.

drop policy if exists sim_sessions_read on public.sim_sessions;
create policy sim_sessions_read on public.sim_sessions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists sim_turns_read on public.sim_turns;
create policy sim_turns_read on public.sim_turns
  for select to authenticated
  using (exists (select 1 from public.sim_sessions s
                 where s.id = sim_turns.session_id and s.user_id = auth.uid()));

-- =============================================================================
-- RPCs — the only path from the browser to scenario data
-- =============================================================================

-- Published scenarios the caller may open, briefing only. Never returns `spec`.
create or replace function public.sim_catalog()
returns table (
  scenario_id  uuid,
  slug         text,
  title        text,
  primary_skill text,
  difficulty   int,
  turn_budget  int,
  briefing     jsonb,
  patient_name text,
  attempts     int,
  best_outcome text
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
    coalesce((select count(*)::int from public.sim_sessions ss
              where ss.scenario_id = s.id and ss.user_id = auth.uid()), 0),
    (select ss.outcome from public.sim_sessions ss
      where ss.scenario_id = s.id and ss.user_id = auth.uid() and ss.outcome is not null
      order by (ss.outcome = 'success') desc, ss.started_at desc limit 1)
  from public.sim_scenarios s
  where s.is_published
    and auth.uid() is not null
    -- Scalar subquery, not a join: a learner with no profiles row must still see
    -- the practitioner scenarios. A CROSS JOIN here would return nothing at all.
    and (s.course_type = 'practitioner'
         or coalesce((select p.role from public.profiles p where p.id = auth.uid()), '')
            in ('paid_customer','admin'))
  order by s.difficulty, s.created_at;
$$;

-- The caller's own sessions, newest first. Used by the history screen.
create or replace function public.sim_my_sessions(p_limit int default 20)
returns table (
  session_id  uuid,
  scenario_id uuid,
  title       text,
  status      text,
  outcome     text,
  turn_count  int,
  metrics     jsonb,
  started_at  timestamptz,
  has_debrief boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select ss.id, ss.scenario_id, sc.title, ss.status, ss.outcome,
         ss.turn_count, ss.metrics, ss.started_at, (ss.debrief is not null)
  from public.sim_sessions ss
  join public.sim_scenarios sc on sc.id = ss.scenario_id
  where ss.user_id = auth.uid()
  order by ss.started_at desc
  limit least(coalesce(p_limit, 20), 100);
$$;

-- Full transcript of one of the caller's own sessions, for the debrief screen.
create or replace function public.sim_transcript(p_session uuid)
returns table (
  turn_index    int,
  student_text  text,
  patient_text  text,
  evaluation    jsonb,
  metrics_after jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select t.turn_index, t.student_text, t.patient_text, t.evaluation, t.metrics_after
  from public.sim_turns t
  join public.sim_sessions s on s.id = t.session_id
  where t.session_id = p_session
    and s.user_id = auth.uid()
  order by t.turn_index;
$$;

revoke all on function public.sim_catalog()          from public, anon;
revoke all on function public.sim_my_sessions(int)   from public, anon;
revoke all on function public.sim_transcript(uuid)   from public, anon;
grant execute on function public.sim_catalog()        to authenticated;
grant execute on function public.sim_my_sessions(int) to authenticated;
grant execute on function public.sim_transcript(uuid) to authenticated;

-- =============================================================================
-- Golden scenario — פירוק הכללה (chunk down)
-- =============================================================================
insert into public.sim_scenarios
  (slug, version, course_type, module_id, lesson_id, title, primary_skill,
   difficulty, turn_budget, is_published, spec)
values (
  'chunk-down-meirav', 1, 'master', 3, 2,
  'פירוק הכללה — מירב',
  'chunk_down', 1, 12, true,
  $json$
{
  "briefing": {
    "patient_intro": "מירב, בת 38, ראש צוות שיווק. פנתה אחרי חודשיים קשים בעבודה.",
    "mission": "פרקי את ההכללה שלה עד לאירוע יחיד, ספציפי, ניתן לתצפית.",
    "rules": [
      "אין לתת עצות.",
      "אין להשתמש במונחים מקצועיים.",
      "אין לשאול 'למה'."
    ],
    "measured": ["ראפור", "פירוט", "עומק רגשי"],
    "opening_line": "אני לא יודעת, אף אחד בצוות שלי לא באמת מקשיב לי. אולי אני פשוט לא מתאימה לתפקיד הזה."
  },

  "patient": {
    "name": "מירב",
    "age": 38,
    "occupation": "ראש צוות שיווק",
    "presenting_problem": "מרגישה שלא מקשיבים לה בעבודה ושהיא לא מתאימה לתפקיד.",
    "opening_line": "אני לא יודעת, אף אחד בצוות שלי לא באמת מקשיב לי. אולי אני פשוט לא מתאימה לתפקיד הזה.",
    "personality": { "warmth": 60, "verbosity": 35, "defensiveness": 55 },
    "speech_register": "עברית יומיומית, משפטים קצרים, ממעיטה בערך עצמה. לא משתמשת בשפה רגשית עשירה.",
    "tics": [
      "פותחת ב'אני לא יודעת' כשהיא לא בטוחה",
      "מסיימת ב'זה כנראה אני' כשהיא בלחץ",
      "מתנצלת לפני שהיא מתלוננת"
    ],
    "never_does": [
      "לא מציעה תובנות על עצמה מיוזמתה",
      "לא משתמשת במילה 'הכללה' או בכל מונח NLP",
      "לא נותנת פרט ספציפי שלא נפתח"
    ]
  },

  "language_patterns": {
    "universal_quantifiers": ["אף אחד לא מקשיב", "זה תמיד ככה", "כולם יודעים יותר טוב ממני"],
    "deletions":            ["לא מקשיבים לי", "זה לא עובד", "מרגישה דחויה"],
    "nominalizations":      ["התקשורת בצוות", "ההערכה", "הלחץ"],
    "mind_reading":         ["הם חושבים שאני לא מספיק טובה"],
    "modal_operators":      ["אני חייבת להיות חזקה", "אני לא יכולה להגיד את זה"],
    "complex_equivalence":  ["לא מקשיבים לי, אז אני לא מתאימה"]
  },

  "gated_facts": [
    {
      "id": "f1_who",
      "content": "טוב... לא אף אחד. בעיקר רונית.",
      "unlock_when": { "moves": ["challenge_universal"], "min_rapport": 40 }
    },
    {
      "id": "f2_when",
      "content": "בישיבת הצוות ביום רביעי.",
      "unlock_when": { "moves": ["specify_time","specify_context"], "requires": ["f1_who"], "min_rapport": 45 }
    },
    {
      "id": "f3_what",
      "content": "היא הסתכלה בטלפון כל הזמן שדיברתי. ואז, חמש דקות אחרי, אמרה את אותו דבר כאילו זה הרעיון שלה.",
      "unlock_when": { "moves": ["specify_behavior"], "requires": ["f2_when"], "min_rapport": 50, "max_resistance": 60 },
      "is_target": true
    },
    {
      "id": "f4_self",
      "content": "ואני... לא אמרתי כלום. פשוט ישבתי שם.",
      "unlock_when": { "moves": ["specify_behavior","reflect_back"], "requires": ["f3_what"], "min_rapport": 65 },
      "is_bonus": true
    }
  ],

  "metrics_init": { "rapport": 55, "resistance": 45, "emotional_depth": 10, "specificity": 5 },

  "scoring_rules": {
    "challenge_universal":  { "rapport":  5, "specificity": 20, "resistance": -5 },
    "specify_time":         { "rapport":  3, "specificity": 15 },
    "specify_context":      { "rapport":  3, "specificity": 15 },
    "specify_behavior":     { "rapport":  5, "specificity": 25, "emotional_depth": 10 },
    "reflect_back":         { "rapport": 10, "resistance": -10 },
    "pace_emotion":         { "rapport":  8, "emotional_depth": 10 },
    "give_advice":          { "rapport": -5, "resistance": 15, "emotional_depth": -10 },
    "why_question":         { "rapport": -5, "resistance": 12 },
    "jargon":               { "rapport": -15, "resistance": 10 },
    "challenge_no_rapport": { "rapport": -20, "resistance": 20 },
    "closed_question":      { "specificity": 3 },
    "neutral":              { "rapport": -2 }
  },

  "success": {
    "all_of": [
      { "fact_unlocked": "f3_what" },
      { "metric": "specificity", "gte": 60 },
      { "metric": "rapport", "gte": 50 }
    ]
  },

  "failure": {
    "any_of": [
      { "metric": "rapport", "lte": 20 },
      { "flag": "advice_count", "gte": 3 },
      { "budget_exhausted": true, "metric": "specificity", "lt": 30 }
    ]
  },

  "known_errors": [
    {
      "id": "why",
      "trigger_move": "why_question",
      "patient_reaction": "אני לא יודעת למה. זה פשוט ככה. אולי זה אני.",
      "coach_note": "שאלת 'למה' מבקשת מהמטופל הצדקה, לא פירוט. היא מייצרת סיפור, לא נתון.",
      "golden_line": "'אף אחד לא מקשיב' — אף אחד?"
    },
    {
      "id": "advice",
      "trigger_move": "give_advice",
      "patient_reaction": "כן, אתה צודק. אני כנראה צריכה לדבר איתם.",
      "coach_note": "היא הסכימה איתך, והשיחה מתה. הסכמה מנומסת היא סימן ההיכר של מטופל שוויתר, לא של מטופל שהתקדם.",
      "golden_line": "רגע לפני פתרונות, מה בדיוק קרה בפעם האחרונה?"
    },
    {
      "id": "jargon",
      "trigger_move": "jargon",
      "patient_reaction": "אמונה מה? אני לא בטוחה שהבנתי.",
      "coach_note": "השם של הטכניקה הוא בשבילך. המטופלת צריכה את הפעולה, לא את השם.",
      "golden_line": "מה קרה שגרם לך לחשוב ככה?"
    },
    {
      "id": "challenge_cold",
      "trigger_move": "challenge_no_rapport",
      "patient_reaction": "אולי. לא משנה. שיהיה.",
      "coach_note": "איתגור בלי ראפור נקרא ביקורת. הפירוק נכון, התזמון הרג אותו.",
      "golden_line": "נשמע שזה יושב עלייך כבר זמן. אף אחד, את אומרת?"
    }
  ]
}
  $json$::jsonb
)
on conflict (slug, version) do update
  set spec = excluded.spec,
      title = excluded.title,
      turn_budget = excluded.turn_budget,
      is_published = excluded.is_published;
