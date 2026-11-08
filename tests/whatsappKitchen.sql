-- Run only against a disposable database with the WhatsApp migrations applied.
-- All fixtures and checks roll back; these tools never create kitchen bookings.
begin;

-- Calls an existing leased read and requires a fail-closed access error.
create function pg_temp.expect_kitchen_denied(phone text, worker uuid, message uuid)
returns void language plpgsql as $$
begin
    begin
        perform public.list_wa_kitchen_bookings(phone,worker,message);
        raise exception 'Unexpected kitchen access';
    exception when raise_exception then
        if sqlerrm<>'Kitchen access unavailable' then raise; end if;
    end;
end;
$$;

-- Creates one inbound through the real signature-independent ingest/claim path.
create function pg_temp.kitchen_turn(phone text, worker uuid, message_id text)
returns jsonb language plpgsql as $$
begin
    perform public.ingest_inbound(jsonb_build_object('rejected','[]'::jsonb,'messages',jsonb_build_array(
        jsonb_build_object('provider','meta','providerMessageId',message_id,'from',phone,
            'text','Show my kitchen bookings','sentAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))));
    return public.claim_wa_turn(phone,worker);
end;
$$;

-- Approved users see only their own rows. Availability hides other owners and
-- follows the existing approved-only, strict-overlap/adjacent-allowed rule.
do $$
declare
    a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid();
    own_booking uuid:=gen_random_uuid(); other_booking uuid:=gen_random_uuid();
    worker uuid:=gen_random_uuid(); inbound uuid; chef uuid; claimed jsonb; result jsonb;
    slot_start timestamptz:=date_trunc('day',clock_timestamp())+interval '2 days 20 hours';
    start_text text; end_text text; row_count bigint; function_name text; actor text;
    invalid_range text[];
begin
    insert into public.users(userid,name,email,phone,is_admin,is_approved)
    values(a,'Kitchen A','kitchen-a@example.test','15552230001',false,true),
        (b,'Kitchen B','kitchen-b@example.test','15552230002',false,true),
        (admin_id,'Kitchen Admin','kitchen-admin@example.test','15552230003',true,true);
    insert into public.booking_event(id,"user",amenity,start_time,end_time,num_people,has_conflicts,approval_status)
    values(own_booking,a,'TEST Kitchen Oven',slot_start,slot_start+interval '1 hour',3,'{}','approved'),
        (gen_random_uuid(),a,'TEST Prep Table',slot_start,slot_start+interval '1 hour',3,'{}','pending'),
        (gen_random_uuid(),a,'TEST Prep Table',slot_start-interval '1 day',slot_start-interval '23 hours',3,'{}','denied'),
        (other_booking,b,'TEST Kitchen Oven',slot_start+interval '2 hours',slot_start+interval '3 hours',3,'{}','approved'),
        (gen_random_uuid(),b,'TEST Kitchen Oven',slot_start+interval '4 hours',slot_start+interval '5 hours',3,'{}','pending');
    claimed:=pg_temp.kitchen_turn('15552230001',worker,'meta:kitchen-own');
    inbound:=(claimed->>'inboundId')::uuid;
    chef:=(claimed#>>'{state,chefs,0,id}')::uuid;
    assert inbound is not null,'inbound leased';
    select count(*) into row_count from public.booking_event;

    set local role service_role;
    result:=public.list_wa_kitchen_bookings('15552230001',worker,inbound);
    reset role;
    assert jsonb_array_length(result)=3,'own approved/pending/denied rows';
    assert exists(select 1 from jsonb_array_elements(result) r where r->>'id'=own_booking::text),'own row exists';
    assert not exists(select 1 from jsonb_array_elements(result) r
        where r->>'id'=other_booking::text or r ? 'user' or r ? 'phone'),'no other owner or contacts';

    start_text:=to_char((slot_start+interval '2 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    end_text:=to_char((slot_start+interval '3 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    result:=public.check_wa_kitchen_availability('15552230001',worker,inbound,'TEST Kitchen Oven',start_text,end_text);
    assert result->>'status'='busy','other chef approved booking blocks';
    assert result-array['status','amenity','startAt','endAt']='{}'::jsonb,'availability contains no owner or booking identifiers';

    start_text:=to_char((slot_start+interval '1 hour') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    end_text:=to_char((slot_start+interval '2 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    result:=public.check_wa_kitchen_availability('15552230001',worker,inbound,'TEST Kitchen Oven',start_text,end_text);
    assert result->>'status'='no_approved_conflicts','adjacent bookings allowed';
    result:=public.check_wa_kitchen_availability('15552230001',worker,inbound,'TEST Kitchen Oven',
        to_char((slot_start+interval '4 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        to_char((slot_start+interval '5 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    assert result->>'status'='no_approved_conflicts','pending booking does not block';
    result:=public.check_wa_kitchen_availability('15552230001',worker,inbound,'test kitchen oven',start_text,end_text);
    assert result->>'status'='unknown_amenity','unknown case is not guessed';
    result:=public.check_wa_kitchen_availability('15552230001',worker,inbound,'Unknown room',start_text,end_text);
    assert result->>'status'='unknown_amenity','unknown amenities fail closed';

    -- Bad dates, past/equal/reversed ranges and excessive query windows are errors.
    foreach invalid_range slice 1 in array array[
        array[replace(start_text,'Z',''),end_text],
        array[start_text,start_text],
        array[end_text,start_text],
        array['2000-01-01T00:00:00Z','2000-01-01T01:00:00Z'],
        array[start_text,to_char((slot_start+interval '40 days') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')]
    ] loop
        begin
            perform public.check_wa_kitchen_availability('15552230001',worker,inbound,'TEST Kitchen Oven',invalid_range[1],invalid_range[2]);
            raise exception 'Accepted invalid interval';
        exception when raise_exception then
            if sqlerrm<>'Invalid kitchen interval' then raise; end if;
        end;
    end loop;

    -- All reads require this exact fresh inbound and its current worker lease.
    perform pg_temp.expect_kitchen_denied('15552230001',gen_random_uuid(),inbound);
    perform pg_temp.expect_kitchen_denied('15552230001',worker,gen_random_uuid());
    perform pg_temp.expect_kitchen_denied('15552230002',worker,inbound);
    update public.wa_conversations set lease_until=clock_timestamp()-interval '1 second' where chef_id=chef;
    perform pg_temp.expect_kitchen_denied('15552230001',worker,inbound);
    update public.wa_conversations set lease_until=clock_timestamp()+interval '90 seconds',human_takeover=true where chef_id=chef;
    perform pg_temp.expect_kitchen_denied('15552230001',worker,inbound);
    update public.wa_conversations set human_takeover=false where chef_id=chef;
    update public.chefs set opted_out_at=clock_timestamp() where id=chef;
    perform pg_temp.expect_kitchen_denied('15552230001',worker,inbound);
    update public.chefs set opted_out_at=null where id=chef;
    update public.users set is_approved=false where userid=a;
    perform pg_temp.expect_kitchen_denied('15552230001',worker,inbound);
    update public.users set is_approved=true where userid=a;
    update public.wa_messages set processed_at=clock_timestamp() where id=inbound;
    perform pg_temp.expect_kitchen_denied('15552230001',worker,inbound);
    update public.wa_messages set processed_at=null where id=inbound;
    assert (select count(*)=row_count from public.booking_event),'kitchen tools never write bookings';

    -- A malformed stored approved interval is not silently reported available.
    update public.booking_event b set end_time=b.start_time where b.id=other_booking;
    begin
        perform public.check_wa_kitchen_availability('15552230001',worker,inbound,'TEST Kitchen Oven',start_text,end_text);
        raise exception 'Ignored malformed approved booking';
    exception when raise_exception then
        if sqlerrm<>'Kitchen availability unavailable' then raise; end if;
    end;
    update public.booking_event b set end_time=b.start_time+interval '1 hour' where b.id=other_booking;

    -- Being an admin does not turn the chef-facing lookup into an all-user read.
    claimed:=pg_temp.kitchen_turn('15552230003',worker,'meta:kitchen-admin');
    result:=public.list_wa_kitchen_bookings('15552230003',worker,(claimed->>'inboundId')::uuid);
    assert result='[]'::jsonb,'admin chef-facing scope is still own rows only';

    -- Every RPC and its authorization helper deny browser roles entirely.
    foreach function_name in array array[
        'public.wa_kitchen_user(text,uuid,uuid)',
        'public.list_wa_kitchen_bookings(text,uuid,uuid)',
        'public.check_wa_kitchen_availability(text,uuid,uuid,text,text,text)'
    ] loop
        foreach actor in array array['anon','authenticated'] loop
            assert not has_function_privilege(actor,function_name,'execute'),'browser cannot call kitchen RPC';
        end loop;
        assert has_function_privilege('service_role',function_name,'execute'),'server can call kitchen RPC';
    end loop;
    begin
        set local role anon;
        perform public.list_wa_kitchen_bookings('15552230001',worker,inbound);
        raise exception 'Anonymous kitchen access';
    exception when insufficient_privilege then reset role;
    end;
    begin
        set local role authenticated;
        perform public.check_wa_kitchen_availability('15552230001',worker,inbound,'TEST Kitchen Oven',start_text,end_text);
        raise exception 'Authenticated kitchen access';
    exception when insufficient_privilege then reset role;
    end;
end;
$$;

-- Legacy WhatsApp-only identities cannot borrow another user's kitchen account.
do $$
declare worker uuid:=gen_random_uuid(); claimed jsonb;
begin
    insert into public.whatsapp_user(chef_id,name,phone)
    values(gen_random_uuid(),'Kitchen legacy-only','15552230004');
    claimed:=pg_temp.kitchen_turn('15552230004',worker,'meta:kitchen-no-web');
    assert claimed->>'inboundId' is not null,'legacy chef can still chat';
    perform pg_temp.expect_kitchen_denied('15552230004',worker,(claimed->>'inboundId')::uuid);
end;
$$;

rollback;
