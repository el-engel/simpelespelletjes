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

\echo 'Alle databasetests geslaagd'
