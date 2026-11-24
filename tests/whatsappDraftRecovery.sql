-- Synthetic draft/outbox regressions. Roll back fixtures and provider responses.
begin;

do $$
declare
    chef_id uuid:=gen_random_uuid();
    first_worker uuid:=gen_random_uuid();
    second_worker uuid:=gen_random_uuid();
    target_phone text:='15557714412';
    initial_request_id uuid:=gen_random_uuid();
    closed_request_id uuid:=gen_random_uuid();
    failed_request_id uuid:=gen_random_uuid();
    removed_booking_id uuid:=gen_random_uuid();
    original_body text;
    alert_id uuid;
    claim jsonb;
begin
    assert not has_function_privilege('authenticated','public.claim_wa_notification(text,uuid,text,text)','execute');
    assert not has_function_privilege('authenticated','public.claim_wa_notification_candidate(text,uuid,text,text)','execute');
    assert not has_function_privilege('authenticated','public.abandon_wa_agent_notice(uuid,uuid)','execute');
    insert into public.users(userid,name,email,phone,is_approved)
        values(chef_id,'Synthetic Draft Chef','draft-check@example.test',target_phone,true);
    insert into public.whatsapp_user(chef_id,name,phone,user_id)
        values(chef_id,'Synthetic Draft Chef',target_phone,chef_id);
    insert into public.chefs(id,name,wa_phone,user_id,whatsapp_user_id,opted_in_at,opt_in_method)
        values(chef_id,'Synthetic Draft Chef',target_phone,chef_id,chef_id,now(),'in_person');
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,processed_at)
        values('inbound','meta','meta:draft-check-hi',chef_id,target_phone,'hey',now(),now());

    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created,event_at)
        values(initial_request_id,chef_id,'Initial assignment',10,false,now(),now()+interval '10 days');
    claim:=public.claim_wa_notification_for_agent(target_phone,first_worker);
    alert_id:=(claim->>'id')::uuid;
    assert alert_id is not null;
    assert (select draft_expires_at>clock_timestamp() from public.wa_notifications where id=alert_id);
    assert public.claim_wa_notification_for_agent(target_phone,second_worker) is null;

    -- A worker lost before Meta never owns a delivery. Editing its draft queues no follow-up.
    update public.whatsapp_catering r set meal_name='Edited assignment' where r.catering_id=initial_request_id;
    assert not exists(select 1 from public.wa_notifications n
        where n.catering_id=initial_request_id and n.kind='catering_update');
    update public.wa_notifications set draft_expires_at=clock_timestamp()-interval '1 second' where id=alert_id;
    claim:=public.claim_wa_notification_for_agent(target_phone,second_worker);
    assert (claim->>'id')::uuid=alert_id and claim#>>'{facts,title}'='Edited assignment';
    assert not public.prepare_wa_agent_notice(alert_id,first_worker,'Old draft.',target_phone);
    assert public.prepare_wa_agent_notice(alert_id,second_worker,'Your new assignment.',target_phone);
    assert not public.prepare_wa_agent_notice(alert_id,second_worker,'Second attempt.',target_phone);

    -- A restart after preparing cannot know if Meta accepted. This row must not be retried.
    update public.wa_notifications set send_started_at=clock_timestamp()-interval '2 hours' where id=alert_id;
    assert public.claim_wa_notification_for_agent(target_phone,first_worker) is null;
    assert (select status='unknown' and draft_expires_at is null from public.wa_notifications where id=alert_id);

    -- Changes during the provider round trip wait until the first alert is accepted.
    update public.whatsapp_catering r set num_people=15 where r.catering_id=initial_request_id;
    assert exists(select 1 from public.wa_notifications n
        where n.catering_id=initial_request_id and n.kind='catering_update' and n.status='pending');
    assert public.claim_wa_notification_for_agent(target_phone,first_worker) is null;
    perform public.finish_wa_notification(alert_id,second_worker,'meta:draft-check-accepted');
    claim:=public.claim_wa_notification_for_agent(target_phone,first_worker);
    assert claim#>>'{facts,notificationKind}'='catering_update' and claim#>>'{facts,guestCount}'='15';
    assert public.prepare_wa_agent_notice((claim->>'id')::uuid,first_worker,'The guest count changed.',target_phone);
    perform public.finish_wa_notification((claim->>'id')::uuid,first_worker,'meta:draft-check-update');

    -- A closure before drafting completes was never announced.
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created,event_at)
        values(closed_request_id,chef_id,'Closed before send',10,false,now(),now()+interval '11 days');
    claim:=public.claim_wa_notification_for_agent(target_phone,first_worker);
    update public.whatsapp_catering r set request_status='closed' where r.catering_id=closed_request_id;
    assert not public.prepare_wa_agent_notice((claim->>'id')::uuid,first_worker,'New assignment.',target_phone);
    assert not exists(select 1 from public.wa_notifications n
        where n.catering_id=closed_request_id and n.kind='catering_update');

    -- A provider refusal makes a waiting follow-up ineligible, including for legacy workers.
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created,event_at)
        values(failed_request_id,chef_id,'Refused by provider',10,false,now(),now()+interval '12 days');
    claim:=public.claim_wa_notification_for_agent(target_phone,first_worker);
    assert public.prepare_wa_agent_notice((claim->>'id')::uuid,first_worker,'Another assignment.',target_phone);
    update public.whatsapp_catering r set meal_name='Edited during provider call' where r.catering_id=failed_request_id;
    perform public.fail_wa_notification((claim->>'id')::uuid,first_worker);
    assert public.claim_wa_notification(target_phone,second_worker) is null;
    assert exists(select 1 from public.wa_notifications n where n.catering_id=failed_request_id
        and n.kind='catering_update' and n.status='failed' and n.blocked_reason='initial_alert_unsent');

    -- The worker can safely abandon after a lost prepare response, but the
    -- original deletion snapshot must survive to render the next attempt.
    insert into public.booking_event(id,amenity,"user",start_time,end_time,num_people,has_conflicts,approval_status)
        values(removed_booking_id,'oven',chef_id,'2041-04-16T10:00:00Z','2041-04-16T11:00:00Z',2,'{}','pending');
    delete from public.booking_event where id=removed_booking_id;
    claim:=public.claim_wa_notification_for_agent(target_phone,first_worker);
    alert_id:=(claim->>'id')::uuid;
    original_body:=claim->>'body';
    assert claim#>>'{facts,status}'='removed' and claim#>>'{facts,title}' is not null;
    assert public.prepare_wa_agent_notice(alert_id,first_worker,'Your booking was removed.',target_phone);
    perform public.abandon_wa_agent_notice(alert_id,second_worker);
    assert (select status='unknown' from public.wa_notifications where id=alert_id);
    perform public.abandon_wa_agent_notice(alert_id,first_worker);
    assert (select status='pending' and body=original_body and draft_source_body is null
        from public.wa_notifications where id=alert_id);
    claim:=public.claim_wa_notification_for_agent(target_phone,second_worker);
    assert (claim->>'id')::uuid=alert_id and claim#>>'{facts,title}' is not null;
    perform public.abandon_wa_agent_notice(alert_id,first_worker);
    assert public.prepare_wa_agent_notice(alert_id,second_worker,'Your booking was removed.',target_phone);
    perform public.finish_wa_notification(alert_id,second_worker,'meta:draft-check-removed');
    assert (select status='sent' and draft_source_body is null from public.wa_notifications where id=alert_id);
end;
$$;

rollback;
