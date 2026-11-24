-- Synthetic-only regressions; every fixture and mock delivery is rolled back.
begin;

-- A linked, approved chef with explicit proactive consent and a fresh service window.
create function pg_temp.proactive_chef(phone text,consent boolean default true) returns uuid
language plpgsql as $$
declare result uuid:=gen_random_uuid();
begin
    insert into public.users(userid,name,email,phone,is_approved)
        values(result,'Synthetic proactive chef',result||'@example.test',phone,true);
    insert into public.whatsapp_user(chef_id,name,phone,user_id)
        values(result,'Synthetic proactive chef',phone,result);
    insert into public.chefs(id,name,wa_phone,user_id,whatsapp_user_id,opted_in_at,opt_in_method)
        values(result,'Synthetic proactive chef',phone,result,result,
            case when consent then now() end,case when consent then 'in_person' end);
    insert into public.wa_conversations(chef_id,last_inbound_at) values(result,now());
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,processed_at)
        values('inbound','meta','meta:proactive-'||result,result,phone,'hello',now(),now());
    return result;
end;
$$;

-- Uses only the booking columns common to the legacy and new product schemas.
create function pg_temp.proactive_booking(owner_id uuid,slot integer default 0) returns uuid
language plpgsql as $$
declare result uuid:=gen_random_uuid();
begin
    insert into public.booking_event(id,amenity,"user",start_time,end_time,num_people,has_conflicts,approval_status)
        values(result,'oven',owner_id,'2040-12-01 10:00Z'::timestamptz+slot*interval '1 day',
            '2040-12-01 11:00Z'::timestamptz+slot*interval '1 day',2,'{}','pending');
    return result;
end;
$$;

-- Before the initial alert sends, edits refresh that alert instead of adding noise.
do $$
#variable_conflict use_variable
declare chef uuid:=pg_temp.proactive_chef('15557710001'); request uuid:=gen_random_uuid();
    worker uuid:=gen_random_uuid(); claimed jsonb;
begin
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created,event_at)
        values(request,chef,'Synthetic first title',20,false,now(),now()+interval '10 days');
    update public.whatsapp_catering set meal_name='Synthetic current title' where catering_id=request;
    assert (select count(*)=1 from public.wa_notifications n where n.catering_id=request),'edit before alert coalesces';
    claimed:=public.claim_wa_notification('15557710001',worker);
    assert claimed->>'body' like '%Synthetic current title%','initial alert reads current facts';
    perform public.finish_wa_notification((claimed->>'id')::uuid,worker,'meta:proactive-initial');
    update public.whatsapp_catering set response_status='interested' where catering_id=request;
    update public.whatsapp_catering set meal_name=meal_name where catering_id=request;
    assert not exists(select 1 from public.wa_notifications n where n.catering_id=request and n.kind='catering_update'),
        'interest writes and no-op edits do not notify';
    update public.whatsapp_catering set location='Synthetic new venue' where catering_id=request;
    update public.whatsapp_catering set num_people=32,request_status='closed' where catering_id=request;
    assert (select count(*)=1 from public.wa_notifications n where n.catering_id=request and n.kind='catering_update'),
        'rapid post-alert changes coalesce';
    claimed:=public.claim_wa_notification('15557710001',worker);
    assert claimed->>'body' like '%Status: closed%' and claimed->>'body' like '%Guests: 32%'
        and claimed->>'body' like '%Synthetic new venue%','closure/update uses current facts';
    assert public.claim_wa_notification('15557710001',gen_random_uuid()) is null,'unknown updates are not resent';
    perform public.finish_wa_notification((claimed->>'id')::uuid,worker,'meta:proactive-update');
    update public.whatsapp_catering set event_at=now()-interval '1 day',meal_name='Past request' where catering_id=request;
    assert (select count(*)=1 from public.wa_notifications n where n.catering_id=request and n.kind='catering_update'),
        'old requests do not create new messages';
end;
$$;

-- Valid maximum-length Unicode fields cannot poison the claimed outbox entry.
do $$
#variable_conflict use_variable
declare chef uuid:=pg_temp.proactive_chef('15557710012'); request uuid:=gen_random_uuid();
    worker uuid:=gen_random_uuid(); claimed jsonb; booking_body text;
begin
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created)
        values(request,chef,'Synthetic Unicode request',20,false,now());
    update public.wa_notifications set status='sent',sent_at=now(),provider_message_id='meta:proactive-unicode-alert'
        where catering_id=request;
    update public.whatsapp_catering set meal_name=repeat('😀',255),location=repeat('😀',500),details=repeat('😀',2000)
        where catering_id=request;
    assert (select char_length(body)<=2000 from public.wa_notifications n
        where n.catering_id=request and n.kind='catering_update'),'queued Unicode update bounded';
    claimed:=public.claim_wa_notification('15557710012',worker);
    assert claimed->>'kind'='text' and char_length(claimed->>'body')<=2000
        and right(claimed->>'body',3)='...','claimed Unicode body fits JS validation with explicit truncation';
    booking_body:=public.wa_booking_update_body(jsonb_build_object('id',gen_random_uuid(),
        'title',repeat('😀',3000),'amenity',repeat('😀',3000),'approval_status','pending',
        'start_time','2040-12-01T10:00:00Z','end_time','2040-12-01T11:00:00Z','num_people',2),false);
    assert char_length(booking_body)<=2000 and right(booking_body,3)='...','booking formatter globally bounds legacy text too';
