-- Databasetests. Elke test gooit een fout als het resultaat niet klopt.
\set ON_ERROR_STOP 1

create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'TEST MISLUKT: %', msg; end if;
  raise notice 'ok: %', msg;
end $$;

-- Seed klopt
select pg_temp.check((select count(*) from questions) = 40, 'seed: 40 vragen');
select pg_temp.check((select count(*) from questions where public_id ~ '^RS-\d{5}$') = 40, 'seed: leesbare ID''s');
select pg_temp.check(not exists (
  select 1 from questions q where not exists (select 1 from question_categories c where c.question_id = q.id)
    or not exists (select 1 from question_task_types t where t.question_id = q.id)), 'seed: elke vraag heeft categorie en soort');

-- ---------------------------------------------------------------- anoniem
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select pg_temp.check((select count(*) from games) = 1, 'anon ziet actief spel');
select pg_temp.check((select count(*) from categories) = 19, 'anon ziet categorieën');
do $$ begin
  perform 1 from questions limit 1;
  raise exception 'anon mag vragen niet lezen';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform draw_questions((select id from games limit 1), 30, '{uitbeelden}', '{}', 5, '{}');
  raise exception 'anon mag draw_questions niet aanroepen';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update games set name = 'x';
  raise exception 'anon mag spellen niet wijzigen';
exception when insufficient_privilege then null; end $$;
reset role;

-- ---------------------------------------------------------------- admin zonder 2FA
set role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","aal":"aal1","app_metadata":{"role":"admin"}}', false);
select pg_temp.check((select count(*) from questions) = 0, 'admin zonder 2FA ziet geen vragen');
update games set name = 'Gehackt';
reset role;
select pg_temp.check((select name from games where slug = 'raadspel') = 'Raadspel', 'admin zonder 2FA kan niets wijzigen');
set role authenticated;
do $$ begin
  perform admin_save_question(null, (select id from games limit 1), 'x', 0, true, '{}', '{}');
  raise exception 'save zonder 2FA had moeten falen';
exception when insufficient_privilege then null; end $$;
reset role;

-- ---------------------------------------------------------------- gewone gebruiker met 2FA (geen admin)
set role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","aal":"aal2","app_metadata":{}}', false);
select pg_temp.check((select count(*) from questions) = 0, 'niet-admin ziet geen vragen');
reset role;

-- ---------------------------------------------------------------- server (service role): draw_questions
set role service_role;
select pg_temp.check((select count(*) from draw_questions((select id from games where slug='raadspel'), 10,
  array['uitbeelden','vragen','beschrijven','tekenen'], array(select id from categories), 500, '{}')) > 0, 'kind krijgt vragen');
select pg_temp.check(not exists (select 1 from draw_questions((select id from games where slug='raadspel'), 17,
  array['uitbeelden','vragen','beschrijven','tekenen'], array(select id from categories), 500, '{}') d where d.adult or d.min_age > 17),
  'onder 18 nooit 18+, ook als de 18+-categorie is meegestuurd');
select pg_temp.check(exists (select 1 from draw_questions((select id from games where slug='raadspel'), 18,
  array['uitbeelden','beschrijven'], array(select id from categories), 500, '{}') d where d.adult), '18 jaar krijgt wel 18+');
select pg_temp.check(not exists (select 1 from draw_questions((select id from games where slug='raadspel'), 6,
  array['uitbeelden','vragen','beschrijven','tekenen'], array(select id from categories), 500, '{}') d where d.min_age > 6),
  'minimumleeftijd wordt gerespecteerd');
select pg_temp.check(not exists (select 1 from draw_questions((select id from games where slug='raadspel'), 30,
  array['vragen'], array(select id from categories), 500, '{}') d where d.task_codes <> array['vragen']),
  'alleen gekozen opdrachtsoorten');
select pg_temp.check((select count(*) from draw_questions((select id from games where slug='raadspel'), 30,
  array['uitbeelden','vragen','beschrijven','tekenen'], array(select id from categories where name = 'Sport en spel'), 500, '{}')) = 4,
  'alleen gekozen categorieën');
select pg_temp.check((select count(*) from draw_questions((select id from games where slug='raadspel'), 30,
  array['uitbeelden','vragen','beschrijven','tekenen'], array(select id from categories where name = 'Sport en spel'), 500,
  array(select id from questions where text in ('Zwemmen','Tennis')))) = 2, 'uitgesloten vragen komen niet terug');
select pg_temp.check((select count(*) from draw_questions((select id from games where slug='raadspel'), 30,
  array['uitbeelden','vragen','beschrijven','tekenen'], array(select id from categories), 3, '{}')) = 3, 'limiet werkt');
select pg_temp.check(hit_rate_limit('test', 2, 60) and hit_rate_limit('test', 2, 60) and not hit_rate_limit('test', 2, 60),
  'rate limit blokkeert na de grens');
