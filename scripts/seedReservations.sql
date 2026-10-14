-- OAK-10 - Right now, ran manually in SQL editor to create seed datayes it seeded correctly
-- Assumes the executing role may insert application users and reservations.
-- Does not create auth users, change RLS, or establish authenticated sessions.
-- Fixed fixture IDs and timestamps make repeated runs deterministic.

begin;

-- Prevent concurrent writes between collision checks and inserts. These short-lived
-- locks are released by COMMIT/ROLLBACK. Do not run this on a production database.
lock table public.users, public.booking_event in share row exclusive mode;

-- Temporary staging tables inherit the actual column types (including the array
-- element type). These are helpers, not new application tables, and drop on commit.
create temporary table oak10_seed_users on commit drop as
select userid, email, name, is_admin, is_approved, phone
from public.users with no data;

create temporary table oak10_seed_bookings on commit drop as
select id, amenity, "user", start_time, end_time, num_people,
       has_conflicts, approval_status
from public.booking_event with no data;

-- Reserved example emails and fictional 202-555-01xx phone numbers; no real chefs.
insert into oak10_seed_users
    (userid, email, name, is_admin, is_approved, phone)
values
    ('0a100000-0000-4000-8000-000000000001', 'oak10-chef-a@example.invalid',
     'OAK-10 Test Chef A', false, true, '+12025550101'),
    ('0a100000-0000-4000-8000-000000000002', 'oak10-chef-b@example.invalid',
     'OAK-10 Test Chef B', false, true, '+12025550102'),
    ('0a100000-0000-4000-8000-000000000003', 'oak10-chef-c@example.invalid',
     'OAK-10 Test Chef C (no bookings)', false, true, '+12025550103');

-- 'kitchen' is a synthetic fixture amenity, not a newly defined database value.
-- If the database restricts amenities, use an accepted development amenity before
-- the first run. Existing constraints remain enforced; failures roll back the seed.
-- '{}' is PostgreSQL's empty-array literal; the destination determines its type.
-- All bookings are non-overlapping with approved bookings for the same amenity.
insert into oak10_seed_bookings
    (id, amenity, "user", start_time, end_time, num_people,
     has_conflicts, approval_status)
values
    ('0a100000-0000-4000-9000-000000000001', 'kitchen',
     '0a100000-0000-4000-8000-000000000001',
     '2030-06-10T09:00:00-07:00', '2030-06-10T10:00:00-07:00', 2, '{}', 'pending'),
    ('0a100000-0000-4000-9000-000000000002', 'kitchen',
     '0a100000-0000-4000-8000-000000000001',
     '2030-06-11T09:00:00-07:00', '2030-06-11T11:00:00-07:00', 4, '{}', 'approved'),
    ('0a100000-0000-4000-9000-000000000003', 'kitchen',
     '0a100000-0000-4000-8000-000000000001',
     '2030-06-10T09:00:00-07:00', '2030-06-10T10:00:00-07:00', 3, '{}', 'denied'),
    ('0a100000-0000-4000-9000-000000000004', 'kitchen',
     '0a100000-0000-4000-8000-000000000001',
     '2020-06-10T16:00:00Z', '2020-06-10T17:00:00Z', 2, '{}', 'approved'),
    ('0a100000-0000-4000-9000-000000000005', 'kitchen',
     '0a100000-0000-4000-8000-000000000002',
     '2030-06-12T09:00:00-07:00', '2030-06-12T10:00:00-07:00', 2, '{}', 'approved');

-- Refuse to overwrite a record if a fixed ID already has different contents.
-- Compare only the schema fields supplied for this sprint.
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
        raise exception 'OAK-10 seed user ID collision or edited fixture. No records changed.';
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
        raise exception 'OAK-10 seed booking ID collision or edited fixture. No records changed.';
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

-- Verify the fixtures before committing. In particular Chef C must remain empty.
-- Unexpected extra reservations are preserved; this seed fails instead of deleting.
do $$
begin
    if (select count(*) from public.users
        where userid in (select userid from oak10_seed_users)) <> 3
       or (select count(*) from public.booking_event
           where id in (select id from oak10_seed_bookings)) <> 5
       or (select count(*) from public.booking_event
           where "user" = '0a100000-0000-4000-8000-000000000001') <> 4
       or (select count(*) from public.booking_event
           where "user" = '0a100000-0000-4000-8000-000000000002') <> 1
       or exists (select 1 from public.booking_event
                  where "user" = '0a100000-0000-4000-8000-000000000003')
    then
        raise exception 'OAK-10 fixture counts do not match; transaction rolled back.';
    end if;
end $$;

-- Final result: Chef A = 4, Chef B = 1, Chef C = 0 (also on every unchanged rerun).
select fixture.userid, fixture.name, count(booking.id) as reservation_count
from oak10_seed_users fixture
left join public.booking_event booking on booking."user" = fixture.userid
group by fixture.userid, fixture.name
order by fixture.userid;

commit;
