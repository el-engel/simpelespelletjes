-- Simplegames: feedback op vragen en gebruiksstatistieken.
-- Uitvoeren in de SQL Editor van Supabase NA 20261114000000_init.sql (zie SETUP.md).
-- Mag meerdere keren worden uitgevoerd.
--
-- Er worden geen namen, IP-adressen of andere persoonsgegevens opgeslagen.
-- Een "toestel" is een willekeurig nummer dat de browser zelf bedenkt en in
-- localStorage bewaart; het is niet te herleiden tot een persoon.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table if not exists public.devices (
  id uuid primary key,
  first_seen date not null,
  last_seen date not null
);
create index if not exists devices_first_seen_idx on public.devices (first_seen);

-- Eén rij per toestel per dag (Nederlandse tijd) waarop de site is bezocht.
create table if not exists public.visits (
  day date not null,
  device_id uuid not null references public.devices (id) on delete cascade,
  primary key (day, device_id)
);

-- Eén rij per gespeeld spel.
create table if not exists public.play_sessions (
  id uuid primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  device_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (end_reason in ('done', 'out', 'stopped', 'quit')),
  players smallint not null default 0 check (players between 0 and 50),
  per_player smallint not null default 0 check (per_player between 0 and 50),
  youngest_age smallint check (youngest_age between 0 and 120),
  task_codes text[] not null default '{}',
  category_ids uuid[] not null default '{}',
  skip_players smallint not null default 0 check (skip_players between 0 and 50),
  repeats_offered boolean not null default false,
  played_repeats boolean not null default false,
  turns integer not null default 0 check (turns between 0 and 5000),
  updated_at timestamptz not null default now()
);
create index if not exists play_sessions_game_idx on public.play_sessions (game_id, started_at);

