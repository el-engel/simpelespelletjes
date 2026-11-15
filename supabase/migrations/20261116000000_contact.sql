-- Simplegames: contactformulier.
-- Uitvoeren in de SQL Editor van Supabase NA de eerdere bestanden (zie SETUP.md).
-- Mag meerdere keren worden uitgevoerd.
--
-- Berichten komen binnen via de server (met de service-sleutel). Alleen de
-- admin met 2FA kan ze lezen, als gelezen markeren of verwijderen.

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 200),
  phone text not null default '' check (char_length(phone) <= 30),
  message text not null check (char_length(message) between 1 and 1000),
  is_read boolean not null default false,
  emailed boolean not null default false
);

create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

revoke all on public.contact_messages from anon, authenticated;
grant select, delete on public.contact_messages to authenticated;
grant update (is_read) on public.contact_messages to authenticated;

drop policy if exists contact_messages_admin_read on public.contact_messages;
create policy contact_messages_admin_read on public.contact_messages for select to authenticated
  using (public.is_admin());
drop policy if exists contact_messages_admin_update on public.contact_messages;
create policy contact_messages_admin_update on public.contact_messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists contact_messages_admin_delete on public.contact_messages;
create policy contact_messages_admin_delete on public.contact_messages for delete to authenticated
  using (public.is_admin());

-- Bericht opslaan (alleen de server). De server heeft de invoer al gecontroleerd;
-- de database knipt voor de zekerheid nog een keer af. Er worden nooit meer dan
-- 5000 berichten bewaard: de oudste gelezen berichten gaan er dan eerst uit.
create or replace function public.save_contact_message(
  p_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_emailed boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.contact_messages (name, email, phone, message, emailed)
  values (
    left(btrim(coalesce(p_name, '')), 100),
    left(btrim(coalesce(p_email, '')), 200),
    left(btrim(coalesce(p_phone, '')), 30),
    left(btrim(coalesce(p_message, '')), 1000),
    coalesce(p_emailed, false)
  )
  returning id into new_id;

  if (select count(*) from public.contact_messages) > 5000 then
    delete from public.contact_messages where id in (
      select id from public.contact_messages order by is_read desc, created_at asc limit 100
    );
  end if;
  return new_id;
end;
$$;

revoke all on function public.save_contact_message(text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.save_contact_message(text, text, text, text, boolean) to service_role;
