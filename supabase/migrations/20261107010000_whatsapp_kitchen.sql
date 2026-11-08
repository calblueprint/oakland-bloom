-- Kitchen tools can read scoped bookings and approved conflicts, never book a slot.
-- Every lookup is tied to the worker's currently leased inbound message.
create function public.wa_kitchen_user(target_phone text, worker_id uuid, inbound_id uuid)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare chef public.chefs%rowtype; bound_id uuid; owner_id uuid;
begin
    if worker_id is null or inbound_id is null then
        raise exception 'Kitchen access unavailable';
    end if;
    bound_id := public.resolve_wa_chef(target_phone);
    select c.* into chef from public.chefs c
    where c.id=bound_id and c.wa_phone=target_phone and c.active and c.opted_out_at is null
    for share;
    if not found or chef.user_id is null then raise exception 'Kitchen access unavailable'; end if;
    select u.userid into owner_id from public.users u
    where u.userid=chef.user_id and u.is_approved
        and public.wa_normalize_phone(u.phone)=target_phone for share;
    if owner_id is null then raise exception 'Kitchen access unavailable'; end if;
    perform 1 from public.wa_conversations c
    where c.chef_id=chef.id and not c.human_takeover
        and c.lease_owner=worker_id::text and c.lease_message_id=inbound_id
        and c.lease_until>clock_timestamp() for share;
    if not found then raise exception 'Kitchen access unavailable'; end if;
    perform 1 from public.wa_messages m
    where m.id=inbound_id and m.chef_id=chef.id and m.phone=target_phone
        and m.direction='inbound' and m.provider='meta' and m.processed_at is null
        and m.sent_at>clock_timestamp()-interval '24 hours'
        and m.sent_at<=clock_timestamp()+interval '5 minutes'
        and btrim(m.body)!~* '^(stop|unsubscribe)[.!]?$' for share;
    if not found then raise exception 'Kitchen access unavailable'; end if;
    return owner_id;
end;
$$;

-- Return every own booking without private contact details or another owner ID.
create function public.list_wa_kitchen_bookings(target_phone text, worker_id uuid, inbound_id uuid)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare owner_id uuid; result jsonb;
begin
    owner_id := public.wa_kitchen_user(target_phone,worker_id,inbound_id);
    select coalesce(jsonb_agg(jsonb_build_object(
        'id',b.id,'amenity',b.amenity,
        'startAt',to_char(b.start_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'endAt',to_char(b.end_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'people',b.num_people,'status',b.approval_status
    ) order by b.start_time,b.id),'[]'::jsonb) into result
    from public.booking_event b where b."user"=owner_id;
    return result;
end;
$$;

-- A conflict check is not proof of opening hours/capacity or staff approval.
-- Text timestamps preserve the explicit offset requirement before PostgreSQL casts.
create function public.check_wa_kitchen_availability(
    target_phone text, worker_id uuid, inbound_id uuid,
    amenity text, start_at text, end_at text
)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare requested_start timestamptz; requested_end timestamptz; result_status text;
begin
    perform public.wa_kitchen_user(target_phone,worker_id,inbound_id);
    if amenity is null or btrim(amenity)='' or char_length(amenity)>255
        or start_at is null or end_at is null
        or start_at !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
        or end_at !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
        then raise exception 'Invalid kitchen interval'; end if;
    requested_start := start_at::timestamptz;
    requested_end := end_at::timestamptz;
    if not isfinite(requested_start) or not isfinite(requested_end)
        or requested_start<=clock_timestamp() or requested_end<=requested_start
        or requested_end-requested_start>interval '31 days'
        then raise exception 'Invalid kitchen interval'; end if;
    if exists(select 1 from public.booking_event b
        where b.amenity=check_wa_kitchen_availability.amenity and b.approval_status='approved'
            and (not isfinite(b.start_time) or not isfinite(b.end_time) or b.end_time<=b.start_time)) then
        raise exception 'Kitchen availability unavailable';
    end if;
    if not exists(select 1 from public.booking_event b
        where b.amenity=check_wa_kitchen_availability.amenity and btrim(b.amenity)<>'') then
        result_status := 'unknown_amenity';
    elsif exists(select 1 from public.booking_event b
        where b.amenity=check_wa_kitchen_availability.amenity and b.approval_status='approved'
            and requested_start<b.end_time and requested_end>b.start_time) then
        result_status := 'busy';
    else result_status := 'no_approved_conflicts'; end if;
    return jsonb_build_object('status',result_status,'amenity',amenity,
        'startAt',to_char(requested_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'endAt',to_char(requested_end at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end;
$$;

revoke all on function public.wa_kitchen_user(text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.list_wa_kitchen_bookings(text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.check_wa_kitchen_availability(text,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.wa_kitchen_user(text,uuid,uuid) to service_role;
grant execute on function public.list_wa_kitchen_bookings(text,uuid,uuid) to service_role;
grant execute on function public.check_wa_kitchen_availability(text,uuid,uuid,text,text,text) to service_role;
