-- Startgegevens: het raadspel met opdrachtsoorten, categorieën en voorbeeldvragen.
-- Uitvoeren na de migratie. Draai je het nog eens, dan wordt niets dubbel aangemaakt.

insert into public.games (slug, name, description, rules, id_prefix, minutes_per_question, sort_order)
values (
  'raadspel',
  'Raadspel',
  'Uitbeelden, tekenen, beschrijven of raden met ja/nee-vragen. Wie raadt het eerst?',
  E'## Zo speel je het raadspel\n\n'
  'Jullie spelen samen op één telefoon of tablet die rondgaat.\n\n'
  '1. De app zegt wie er aan de beurt is. Die speler pakt de telefoon.\n'
  '2. Tik op **Laat soort opdracht zien**. Je ziet of je moet **uitbeelden**, **tekenen**, **beschrijven** of **raden (ja of nee)**. Die mag je aan de groep laten zien.\n'
  '3. Tik op **Laat vraag zien**. Laat dit scherm aan niemand zien en leg de telefoon omgekeerd neer.\n'
  '4. Voer de opdracht uit. De anderen raden.\n'
  '5. Heeft iemand het goed? Tik op **Klaar!** en kies wie het geraden heeft. Die speler krijgt een punt.\n\n'
  '### Regels bij de opdrachten\n\n'
  '- **Uitbeelden:** niet praten en geen geluiden maken.\n'
  '- **Tekenen:** geen letters of cijfers tekenen.\n'
  '- **Beschrijven:** het woord zelf niet noemen.\n'
  '- **Raden (ja of nee):** de anderen stellen om de beurt een vraag die je alleen met ja of nee beantwoordt ("Ben je een dier?" "Ja."), net zo lang tot iemand het woord raadt.\n\n'
  'Wie aan het eind de meeste punten heeft, wint!',
  'RS',
  1,
  10
)
on conflict (slug) do nothing;

insert into public.task_types (game_id, code, name, sort_order)
select g.id, t.code, t.name, t.sort_order
from public.games g,
  (values ('uitbeelden', 'Uitbeelden', 1),
          ('vragen', 'Raden (ja of nee)', 2),
          ('beschrijven', 'Beschrijven', 3),
          ('tekenen', 'Tekenen', 4)) as t(code, name, sort_order)
where g.slug = 'raadspel'
on conflict (game_id, code) do nothing;

insert into public.categories (game_id, name, is_18plus)
select g.id, c.name, c.adult
from public.games g,
  (values ('Dieren', false), ('Eten en drinken', false), ('Beroepen', false), ('Sport en spel', false),
          ('Voertuigen', false), ('In huis', false), ('Natuur en weer', false), ('Lichaam en gezondheid', false),
          ('Feestdagen en tradities', false), ('Nederland', false), ('Films, series en tv', false), ('Muziek', false),
          ('Sprookjes en fantasie', false), ('Bekende figuren', false), ('Algemene kennis', false), ('Doe-woorden', false),
          ('Volwassen leven 18+', true), ('Uitgaan en feesten 18+', true), ('Pikant 18+', true)) as c(name, adult)
where g.slug = 'raadspel'
  and not exists (select 1 from public.categories x where x.game_id = g.id and lower(x.name) = lower(c.name));