reset role;

update questions set active = false where text = 'Zwemmen';
set role service_role;
select pg_temp.check((select count(*) from draw_questions((select id from games where slug='raadspel'), 30,
  array['uitbeelden','vragen','beschrijven','tekenen'], array(select id from categories where name = 'Sport en spel'), 500, '{}')) = 3,
  'inactieve vraag komt niet terug');
reset role;
update questions set active = true where text = 'Zwemmen';

-- ---------------------------------------------------------------- admin met 2FA
set role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', false);
select pg_temp.check((select count(*) from questions) = 40, 'admin met 2FA ziet alle vragen');

-- handmatig toevoegen
select pg_temp.check((select public_id from admin_save_question(null, (select id from games where slug='raadspel'),
  '  Regenboog ', 3, true, array(select id from categories where name='In huis'), array(select id from task_types where code='tekenen')))
  ~ '^RS-\d{5}$', 'handmatige vraag krijgt ID');
select pg_temp.check((select text from questions where text = 'Regenboog') = 'Regenboog', 'spaties worden weggehaald');
select pg_temp.check((select min_age from admin_save_question(null, (select id from games where slug='raadspel'),
  'Feestje', 0, true, array(select id from categories where name='Pikant 18+'), array(select id from task_types where code='uitbeelden'))) = 18,
  '18+-categorie zet minimumleeftijd op 18');
do $$ begin
  perform admin_save_question(null, (select id from games where slug='raadspel'), 'Zonder categorie', 0, true, '{}',
    array(select id from task_types where code='tekenen'));
  raise exception 'vraag zonder categorie had moeten falen';
exception when raise_exception then
  if sqlerrm not like '%categorie%' then raise; end if;
end $$;

-- upload
select pg_temp.check((r ->> 'created')::int = 2 and (r ->> 'updated')::int = 1 and (r ->> 'failed')::int = 5,
  'upload: 2 nieuw, 1 bijgewerkt, 5 fout')
from (select admin_import_questions((select id from games where slug='raadspel'), jsonb_build_array(
  jsonb_build_object('row', 2, 'id', null, 'text', 'Draak', 'categories', jsonb_build_array('Dieren', 'Fantasie'),
    'task_types', jsonb_build_array('Uitbeelden', 'tekenen'), 'min_age', '5'),
  jsonb_build_object('row', 3, 'id', '', 'text', 'Wolk', 'categories', jsonb_build_array('in huis'),
    'task_types', jsonb_build_array('TEKENEN'), 'min_age', '3'),
  jsonb_build_object('row', 4, 'id', (select public_id from questions where text = 'Olifant'), 'text', 'Olifant met slurf',
    'categories', jsonb_build_array('Dieren'), 'task_types', jsonb_build_array('uitbeelden'), 'min_age', '4'),
  jsonb_build_object('row', 5, 'id', null, 'text', 'olifant met SLURF', 'categories', jsonb_build_array('Dieren'),
    'task_types', jsonb_build_array('uitbeelden'), 'min_age', '4'),
  jsonb_build_object('row', 6, 'id', null, 'text', 'Zingen', 'categories', jsonb_build_array('Dieren'),
    'task_types', jsonb_build_array('zingen'), 'min_age', '4'),
  jsonb_build_object('row', 7, 'id', null, 'text', 'Leeftijd fout', 'categories', jsonb_build_array('Dieren'),
    'task_types', jsonb_build_array('tekenen'), 'min_age', 'zes'),
  jsonb_build_object('row', 8, 'id', 'RS-99999', 'text', 'Bestaat niet', 'categories', jsonb_build_array('Dieren'),
    'task_types', jsonb_build_array('tekenen'), 'min_age', '4'),
  jsonb_build_object('row', 9, 'id', null, 'text', '', 'categories', jsonb_build_array('Dieren'),
    'task_types', jsonb_build_array('tekenen'), 'min_age', '4')
), true, 'test.xlsx') as r) s;
select pg_temp.check(exists (select 1 from categories where name = 'Fantasie' and not is_18plus), 'upload maakt nieuwe categorie aan');
select pg_temp.check((r ->> 'created')::int = 1, 'upload met nieuwe 18+-categorie') from (select admin_import_questions((select id from games where slug='raadspel'), jsonb_build_array(
  jsonb_build_object('row', 2, 'text', 'Romantisch dineetje', 'categories', jsonb_build_array('Uitgaan 18+'),
    'task_types', jsonb_build_array('uitbeelden'), 'min_age', '16')), true, 'y.csv') as r) s;
