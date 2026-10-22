-- 1. New accounts can never start approved or admin
alter table public.users alter column is_admin set default false;
alter table public.users alter column is_approved set default false;

-- 2. Link each account to its Supabase login
alter table public.users
  add constraint users_userid_fkey
  foreign key (userid) references auth.users(id) on delete cascade;

-- 3. Restaurant info, one per account
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  userid uuid not null unique references public.users(userid) on delete cascade,
  name text,
  address text,
  cuisine text,
  created_at timestamptz not null default now()
);
alter table public.restaurants enable row level security;

-- 4. Chefs can read their own rows, and can never write
revoke insert, update, delete on public.users from anon, authenticated;
revoke insert, update, delete on public.restaurants from anon, authenticated;

create policy "read own user" on public.users
  for select to authenticated using (userid = auth.uid());

create policy "read own restaurant" on public.restaurants
  for select to authenticated using (userid = auth.uid());

-- 5. Create the account automatically when someone signs up.
-- Approval and admin are hardcoded false, never read from metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (userid, email, name, phone, is_admin, is_approved)
  values (
    new.id,
    lower(new.email),
    concat_ws(' ', new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name'),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    false,
    false
  )
  on conflict (userid) do nothing;

  insert into public.restaurants (userid, name, address, cuisine)
  values (
    new.id,
    new.raw_user_meta_data->>'restaurant_name',
    new.raw_user_meta_data->>'restaurant_address',
    new.raw_user_meta_data->>'cuisine'
  )
  on conflict (userid) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6. Give existing logins without an account a pending one
insert into public.users (userid, email, name, phone, is_admin, is_approved)
select id, lower(email),
  concat_ws(' ', raw_user_meta_data->>'first_name', raw_user_meta_data->>'last_name'),
  coalesce(raw_user_meta_data->>'phone', ''),
  false, false
from auth.users
on conflict (userid) do nothing;

insert into public.restaurants (userid, name, address, cuisine)
select id,
  raw_user_meta_data->>'restaurant_name',
  raw_user_meta_data->>'restaurant_address',
  raw_user_meta_data->>'cuisine'
from auth.users
where id in (select userid from public.users)
on conflict (userid) do nothing;