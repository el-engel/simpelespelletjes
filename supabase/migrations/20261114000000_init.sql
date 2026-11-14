-- Simplegames: databaseschema, toegangsregels en functies.
-- Uitvoeren in de SQL Editor van je eigen Supabase-project (zie SETUP.md).
-- Alles in dit bestand mag meerdere keren worden uitgevoerd op een lege database.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Hulpfuncties
-- ---------------------------------------------------------------------------

-- Admin = ingelogd, rol "admin" in app_metadata (alleen te zetten met de
-- service-sleutel of via SQL) en ingelogd met 2FA (aal2).
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 300),
  rules text not null default '' check (char_length(rules) <= 10000),
  id_prefix text not null default 'V' check (id_prefix ~ '^[A-Z]{1,5}$'),
  minutes_per_question numeric(4,1) not null default 1 check (minutes_per_question > 0 and minutes_per_question <= 60),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  is_18plus boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists categories_game_name_key on public.categories (game_id, lower(name));

create table if not exists public.task_types (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9-]{2,30}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, code)
);
create unique index if not exists task_types_game_name_key on public.task_types (game_id, lower(name));

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  filename text not null default '',
  rows_total integer not null default 0,
  rows_created integer not null default 0,
  rows_updated integer not null default 0,
  rows_failed integer not null default 0,
  report jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create sequence if not exists public.question_number_seq;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  game_id uuid not null references public.games (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 500),
  min_age integer not null default 0 check (min_age between 0 and 99),
  active boolean not null default true,
  upload_id uuid references public.uploads (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists questions_game_idx on public.questions (game_id, active, min_age);

create table if not exists public.question_categories (
  question_id uuid not null references public.questions (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (question_id, category_id)
);
create index if not exists question_categories_cat_idx on public.question_categories (category_id);

create table if not exists public.question_task_types (
  question_id uuid not null references public.questions (id) on delete cascade,
  task_type_id uuid not null references public.task_types (id) on delete cascade,
  primary key (question_id, task_type_id)
);
create index if not exists question_task_types_tt_idx on public.question_task_types (task_type_id);

-- Teller voor botbescherming (aantal verzoeken per IP per tijdvak).
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Leesbare vraag-ID, bijvoorbeeld RS-00012, als die niet is meegegeven.
create or replace function public.set_question_public_id()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  prefix text;
begin
  if new.public_id is null or btrim(new.public_id) = '' then
    select g.id_prefix into prefix from public.games g where g.id = new.game_id;
    new.public_id := coalesce(prefix, 'V') || '-' || lpad(nextval('public.question_number_seq')::text, 5, '0');
  end if;
  new.text := btrim(new.text);
  return new;
end;
$$;

drop trigger if exists questions_public_id on public.questions;
create trigger questions_public_id before insert on public.questions
  for each row execute function public.set_question_public_id();

drop trigger if exists games_touch on public.games;
create trigger games_touch before update on public.games for each row execute function public.touch_updated_at();
drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before update on public.categories for each row execute function public.touch_updated_at();
drop trigger if exists task_types_touch on public.task_types;
create trigger task_types_touch before update on public.task_types for each row execute function public.touch_updated_at();
drop trigger if exists questions_touch on public.questions;
create trigger questions_touch before update on public.questions for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Toegangsregels (Row Level Security)
-- Bezoekers: alleen actieve spellen, categorieën en opdrachtsoorten lezen.
-- Vragen lezen bezoekers nooit rechtstreeks, alleen via draw_questions()
-- vanuit de server-functie. Admin (met 2FA): alles.
-- ---------------------------------------------------------------------------

alter table public.games enable row level security;
alter table public.categories enable row level security;
alter table public.task_types enable row level security;
alter table public.uploads enable row level security;
alter table public.questions enable row level security;
alter table public.question_categories enable row level security;
alter table public.question_task_types enable row level security;
alter table public.rate_limits enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.games, public.categories, public.task_types to anon, authenticated;
grant insert, update, delete on public.games, public.categories, public.task_types to authenticated;
grant select, insert, update, delete on public.questions, public.question_categories,
  public.question_task_types, public.uploads to authenticated;
grant usage on sequence public.question_number_seq to authenticated;

drop policy if exists games_public_read on public.games;
create policy games_public_read on public.games for select to anon, authenticated
  using (active or public.is_admin());
drop policy if exists games_admin_write on public.games;
create policy games_admin_write on public.games for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories for select to anon, authenticated
  using (active or public.is_admin());
drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists task_types_public_read on public.task_types;
create policy task_types_public_read on public.task_types for select to anon, authenticated
  using (active or public.is_admin());
drop policy if exists task_types_admin_write on public.task_types;
create policy task_types_admin_write on public.task_types for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists questions_admin on public.questions;
create policy questions_admin on public.questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists question_categories_admin on public.question_categories;
create policy question_categories_admin on public.question_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists question_task_types_admin on public.question_task_types;
create policy question_task_types_admin on public.question_task_types for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists uploads_admin on public.uploads;
create policy uploads_admin on public.uploads for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- rate_limits: geen policies, dus alleen de server (service role) kan erbij.

-- ---------------------------------------------------------------------------
-- Functies voor spelers (alleen aan te roepen door de server-functie)
-- ---------------------------------------------------------------------------

-- Geeft willekeurige passende vragen. Onder 18 nooit iets met een
-- 18+-categorie of een minimumleeftijd van 18 of hoger.
create or replace function public.draw_questions(
  p_game uuid,
  p_age integer,
  p_task_codes text[],
  p_category_ids uuid[],
  p_limit integer,
  p_exclude uuid[] default '{}'
)
returns table (id uuid, text text, min_age integer, task_codes text[], adult boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id,
         q.text,
         q.min_age,
         array(
           select tt.code
           from public.question_task_types qtt
           join public.task_types tt on tt.id = qtt.task_type_id
           where qtt.question_id = q.id and tt.active and tt.code = any (p_task_codes)
           order by tt.sort_order
         ) as task_codes,
         exists (
           select 1 from public.question_categories qc
           join public.categories c on c.id = qc.category_id
           where qc.question_id = q.id and c.is_18plus
         ) or q.min_age >= 18 as adult
  from public.questions q
  join public.games g on g.id = q.game_id and g.active
  where q.game_id = p_game
    and q.active
    and q.min_age <= greatest(p_age, 0)
    and not (q.id = any (coalesce(p_exclude, '{}')))
    and exists (
      select 1 from public.question_task_types qtt
      join public.task_types tt on tt.id = qtt.task_type_id
      where qtt.question_id = q.id and tt.active and tt.code = any (p_task_codes)
    )
    and exists (
      select 1 from public.question_categories qc
      join public.categories c on c.id = qc.category_id
      where qc.question_id = q.id and c.active and c.id = any (p_category_ids)
        and (p_age >= 18 or not c.is_18plus)
    )
    and (
      p_age >= 18
      or (
        q.min_age < 18
        and not exists (
          select 1 from public.question_categories qc
          join public.categories c on c.id = qc.category_id
          where qc.question_id = q.id and c.is_18plus
        )
      )
    )
  order by random()
  limit least(greatest(coalesce(p_limit, 0), 0), 500)
$$;

-- Telt een verzoek mee en geeft true zolang de grens niet is bereikt.
create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limits (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into n;
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return n <= p_limit;
end;
$$;

revoke all on function public.draw_questions(uuid, integer, text[], uuid[], integer, uuid[]) from public, anon, authenticated;
revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.draw_questions(uuid, integer, text[], uuid[], integer, uuid[]) to service_role;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Functies voor de admin (draaien met de rechten van de admin zelf, dus RLS
-- blijft gelden; daarnaast een expliciete controle op is_admin()).
-- ---------------------------------------------------------------------------

-- Eén vraag opslaan (nieuw of bijwerken) inclusief categorieën en soorten.
create or replace function public.admin_save_question(
  p_id uuid,
  p_game uuid,
  p_text text,
  p_min_age integer,
  p_active boolean,
  p_category_ids uuid[],
  p_task_type_ids uuid[]
)
returns public.questions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  q public.questions;
  age integer := coalesce(p_min_age, 0);
begin
  if not public.is_admin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  if p_text is null or btrim(p_text) = '' then
    raise exception 'Vul een vraag in';
  end if;
  if coalesce(array_length(p_category_ids, 1), 0) = 0 then
    raise exception 'Kies minstens één categorie';
  end if;
  if coalesce(array_length(p_task_type_ids, 1), 0) = 0 then
    raise exception 'Kies minstens één soort opdracht';
  end if;
  if exists (select 1 from unnest(p_category_ids) cid
             where not exists (select 1 from public.categories c where c.id = cid and c.game_id = p_game)) then
    raise exception 'Onbekende categorie voor dit spel';
  end if;
  if exists (select 1 from unnest(p_task_type_ids) tid
             where not exists (select 1 from public.task_types t where t.id = tid and t.game_id = p_game)) then
    raise exception 'Onbekende soort opdracht voor dit spel';
  end if;
  if exists (select 1 from public.categories c where c.id = any (p_category_ids) and c.is_18plus) then
    age := greatest(age, 18);
  end if;

  if p_id is null then
    insert into public.questions (game_id, public_id, text, min_age, active)
    values (p_game, null, p_text, age, coalesce(p_active, true))
    returning * into q;
  else
    update public.questions
       set text = btrim(p_text), min_age = age, active = coalesce(p_active, active)
     where id = p_id and game_id = p_game
    returning * into q;
    if q.id is null then
      raise exception 'Vraag niet gevonden';
    end if;
    delete from public.question_categories where question_id = q.id;
    delete from public.question_task_types where question_id = q.id;
  end if;

  insert into public.question_categories (question_id, category_id)
    select q.id, cid from (select distinct unnest(p_category_ids) as cid) s;
  insert into public.question_task_types (question_id, task_type_id)
    select q.id, tid from (select distinct unnest(p_task_type_ids) as tid) s;
  return q;
end;
$$;

-- Upload verwerken. Een nieuwe categorie met "18+" in de naam wordt automatisch
-- een 18+-categorie. p_rows is een lijst van
-- {"row": 2, "id": "RS-00012" of null, "text": "...", "categories": ["..."],
--  "task_types": ["..."], "min_age": 6}
-- Goede rijen worden opgeslagen, foute rijen komen in het rapport.
create or replace function public.admin_import_questions(
  p_game uuid,
  p_rows jsonb,
  p_create_categories boolean default false,
  p_filename text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r jsonb;
  rownum integer;
  v_public_id text;
  v_text text;
  v_age integer;
  v_age_raw text;
  v_cat_names text[];
  v_tt_names text[];
  v_cat_ids uuid[];
  v_tt_ids uuid[];
  v_existing public.questions;
  v_name text;
  v_id uuid;
  v_upload uuid;
  v_created integer := 0;
  v_updated integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_err text;
  v_adult boolean;
  v_q public.questions;
begin
  if not public.is_admin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  if not exists (select 1 from public.games where id = p_game) then
    raise exception 'Spel niet gevonden';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Ongeldige invoer';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Maximaal 5000 rijen per upload';
  end if;

  insert into public.uploads (game_id, filename, rows_total)
  values (p_game, left(coalesce(p_filename, ''), 200), jsonb_array_length(p_rows))
  returning id into v_upload;

  for r in select * from jsonb_array_elements(p_rows) loop
    rownum := coalesce((r ->> 'row')::integer, 0);
    v_err := null;
    v_public_id := nullif(btrim(coalesce(r ->> 'id', '')), '');
    v_text := btrim(coalesce(r ->> 'text', ''));
    v_age_raw := btrim(coalesce(r ->> 'min_age', ''));
    v_cat_names := array(
      select distinct btrim(x) from jsonb_array_elements_text(coalesce(r -> 'categories', '[]'::jsonb)) x
      where btrim(x) <> '');
    v_tt_names := array(
      select distinct lower(btrim(x)) from jsonb_array_elements_text(coalesce(r -> 'task_types', '[]'::jsonb)) x
      where btrim(x) <> '');
    v_cat_ids := '{}';
    v_tt_ids := '{}';
    v_existing := null;

    if v_text = '' then
      v_err := 'Vraag is leeg';
    elsif char_length(v_text) > 500 then
      v_err := 'Vraag is langer dan 500 tekens';
    elsif v_age_raw !~ '^\d{1,2}$' then
      v_err := 'Minimum leeftijd moet een getal van 0 tot 99 zijn';
    elsif coalesce(array_length(v_cat_names, 1), 0) = 0 then
      v_err := 'Geen categorie ingevuld';
    elsif coalesce(array_length(v_tt_names, 1), 0) = 0 then
      v_err := 'Geen soort opdracht ingevuld';
    end if;

    if v_err is null then
      v_age := v_age_raw::integer;
      -- soorten opdracht: op naam of code
      foreach v_name in array v_tt_names loop
        select t.id into v_id from public.task_types t
         where t.game_id = p_game and (lower(t.name) = v_name or t.code = v_name);
        if v_id is null then
          v_err := 'Onbekende soort opdracht: ' || v_name;
          exit;
        end if;
        v_tt_ids := v_tt_ids || v_id;
        v_id := null;
      end loop;
    end if;

    if v_err is null then
      foreach v_name in array v_cat_names loop
        select c.id into v_id from public.categories c
         where c.game_id = p_game and lower(c.name) = lower(v_name);
        if v_id is null then
          if p_create_categories and char_length(v_name) <= 60 then
            insert into public.categories (game_id, name, is_18plus)
            values (p_game, v_name, v_name ~ '18\s*\+' or lower(v_name) = 'volwassenen')
            returning id into v_id;
          else
            v_err := 'Onbekende categorie: ' || v_name;
            exit;
          end if;
        end if;
        v_cat_ids := v_cat_ids || v_id;
        v_id := null;
      end loop;
    end if;

    if v_err is null and v_public_id is not null then
      select * into v_existing from public.questions q where q.public_id = v_public_id;
      if v_existing.id is null then
        v_err := 'ID ' || v_public_id || ' bestaat niet; laat de ID leeg voor een nieuwe vraag';
      elsif v_existing.game_id <> p_game then
        v_err := 'ID ' || v_public_id || ' hoort bij een ander spel';
      end if;
    end if;

    if v_err is null and v_public_id is null then
      if exists (select 1 from public.questions q
                 where q.game_id = p_game and lower(q.text) = lower(v_text)) then
        v_err := 'Deze vraag bestaat al';
      end if;
    end if;

    if v_err is not null then
      v_errors := v_errors || jsonb_build_object('row', rownum, 'message', v_err);
      continue;
    end if;

    select exists (select 1 from public.categories c where c.id = any (v_cat_ids) and c.is_18plus)
      into v_adult;
    if v_adult then
      v_age := greatest(v_age, 18);
    end if;

    if v_existing.id is null then
      insert into public.questions (game_id, public_id, text, min_age, upload_id)
      values (p_game, null, v_text, v_age, v_upload)
      returning * into v_q;
      v_created := v_created + 1;
    else
      update public.questions set text = v_text, min_age = v_age
       where id = v_existing.id
      returning * into v_q;
      delete from public.question_categories where question_id = v_q.id;
      delete from public.question_task_types where question_id = v_q.id;
      v_updated := v_updated + 1;
    end if;
    insert into public.question_categories (question_id, category_id)
      select v_q.id, cid from (select distinct unnest(v_cat_ids) as cid) s;
    insert into public.question_task_types (question_id, task_type_id)
      select v_q.id, tid from (select distinct unnest(v_tt_ids) as tid) s;
  end loop;

  update public.uploads
     set rows_created = v_created,
         rows_updated = v_updated,
         rows_failed = jsonb_array_length(v_errors),
         report = v_errors
   where id = v_upload;

  return jsonb_build_object(
    'upload_id', v_upload,
    'created', v_created,
    'updated', v_updated,
    'failed', jsonb_array_length(v_errors),
    'errors', v_errors
  );
end;
$$;

revoke all on function public.admin_save_question(uuid, uuid, text, integer, boolean, uuid[], uuid[]) from public, anon;
revoke all on function public.admin_import_questions(uuid, jsonb, boolean, text) from public, anon;
grant execute on function public.admin_save_question(uuid, uuid, text, integer, boolean, uuid[], uuid[]) to authenticated;
grant execute on function public.admin_import_questions(uuid, jsonb, boolean, text) to authenticated;
grant execute on function public.is_admin() to anon, authenticated, service_role;
