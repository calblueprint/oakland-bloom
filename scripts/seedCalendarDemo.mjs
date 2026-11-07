import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { runSeed } from "./seedReservations.mjs";

// Reuse the existing development-target, UUID, TLS, and transaction safeguards.
// Only these four demo IDs are refreshed; accounts and unrelated bookings stay intact.
const source = `
select pg_advisory_xact_lock(150004);

do $$
begin
  if (select count(*) from auth.users a
      join public.users u on u.userid = a.id
      where a.id in (current_setting('oak10.user1')::uuid,
                     current_setting('oak10.user2')::uuid)) <> 2 then
    raise exception 'Both test Auth users and their application profiles must exist.';
  end if;
end $$;

create temporary table calendar_demo on commit drop as
select id, amenity, "user", start_time, end_time, num_people,
       has_conflicts, approval_status
from public.booking_event with no data;

insert into calendar_demo
  (id, amenity, "user", start_time, end_time, num_people,
   has_conflicts, approval_status)
select v.id::uuid, 'kitchen', current_setting(v.owner_setting)::uuid,
       (d.today + v.day_offset + v.starts) at time zone 'America/Los_Angeles',
       (d.today + v.day_offset + v.ends) at time zone 'America/Los_Angeles',
       2, '{}', v.status
from (values
  ('0a150000-0000-4000-a000-000000000001', 'oak10.user1', 0, time '10:00', time '11:00', 'approved'),
  ('0a150000-0000-4000-a000-000000000002', 'oak10.user1', 1, time '13:00', time '14:00', 'pending'),
  ('0a150000-0000-4000-a000-000000000003', 'oak10.user2', 0, time '14:00', time '15:00', 'approved'),
  ('0a150000-0000-4000-a000-000000000004', 'oak10.user2', 1, time '10:00', time '11:00', 'denied')
) as v(id, owner_setting, day_offset, starts, ends, status)
cross join (select (current_timestamp at time zone 'America/Los_Angeles')::date as today) d;

-- Refuse to claim a demo ID already owned by someone else.
do $$
begin
  if exists (select 1 from public.booking_event b join calendar_demo d using (id)
             where b."user" is distinct from d."user") then
    raise exception 'Calendar demo ID belongs to another user. No records changed.';
  end if;
end $$;

insert into public.booking_event
  (id, amenity, "user", start_time, end_time, num_people,
   has_conflicts, approval_status)
select id, amenity, "user", start_time, end_time, num_people,
       has_conflicts, approval_status from calendar_demo
on conflict (id) do update set
  amenity = excluded.amenity,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  num_people = excluded.num_people,
  has_conflicts = excluded.has_conflicts,
  approval_status = excluded.approval_status
where public.booking_event."user" = excluded."user";

do $$
begin
  if (select count(*) from public.booking_event b join calendar_demo d using (id)
      where row(b.amenity, b."user", b.start_time, b.end_time, b.num_people,
                b.has_conflicts, b.approval_status)
        is not distinct from
            row(d.amenity, d."user", d.start_time, d.end_time, d.num_people,
                d.has_conflicts, d.approval_status)) <> 4 then
    raise exception 'Calendar demo verification failed. No records changed.';
  end if;
end $$;
`;

try {
  const envFile = new URL("../.env.local", import.meta.url);
  if (existsSync(envFile)) loadEnvFile(envFile);
  await runSeed({ source });
  console.log("Calendar demo seeded: 4 kitchen bookings, America/Los_Angeles.");
  console.log("User 1: today 10–11 approved; tomorrow 13–14 pending.");
  console.log("User 2: today 14–15 approved; tomorrow 10–11 denied.");
  console.log("Reruns refresh the same four IDs. Other records are preserved.");
} catch (error) {
  // Never print driver errors, connection strings, or credentials.
  if (
    error instanceof Error &&
    /^(Set SEED_|Set RESERVATION_TEST_|SEED_DATABASE_URL must|Use the direct|Run reservation seeding|Both test Auth users|Calendar demo)/.test(
      error.message,
    )
  ) {
    console.error(error.message);
  } else {
    console.error(
      "Calendar demo seed failed. Check database configuration and constraints.",
    );
  }
  process.exitCode = 1;
}
