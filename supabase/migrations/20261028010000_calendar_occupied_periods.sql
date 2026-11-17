-- Authenticated anonymous availability only; this does not configure table RLS.
-- Apply reviewed owner-only table policies separately to protect direct access.
create or replace function public.get_calendar_occupied_periods(p_start timestamptz, p_end timestamptz)
returns table (amenity text, start_time timestamptz, end_time timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
     or p_end <= p_start or p_end - p_start > interval '42 days' then
    raise exception 'Invalid calendar range' using errcode = '22023';
  end if;
  return query
  -- Merge adjacent/overlapping periods so booking IDs and counts stay private.
  with periods as (
    select b.amenity::text as resource,
           greatest(b.start_time, p_start) as starts,
           least(b.end_time, p_end) as ends
    from public.booking_event b
    where b."user" <> auth.uid() and b.approval_status = 'approved'
      and b.start_time < p_end and b.end_time > p_start
  ), previous_ends as (
    select *, max(ends) over (partition by resource order by starts, ends
      rows between unbounded preceding and 1 preceding) as previous_end
    from periods
  ), grouped as (
    select *, sum(case when previous_end is null or starts > previous_end then 1 else 0 end)
      over (partition by resource order by starts, ends) as group_id
    from previous_ends
  )
  select resource, min(starts), max(ends)
  from grouped group by resource, group_id order by min(starts), resource;
end;
$$;
revoke all on function public.get_calendar_occupied_periods(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_calendar_occupied_periods(timestamptz, timestamptz) to authenticated;
comment on function public.get_calendar_occupied_periods(timestamptz, timestamptz)
  is 'Approved occupied periods for other chefs; no booking IDs, owners, counts, or private details.';
notify pgrst, 'reload schema';
