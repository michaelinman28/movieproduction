-- Phone number on user profiles. Visible to the same people who can see the
-- profile (yourself and people you share a company with); only you can edit it.

alter table public.profiles
  add column phone text check (phone is null or length(trim(phone)) between 3 and 40);

-- Pick up name and phone from sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  );
  return new;
end;
$$;
