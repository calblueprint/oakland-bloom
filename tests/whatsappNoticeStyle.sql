-- Synthetic-only style regressions. Roll back all fixtures and mock deliveries.
begin;

do $$
declare
    chef_id uuid:=gen_random_uuid();
    worker uuid:=gen_random_uuid();
    target_phone text:='15557714411';
    booking_id uuid:=gen_random_uuid();
    request_id uuid:=gen_random_uuid();
    staff_id uuid:=gen_random_uuid();
    staff_text text:=E'Hi Chef, a quick note.\n\nPlease call the kitchen.';
    alert jsonb;
    booking jsonb;
    staff jsonb;
begin
    assert not has_function_privilege('anon','public.claim_wa_notification_for_agent(text,uuid,text,text)','execute');
    assert not has_function_privilege('authenticated','public.prepare_wa_agent_notice(uuid,uuid,text,text)','execute');
    assert has_function_privilege('service_role','public.prepare_wa_agent_notice(uuid,uuid,text,text)','execute');
    insert into public.users(userid,name,email,phone,is_approved,is_admin)
        values(chef_id,'Synthetic Style Chef','style-check@example.test',target_phone,true,true);
    insert into public.whatsapp_user(chef_id,name,phone,user_id)
        values(chef_id,'Synthetic Style Chef',target_phone,chef_id);
    insert into public.chefs(id,name,wa_phone,user_id,whatsapp_user_id,opted_in_at,opt_in_method)
        values(chef_id,'Synthetic Style Chef',target_phone,chef_id,chef_id,now(),'in_person');
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,processed_at)
        values('inbound','meta','meta:style-check-hi',chef_id,target_phone,'hey',now(),now());

    -- Deliver agent text only with the original claim. Future chat context gets the exact text.
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created,event_at)
        values(request_id,chef_id,'Synthetic style request',10,false,now(),now()+interval '10 days');
    alert:=public.claim_wa_notification_for_agent(target_phone,worker);
    assert alert#>>'{facts,notificationKind}'='catering_alert' and alert#>>'{facts,title}'='Synthetic style request';
    assert not public.prepare_wa_agent_notice((alert->>'id')::uuid,gen_random_uuid(),'Wrong worker',target_phone);
    assert public.prepare_wa_agent_notice((alert->>'id')::uuid,worker,'Catering for your kitchen.',target_phone);
    perform public.finish_wa_notification((alert->>'id')::uuid,worker,'meta:style-check-alert');
    assert (select body='Catering for your kitchen.' and status='sent' from public.wa_notifications
        where id=(alert->>'id')::uuid);
    update public.whatsapp_catering o set details=repeat('x',801) where o.catering_id=request_id;
    alert:=public.claim_wa_notification_for_agent(target_phone,worker);
    assert alert#>>'{facts,details}'=repeat('x',799)||'…';
    assert public.prepare_wa_agent_notice((alert->>'id')::uuid,worker,'The details changed.',target_phone);
    perform public.finish_wa_notification((alert->>'id')::uuid,worker,'meta:style-check-details');

    -- Preserve staff text exactly, including line breaks.
    perform public.set_wa_staff_takeover(chef_id,chef_id,true);
    perform public.queue_wa_staff_reply(chef_id,chef_id,staff_text,staff_id);
    staff:=public.claim_wa_notification_for_agent(target_phone,worker);
    assert staff->>'kind'='text' and staff->>'body'=staff_text and not(staff ? 'facts');
    assert not public.prepare_wa_agent_notice((staff->>'id')::uuid,worker,'Attempt to rewrite staff reply',target_phone);
    perform public.finish_wa_notification((staff->>'id')::uuid,worker,'meta:style-check-staff');
    perform public.set_wa_staff_takeover(chef_id,chef_id,false);

    -- The worker discards a draft if a newer booking update arrives during inference.
    insert into public.booking_event(id,amenity,"user",start_time,end_time,num_people,has_conflicts,approval_status)
        values(booking_id,'oven',chef_id,'2041-04-15T10:00:00Z','2041-04-15T11:00:00Z',2,'{}','pending');
    booking:=public.claim_wa_notification_for_agent(target_phone,worker);
    assert booking#>>'{facts,status}'='pending' and booking#>>'{facts,guestCount}'='2';
    update public.booking_event b set approval_status='approved' where b.id=booking_id;
    assert not public.prepare_wa_agent_notice((booking->>'id')::uuid,worker,'Still pending.',target_phone);
    assert (select status='failed' and blocked_reason='superseded' from public.wa_notifications
        where id=(booking->>'id')::uuid);
    booking:=public.claim_wa_notification_for_agent(target_phone,worker);
    assert booking#>>'{facts,status}'='approved' and booking#>>'{facts,amenities,0}'='oven';

    -- STOP that comes in while the agent writes must still prevent the provider call.
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at)
        values('inbound','meta','meta:style-check-stop',chef_id,target_phone,'STOP!',now());
    assert not public.prepare_wa_agent_notice((booking->>'id')::uuid,worker,'All set.',target_phone);
    assert (select status='blocked' and blocked_reason='opted_out' from public.wa_notifications
        where id=(booking->>'id')::uuid);
end;
$$;

rollback;
