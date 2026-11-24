-- Chefs can cancel their own pending or approved reservations before they
-- start. A cancelled request keeps its row (for history and the admin view)
-- but no longer occupies any amenity: availability only counts 'approved'.
alter table public.booking_event
  drop constraint booking_event_status_check,
  add constraint booking_event_status_check
    check (approval_status in ('pending', 'approved', 'denied', 'cancelled'));

-- Chefs still have no direct write access to booking_event (see
-- 20261108000000_booking_requests.sql); cancelling goes through this checked
-- operation instead.
create or replace function public.cancel_booking_request(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  existing public.booking_event;
begin
  if owner_id is null or not exists (
    select 1 from public.users where userid = owner_id and (is_approved or is_admin)
  ) then
    raise exception 'Approved account required' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'Reservation required' using errcode = '22023';
  end if;
  -- the same lock as every other booking write, so a cancel can't interleave
  -- with an approval of the same request
  perform pg_advisory_xact_lock(180001);
  select * into existing from public.booking_event
    where id = p_id and "user" = owner_id
    for update;
  -- someone else's request reads the same as a missing one
  if not found then
    raise exception 'Reservation not found' using errcode = 'P0002';
  end if;
  if existing.approval_status = 'cancelled' then
    return existing.id; -- retrying a cancel that already went through is fine
  end if;
  if existing.approval_status not in ('pending', 'approved') then
    raise exception 'Only pending or approved reservations can be cancelled'
      using errcode = '22023';
  end if;
  if existing.start_time <= current_timestamp then
    raise exception 'Reservations that have started cannot be cancelled'
      using errcode = '22023';
  end if;
  update public.booking_event set approval_status = 'cancelled' where id = p_id;
  return p_id;
end $$;
revoke all on function public.cancel_booking_request(uuid) from public, anon;
grant execute on function public.cancel_booking_request(uuid) to authenticated;