-- Voorbeeldvragen: tekst | categorieën | soorten | minimumleeftijd
with data(text, cats, types, age) as (
  values
    ('Olifant', '{Dieren}', '{uitbeelden,tekenen,beschrijven}', 4),
    ('Kikker', '{Dieren}', '{uitbeelden,tekenen}', 4),
    ('Pinguïn', '{Dieren}', '{uitbeelden,tekenen,beschrijven}', 4),
    ('Giraf', '{Dieren}', '{tekenen,beschrijven}', 4),
    ('Slak', '{Dieren}', '{uitbeelden,tekenen}', 4),
    ('Kangoeroe', '{Dieren}', '{uitbeelden,beschrijven}', 5),
    ('Octopus', '{Dieren}', '{tekenen,beschrijven}', 6),
    ('Pindarotsje', '{"Eten en drinken"}', '{uitbeelden,tekenen}', 6),
    ('Pannenkoek', '{"Eten en drinken"}', '{uitbeelden,tekenen,beschrijven}', 4),
    ('Spaghetti', '{"Eten en drinken"}', '{uitbeelden,tekenen,beschrijven}', 5),
    ('IJsje', '{"Eten en drinken"}', '{uitbeelden,tekenen}', 4),
    ('Hagelslag', '{"Eten en drinken"}', '{beschrijven,tekenen}', 5),
    ('Brandweerman', '{Beroepen}', '{uitbeelden,beschrijven}', 4),
    ('Kapper', '{Beroepen}', '{uitbeelden,beschrijven}', 5),
    ('Tandarts', '{Beroepen}', '{uitbeelden,beschrijven}', 5),
    ('Piloot', '{Beroepen}', '{uitbeelden,tekenen,beschrijven}', 5),
    ('Voetballen', '{"Sport en spel"}', '{uitbeelden,beschrijven}', 4),
    ('Zwemmen', '{"Sport en spel"}', '{uitbeelden}', 4),
    ('Schaatsen', '{"Sport en spel"}', '{uitbeelden,tekenen}', 5),
    ('Tennis', '{"Sport en spel"}', '{uitbeelden,beschrijven}', 6),
    ('Fiets', '{Voertuigen}', '{uitbeelden,tekenen}', 4),
    ('Helikopter', '{Voertuigen}', '{uitbeelden,tekenen,beschrijven}', 4),
    ('Brandweerauto', '{Voertuigen}', '{uitbeelden,tekenen,beschrijven}', 4),
    ('Onderzeeër', '{Voertuigen}', '{tekenen,beschrijven}', 7),
    ('Stofzuiger', '{"In huis"}', '{uitbeelden,tekenen}', 4),
    ('Wasmachine', '{"In huis"}', '{uitbeelden,beschrijven}', 6),
    ('Paraplu', '{"In huis"}', '{uitbeelden,tekenen}', 4),
    ('Tandenborstel', '{"In huis"}', '{uitbeelden,tekenen}', 4),
    ('Sneeuwwitje', '{"Films, series en tv"}', '{uitbeelden,beschrijven}', 6),
    ('Superheld', '{"Films, series en tv"}', '{uitbeelden,tekenen}', 6),
    ('Robot', '{"Algemene kennis"}', '{vragen,uitbeelden,tekenen}', 8),
    ('Spin', '{"Algemene kennis",Dieren}', '{vragen,tekenen}', 6),
    ('Eiffeltoren', '{"Algemene kennis"}', '{vragen,tekenen,beschrijven}', 9),
    ('Zeilboot', '{"Algemene kennis"}', '{vragen,tekenen}', 5),
    ('Klok', '{"Algemene kennis"}', '{vragen,tekenen,beschrijven}', 7),
    ('Koe', '{"Algemene kennis",Dieren}', '{vragen,uitbeelden,tekenen}', 5),
    ('Banaan', '{"Algemene kennis","Eten en drinken"}', '{vragen,tekenen,beschrijven}', 5),
    ('Vulkaan', '{"Algemene kennis"}', '{vragen,tekenen,beschrijven}', 8),
    ('Vrijgezellenfeest', '{"Uitgaan en feesten 18+"}', '{uitbeelden,beschrijven}', 18),
    ('Kater na het stappen', '{"Uitgaan en feesten 18+"}', '{uitbeelden,beschrijven}', 18)
),
g as (select id from public.games where slug = 'raadspel'),
ins as (
  insert into public.questions (game_id, public_id, text, min_age)
  select g.id, null, d.text, d.age from data d, g
  where not exists (select 1 from public.questions q where q.game_id = g.id and lower(q.text) = lower(d.text))
  returning id, text
)
select count(*) from ins;

