-- Soort opdracht "Vragen beantwoorden" heet voortaan "Raden (ja of nee)".
-- Zo werkt het: de speler ziet een woord (bijv. Paard). De anderen stellen om de beurt
-- een vraag die alleen met ja of nee beantwoord mag worden, tot iemand het woord raadt.
-- De code blijft 'vragen', dus bestaande vragen en oude Excel-bestanden blijven werken.
-- Veilig om vaker te draaien.

update public.task_types
   set name = 'Raden (ja of nee)'
 where code = 'vragen'
   and name <> 'Raden (ja of nee)';

-- Spelregels en omschrijving bijwerken, alleen waar nog de oude standaardtekst staat.
update public.games
   set rules = replace(
         replace(
           rules,
           '**beschrijven** of een **vraag beantwoorden**.',
           '**beschrijven** of **raden (ja of nee)**.'
         ),
         '- **Vragen beantwoorden:** lees de vraag voor; wie het eerst het goede antwoord geeft, wint de beurt.',
         '- **Raden (ja of nee):** de anderen stellen om de beurt een vraag die je alleen met ja of nee beantwoordt ("Ben je een dier?" "Ja."), net zo lang tot iemand het woord raadt.'
       ),
       description = replace(description, 'of vragen beantwoorden.', 'of raden met ja/nee-vragen.')
 where slug = 'raadspel';
