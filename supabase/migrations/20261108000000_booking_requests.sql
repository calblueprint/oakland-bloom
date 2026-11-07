-- One request can reserve several amenities. Keep the legacy singular column
-- synchronized for existing integrations; new clients use amenities.
alter table public.booking_event
  add column if not exists title text,
  add column amenities text[],
  add column additional_contacts text[] not null default '{}';

-- A legacy kitchen booking occupied the whole kitchen, so preserve that meaning.
update public.booking_event set
  title = coalesce(nullif(btrim(title), ''), 'Kitchen reservation'),
  amenities = case lower(amenity)
    when 'kitchen' then array['bar_prep_table', 'salad_bar_table', 'oven']
    when 'bar_prep_table' then array['bar_prep_table']
    when 'salad_bar_table' then array['salad_bar_table']
    when 'oven' then array['oven']
    else array[amenity] end;

alter table public.booking_event
  alter column title set not null,
  alter column amenities set not null,
  add constraint booking_event_title_check check (length(btrim(title)) between 1 and 120),
  add constraint booking_event_amenities_check check (
    cardinality(amenities) between 1 and 3
    and array_position(amenities, null) is null
    and amenities <@ array['bar_prep_table', 'salad_bar_table', 'oven']::text[]
  ),
  add constraint booking_event_status_check check (approval_status in ('pending', 'approved', 'denied')),
  add constraint booking_event_chefs_check check (num_people between 1 and 2147483647),
  add constraint booking_event_contacts_count_check check (
    cardinality(additional_contacts) <= 10 and array_position(additional_contacts, null) is null
  ),
  add constraint booking_event_finite_times_check check (isfinite(start_time) and isfinite(end_time));

create or replace function public.validate_booking_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize booking writes, including later approvals. The overlap check and
  -- insert must share a transaction; checking only in the browser races.
  perform pg_advisory_xact_lock(180001);
  -- Older seed/integration clients still supply the singular amenity column.
  if new.amenities is null then
    new.amenities := case when new.amenity = 'kitchen'
      then array['bar_prep_table', 'salad_bar_table', 'oven']
      else array[new.amenity::text] end;
  end if;
  new.title := coalesce(new.title, 'Kitchen reservation');
  new.amenities := array(select distinct a from unnest(new.amenities) a order by a);
  new.amenity := case when cardinality(new.amenities) = 1 then new.amenities[1] else 'kitchen' end;
  if exists (select 1 from unnest(new.additional_contacts) email
             where length(email) > 254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Invalid contact email' using errcode = '22023';
  end if;
  if new.approval_status in ('pending', 'approved') and exists (
    select 1 from public.booking_event b
    where b.id <> new.id and b.approval_status = 'approved'
      and b.amenities && new.amenities
      and b.start_time < new.end_time and b.end_time > new.start_time
  ) then
    raise exception 'One or more amenities are occupied during this time.' using errcode = '23P01';
  end if;
  return new;
end $$;
revoke all on function public.validate_booking_request() from public, anon, authenticated;
create trigger validate_booking_request before insert or update on public.booking_event
  for each row execute function public.validate_booking_request();

alter table public.booking_event enable row level security;
-- Writes go through the validated operation, never through a privileged client
-- in the application or an unrestricted chef insert/update policy.
revoke insert, update, delete on public.booking_event from anon, authenticated;
grant select on public.booking_event to authenticated;
drop policy if exists booking_event_owner_read on public.booking_event;
create policy booking_event_owner_read on public.booking_event for select to authenticated
  using ("user" = (select auth.uid()));

create or replace function public.create_booking_request(
  p_id uuid, p_title text, p_amenities text[], p_start timestamptz,
  p_end timestamptz, p_num_people integer, p_additional_contacts text[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  existing public.booking_event;
  chosen text[];
  contacts text[];
begin
  if owner_id is null or not exists (
    select 1 from public.users where userid = owner_id and (is_approved or is_admin)
  ) then
    raise exception 'Approved account required' using errcode = '42501';
  end if;
  if p_id is null or p_title is null or length(btrim(p_title)) not between 1 and 120
     or p_amenities is null or cardinality(p_amenities) not between 1 and 3
     or array_position(p_amenities, null) is not null
     or not (p_amenities <@ array['bar_prep_table', 'salad_bar_table', 'oven']::text[])
     or p_num_people is null or p_num_people < 1
     or p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
     or p_end <= p_start or p_end - p_start > interval '42 days'
     or p_additional_contacts is null or cardinality(p_additional_contacts) > 10
     or array_position(p_additional_contacts, null) is not null then
    raise exception 'Invalid reservation details' using errcode = '22023';
  end if;
  chosen := array(select distinct a from unnest(p_amenities) a order by a);
  contacts := array(select distinct lower(btrim(e)) from unnest(p_additional_contacts) e order by 1);
  perform pg_advisory_xact_lock(180001);
  select * into existing from public.booking_event where id = p_id;
  if found then
    if existing."user" = owner_id and existing.title = btrim(p_title)
       and existing.amenities = chosen and existing.start_time = p_start
       and existing.end_time = p_end and existing.num_people = p_num_people
       and existing.additional_contacts = contacts then
      return existing.id; -- Retrying the same submission never creates a duplicate.
    end if;
    raise exception 'Request identifier already used' using errcode = '22023';
  end if;
  if p_start <= current_timestamp then
    raise exception 'Choose a future start time' using errcode = '22023';
  end if;
  insert into public.booking_event
    (id, title, amenities, amenity, "user", start_time, end_time, num_people,
     additional_contacts, has_conflicts, approval_status)
  values (p_id, btrim(p_title), chosen, chosen[1], owner_id, p_start, p_end,
          p_num_people, contacts, '{}', 'pending');
  return p_id;
end $$;
revoke all on function public.create_booking_request(uuid, text, text[], timestamptz, timestamptz, integer, text[]) from public, anon;
grant execute on function public.create_booking_request(uuid, text, text[], timestamptz, timestamptz, integer, text[]) to authenticated;

-- Expand each request into occupied periods per amenity, without exposing titles,
-- contacts, ownership, request IDs, or individual booking counts.
create or replace function public.get_calendar_occupied_periods(p_start timestamptz, p_end timestamptz)
returns table (amenity text, start_time timestamptz, end_time timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
     or p_end <= p_start or p_end - p_start > interval '42 days' then
    raise exception 'Invalid calendar range' using errcode = '22023';
  end if;
  return query
  with periods as (
    select a.resource, greatest(b.start_time, p_start) as starts, least(b.end_time, p_end) as ends
    from public.booking_event b cross join lateral unnest(b.amenities) a(resource)
    where b."user" <> auth.uid() and b.approval_status = 'approved'
      and b.start_time < p_end and b.end_time > p_start
  ), previous_ends as (
    select *, max(ends) over (partition by resource order by starts, ends
      rows between unbounded preceding and 1 preceding) as previous_end from periods
  ), grouped as (
    select *, sum(case when previous_end is null or starts > previous_end then 1 else 0 end)
      over (partition by resource order by starts, ends) as group_id from previous_ends
  )
  select resource, min(starts), max(ends) from grouped
    group by resource, group_id order by min(starts), resource;
end $$;
notify pgrst, 'reload schema';