insert into public.question_categories (question_id, category_id)
select q.id, c.id
from public.questions q
join public.games g on g.id = q.game_id and g.slug = 'raadspel'
join (values
    ('Olifant', '{Dieren}'), ('Kikker', '{Dieren}'), ('Pinguïn', '{Dieren}'), ('Giraf', '{Dieren}'),
    ('Slak', '{Dieren}'), ('Kangoeroe', '{Dieren}'), ('Octopus', '{Dieren}'),
    ('Pindarotsje', '{"Eten en drinken"}'), ('Pannenkoek', '{"Eten en drinken"}'), ('Spaghetti', '{"Eten en drinken"}'),
    ('IJsje', '{"Eten en drinken"}'), ('Hagelslag', '{"Eten en drinken"}'),
    ('Brandweerman', '{Beroepen}'), ('Kapper', '{Beroepen}'), ('Tandarts', '{Beroepen}'), ('Piloot', '{Beroepen}'),
    ('Voetballen', '{"Sport en spel"}'), ('Zwemmen', '{"Sport en spel"}'), ('Schaatsen', '{"Sport en spel"}'), ('Tennis', '{"Sport en spel"}'),
    ('Fiets', '{Voertuigen}'), ('Helikopter', '{Voertuigen}'), ('Brandweerauto', '{Voertuigen}'), ('Onderzeeër', '{Voertuigen}'),
    ('Stofzuiger', '{"In huis"}'), ('Wasmachine', '{"In huis"}'), ('Paraplu', '{"In huis"}'), ('Tandenborstel', '{"In huis"}'),
    ('Sneeuwwitje', '{"Sprookjes en fantasie","Films, series en tv"}'), ('Superheld', '{"Films, series en tv"}'),
    ('Robot', '{"Algemene kennis"}'), ('Spin', '{"Algemene kennis",Dieren}'), ('Eiffeltoren', '{"Algemene kennis"}'),
    ('Zeilboot', '{"Algemene kennis"}'), ('Klok', '{"Algemene kennis"}'), ('Koe', '{"Algemene kennis",Dieren}'),
    ('Banaan', '{"Algemene kennis","Eten en drinken"}'), ('Vulkaan', '{"Algemene kennis"}'),
    ('Vrijgezellenfeest', '{"Uitgaan en feesten 18+"}'), ('Kater na het stappen', '{"Uitgaan en feesten 18+"}')
  ) as m(text, cats) on m.text = q.text
join public.categories c on c.game_id = g.id and c.name = any (m.cats::text[])
on conflict do nothing;

insert into public.question_task_types (question_id, task_type_id)
select q.id, t.id
from public.questions q
join public.games g on g.id = q.game_id and g.slug = 'raadspel'
join (values
    ('Olifant', '{uitbeelden,tekenen,beschrijven}'), ('Kikker', '{uitbeelden,tekenen}'),
    ('Pinguïn', '{uitbeelden,tekenen,beschrijven}'), ('Giraf', '{tekenen,beschrijven}'),
    ('Slak', '{uitbeelden,tekenen}'), ('Kangoeroe', '{uitbeelden,beschrijven}'), ('Octopus', '{tekenen,beschrijven}'),
    ('Pindarotsje', '{uitbeelden,tekenen}'), ('Pannenkoek', '{uitbeelden,tekenen,beschrijven}'),
    ('Spaghetti', '{uitbeelden,tekenen,beschrijven}'), ('IJsje', '{uitbeelden,tekenen}'), ('Hagelslag', '{beschrijven,tekenen}'),
    ('Brandweerman', '{uitbeelden,beschrijven}'), ('Kapper', '{uitbeelden,beschrijven}'),
    ('Tandarts', '{uitbeelden,beschrijven}'), ('Piloot', '{uitbeelden,tekenen,beschrijven}'),
    ('Voetballen', '{uitbeelden,beschrijven}'), ('Zwemmen', '{uitbeelden}'), ('Schaatsen', '{uitbeelden,tekenen}'),
    ('Tennis', '{uitbeelden,beschrijven}'), ('Fiets', '{uitbeelden,tekenen}'),
    ('Helikopter', '{uitbeelden,tekenen,beschrijven}'), ('Brandweerauto', '{uitbeelden,tekenen,beschrijven}'),
    ('Onderzeeër', '{tekenen,beschrijven}'), ('Stofzuiger', '{uitbeelden,tekenen}'), ('Wasmachine', '{uitbeelden,beschrijven}'),
    ('Paraplu', '{uitbeelden,tekenen}'), ('Tandenborstel', '{uitbeelden,tekenen}'),
    ('Sneeuwwitje', '{uitbeelden,beschrijven}'), ('Superheld', '{uitbeelden,tekenen}'),
    ('Robot', '{vragen,uitbeelden,tekenen}'), ('Spin', '{vragen,tekenen}'), ('Eiffeltoren', '{vragen,tekenen,beschrijven}'), ('Zeilboot', '{vragen,tekenen}'),
    ('Klok', '{vragen,tekenen,beschrijven}'), ('Koe', '{vragen,uitbeelden,tekenen}'), ('Banaan', '{vragen,tekenen,beschrijven}'), ('Vulkaan', '{vragen,tekenen,beschrijven}'),
    ('Vrijgezellenfeest', '{uitbeelden,beschrijven}'), ('Kater na het stappen', '{uitbeelden,beschrijven}')
  ) as m(text, types) on m.text = q.text
join public.task_types t on t.game_id = g.id and t.code = any (m.types::text[])
on conflict do nothing;