select pg_temp.check((select is_18plus from categories where name = 'Uitgaan 18+'), 'nieuwe categorie met 18+ in de naam is 18+');
select pg_temp.check((select min_age from questions where text = 'Romantisch dineetje') = 18, 'vraag in 18+-categorie krijgt minimaal 18');
select pg_temp.check((select count(*) from question_task_types qt join questions q on q.id = qt.question_id where q.text = 'Olifant met slurf') = 1,
  'bijgewerkte vraag krijgt nieuwe soorten');
select pg_temp.check((select rows_failed from uploads where filename = 'test.xlsx') = 5, 'upload gelogd');
select pg_temp.check((r -> 'errors' -> 0 ->> 'message') like 'Onbekende categorie%', 'zonder aanmaken: onbekende categorie is fout')
from (select admin_import_questions((select id from games where slug='raadspel'), jsonb_build_array(
  jsonb_build_object('row', 2, 'text', 'Eenhoorn', 'categories', jsonb_build_array('Sprookjes'),
    'task_types', jsonb_build_array('tekenen'), 'min_age', '4')), false, 'x.csv') as r) s;

-- aan/uit en bewerken
update questions set active = false where text = 'Wolk';
select pg_temp.check((select not active from questions where text = 'Wolk'), 'admin kan de-activeren');
update games set rules = 'Nieuwe regels', minutes_per_question = 1.5 where slug = 'raadspel';
select pg_temp.check((select minutes_per_question from games where slug = 'raadspel') = 1.5, 'admin kan spel bewerken');
reset role;


-- ---------------------------------------------------------------- feedback en statistieken
-- anoniem en gewone gebruikers kunnen er niet bij
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$ begin
  perform 1 from question_feedback limit 1;
  raise exception 'anon mag feedback niet lezen';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform log_play((select id from games limit 1), gen_random_uuid(), '[]', '[]', '[]');
  raise exception 'anon mag log_play niet aanroepen';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform record_visit(gen_random_uuid());
  raise exception 'anon mag record_visit niet aanroepen';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into question_feedback (session_id, game_id, question_id, reason, moment) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'prima', 'niet_geraden');
  raise exception 'anon mag geen feedback schrijven';
exception when insufficient_privilege then null; end $$;
reset role;

set role service_role;
select record_visit('11111111-1111-4111-8111-111111111111');
select record_visit('11111111-1111-4111-8111-111111111111');
select log_play(
  (select id from games where slug = 'raadspel'),
  '22222222-2222-4222-8222-222222222222',
  jsonb_build_array(jsonb_build_object(
    'id', 'aaaaaaaa-0000-4000-8000-000000000001', 'started_at', extract(epoch from now() - interval '20 minutes') * 1000,
    'players', 3, 'per_player', 2, 'age', 8, 'task_codes', jsonb_build_array('uitbeelden', 'tekenen'),
    'category_ids', (select jsonb_agg(id) from categories where not is_18plus), 'skip_players', 1,
    'repeats_offered', true, 'played_repeats', true, 'turns', 0)),
  jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'session_id', 'aaaaaaaa-0000-4000-8000-000000000001',
      'question_id', (select id from questions where text = 'Olifant met slurf'), 'kind', 'swapped', 'task_code', 'tekenen', 'age', 8),
    jsonb_build_object('id', 'eeeeeeee-0000-4000-8000-000000000001', 'session_id', 'aaaaaaaa-0000-4000-8000-000000000001',
      'question_id', (select id from questions where text = 'Zwemmen'), 'kind', 'not_guessed', 'task_code', 'uitbeelden', 'age', 8),
    jsonb_build_object('id', gen_random_uuid(), 'session_id', 'aaaaaaaa-0000-4000-8000-000000000001',
      'question_id', (select id from questions where text = 'Tennis'), 'kind', 'guessed', 'task_code', 'uitbeelden', 'age', 8),
    jsonb_build_object('id', gen_random_uuid(), 'session_id', 'aaaaaaaa-0000-4000-8000-000000000001',
      'question_id', gen_random_uuid(), 'kind', 'guessed', 'task_code', 'uitbeelden', 'age', 8),
    jsonb_build_object('id', gen_random_uuid(), 'session_id', 'aaaaaaaa-0000-4000-8000-000000000001',
      'question_id', (select id from questions where text = 'Tennis'), 'kind', 'gehackt', 'task_code', 'uitbeelden', 'age', 8)
  ),
  jsonb_build_array(
    jsonb_build_object('session_id', 'aaaaaaaa-0000-4000-8000-000000000001',
      'question_id', (select id from questions where text = 'Olifant met slurf'), 'reason', 'te_moeilijk', 'moment', 'andere_vraag', 'age', 8),
    jsonb_build_object('session_id', 'aaaaaaaa-0000-4000-8000-000000000001',
      'question_id', (select id from questions where text = 'Olifant met slurf'), 'reason', 'niet_leuk', 'moment', 'andere_vraag', 'age', 8),
    jsonb_build_object('session_id', 'aaaaaaaa-0000-4000-8000-000000000001',
      'question_id', (select id from questions where text = 'Zwemmen'), 'reason', 'prima', 'moment', 'niet_geraden', 'age', 8),
    jsonb_build_object('session_id', 'aaaaaaaa-0000-4000-8000-000000000001',
      'question_id', (select id from questions where text = 'Tennis'), 'reason', 'onzin', 'moment', 'niet_geraden', 'age', 8)
  )
);
-- zelfde gebeurtenis nog een keer (bijvoorbeeld opnieuw verstuurd) en spel afgerond
select log_play(
  (select id from games where slug = 'raadspel'),
  '22222222-2222-4222-8222-222222222222',
  jsonb_build_array(jsonb_build_object(
    'id', 'aaaaaaaa-0000-4000-8000-000000000001', 'started_at', extract(epoch from now() - interval '20 minutes') * 1000,
    'ended_at', extract(epoch from now()) * 1000, 'end_reason', 'done',
    'players', 3, 'per_player', 2, 'age', 8, 'task_codes', jsonb_build_array('uitbeelden', 'tekenen'),
    'category_ids', jsonb_build_array(gen_random_uuid()), 'skip_players', 1, 'turns', 6)),
  jsonb_build_array(
    jsonb_build_object('id', 'eeeeeeee-0000-4000-8000-000000000001', 'session_id', 'aaaaaaaa-0000-4000-8000-000000000001',
      'question_id', (select id from questions where text = 'Zwemmen'), 'kind', 'not_guessed', 'task_code', 'uitbeelden', 'age', 8)),
  '[]'
);
reset role;
select pg_temp.check((select count(*) from visits) = 2 and (select count(*) from devices) = 2, 'bezoek telt één keer per toestel per dag');
select pg_temp.check((select count(*) from question_events) = 3, 'alleen geldige gebeurtenissen, geen dubbele');
select pg_temp.check((select count(*) from question_feedback) = 2, 'feedback één keer per vraag per spel, onzin geweigerd');
select pg_temp.check((select end_reason = 'done' and turns = 6 and played_repeats and category_ids = '{}' from play_sessions),
  'spel bijgewerkt; onbekende categorie genegeerd; Toch spelen onthouden');

