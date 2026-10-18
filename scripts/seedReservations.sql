-- OAK-10 DEVELOPMENT ONLY: two application profiles for the existing test Auth users.
-- Never creates Auth accounts, stores passwords, changes RLS, or deletes old data.
begin;
lock table public.users, public.booking_event in share row exclusive mode;

create temporary table oak10_seed_users on commit drop as
select userid, email, name, is_admin, is_approved, phone
from public.users with no data;

create temporary table oak10_seed_bookings on commit drop as
select id, amenity, "user", start_time, end_time, num_people,
       has_conflicts, approval_status
from public.booking_event with no data;

-- Use the verified test account's ID/email; do not invent a separate owner ID.
insert into oak10_seed_users (userid, email, name, is_admin, is_approved, phone)
select id, email, 'OAK-10 Backend Test User', false, true, '+12025550104'
from auth.users
where id = 'ee90d30c-984c-41c9-8248-bd299ca51f6d';

insert into oak10_seed_users (userid, email, name, is_admin, is_approved, phone)
select id, email, 'OAK-10 Backend Test User 2', false, true, '+12025550106'
from auth.users
where id = '15fe2790-f751-4107-a789-38e3cf1485d6';

do $$
begin
    if (select count(*) from oak10_seed_users) <> 2 then
        raise exception 'Both configured OAK-10 test Auth accounts must exist before seeding.';
    end if;
end $$;

-- Chef 1: pending, approved, denied, and past-approved.
-- Chef 2: one approved booking for real cross-owner isolation checks.
-- Pending/denied share a start time to exercise stable ordering by ID.
-- PostgreSQL infers the empty array type from the destination column.
insert into oak10_seed_bookings
    (id, amenity, "user", start_time, end_time, num_people,
     has_conflicts, approval_status)
values
    ('0a100000-0000-4000-a000-000000000001', 'kitchen',
     'ee90d30c-984c-41c9-8248-bd299ca51f6d',
     '2030-07-10T09:00:00-07:00', '2030-07-10T10:00:00-07:00', 2, '{}', 'pending'),
    ('0a100000-0000-4000-a000-000000000002', 'kitchen',
     'ee90d30c-984c-41c9-8248-bd299ca51f6d',
     '2030-07-11T09:00:00-07:00', '2030-07-11T11:00:00-07:00', 4, '{}', 'approved'),
    ('0a100000-0000-4000-a000-000000000003', 'kitchen',
     'ee90d30c-984c-41c9-8248-bd299ca51f6d',
     '2030-07-10T09:00:00-07:00', '2030-07-10T10:00:00-07:00', 3, '{}', 'denied'),
    ('0a100000-0000-4000-a000-000000000004', 'kitchen',
     'ee90d30c-984c-41c9-8248-bd299ca51f6d',
     '2020-07-10T16:00:00Z', '2020-07-10T17:00:00Z', 2, '{}', 'approved'),
    ('0a100000-0000-4000-a000-000000000006', 'kitchen',
     '15fe2790-f751-4107-a789-38e3cf1485d6',
     '2030-07-13T09:00:00-07:00', '2030-07-13T10:00:00-07:00', 2, '{}', 'approved');

-- Fixed IDs are safe to rerun only if their existing data is unchanged.
do $$
begin
    if exists (
        select 1 from public.users existing
        join oak10_seed_users fixture on existing.userid = fixture.userid
        where row(existing.userid, existing.email, existing.name,
                  existing.is_admin, existing.is_approved, existing.phone)
            is distinct from
              row(fixture.userid, fixture.email, fixture.name,
                  fixture.is_admin, fixture.is_approved, fixture.phone)
    ) then
        raise exception 'OAK-10 profile collision or edited fixture. No records changed.';
    end if;
    if exists (
        select 1 from public.booking_event existing
        join oak10_seed_bookings fixture on existing.id = fixture.id
        where row(existing.id, existing.amenity, existing."user", existing.start_time,
                  existing.end_time, existing.num_people, existing.has_conflicts,
                  existing.approval_status)
            is distinct from
              row(fixture.id, fixture.amenity, fixture."user", fixture.start_time,
                  fixture.end_time, fixture.num_people, fixture.has_conflicts,
                  fixture.approval_status)
    ) then
        raise exception 'OAK-10 booking collision or edited fixture. No records changed.';
    end if;
end $$;

insert into public.users (userid, email, name, is_admin, is_approved, phone)
select fixture.userid, fixture.email, fixture.name, fixture.is_admin,
       fixture.is_approved, fixture.phone
from oak10_seed_users fixture
where not exists (
    select 1 from public.users existing where existing.userid = fixture.userid
);

insert into public.booking_event
    (id, amenity, "user", start_time, end_time, num_people,
     has_conflicts, approval_status)
select fixture.id, fixture.amenity, fixture."user", fixture.start_time,
       fixture.end_time, fixture.num_people, fixture.has_conflicts,
       fixture.approval_status
from oak10_seed_bookings fixture
where not exists (
    select 1 from public.booking_event existing where existing.id = fixture.id
);

do $$
begin
    if (select count(*) from public.users
        where userid in (select userid from oak10_seed_users)) <> 2
       or (select count(*) from public.booking_event
           where id in (select id from oak10_seed_bookings)) <> 5
       or (select count(*) from public.booking_event
           where "user" = 'ee90d30c-984c-41c9-8248-bd299ca51f6d') <> 4
       or (select count(*) from public.booking_event
           where "user" = '15fe2790-f751-4107-a789-38e3cf1485d6') <> 1
    then
        raise exception 'OAK-10 fixture counts do not match; transaction rolled back.';
    end if;
end $$;

select fixture.userid, count(booking.id) as reservation_count
from oak10_seed_users fixture
left join public.booking_event booking on booking."user" = fixture.userid
group by fixture.userid;
commit;
