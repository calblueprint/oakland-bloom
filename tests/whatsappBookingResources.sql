-- Exercise canonical booking resources and quote ownership without changing fixtures.
begin;
alter table public.booking_event add column if not exists title text,
    add column if not exists amenities text[];

do $$
declare
    owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid();
    booking_id uuid:=gen_random_uuid(); other_booking_id uuid:=gen_random_uuid();
    worker_id uuid:=gen_random_uuid(); inbound_id uuid;
    owner_chef uuid; other_chef uuid; claimed jsonb; rows jsonb;
    slot_start timestamptz:=date_trunc('hour',clock_timestamp())+interval '297 days';
    start_at text; end_at text;
begin
    insert into public.users(userid,name,email,phone,is_admin,is_approved) values
        (owner_id,'Kitchen resource test','kitchen-resources@example.test','15552231001',false,true),
        (other_id,'Other resource test','other-kitchen-resources@example.test','15552231002',false,true);
    owner_chef:=public.resolve_wa_chef('15552231001');
    other_chef:=public.resolve_wa_chef('15552231002');

    insert into public.booking_event
        (id,"user",title,amenity,amenities,start_time,end_time,num_people,has_conflicts,approval_status) values
        (booking_id,owner_id,'Catering prep','kitchen',array['bar_prep_table','oven'],
            slot_start,slot_start+interval '1 hour',3,'{}','approved'),
        (other_booking_id,other_id,'Private event','kitchen',array['bar_prep_table','oven'],
            slot_start+interval '2 hours',slot_start+interval '3 hours',2,'{}','approved');

    insert into public.wa_notifications
        (chef_id,kind,booking_id,booking_owner,booking_end_at,body,status,provider_message_id,sent_at) values
        (owner_chef,'booking_update',booking_id,owner_id,slot_start+interval '1 hour',
          'Booking approved','sent','meta:resource-test-own-notice',clock_timestamp()),
        (other_chef,'booking_update',other_booking_id,other_id,slot_start+interval '3 hours',
          'Other booking approved','sent','meta:resource-test-other-notice',clock_timestamp());

    perform public.ingest_inbound(jsonb_build_object('rejected','[]'::jsonb,'messages',jsonb_build_array(
        jsonb_build_object('provider','meta','providerMessageId','meta:resource-test-reply',
          'from','15552231001','text','What equipment is included?',
          'contextMessageId','meta:resource-test-own-notice',
          'sentAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))));
    claimed:=public.claim_wa_turn('15552231001',worker_id);
    inbound_id:=(claimed->>'inboundId')::uuid;
    assert inbound_id is not null,'inbound leased';

    set local role service_role;
    rows:=public.list_wa_kitchen_bookings('15552231001',worker_id,inbound_id,true);
    assert jsonb_array_length(rows)=1,'own booking only';
    assert rows->0->>'id'=booking_id::text and rows->0->>'title'='Catering prep','own booking title';
    assert rows->0->'amenities'='["bar_prep_table","oven"]'::jsonb
        and rows->0->>'quoted'='true','canonical equipment and exact quote';
    rows:=public.list_wa_kitchen_bookings('15552231001',worker_id,inbound_id);
    assert rows->0->>'amenity'='kitchen' and not (rows->0 ? 'amenities'),'legacy payload preserved';

    start_at:=to_char((slot_start+interval '2 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    end_at:=to_char((slot_start+interval '3 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    assert public.check_wa_kitchen_availability('15552231001',worker_id,inbound_id,'oven',start_at,end_at)->>'status'='busy',
        'other chef multiresource reservation blocks the oven';
    assert public.check_wa_kitchen_availability('15552231001',worker_id,inbound_id,'bar_prep_table',start_at,end_at)->>'status'='busy',
        'other chef multiresource reservation blocks the prep table';
    assert public.check_wa_kitchen_availability('15552231001',worker_id,inbound_id,'salad_bar_table',start_at,end_at)->>'status'='no_approved_conflicts',
        'legacy kitchen summary does not block unselected equipment';
    assert public.check_wa_kitchen_availability('15552231001',worker_id,inbound_id,'kitchen',start_at,end_at)->>'status'='busy',
        'whole-kitchen requests conflict with partial bookings';
    reset role;

    update public.wa_messages m set context_message_id='meta:resource-test-other-notice' where m.id=inbound_id;
    rows:=public.list_wa_kitchen_bookings('15552231001',worker_id,inbound_id,true);
    assert jsonb_array_length(rows)=1 and not (rows->0 ? 'quoted'),'no marker for another chef notice';

    update public.wa_messages m set context_message_id='meta:resource-test-own-notice' where m.id=inbound_id;
    update public.booking_event b set "user"=other_id where b.id=booking_id;
    rows:=public.list_wa_kitchen_bookings('15552231001',worker_id,inbound_id,true);
    assert rows='[]'::jsonb,'previous owner cannot see reassigned booking';

    assert not has_function_privilege('authenticated','public.list_wa_kitchen_bookings(text,uuid,uuid,boolean)','execute'),
        'browser cannot invoke expanded list RPC';
end;
$$;

rollback;
