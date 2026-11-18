-- Canonical amenity arrays take priority over the legacy singular column.
-- Read the optional field through the row so older test databases still work.
create function public.wa_booking_resources(booking public.booking_event)
returns text[]
language sql stable security invoker set search_path=''
as $$
    select case
        when jsonb_typeof(to_jsonb(booking)->'amenities')='array'
            then array(select jsonb_array_elements_text(to_jsonb(booking)->'amenities'))
        when lower(booking.amenity)='kitchen'
            then array['bar_prep_table','salad_bar_table','oven']
        else array[booking.amenity::text]
    end;
$$;

-- Keep the old three-argument RPC available for workers rolling over to this version.
create function public.list_wa_kitchen_bookings(
    target_phone text, worker_id uuid, inbound_id uuid, include_resources boolean
)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare owner_id uuid; quoted_booking uuid; result jsonb;
begin
    if include_resources is not true then
        return public.list_wa_kitchen_bookings(target_phone,worker_id,inbound_id);
    end if;
    owner_id:=public.wa_kitchen_user(target_phone,worker_id,inbound_id);

    -- A quote can point only to a notice sent to this chef for their own booking.
    -- The owner filter below also excludes bookings reassigned since the notice.
    select n.booking_id into quoted_booking from public.wa_messages m
    join public.wa_notifications n on n.provider_message_id=m.context_message_id
        and n.chef_id=m.chef_id and n.booking_owner=owner_id
        and n.kind='booking_update' and n.status='sent'
    where m.id=inbound_id;

    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id',b.id,'amenity',b.amenity,'amenities',public.wa_booking_resources(b),
        'title',nullif(btrim(to_jsonb(b)->>'title'),''),
        'quoted',case when b.id=quoted_booking then true end,
        'startAt',to_char(b.start_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'endAt',to_char(b.end_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'people',b.num_people,'status',b.approval_status
    )) order by b.start_time,b.id),'[]'::jsonb) into result
    from public.booking_event b where b."user"=owner_id;
    return result;
end;
$$;

-- Match every resource in an approved reservation. 'kitchen' requests all three
-- resources, but a canonical row with a legacy 'kitchen' summary may use fewer.
create or replace function public.check_wa_kitchen_availability(
    target_phone text, worker_id uuid, inbound_id uuid,
    amenity text, start_at text, end_at text
)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
    requested_start timestamptz; requested_end timestamptz; result_status text;
    kitchen_resources constant text[]:=array['bar_prep_table','salad_bar_table','oven'];
    requested_resources text[];
    known boolean; invalid_booking boolean; conflict boolean;
begin
    perform public.wa_kitchen_user(target_phone,worker_id,inbound_id);
    if amenity is null or btrim(amenity)='' or char_length(amenity)>255
        or start_at is null or end_at is null
        or start_at !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
        or end_at !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
        then raise exception 'Invalid kitchen interval'; end if;
    requested_start:=start_at::timestamptz;
    requested_end:=end_at::timestamptz;
    if not isfinite(requested_start) or not isfinite(requested_end)
        or requested_start<=clock_timestamp() or requested_end<=requested_start
        or requested_end-requested_start>interval '31 days'
        then raise exception 'Invalid kitchen interval'; end if;

    requested_resources:=case when amenity='kitchen' then kitchen_resources else array[amenity] end;
    select count(*)>0,
        coalesce(bool_or(b.approval_status='approved' and
            (not isfinite(b.start_time) or not isfinite(b.end_time) or b.end_time<=b.start_time)),false),
        coalesce(bool_or(b.approval_status='approved'
            and requested_start<b.end_time and requested_end>b.start_time),false)
    into known,invalid_booking,conflict from public.booking_event b
    where public.wa_booking_resources(b) && requested_resources;

    if invalid_booking then raise exception 'Kitchen availability unavailable'; end if;
    if conflict then result_status:='busy';
    elsif known or requested_resources <@ kitchen_resources then result_status:='no_approved_conflicts';
    else result_status:='unknown_amenity'; end if;

    return jsonb_build_object('status',result_status,'amenity',amenity,
        'startAt',to_char(requested_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'endAt',to_char(requested_end at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end;
$$;

revoke all on function public.wa_booking_resources(public.booking_event),
    public.list_wa_kitchen_bookings(text,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.wa_booking_resources(public.booking_event),
    public.list_wa_kitchen_bookings(text,uuid,uuid,boolean) to service_role;
notify pgrst,'reload schema';
