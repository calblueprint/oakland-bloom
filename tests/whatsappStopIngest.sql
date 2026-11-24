-- The production ingest transaction records consent without sending any messages.
begin;

create function pg_temp.ingest_stop_test(
    phone text, received_text text, message_id text, sent_at timestamptz, media jsonb default null
) returns void language sql as $$
    select public.ingest_inbound(jsonb_build_object('rejected','[]'::jsonb,'messages',
        jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
            'provider','meta','providerMessageId',message_id,'from',phone,
            'text',received_text,'sentAt',sent_at,'media',media)))));
$$;

do $$
declare
    chef uuid:=gen_random_uuid();
    staff uuid:=gen_random_uuid();
    target_phone text:='15557714522';
    original_opt_in timestamptz:=now()-interval '3 days';
    old_stop timestamptz:=now()-interval '26 hours';
    latest_opt_in timestamptz;
    worker uuid:=gen_random_uuid();
begin
    assert not has_function_privilege('anon','public.wa_apply_inbound_stop(uuid)','execute');
    assert not has_function_privilege('authenticated','public.ingest_inbound(jsonb)','execute');
    assert has_function_privilege('service_role','public.wa_apply_inbound_stop(uuid)','execute');

    insert into public.users(userid,name,email,phone,is_approved,is_admin)
    values(chef,'Synthetic consent chef','stop-ingest-chef@example.test',target_phone,true,false),
          (staff,'Synthetic consent staff','stop-ingest-staff@example.test','15557714523',true,true);
    insert into public.whatsapp_user(chef_id,name,phone,user_id)
    values(chef,'Synthetic consent chef',target_phone,chef);
    insert into public.chefs(id,name,wa_phone,user_id,whatsapp_user_id,opted_in_at,opt_in_method)
    values(chef,'Synthetic consent chef',target_phone,chef,chef,original_opt_in,'in_person');
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created,event_at)
    values(gen_random_uuid(),chef,'Synthetic consent request',10,false,now(),now()+interval '10 days');
    assert (select count(*)=1 from public.wa_notifications n where n.chef_id=chef and n.status='pending');

    -- Neither ordinary sentences nor a media caption is a stored text opt-out.
    perform pg_temp.ingest_stop_test(target_phone,'Please stop by after lunch.','meta:stop-ingest-ordinary',now());
    perform pg_temp.ingest_stop_test(target_phone,'STOP','meta:stop-ingest-caption',now(),
        '{"kind":"image","mediaId":"synthetic-caption","mimeType":"image/jpeg"}');
    assert (select opted_out_at is null from public.chefs where id=chef);
    assert (select processed_at is null from public.wa_messages where provider_message_id='meta:stop-ingest-ordinary');
    update public.wa_messages set processed_at=now() where provider_message_id='meta:stop-ingest-caption';

    -- Explicit opt-out works at ingest, even before the worker sees this inbox
    -- and after the sender's 24-hour reply window has expired.
    perform pg_temp.ingest_stop_test(target_phone,E' \t unSubScriBe! \r\n','meta:stop-ingest-late',old_stop);
    assert (select opted_out_at=old_stop from public.chefs where id=chef);
    assert (select processed_at is not null from public.wa_messages where provider_message_id='meta:stop-ingest-late');
    assert (select count(*)=1 from public.wa_notifications n
        where n.chef_id=chef and n.status='blocked' and n.blocked_reason='opted_out');
    perform pg_temp.ingest_stop_test(target_phone,'What is new?','meta:stop-ingest-reopen',now());
    assert public.claim_wa_notification_for_agent(target_phone,worker) is null,
        'a recent message cannot undo a recorded STOP';
    assert public.claim_wa_turn(target_phone,worker) is null;

    -- A new explicit opt-in wins over both exact webhook retries and an older
    -- STOP first delivered after that consent.
    perform public.set_wa_alert_consent(staff,chef,true,'Synthetic explicit renewed consent');
    select opted_in_at into latest_opt_in from public.chefs where id=chef;
    perform pg_temp.ingest_stop_test(target_phone,'STOP','meta:stop-ingest-late',old_stop);
    perform pg_temp.ingest_stop_test(target_phone,'STOP','meta:stop-ingest-after-renewal',latest_opt_in-interval '1 minute');
    assert (select opted_in_at=latest_opt_in and opted_out_at is null from public.chefs where id=chef);
    assert (select count(*)=1 from public.wa_messages where provider_message_id='meta:stop-ingest-late');
    assert (select processed_at is not null from public.wa_messages where provider_message_id='meta:stop-ingest-after-renewal');

    -- The upgrade backfill uses the same helper. Unprocessed historical rows
    -- must respect current consent and be consumed without another worker pass.
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,received_at)
    values('inbound','meta','meta:stop-ingest-backfill',chef,target_phone,E'\nSTOP.\t',
        latest_opt_in-interval '2 days',latest_opt_in-interval '1 day');
    perform public.wa_apply_inbound_stop(
        (select id from public.wa_messages where provider_message_id='meta:stop-ingest-backfill'));
    assert (select processed_at is not null from public.wa_messages where provider_message_id='meta:stop-ingest-backfill');
    assert (select opted_out_at is null from public.chefs where id=chef);
end;
$$;

rollback;
