-- Minimal product tables for the local WhatsApp test database.
-- This is not the web app's onboarding migration history.
-- The runner checks the local database address and owns the transaction.
-- These column types, nullability, defaults, and relationships match the
-- existing product's live schema metadata; no production rows are copied.
do $$
begin
    if current_setting('oakland_bloom.synthetic_test', true) is distinct from 'on' then
        raise exception 'This schema is only for the explicitly selected synthetic test database.';
    end if;
end;
$$;

create table if not exists public.users (
    userid uuid primary key,
    email varchar(255) not null,
    name varchar(255) not null,
    is_admin boolean not null default false,
    is_approved boolean not null default false,
    phone varchar(255) not null
);

create table if not exists public.restaurants (
    id uuid primary key default gen_random_uuid(),
    userid uuid not null references public.users(userid) on delete cascade,
    name text,
    address text,
    cuisine text,
    created_at timestamptz not null default now()
);

create table if not exists public.booking_event (
    id uuid primary key,
    amenity varchar(255) not null,
    "user" uuid not null references public.users(userid),
    start_time timestamptz not null,
    end_time timestamptz not null,
    num_people bigint not null,
    has_conflicts uuid[] not null,
    approval_status varchar(255) not null
);

-- The later integration migration adds the web-user link and response fields.
create table if not exists public.whatsapp_user (
    chef_id uuid primary key,
    name varchar(255) not null,
    phone varchar(255) not null
);

create table if not exists public.whatsapp_catering (
    catering_id uuid primary key,
    num_people bigint not null,
    meal_name varchar(255) not null,
    is_accepted boolean not null,
    chef uuid not null references public.whatsapp_user(chef_id),
    day_created timestamptz not null
);

create table if not exists public.past_items (
    meal_id uuid primary key,
    chef_id uuid not null references public.whatsapp_user(chef_id),
    name varchar(255) not null,
    price bigint not null
);

-- Only a signed-in user can read their own web profile, business, and bookings.
-- Web onboarding and admin account writers are outside this fixture setup.
alter table public.users enable row level security;
alter table public.restaurants enable row level security;
alter table public.booking_event enable row level security;
alter table public.whatsapp_user enable row level security;
alter table public.whatsapp_catering enable row level security;
alter table public.past_items enable row level security;

-- Recreate only these named test policies so setup can be run again safely.
drop policy if exists synthetic_own_profile on public.users;
create policy synthetic_own_profile on public.users
    for select to authenticated using (userid = (select auth.uid()));
drop policy if exists synthetic_own_restaurants on public.restaurants;
create policy synthetic_own_restaurants on public.restaurants
    for select to authenticated using (userid = (select auth.uid()));
drop policy if exists synthetic_own_bookings on public.booking_event;
create policy synthetic_own_bookings on public.booking_event
    for select to authenticated using ("user" = (select auth.uid()));

-- WhatsApp domain tables deliberately have no browser policies. The server key
-- writes fixtures and runs the guarded functions; browser clients only read the
-- three web tables through their own-user policies above.
revoke all on public.users, public.restaurants, public.booking_event,
    public.whatsapp_user, public.whatsapp_catering, public.past_items
    from anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant select on public.users, public.restaurants, public.booking_event to authenticated;
grant select, insert, update, delete on public.users, public.restaurants,
    public.booking_event, public.whatsapp_user, public.whatsapp_catering,
    public.past_items to service_role;
