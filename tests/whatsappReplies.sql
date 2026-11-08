-- Regression checks for the WhatsApp inbox/agent/outbox RPCs. No network calls.
-- Run only in a disposable UTF8 PostgreSQL database after all WhatsApp migrations
-- and the existing product schema, plus anon/authenticated/
-- service_role roles, are installed. The main schema needs PostgreSQL 15+.
-- psql -v ON_ERROR_STOP=1 -d <disposable_database> -f tests/whatsappReplies.sql
-- Fixtures are fictional and rolled back, including their tool writes.
begin;

do $$
declare
 c uuid := gen_random_uuid();
 o uuid := gen_random_uuid();
 w uuid := gen_random_uuid();
 other_worker uuid := gen_random_uuid();
 msg uuid;
 reply uuid;
 claimed jsonb;
 state jsonb;
 send jsonb;
 proposal text := 'Should I record that you''re interested in OB12? Reply "confirm" or "cancel". This records your interest; it does not book the event.';
begin
 insert into public.chefs(id,name,wa_phone) values(c,'Test chef','15551112222');
 insert into public.whatsapp_user(chef_id,name,phone) values(c,'Test chef','15551112222');
 insert into public.whatsapp_catering(catering_id,ref_code,meal_name,event_at,location,num_people,is_accepted,chef,day_created) values(o,'OB12','Test gig',now()+interval '2 days','Test location',10,false,c,now());
 insert into public.whatsapp_user(chef_id,name,phone) values(gen_random_uuid(),'Other chef','15559990000');
 insert into public.whatsapp_catering(catering_id,ref_code,meal_name,event_at,location,num_people,is_accepted,chef,day_created) select gen_random_uuid(),'OB99','Other gig',now()+interval '2 days','Private location',10,false,chef_id,now() from public.whatsapp_user where phone='15559990000';
 insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at)
 values('inbound','meta','meta:hello',c,'15551112222','hello',now()) returning id into msg;
 claimed := public.claim_wa_turn('15551112222',w);
 assert claimed->>'inboundId' = msg::text, 'claim inbound id';
 assert claimed#>>'{message,from}' = '15551112222', 'sender bound';
 assert jsonb_array_length(claimed#>'{state,opportunities}') = 1, 'only assigned gig';
 assert claimed#>>'{message,sentAt}' ~ 'Z$', 'UTC date';
 assert public.claim_wa_turn('15551112222',other_worker) is null, 'lease excludes second worker';
 state := claimed->'state';
 begin
   perform public.commit_wa_turn(msg,w,state);
   raise exception 'accepted missing receipt';
 exception when raise_exception then
   if sqlerrm='accepted missing receipt' then raise; end if;
 end;
 state := jsonb_set(state,'{receipts}',jsonb_build_array(jsonb_build_object('message',claimed->'message','result',jsonb_build_object('reply','Hello there','outcome','conversation','toolCalls','[]'::jsonb))));
 begin
   perform public.commit_wa_turn(msg,other_worker,state);
   raise exception 'accepted foreign lease';
 exception when raise_exception then
   if sqlerrm='accepted foreign lease' then raise; end if;
 end;
 reply := public.commit_wa_turn(msg,w,state);
 assert (select processed_at is not null from public.wa_messages where id=msg), 'processed with reply';
 send := public.claim_wa_reply('15551112222',w);
 assert send->>'id'=reply::text, 'claimed expected reply';
 assert send->>'replyTo'='meta:hello', 'reply quotes input';
 assert public.claim_wa_reply('15551112222',other_worker) is null, 'send not replayed';
 assert (select send_status='unknown' from public.wa_messages where id=reply), 'ambiguous state before network';
 begin
   perform public.finish_wa_reply(reply,other_worker,'meta:outwrong');
   raise exception 'accepted foreign send';
 exception when raise_exception then
   if sqlerrm='accepted foreign send' then raise; end if;
 end;
 perform public.finish_wa_reply(reply,w,'meta:outhello');

 insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at)
 values('inbound','meta','meta:proposal',c,'15551112222','interested OB12',now()) returning id into msg;
 claimed := public.claim_wa_turn('15551112222',w);
 assert jsonb_array_length(claimed#>'{state,conversations,0,turns}')=1, 'sent history restored';
 state := jsonb_set(claimed->'state','{conversations,0,pending}',jsonb_build_object('reference','OB12','interested',true,'sourceMessageId','meta:proposal','expiresAt',to_char((now()+interval '15 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
 state := jsonb_set(state,'{receipts}',jsonb_build_array(jsonb_build_object('message',claimed->'message','result',jsonb_build_object('reply',proposal,'outcome','confirmation-required','toolCalls','[]'::jsonb))));
 reply := public.commit_wa_turn(msg,w,state);
 send := public.claim_wa_reply('15551112222',w);
 perform public.finish_wa_reply(reply,w,'meta:outproposal');
 assert (select count(*)=1 from public.pending_confirmations where chef_id=c), 'proposal saved';

 insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at)
 values('inbound','meta','meta:confirm',c,'15551112222','confirm',now()) returning id into msg;
 claimed := public.claim_wa_turn('15551112222',w);
 assert claimed#>>'{state,conversations,0,pending,reference}'='OB12', 'pending restored';
 state := jsonb_set(claimed->'state','{conversations,0,pending}','null'::jsonb);
 state := jsonb_set(state,'{responses}',jsonb_build_array(jsonb_build_object('chefId',c,'reference','OB12','interested',true,'messageId','meta:confirm','recordedAt',now())));
 state := jsonb_set(state,'{receipts}',jsonb_build_array(jsonb_build_object('message',claimed->'message','result',jsonb_build_object('reply','Recorded interest','outcome','recorded','toolCalls','[]'::jsonb))));
 reply := public.commit_wa_turn(msg,w,state);
 assert (select count(*)=1 from public.interest_responses where chef_id=c), 'confirmed interest saved';
 assert (select count(*)=0 from public.pending_confirmations where chef_id=c), 'proposal consumed';

 insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at)
 values('inbound','meta','meta:stop',c,'15551112222','STOP',now());
 assert public.claim_wa_reply('15551112222',w) is null, 'pending STOP blocks send';
 assert public.claim_wa_turn('15551112222',w) is null, 'STOP bypasses model';
 assert (select opted_out_at is not null from public.chefs where id=c), 'opt out saved';
 assert public.claim_wa_reply('15551112222',w) is null, 'opt out blocks sends';
 assert public.claim_wa_turn('15550000000',w) is null, 'unknown sender blocked';
 assert not has_function_privilege('anon','public.claim_wa_turn(text,uuid)','EXECUTE'), 'anon claim blocked';
 assert has_function_privilege('service_role','public.claim_wa_turn(text,uuid)','EXECUTE'), 'server claim granted';
end;
$$;

do $$
declare
 c uuid := gen_random_uuid();
 o uuid := gen_random_uuid();
 w uuid := gen_random_uuid();
 w2 uuid := gen_random_uuid();
 source uuid;
 ignored uuid;
 current_id uuid;
 reply uuid;
 claimed jsonb;
begin
 insert into public.chefs(id,name,wa_phone) values(c,'Second test chef','15553334444');
 insert into public.whatsapp_user(chef_id,name,phone) values(c,'Second test chef','15553334444');
 insert into public.whatsapp_catering(catering_id,ref_code,meal_name,num_people,is_accepted,chef,day_created) values(o,'OB13','Second request',10,false,c,now());
 insert into public.wa_conversations(chef_id) values(c);
 insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,received_at,processed_at)
 values('inbound','meta','meta:source',c,'15553334444','OB12 interested',now()-interval '3 minutes',now()-interval '3 minutes',now()) returning id into source;
 insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,received_at)
 values('inbound','meta','meta:ignored',c,'15553334444',repeat(chr(128512), 4001),now()-interval '2 minutes',now()-interval '2 minutes') returning id into ignored;
 insert into public.wa_media(message_id,direction,kind,provider_media_id,mime_type)
 values(ignored,'inbound','image','image-123','image/jpeg');
 insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,received_at)
 values('inbound','meta','meta:laterconfirm',c,'15553334444','confirm',now()-interval '1 minute',now()-interval '1 minute') returning id into current_id;
 insert into public.pending_confirmations(chef_id,catering_id,interested,source_message_id,expires_at)
 values(c,o,true,'meta:source',now()+interval '15 minutes');
 claimed := public.claim_wa_turn('15553334444',w);
 assert claimed->>'inboundId'=current_id::text,'skip oversized attachment';
 assert claimed#>'{state,conversations,0,pending}'='null'::jsonb,'ignored oversized attachment invalidates pending';
 perform public.release_wa_turn(c,w2);
 assert (select lease_owner=w::text from public.wa_conversations where chef_id=c),'foreign release ignored';
 perform public.release_wa_turn(c,w);
 insert into public.wa_messages(direction,provider,chef_id,phone,body,reply_to_message_id,send_status)
 values('outbound','meta',c,'15553334444','Awaiting delivery',source,'pending') returning id into reply;
 assert public.claim_wa_turn('15553334444',w) is null,'pending reply blocks new turn';
 claimed := public.claim_wa_reply('15553334444',w);
 assert claimed->>'id'=reply::text,'pending reply claimed';
 assert public.claim_wa_turn('15553334444',w) is null,'unknown reply blocks new turn';
 assert public.claim_wa_reply('15553334444',w2) is null,'unknown reply blocks send';
 perform public.fail_wa_reply(reply,w);
 assert (select send_status='failed' from public.wa_messages where id=reply),'definite rejection marked failed';
 claimed := public.claim_wa_turn('15553334444',w);
 assert claimed->>'inboundId'=current_id::text,'definite failure permits next user input';
 update public.wa_conversations set lease_until=now()-interval '1 second' where chef_id=c;
 claimed := public.claim_wa_turn('15553334444',w2);
 assert claimed->>'inboundId'=current_id::text,'expired lease reclaimed';
 assert (select lease_owner=w2::text from public.wa_conversations where chef_id=c),'new worker owns reclaimed lease';
 perform public.release_wa_turn(c,w2);
 update public.wa_conversations set human_takeover=true where chef_id=c;
 assert public.claim_wa_turn('15553334444',w) is null,'human takeover blocks model';
 assert public.claim_wa_reply('15553334444',w) is null,'human takeover blocks send';
 update public.wa_conversations set human_takeover=false where chef_id=c;
 insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at)
 values('inbound','meta','meta:prioritystop',c,'15553334444','unsubscribe',now());
 assert public.claim_wa_turn('15553334444',w) is null,'STOP bypasses earlier input';
 assert (select opted_out_at is not null from public.chefs where id=c),'later STOP immediately saved';
 assert not has_function_privilege('authenticated','public.fail_wa_reply(uuid,uuid)','EXECUTE'),'public failure mutation blocked';
