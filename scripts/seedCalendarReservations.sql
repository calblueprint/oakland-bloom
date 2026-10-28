-- Current Los Angeles week, anchored to Monday. Only synthetic test accounts.
-- Fixed demo IDs move to the current week when this command is rerun.
truncate oak10_seed_bookings;
insert into oak10_seed_bookings
    (id, amenity, "user", start_time, end_time, num_people, has_conflicts, approval_status)
select fixture.id::uuid, 'kitchen', fixture.owner::uuid,
       (date_trunc('week', now() at time zone 'America/Los_Angeles') + fixture.starts) at time zone 'America/Los_Angeles',
       (date_trunc('week', now() at time zone 'America/Los_Angeles') + fixture.ends) at time zone 'America/Los_Angeles',
       2, '{}', fixture.status
from (values
    ('0a100000-0000-4000-a000-000000000009', current_setting('oak10.user1'),
     interval '1 day 13 hours', interval '1 day 14 hours 30 minutes', 'pending'),
    ('0a100000-0000-4000-a000-000000000010', current_setting('oak10.user1'),
     interval '3 days 10 hours', interval '3 days 12 hours', 'approved'),
    ('0a100000-0000-4000-a000-000000000011', current_setting('oak10.user2'),
     interval '2 days 11 hours', interval '2 days 13 hours', 'approved')
) as fixture(id, owner, starts, ends, status);

do $$
begin
    if exists (
        select 1 from public.booking_event existing
        join oak10_seed_bookings fixture on existing.id = fixture.id
        where row(existing.amenity, existing."user", existing.num_people,
                  existing.has_conflicts, existing.approval_status)
            is distinct from
              row(fixture.amenity, fixture."user", fixture.num_people,
                  fixture.has_conflicts, fixture.approval_status)
    ) then
        raise exception 'Calendar booking collision or edited fixture. No records changed.';
    end if;
end $$;

insert into public.booking_event
    (id, amenity, "user", start_time, end_time, num_people, has_conflicts, approval_status)
select id, amenity, "user", start_time, end_time, num_people, has_conflicts, approval_status
from oak10_seed_bookings
on conflict (id) do update
set start_time = excluded.start_time, end_time = excluded.end_time;