-- Wat er met een vraag gebeurde: geraden, niet geraden of overgeslagen.
create table if not exists public.question_events (
  id uuid primary key,
  session_id uuid not null references public.play_sessions (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  kind text not null check (kind in ('guessed', 'not_guessed', 'swapped')),
  task_code text not null default '',
  youngest_age smallint check (youngest_age between 0 and 120),
  created_at timestamptz not null default now()
);
create index if not exists question_events_game_idx on public.question_events (game_id, created_at);
create index if not exists question_events_question_idx on public.question_events (question_id);

-- Feedbackknoppen. Per spel kan een vraag maar één keer gemeld worden.
create table if not exists public.question_feedback (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.play_sessions (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  reason text not null check (reason in ('te_moeilijk', 'leeftijd', 'niet_leuk', 'prima')),
  moment text not null check (moment in ('andere_vraag', 'niet_geraden')),
  youngest_age smallint check (youngest_age between 0 and 120),
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, question_id)
);
create index if not exists question_feedback_game_idx on public.question_feedback (game_id, created_at);
create index if not exists question_feedback_question_idx on public.question_feedback (question_id);

-- ---------------------------------------------------------------------------
-- Toegangsregels: bezoekers kunnen hier nooit rechtstreeks bij. Alleen de
-- server schrijft (via de functies hieronder) en alleen de admin met 2FA leest.
-- ---------------------------------------------------------------------------

alter table public.devices enable row level security;
alter table public.visits enable row level security;
alter table public.play_sessions enable row level security;
alter table public.question_events enable row level security;
alter table public.question_feedback enable row level security;

revoke all on public.devices, public.visits, public.play_sessions, public.question_events,
  public.question_feedback from anon, authenticated;
grant select on public.play_sessions, public.question_events, public.question_feedback to authenticated;
grant update (dismissed) on public.question_feedback to authenticated;

drop policy if exists play_sessions_admin_read on public.play_sessions;
create policy play_sessions_admin_read on public.play_sessions for select to authenticated
  using (public.is_admin());
drop policy if exists question_events_admin_read on public.question_events;
create policy question_events_admin_read on public.question_events for select to authenticated
  using (public.is_admin());
drop policy if exists question_feedback_admin_read on public.question_feedback;
create policy question_feedback_admin_read on public.question_feedback for select to authenticated
  using (public.is_admin());
drop policy if exists question_feedback_admin_update on public.question_feedback;
create policy question_feedback_admin_update on public.question_feedback for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Hulpfuncties
-- ---------------------------------------------------------------------------

create or replace function public.nl_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Amsterdam')::date
$$;

create or replace function public.age_group(a integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when a is null then 'onbekend'
    when a <= 3 then '0-3'
    when a <= 6 then '4-6'
    when a <= 9 then '7-9'
    when a <= 12 then '10-12'
    when a <= 17 then '13-17'
    else '18+'
  end
$$;

-- Tijdstip uit de browser (milliseconden) binnen redelijke grenzen houden.
create or replace function public.clamp_ms(p_ms double precision)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when p_ms is null then null
    else least(greatest(to_timestamp(p_ms / 1000.0), now() - interval '2 days'), now() + interval '5 minutes')
  end
$$;

-- ---------------------------------------------------------------------------
-- Functies voor de server (alleen met de service-sleutel aan te roepen)
-- ---------------------------------------------------------------------------

-- Bezoek tellen: één keer per toestel per dag.
create or replace function public.record_visit(p_device uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := public.nl_today();
begin
  if p_device is null then
    return;
  end if;
  insert into public.devices (id, first_seen, last_seen) values (p_device, today, today)
  on conflict (id) do update set last_seen = excluded.last_seen
  where public.devices.last_seen <> excluded.last_seen;
  insert into public.visits (day, device_id) values (today, p_device)
  on conflict do nothing;
end;
$$;

-- Spelgegevens opslaan. Alles komt van de server-functie, die de invoer al
-- heeft gecontroleerd. Vragen en spellen moeten bij elkaar horen.
create or replace function public.log_play(
  p_game uuid,
  p_device uuid,
  p_sessions jsonb,
  p_events jsonb,
  p_feedback jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.record_visit(p_device);

  insert into public.play_sessions as ps (
    id, game_id, device_id, started_at, ended_at, end_reason, players, per_player, youngest_age,
    task_codes, category_ids, skip_players, repeats_offered, played_repeats, turns, updated_at
  )
  select s.id, p_game, p_device,
         coalesce(public.clamp_ms(s.started_at), now()),
         public.clamp_ms(s.ended_at),
         case when s.end_reason in ('done', 'out', 'stopped', 'quit') then s.end_reason end,
         least(greatest(coalesce(s.players, 0), 0), 50),
         least(greatest(coalesce(s.per_player, 0), 0), 50),
         case when s.age between 0 and 120 then s.age end,
         array(select left(x, 30) from unnest(coalesce(s.task_codes, '{}')) x limit 20),
         coalesce(array(select c.id from public.categories c
                         where c.game_id = p_game and c.id = any (coalesce(s.category_ids, '{}'))), '{}'),
         least(greatest(coalesce(s.skip_players, 0), 0), 50),
         coalesce(s.repeats_offered, false),
         coalesce(s.played_repeats, false),
         least(greatest(coalesce(s.turns, 0), 0), 5000),
         now()
  from jsonb_to_recordset(coalesce(p_sessions, '[]'::jsonb)) as s(
    id uuid, started_at double precision, ended_at double precision, end_reason text, players integer,
    per_player integer, age integer, task_codes text[], category_ids uuid[], skip_players integer,
    repeats_offered boolean, played_repeats boolean, turns integer)
  where s.id is not null
  on conflict (id) do update set
    ended_at = excluded.ended_at,
    end_reason = excluded.end_reason,
    players = excluded.players,
    per_player = excluded.per_player,
    youngest_age = excluded.youngest_age,
    task_codes = excluded.task_codes,
    category_ids = excluded.category_ids,
    skip_players = excluded.skip_players,
    repeats_offered = ps.repeats_offered or excluded.repeats_offered,
    played_repeats = ps.played_repeats or excluded.played_repeats,
    turns = greatest(ps.turns, excluded.turns),
    updated_at = now()
  where ps.game_id = excluded.game_id;

  insert into public.question_events (id, session_id, game_id, question_id, kind, task_code, youngest_age)
  select e.id, e.session_id, p_game, e.question_id, e.kind, left(coalesce(e.task_code, ''), 30),
         case when e.age between 0 and 120 then e.age end
  from jsonb_to_recordset(coalesce(p_events, '[]'::jsonb)) as e(
    id uuid, session_id uuid, question_id uuid, kind text, task_code text, age integer)
  join public.play_sessions s on s.id = e.session_id and s.game_id = p_game
  join public.questions q on q.id = e.question_id and q.game_id = p_game
  where e.id is not null and e.kind in ('guessed', 'not_guessed', 'swapped')
  on conflict (id) do nothing;

  insert into public.question_feedback (session_id, game_id, question_id, reason, moment, youngest_age)
  select f.session_id, p_game, f.question_id, f.reason, f.moment,
         case when f.age between 0 and 120 then f.age end
  from jsonb_to_recordset(coalesce(p_feedback, '[]'::jsonb)) as f(
    session_id uuid, question_id uuid, reason text, moment text, age integer)
  join public.play_sessions s on s.id = f.session_id and s.game_id = p_game
  join public.questions q on q.id = f.question_id and q.game_id = p_game
  where f.reason in ('te_moeilijk', 'leeftijd', 'niet_leuk', 'prima')
    and f.moment in ('andere_vraag', 'niet_geraden')
  on conflict (session_id, question_id) do nothing;
end;
$$;

revoke all on function public.record_visit(uuid) from public, anon, authenticated;
revoke all on function public.log_play(uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_visit(uuid) to service_role;
grant execute on function public.log_play(uuid, uuid, jsonb, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Functies voor de admin (met 2FA). Ze geven één JSON-waarde terug, zodat er
-- geen grens van 1000 rijen geldt.
-- ---------------------------------------------------------------------------

-- Per vraag: hoe vaak gespeeld, geraden, overgeslagen en gemeld, ook per leeftijdsgroep.
-- Periode in Nederlandse datums, beide dagen inbegrepen.
create or replace function public.admin_question_stats(p_game uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  with ev as (
    select e.question_id, e.kind, public.age_group(e.youngest_age) as grp
    from public.question_events e
    where e.game_id = p_game
      and (e.created_at at time zone 'Europe/Amsterdam')::date between p_from and p_to
  ),
  fb as (
    select f.question_id, f.reason, f.dismissed, public.age_group(f.youngest_age) as grp, f.created_at
    from public.question_feedback f
    where f.game_id = p_game
      and (f.created_at at time zone 'Europe/Amsterdam')::date between p_from and p_to
  ),
  per_grp as (
    select coalesce(a.question_id, b.question_id) as question_id,
           coalesce(a.grp, b.grp) as grp,
           coalesce(a.plays, 0) as plays, coalesce(a.guessed, 0) as guessed,
           coalesce(a.not_guessed, 0) as not_guessed, coalesce(a.swapped, 0) as swapped,
           coalesce(b.reports, 0) as reports
    from (
      select question_id, grp, count(*) as plays,
             count(*) filter (where kind = 'guessed') as guessed,
             count(*) filter (where kind = 'not_guessed') as not_guessed,
             count(*) filter (where kind = 'swapped') as swapped
      from ev group by question_id, grp
    ) a
    full join (
      select question_id, grp, count(*) filter (where reason <> 'prima' and not dismissed) as reports
      from fb group by question_id, grp
    ) b on a.question_id = b.question_id and a.grp = b.grp
  ),
  per_q as (
    select question_id,
           sum(plays)::int as plays, sum(guessed)::int as guessed, sum(not_guessed)::int as not_guessed,
           sum(swapped)::int as swapped,
           jsonb_object_agg(grp, jsonb_build_object(
             'plays', plays, 'guessed', guessed, 'not_guessed', not_guessed, 'swapped', swapped, 'reports', reports
           )) as by_age
    from per_grp group by question_id
  ),
  fb_q as (
    select question_id,
           count(*) filter (where not dismissed and reason <> 'prima')::int as reports,
           count(*) filter (where not dismissed and reason = 'te_moeilijk')::int as te_moeilijk,
           count(*) filter (where not dismissed and reason = 'leeftijd')::int as leeftijd,
           count(*) filter (where not dismissed and reason = 'niet_leuk')::int as niet_leuk,
           count(*) filter (where not dismissed and reason = 'prima')::int as prima,
           count(*) filter (where dismissed)::int as dismissed,
           max(created_at) filter (where not dismissed and reason <> 'prima') as last_report
    from fb group by question_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'public_id', q.public_id, 'text', q.text, 'min_age', q.min_age, 'active', q.active,
           'plays', coalesce(p.plays, 0), 'guessed', coalesce(p.guessed, 0),
           'not_guessed', coalesce(p.not_guessed, 0), 'swapped', coalesce(p.swapped, 0),
           'reports', coalesce(f.reports, 0), 'te_moeilijk', coalesce(f.te_moeilijk, 0),
           'leeftijd', coalesce(f.leeftijd, 0), 'niet_leuk', coalesce(f.niet_leuk, 0),
           'prima', coalesce(f.prima, 0), 'dismissed', coalesce(f.dismissed, 0),
           'last_report', f.last_report, 'by_age', coalesce(p.by_age, '{}'::jsonb)
         ) order by coalesce(f.reports, 0) desc, coalesce(p.plays, 0) desc), '[]'::jsonb)
    into result
  from public.questions q
  left join per_q p on p.question_id = q.id
  left join fb_q f on f.question_id = q.id
  where q.game_id = p_game and (p.question_id is not null or f.question_id is not null);

  return result;
end;
$$;

-- Overzicht voor de statistiekenpagina.
create or replace function public.admin_stats(p_game uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  with s as (
    select ps.*,
           (ps.started_at at time zone 'Europe/Amsterdam') as local_start,
           (ps.started_at at time zone 'Europe/Amsterdam')::date as day,
           case when ps.ended_at is not null and ps.ended_at > ps.started_at
                     and ps.ended_at - ps.started_at < interval '6 hours'
                then extract(epoch from ps.ended_at - ps.started_at) / 60.0 end as minutes
    from public.play_sessions ps
    where ps.game_id = p_game
      and (ps.started_at at time zone 'Europe/Amsterdam')::date between p_from and p_to
  ),
  v as (
    select vi.day, vi.device_id, d.first_seen
    from public.visits vi join public.devices d on d.id = vi.device_id
    where vi.day between p_from and p_to
  ),
  ev as (
    select e.kind from public.question_events e
    where e.game_id = p_game
      and (e.created_at at time zone 'Europe/Amsterdam')::date between p_from and p_to
  ),
  periods as (
    select 'day' as unit, d::date as period from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
    union all
    select 'week', w::date from generate_series(date_trunc('week', p_from::timestamp), p_to::timestamp, interval '1 week') w
    union all
    select 'month', m::date from generate_series(date_trunc('month', p_from::timestamp), p_to::timestamp, interval '1 month') m
  ),
  series as (
    select p.unit, p.period,
           (select count(*) from s where date_trunc(p.unit, s.day::timestamp)::date = p.period) as games,
           (select count(*) from s where date_trunc(p.unit, s.day::timestamp)::date = p.period
              and s.end_reason in ('done', 'out')) as completed,
           (select count(distinct v.device_id) from v where date_trunc(p.unit, v.day::timestamp)::date = p.period) as visitors,
           (select count(distinct v.device_id) from v where date_trunc(p.unit, v.day::timestamp)::date = p.period
              and date_trunc(p.unit, v.first_seen::timestamp)::date = p.period) as new_visitors,
           (select count(distinct s.device_id) from s where date_trunc(p.unit, s.day::timestamp)::date = p.period) as players_devices
    from periods p
  )
  select jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'games', count(*),
        'completed', count(*) filter (where end_reason in ('done', 'out')),
        'stopped', count(*) filter (where end_reason = 'stopped'),
        'quit', count(*) filter (where end_reason = 'quit'),
        'unfinished', count(*) filter (where end_reason is null),
        'avg_minutes', round(avg(minutes)::numeric, 1),
        'avg_turns', round(avg(turns) filter (where end_reason is not null)::numeric, 1),
        'avg_players', round(avg(players)::numeric, 1),
        'skip_games', count(*) filter (where skip_players > 0),
        'repeats_offered', count(*) filter (where repeats_offered),
        'played_repeats', count(*) filter (where played_repeats)
      ) from s
    ),
    'visitors', (
      select jsonb_build_object(
        'visitors', count(distinct device_id),
        'new', count(distinct device_id) filter (where first_seen between p_from and p_to),
        'returning', count(distinct device_id) filter (where first_seen < p_from)
           + coalesce((select count(*) from (
               select device_id from v where first_seen between p_from and p_to
               group by device_id having count(*) > 1) x), 0),
        'devices_playing', (select count(distinct device_id) from s)
      ) from v
    ),
    'questions', (
      select jsonb_build_object(
        'shown', count(*),
        'guessed', count(*) filter (where kind = 'guessed'),
        'not_guessed', count(*) filter (where kind = 'not_guessed'),
        'swapped', count(*) filter (where kind = 'swapped')
      ) from ev
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'unit', unit, 'period', period, 'games', games, 'completed', completed,
        'visitors', visitors, 'new_visitors', new_visitors
      ) order by unit, period), '[]'::jsonb) from series
    ),
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'games', n)), '[]'::jsonb)
      from (select extract(isodow from local_start)::int as dow, extract(hour from local_start)::int as hr,
                   count(*) as n from s group by 1, 2) h
    ),
    'ages', (
      select coalesce(jsonb_agg(jsonb_build_object('group', grp, 'games', n)), '[]'::jsonb)
      from (select public.age_group(youngest_age) as grp, count(*) as n from s group by 1) a
    ),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object('players', players, 'games', n) order by players), '[]'::jsonb)
      from (select players, count(*) as n from s group by 1) p
    ),
    'task_types', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', t.code, 'name', t.name,
        'games_on', (select count(*) from s where t.code = any (s.task_codes))
      ) order by t.sort_order), '[]'::jsonb)
      from public.task_types t where t.game_id = p_game
    ),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'is_18plus', c.is_18plus,
        'games_on', (select count(*) from s where c.id = any (s.category_ids)),
        'games_allowed', (select count(*) from s where not c.is_18plus or s.youngest_age >= 18)
      ) order by c.name), '[]'::jsonb)
      from public.categories c where c.game_id = p_game
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_question_stats(uuid, date, date) from public, anon;
revoke all on function public.admin_stats(uuid, date, date) from public, anon;
grant execute on function public.admin_question_stats(uuid, date, date) to authenticated;
grant execute on function public.admin_stats(uuid, date, date) to authenticated;
revoke all on function public.nl_today() from public, anon;
revoke all on function public.age_group(integer) from public, anon;
revoke all on function public.clamp_ms(double precision) from public, anon;
grant execute on function public.nl_today(), public.age_group(integer), public.clamp_ms(double precision)
  to authenticated, service_role;
