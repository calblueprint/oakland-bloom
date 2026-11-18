-- Synthetic tests for abandoned provider calls. Fixtures roll back.
begin;
do $$
declare
    chef uuid:=gen_random_uuid();
    other_chef uuid:=gen_random_uuid();
    worker uuid:=gen_random_uuid();
    new_worker uuid:=gen_random_uuid();
    target_phone constant text:='15557714419';
    other_phone constant text:='15557714420';
    gig uuid:=gen_random_uuid();
    next_gig uuid:=gen_random_uuid();
    prior_inbound uuid:=gen_random_uuid();
    next_inbound uuid:=gen_random_uuid();
    reply_id uuid:=gen_random_uuid();
    notice_id uuid;
    next_notice_id uuid;
    prepared_body constant text:='New catering assignment.';
    claim jsonb;
begin
    assert has_function_privilege('service_role','public.resume_wa_after_uncertain_send(text)','execute');
    assert not has_function_privilege('authenticated','public.resume_wa_after_uncertain_send(text)','execute');
    insert into public.users(userid,name,email,phone,is_approved) values
        (chef,'Synthetic recovery chef','wa-resume@example.test',target_phone,true),
        (other_chef,'Synthetic other chef','wa-resume-other@example.test',other_phone,true);
    insert into public.whatsapp_user(chef_id,name,phone,user_id) values
        (chef,'Synthetic recovery chef',target_phone,chef),
        (other_chef,'Synthetic other chef',other_phone,other_chef);
    insert into public.chefs(id,name,wa_phone,user_id,whatsapp_user_id,opted_in_at,opt_in_method) values
        (chef,'Synthetic recovery chef',target_phone,chef,chef,now(),'in_person'),
        (other_chef,'Synthetic other chef',other_phone,other_chef,other_chef,now(),'in_person');
    insert into public.wa_messages(id,direction,provider,provider_message_id,chef_id,phone,body,sent_at,processed_at)
        values(prior_inbound,'inbound','meta','meta:resume-initial',chef,target_phone,'interested',now(),now());
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created,event_at)
        values(gig,chef,'Synthetic recovery catering',10,false,now(),now()+interval '10 days');
    claim:=public.claim_wa_notification_for_agent(target_phone,worker);
    notice_id:=(claim->>'id')::uuid;
    assert notice_id is not null;
    assert public.prepare_wa_agent_notice(notice_id,worker,prepared_body,target_phone);

    insert into public.wa_messages(id,direction,provider,chef_id,phone,body,reply_to_message_id,
        send_status,send_owner,send_started_at) values(reply_id,'outbound','meta',chef,target_phone,
        'Should I record your interest?',prior_inbound,'unknown',worker,clock_timestamp());
    insert into public.pending_confirmations(chef_id,catering_id,source_message_id,interested,expires_at)
        values(chef,gig,'meta:resume-initial',true,clock_timestamp()+interval '10 minutes');
    insert into public.wa_messages(id,direction,provider,provider_message_id,chef_id,phone,body,sent_at)
        values(next_inbound,'inbound','meta','meta:resume-next',chef,target_phone,'what time?',now());

    -- The next message waits during active sends, rather than racing them.
    assert public.resume_wa_after_uncertain_send(target_phone)=0;
    assert public.claim_wa_turn(target_phone,new_worker) is null;
    update public.wa_messages set send_started_at=clock_timestamp()-interval '3 minutes' where id=reply_id;
    update public.wa_notifications set send_started_at=clock_timestamp()-interval '3 minutes' where id=notice_id;
    assert public.resume_wa_after_uncertain_send(other_phone)=0;
    assert public.resume_wa_after_uncertain_send(target_phone)=2;
    assert public.resume_wa_after_uncertain_send(target_phone)=0;
    assert (select status='review' and blocked_reason='delivery_uncertain'
            and body=prepared_body and send_owner=worker and draft_source_body is null
        from public.wa_notifications where id=notice_id);
    assert (select send_status='review' and send_owner=worker from public.wa_messages where id=reply_id);
    assert (select expires_at<=clock_timestamp() from public.pending_confirmations p where p.chef_id=chef);
    assert public.claim_wa_reply(target_phone,new_worker) is null;
    assert public.claim_wa_notification_for_agent(target_phone,new_worker) is null;
    claim:=public.claim_wa_turn(target_phone,new_worker);
    assert (claim->>'inboundId')::uuid=next_inbound;
    assert claim#>'{state,conversations,0,pending}'='null'::jsonb;
    perform public.release_wa_turn(chef,new_worker);

    -- The original owner can record a late definite result with no resend.
    begin
        perform public.finish_wa_notification(notice_id,new_worker,'meta:resume-wrong-owner');
        assert false,'wrong owner cannot settle a reviewed notice';
    exception when sqlstate '55000' then null;
    end;
    perform public.finish_wa_notification(notice_id,worker,'meta:resume-accepted-notice');
    perform public.finish_wa_reply(reply_id,worker,'meta:resume-accepted-reply');
    assert (select status='sent' and blocked_reason is null
        from public.wa_notifications where id=notice_id);
    assert (select send_status='sent' from public.wa_messages where id=reply_id);
    assert (select expires_at<=clock_timestamp() from public.pending_confirmations p where p.chef_id=chef);

    -- The reversible draft path still owns abandoned pre-send work.
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created,event_at)
        values(next_gig,chef,'Synthetic recoverable draft',10,false,now(),now()+interval '11 days');
    claim:=public.claim_wa_notification_for_agent(target_phone,worker);
    next_notice_id:=(claim->>'id')::uuid;
    assert next_notice_id is not null and next_notice_id<>notice_id;
    update public.wa_notifications set send_started_at=clock_timestamp()-interval '3 minutes',
        draft_expires_at=clock_timestamp()-interval '1 second' where id=next_notice_id;
    assert public.resume_wa_after_uncertain_send(target_phone)=0;
    claim:=public.claim_wa_notification_for_agent(target_phone,new_worker);
    assert (claim->>'id')::uuid=next_notice_id;
end;
$$;
rollback;