end;
$$;

-- Booking status/detail changes are scoped to the current owner and coalesce.
do $$
#variable_conflict use_variable
declare chef uuid:=pg_temp.proactive_chef('15557710002'); other uuid:=pg_temp.proactive_chef('15557710003');
    booking uuid; claimed jsonb; worker uuid:=gen_random_uuid();
begin
    booking:=pg_temp.proactive_booking(chef);
    update public.booking_event set approval_status='approved',num_people=3 where id=booking;
    assert (select count(*)=1 from public.wa_notifications n where n.booking_id=booking),'booking edits coalesce';
    assert public.claim_wa_notification('15557710003',worker) is null,'other chef cannot receive owner update';
    update public.booking_event set has_conflicts=array[gen_random_uuid()] where id=booking;
    update public.wa_conversations set human_takeover=true where chef_id=chef;
    assert public.claim_wa_notification('15557710002',worker) is null,'automated booking update pauses during takeover';
    update public.wa_conversations set human_takeover=false where chef_id=chef;
    claimed:=public.claim_wa_notification('15557710002',worker);
    assert claimed->>'phone'='15557710002' and claimed->>'body' like '%Status: approved%'
        and claimed->>'body' like '%People: 3%' and claimed->>'body' like '%2040-12-01 02:00%Oakland time%',
        'owner receives current facts in Oakland time';
    perform public.finish_wa_notification((claimed->>'id')::uuid,worker,'meta:proactive-booking-approved');
    update public.booking_event set has_conflicts='{}' where id=booking;
    assert (select count(*)=1 from public.wa_notifications n where n.booking_id=booking),'internal conflict changes do not notify';
    update public.booking_event set "user"=other where id=booking;
    assert public.claim_wa_notification('15557710002',worker) is null,'former owner sees no new booking facts';
    claimed:=public.claim_wa_notification('15557710003',worker);
    assert claimed->>'phone'='15557710003','new owner gets own reservation';
end;
$$;

-- New generic updates cannot use a catering-assignment template outside 24 hours.
do $$
#variable_conflict use_variable
declare chef uuid:=pg_temp.proactive_chef('15557710004'); booking uuid; worker uuid:=gen_random_uuid(); claimed jsonb;
begin
    booking:=pg_temp.proactive_booking(chef,1);
    update public.wa_messages set sent_at=now()-interval '25 hours' where chef_id=chef;
    assert public.claim_wa_notification('15557710004',worker,'catering_request','en_US') is null,
        'generic booking update never misuses catering template';
    assert (select n.status='blocked' and n.blocked_reason='template_required'
        from public.wa_notifications n where n.booking_id=booking),'closed-window block is visible';
    update public.wa_messages set sent_at=now() where chef_id=chef;
    claimed:=public.claim_wa_notification('15557710004',worker);
    assert claimed->>'kind'='text','chef reopening service window releases current update';
end;
$$;

-- Consent is required when enqueuing and rechecked before delivery.
do $$
#variable_conflict use_variable
declare chef uuid:=pg_temp.proactive_chef('15557710005',false); booking uuid;
begin
    booking:=pg_temp.proactive_booking(chef,2);
    assert not exists(select 1 from public.wa_notifications n where n.booking_id=booking),'no unsolicited booking updates';
    update public.chefs set opted_in_at=now(),opt_in_method='web' where id=chef;
    update public.booking_event set num_people=4 where id=booking;
    update public.chefs set opted_out_at=now() where id=chef;
    assert public.claim_wa_notification('15557710005',gen_random_uuid()) is null,'later opt-out prevents queued update';
end;
$$;

-- A reassignment while queued invalidates the old owner's delivery.
do $$
#variable_conflict use_variable
declare chef uuid:=pg_temp.proactive_chef('15557710006'); other uuid:=pg_temp.proactive_chef('15557710007'); booking uuid;
begin
    booking:=pg_temp.proactive_booking(chef,3);
    update public.booking_event set "user"=other where id=booking;
    assert public.claim_wa_notification('15557710006',gen_random_uuid()) is null,'queued former-owner update rejected';
    assert (select n.status='failed' and n.blocked_reason='booking_unavailable' from public.wa_notifications n
        where n.booking_id=booking and n.chef_id=chef),'ownership failure recorded';
end;
$$;

-- Removal notices survive deletion but never reveal a replacement owner's booking.
do $$
#variable_conflict use_variable
declare chef uuid:=pg_temp.proactive_chef('15557710008'); other uuid:=pg_temp.proactive_chef('15557710009');
    booking uuid; replacement uuid; expired uuid; claimed jsonb; worker uuid:=gen_random_uuid();
