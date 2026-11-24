-- Phone numbers are stored in one format, and email addresses must be well formed.
--  * A 10-digit number (or 11 digits starting with 1, e.g. +1 404 555 0123) is stored
--    as ###-###-####.
--  * A number starting with + and another country code is stored as + and its digits.
--  * Anything else is refused with a message saying what to type.
--  * An email needs a name, an @, and a domain with a dot and an ending of 2+ letters.

create or replace function public.format_phone(v text)
returns text language plpgsql immutable set search_path = public as $$
declare
  t text := trim(coalesce(v, ''));
  d text := regexp_replace(t, '\D', '', 'g');
begin
  if t = '' then return null; end if;
  if t ~ '[A-Za-z]' then
    raise exception 'Phone numbers can only have digits, like 404-555-0123';
  end if;
  if length(d) = 11 and left(d, 1) = '1' then d := substr(d, 2); end if;
  if length(d) = 10 and not (t ~ '^\s*\+' and left(regexp_replace(t, '\D', '', 'g'), 1) <> '1') then
    return substr(d, 1, 3) || '-' || substr(d, 4, 3) || '-' || substr(d, 7, 4);
  end if;
  if t ~ '^\s*\+' and length(regexp_replace(t, '\D', '', 'g')) between 8 and 15 then
    return '+' || regexp_replace(t, '\D', '', 'g');
  end if;
  raise exception 'Enter a 10-digit phone number, like 404-555-0123, or an international number starting with +';
end;
$$;

create or replace function public.is_valid_email(v text)
returns boolean language sql immutable as $$
  select v is not null and length(v) <= 254
    and v ~ '^[A-Za-z0-9._%+''-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$'
    and v !~ '\.\.' and v !~ '^\.' and v !~ '\.@';
$$;

create or replace function public.check_email(v text)
returns text language plpgsql immutable as $$
declare t text := nullif(lower(trim(coalesce(v, ''))), '');
begin
  if t is not null and not public.is_valid_email(t) then
    raise exception '"%" isn''t a valid email address. Use the full address, like name@example.com', trim(v);
  end if;
  return t;
end;
$$;

-- Profiles: the phone. A malformed phone typed at sign-up is kept as typed rather than
-- blocking the account; it is formatted the next time it is saved.
create or replace function public.format_profile_phone()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    begin
      new.phone := public.format_phone(new.phone);
    exception when others then
      new.phone := nullif(trim(new.phone), '');
    end;
  elsif new.phone is distinct from old.phone then
    new.phone := public.format_phone(new.phone);
  end if;
  return new;
end;
$$;
create trigger profiles_format_phone before insert or update on public.profiles
  for each row execute function public.format_profile_phone();

-- Other emails and phones.
create or replace function public.format_person_contact()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.kind = 'phone' then new.value := public.format_phone(new.value);
  else new.value := public.check_email(new.value);
  end if;
  return new;
end;
$$;
create trigger person_contacts_format before insert or update on public.person_contacts
  for each row execute function public.format_person_contact();

-- Location contacts.
create or replace function public.format_location_contact()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.contact_phone is distinct from old.contact_phone then
    new.contact_phone := public.format_phone(new.contact_phone);
  end if;
  if tg_op = 'INSERT' or new.contact_email is distinct from old.contact_email then
    new.contact_email := public.check_email(new.contact_email);
  end if;
  return new;
end;
$$;
create trigger project_locations_format before insert or update on public.project_locations
  for each row execute function public.format_location_contact();

-- The stricter email rule as a check too.
alter table public.person_contacts drop constraint person_contacts_email;
alter table public.person_contacts add constraint person_contacts_email
  check (kind <> 'email' or public.is_valid_email(value));
alter table public.project_locations drop constraint if exists project_locations_contact_email_check;
alter table public.project_locations add constraint project_locations_contact_email_check
  check (contact_email is null or public.is_valid_email(contact_email));

-- Existing numbers in the new format (those that can be).
do $$
declare r record;
begin
  for r in select id, phone from public.profiles where phone is not null loop
    begin
      update public.profiles set phone = public.format_phone(r.phone) where id = r.id;
    exception when others then null;
    end;
  end loop;
  for r in select id, value from public.person_contacts where kind = 'phone' loop
    begin
      update public.person_contacts set value = public.format_phone(r.value) where id = r.id;
    exception when others then null;
    end;
  end loop;
  for r in select id, contact_phone from public.project_locations where contact_phone is not null loop
    begin
      update public.project_locations set contact_phone = public.format_phone(r.contact_phone) where id = r.id;
    exception when others then null;
    end;
  end loop;
end;
$$;