end;
$$;

-- Equal webhook timestamps preserve insertion order rather than random UUID order.
do $$
declare
    chef_id uuid := gen_random_uuid();
    worker_id uuid := gen_random_uuid();
    first_id uuid := 'ffffffff-ffff-ffff-ffff-fffffffffff1';
    second_id uuid := '00000000-0000-0000-0000-000000000001';
    claimed jsonb;
begin
    insert into public.chefs(id, name, wa_phone) values(chef_id, 'Batch test chef', '15557778888');
    insert into public.wa_messages(id, direction, provider, provider_message_id, chef_id, phone, body, sent_at)
    values(first_id, 'inbound', 'meta', 'meta:batchfirst', chef_id, '15557778888', 'first', now()),
        (second_id, 'inbound', 'meta', 'meta:batchsecond', chef_id, '15557778888', 'second', now());
    claimed := public.claim_wa_turn('15557778888', worker_id);
    assert claimed->>'inboundId' = first_id::text, 'batch order follows insertion order';
end;
$$;


-- A reply never sent before its service window expired must not poison the queue.
do $$
declare
    chef uuid := gen_random_uuid(); worker uuid := gen_random_uuid();
    old_input uuid; expired_reply uuid; fresh_input uuid; claimed jsonb;
begin
    insert into public.chefs(id,name,wa_phone) values(chef,'Downtime test chef','15558889999');
    insert into public.wa_conversations(chef_id) values(chef);
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,processed_at)
    values('inbound','meta','meta:expired-original',chef,'15558889999','yesterday',now()-interval '25 hours',now()) returning id into old_input;
    insert into public.wa_messages(direction,provider,chef_id,phone,body,reply_to_message_id,send_status)
    values('outbound','meta',chef,'15558889999','Old pending reply',old_input,'pending') returning id into expired_reply;
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at)
    values('inbound','meta','meta:after-downtime',chef,'15558889999','hello again',now()) returning id into fresh_input;
    assert public.claim_wa_reply('15558889999',worker) is null,'expired pending reply never sent';
    assert (select send_status='failed' from public.wa_messages where id=expired_reply),'expired pending reply retired';
    claimed := public.claim_wa_turn('15558889999',worker);
    assert claimed->>'inboundId'=fresh_input::text,'fresh input works after downtime';
end;
$$;

rollback;