begin
    booking:=pg_temp.proactive_booking(chef,4);
    delete from public.booking_event where id=booking;
    claimed:=public.claim_wa_notification('15557710008',worker);
    assert claimed->>'body' like '%was removed.%','original owner receives removal notice';
    perform public.finish_wa_notification((claimed->>'id')::uuid,worker,'meta:proactive-booking-deleted');
    expired:=pg_temp.proactive_booking(chef,10);
    delete from public.booking_event where id=expired;
    update public.wa_notifications set booking_end_at=now()-interval '1 day' where booking_id=expired;
    assert public.claim_wa_notification('15557710008',worker) is null,'expired removal notice is not revived by a later chat';
    replacement:=pg_temp.proactive_booking(chef,5);
    delete from public.booking_event where id=replacement;
    insert into public.booking_event(id,amenity,"user",start_time,end_time,num_people,has_conflicts,approval_status)
        values(replacement,'oven',other,'2040-12-10 10:00Z','2040-12-10 11:00Z',2,'{}','pending');
    assert public.claim_wa_notification('15557710008',worker) is null,'reused booking ID cannot leak new owner facts';
end;
$$;

-- Follow-up turns see only this chef's sent notices for still-owned records.
do $$
#variable_conflict use_variable
declare chef uuid:=pg_temp.proactive_chef('15557710010'); other uuid:=pg_temp.proactive_chef('15557710011');
    request uuid:=gen_random_uuid(); stale_request uuid:=gen_random_uuid(); booking uuid; pending_booking uuid;
    foreign_booking uuid; removed_booking uuid; incoming uuid; worker uuid:=gen_random_uuid(); claimed jsonb; reference text;
begin
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created)
        values(request,chef,'Synthetic visible request',20,false,now()),
            (stale_request,chef,'Synthetic former request',20,false,now());
    update public.wa_notifications set status='sent',sent_at=now(),provider_message_id='meta:proactive-history-alert-'||catering_id
        where chef_id=chef and kind='catering_alert';
    update public.whatsapp_catering set details='Synthetic updated details' where catering_id=request;
    update public.wa_notifications set status='sent',sent_at=now(),provider_message_id='meta:proactive-history-update'
        where catering_id=request and kind='catering_update';
    update public.whatsapp_catering set chef=other where catering_id=stale_request;
    select ref_code into reference from public.whatsapp_catering where catering_id=request;
    booking:=pg_temp.proactive_booking(chef,6);
    pending_booking:=pg_temp.proactive_booking(chef,7);
    foreign_booking:=pg_temp.proactive_booking(other,8);
    removed_booking:=pg_temp.proactive_booking(chef,9);
    delete from public.booking_event where id=removed_booking;
    update public.wa_notifications set status='sent',sent_at=now(),provider_message_id='meta:proactive-history-booking-'||booking_id
        where booking_id in (booking,foreign_booking,removed_booking);
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,context_message_id)
        values('inbound','meta','meta:proactive-history-question',chef,'15557710010','what changed?',now(),
            'meta:proactive-history-update') returning id into incoming;
    claimed:=public.claim_wa_turn('15557710010',worker);
    assert jsonb_array_length(claimed#>'{state,notificationMessages}')=4,
        'context contains only own current sent alerts/update/booking/removal';
    assert claimed#>>'{state,quotedCateringRequest,reference}'=reference,'swipe-reply to update binds current assignment';
    assert not exists(select 1 from jsonb_array_elements(claimed#>'{state,notificationMessages}') n
        where n->>'body' like '%'||left(pending_booking::text,8)||'%'
            or n->>'body' like '%'||left(foreign_booking::text,8)||'%'
            or n->>'body' like '%Synthetic former request%'), 'pending, foreign and reassigned notices excluded';
    update public.wa_messages set processed_at=now() where id=incoming;
    perform public.release_wa_turn(chef,worker);
    update public.whatsapp_catering set chef=other where catering_id=request;
    update public.booking_event set "user"=other where id=booking;
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,context_message_id)
        values('inbound','meta','meta:proactive-history-reassigned',chef,'15557710010','what changed?',now(),
            'meta:proactive-history-update');
    claimed:=public.claim_wa_turn('15557710010',worker);
    assert jsonb_array_length(claimed#>'{state,notificationMessages}')=1,'only own deletion notice remains after reassignment';
    assert claimed#>'{state,quotedCateringRequest}' is null,'quoted stale update never binds old assignment';
end;
$$;

-- Trigger functions cannot be invoked through a chef/browser credential.
set local role authenticated;
do $$
begin
    assert not has_function_privilege(current_user,'public.queue_wa_booking_update()','EXECUTE'),'booking trigger server-only';
    assert not has_function_privilege(current_user,'public.queue_wa_catering_update()','EXECUTE'),'catering trigger server-only';
    assert not has_function_privilege(current_user,'public.claim_wa_notification(text,uuid,text,text)','EXECUTE'),'claim server-only';
end;
$$;
reset role;
rollback;