-- admin zonder 2FA ziet niets
set role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","aal":"aal1","app_metadata":{"role":"admin"}}', false);
select pg_temp.check((select count(*) from question_feedback) = 0, 'admin zonder 2FA ziet geen feedback');
do $$ begin
  perform admin_stats((select id from games limit 1), current_date - 30, current_date);
  raise exception 'statistieken zonder 2FA had moeten falen';
exception when insufficient_privilege then null; end $$;

-- admin met 2FA
select set_config('request.jwt.claims', '{"role":"authenticated","aal":"aal2","app_metadata":{"role":"admin"}}', false);
select pg_temp.check(jsonb_array_length(r) = 3, 'vraagstatistiek: 3 vragen') from (
  select admin_question_stats((select id from games where slug = 'raadspel'), nl_today() - 30, nl_today()) r) x;
select pg_temp.check((r -> 0 ->> 'text') = 'Olifant met slurf' and (r -> 0 ->> 'reports')::int = 1
  and (r -> 0 ->> 'te_moeilijk')::int = 1 and (r -> 0 -> 'by_age' -> '7-9' ->> 'swapped')::int = 1,
  'meest gemelde vraag bovenaan, met leeftijdsgroep') from (
  select admin_question_stats((select id from games where slug = 'raadspel'), nl_today() - 30, nl_today()) r) x;
select pg_temp.check((r -> 'summary' ->> 'games')::int = 1 and (r -> 'summary' ->> 'completed')::int = 1
  and (r -> 'summary' ->> 'avg_minutes')::numeric between 19 and 21 and (r -> 'visitors' ->> 'visitors')::int = 2
  and (r -> 'visitors' ->> 'new')::int = 2 and (r -> 'questions' ->> 'swapped')::int = 1
  and (select count(*) from jsonb_array_elements(r -> 'series') e where e ->> 'unit' = 'day') = 31
  and (r -> 'ages' -> 0 ->> 'group') = '7-9', 'statistieken kloppen')
from (select admin_stats((select id from games where slug = 'raadspel'), nl_today() - 30, nl_today()) r) x;
update question_feedback set dismissed = true where question_id = (select id from questions where text = 'Olifant met slurf');
select pg_temp.check((r -> 0 ->> 'reports')::int = 0, 'negeren haalt meldingen weg') from (
  select admin_question_stats((select id from games where slug = 'raadspel'), nl_today() - 30, nl_today()) r) x;
do $$ begin
  update question_feedback set reason = 'prima';
  raise exception 'admin mag alleen negeren, niet de reden aanpassen';
exception when insufficient_privilege then null; end $$;
reset role;

\echo 'Alle databasetests geslaagd'
