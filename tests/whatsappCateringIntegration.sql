-- Canonical catering integration regressions. Run only in a disposable PostgreSQL15+
-- database with the existing users/whatsapp_user/whatsapp_catering/restaurants
-- schema, anon/authenticated/service_role roles, and all WhatsApp migrations.
-- psql -v ON_ERROR_STOP=1 -d <disposable_database> -f tests/whatsappCateringIntegration.sql
-- Fixtures and helper functions are rolled back. No real messages or customer rows.
begin;

-- Builds the same saved receipt/draft shape returned by the TypeScript agent.
create function pg_temp.turn_state(claimed jsonb, reply text, pending jsonb default 'null', responses jsonb default null)
returns jsonb language plpgsql as $$
declare draft jsonb := claimed->'state';
begin
    draft := jsonb_set(draft,'{conversations,0,pending}',pending);
    if responses is not null then draft := jsonb_set(draft,'{responses}',responses); end if;
    return jsonb_set(draft,'{receipts}',jsonb_build_array(jsonb_build_object(
        'message',claimed->'message','result',jsonb_build_object(
            'reply',reply,'outcome','conversation','toolCalls','[]'::jsonb))));
end;
$$;

-- Uses the real ingest path so identity binding, deduplication and metadata agree.
create function pg_temp.inbound(phone text, body text, message_id text)
returns uuid language plpgsql as $$
declare id uuid;
begin
    perform public.ingest_inbound(jsonb_build_object('rejected','[]'::jsonb,'messages',jsonb_build_array(
        jsonb_build_object('provider','meta','providerMessageId',message_id,'from',phone,
            'text',body,'sentAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))));
    select m.id into id from public.wa_messages m where m.provider_message_id=message_id;
    return id;
end;
$$;

-- A formatted legacy phone resolves to one approved web account without making
-- a second transport identity or leaking another chef's request/business data.
do $$
declare
    web uuid := gen_random_uuid(); legacy uuid := gen_random_uuid(); extension uuid := gen_random_uuid();
    other uuid := gen_random_uuid(); request uuid := gen_random_uuid(); worker uuid := gen_random_uuid();
    inbound_id uuid; claimed jsonb;
begin
    insert into public.users(userid,name,email,phone,is_approved)
    values(web,'Canonical chef','fictional@example.test','+1 (555) 200-0001',true);
    insert into public.whatsapp_user(chef_id,name,phone) values(legacy,'Legacy name','+1 555-200-0001'),(other,'Other chef','15552000002');
    insert into public.chefs(id,name,wa_phone) values(extension,'Local test history','15552000001');
    insert into public.restaurants(userid,name) values(web,'Canonical kitchen');
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created,response_status)
    values(request,legacy,'Actual meal',25,false,now(),'unknown');
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created)
    values(gen_random_uuid(),other,'Private meal',99,false,now());
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created,request_status)
    values(gen_random_uuid(),legacy,'Closed meal',10,false,now(),'closed');
    inbound_id := pg_temp.inbound('15552000001','what requests do I have?','meta:canonical-context');
    claimed := public.claim_wa_turn('15552000001',worker);
    assert claimed->>'inboundId'=inbound_id::text,'real ingest picked up';
    assert claimed#>>'{state,chefs,0,id}'=extension::text,'test history id preserved';
    assert claimed#>>'{state,chefs,0,userId}'=web::text,'web account linked';
    assert claimed#>>'{state,chefs,0,name}'='Canonical chef','canonical name';
    assert claimed#>>'{state,chefs,0,businessName}'='Canonical kitchen','business context';
    assert jsonb_array_length(claimed#>'{state,opportunities}')=2,'only own requests including closed';
    assert exists(select 1 from jsonb_array_elements(claimed#>'{state,opportunities}') o
        where o->>'title'='Actual meal' and o->'startsAt'='null'::jsonb
            and o->'location'='null'::jsonb and o->>'responseStatus'='unknown'),'unknown date/location/status stay unknown';
    assert (select user_id=web from public.whatsapp_user where chef_id=legacy),'legacy linked to canonical user';
    assert (select whatsapp_user_id=legacy from public.chefs where id=extension),'extension linked to legacy chef';
    perform public.release_wa_turn(extension,worker);
    -- Duplicate provider delivery cannot create another inbound or overwrite its body.
    perform pg_temp.inbound('15552000001','different duplicate text','meta:canonical-context');
    assert (select count(*)=1 from public.wa_messages where provider_message_id='meta:canonical-context'),'ingest deduplicated';
    assert (select body='what requests do I have?' from public.wa_messages where id=inbound_id),'duplicate preserves original input';
    assert (select is_accepted=false from public.whatsapp_catering where catering_id=request),'reading does not accept catering';
end;
$$;

-- A real proposal/confirmation writes the existing catering record and an
-- append-only source receipt atomically; it never changes booking acceptance.
do $$
declare
    legacy uuid := gen_random_uuid(); request uuid := gen_random_uuid(); chef uuid;
    worker uuid := gen_random_uuid(); msg uuid; outgoing uuid; claimed jsonb; state jsonb;
    reference text; proposal text; send jsonb;
begin
    insert into public.whatsapp_user(chef_id,name,phone) values(legacy,'Independent WhatsApp chef','15552000003');
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created)
    values(request,legacy,'Canonical dinner',30,false,now()) returning ref_code into reference;
    assert (select response_status='unanswered' from public.whatsapp_catering where catering_id=request),'new requests start unanswered';
    chef := public.resolve_wa_chef('15552000003');
    assert chef is not null,'legacy chef does not need a web account';
    proposal := 'Should I record that you''re interested in '||reference||'? Reply "confirm" or "cancel". This records your interest; it does not book the event.';
    msg := pg_temp.inbound('15552000003','interested in '||reference,'meta:canonical-propose');
    claimed := public.claim_wa_turn('15552000003',worker);
    state := pg_temp.turn_state(claimed,proposal,jsonb_build_object('reference',reference,'interested',true,
        'sourceMessageId','meta:canonical-propose','expiresAt',to_char((now()+interval '15 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
    outgoing := public.commit_wa_turn(msg,worker,state);
    send := public.claim_wa_reply('15552000003',worker);
    perform public.finish_wa_reply(outgoing,worker,'meta:canonical-proposal-sent');
    assert (select catering_id=request and opportunity_id is null from public.pending_confirmations where chef_id=chef),'pending targets actual catering';
    msg := pg_temp.inbound('15552000003','confirm','meta:canonical-confirm');
    claimed := public.claim_wa_turn('15552000003',worker);
    assert claimed#>>'{state,conversations,0,pending,reference}'=reference,'canonical pending restored';
    state := pg_temp.turn_state(claimed,'Interest recorded','null',jsonb_build_array(jsonb_build_object(
        'chefId',chef,'reference',reference,'interested',true,'messageId','meta:canonical-confirm','recordedAt',now())));
    outgoing := public.commit_wa_turn(msg,worker,state);
    assert (select response_status='interested' and response_message_id='meta:canonical-confirm' and response_at is not null and not is_accepted
        from public.whatsapp_catering where catering_id=request),'canonical response saved without booking acceptance';
    assert (select count(*)=1 from public.interest_responses where chef_id=chef and catering_id=request and opportunity_id is null),'source history saved';
    begin
        perform public.commit_wa_turn(msg,worker,state);
        raise exception 'duplicate commit accepted';
    exception when raise_exception then
        if sqlerrm='duplicate commit accepted' then raise; end if;
    end;
    assert (select count(*)=1 from public.interest_responses where chef_id=chef),'duplicate commit never repeats interest';
    send := public.claim_wa_reply('15552000003',worker);
    perform public.finish_wa_reply(outgoing,worker,'meta:canonical-response-sent');
    msg := pg_temp.inbound('15552000003','what did I answer?','meta:canonical-history');
    claimed := public.claim_wa_turn('15552000003',worker);
    assert claimed#>>'{state,responses,0,reference}'=reference,'canonical response history restored';
    assert jsonb_array_length(claimed#>'{state,conversations,0,turns}')=2,'conversation survives new poll';
end;
$$;

-- Ambiguous identity/approval changes block both fresh turns and queued sends.
do $$
declare
    legacy uuid := gen_random_uuid(); web uuid := gen_random_uuid(); chef uuid;
    worker uuid := gen_random_uuid(); msg uuid; reply uuid; claimed jsonb;
begin
    insert into public.users(userid,name,email,phone,is_approved)
    values(web,'Pending user','pending@example.test','15552000004',false);
    insert into public.whatsapp_user(chef_id,name,phone) values(legacy,'Pending legacy','15552000004');
    assert public.resolve_wa_chef('15552000004') is null,'unapproved web match fails closed';
    update public.users set is_approved=true where userid=web;
    chef := public.resolve_wa_chef('15552000004');
    msg := pg_temp.inbound('15552000004','hello','meta:approval-change');
    claimed := public.claim_wa_turn('15552000004',worker);
    reply := public.commit_wa_turn(msg,worker,pg_temp.turn_state(claimed,'Hello'));
    update public.users set is_approved=false where userid=web;
    assert public.claim_wa_reply('15552000004',worker) is null,'approval revocation blocks queued reply';
    assert public.claim_wa_turn('15552000004',worker) is null,'approval revocation blocks context';
    update public.users set is_approved=true where userid=web;
    insert into public.whatsapp_user(chef_id,name,phone) values(gen_random_uuid(),'Collision','+1 (555) 200-0004');
    assert public.resolve_wa_chef('15552000004') is null,'duplicate legacy phone fails closed';
    assert public.claim_wa_reply('15552000004',worker) is null,'legacy collision blocks queued reply';
    assert (select send_status='pending' from public.wa_messages where id=reply),'blocked queue stays unsent';
    insert into public.users(userid,name,email,phone,is_approved)
    values(gen_random_uuid(),'Duplicate web','duplicate@example.test','+1 (555) 200-0001',true);
    assert public.resolve_wa_chef('15552000001') is null,'duplicate web phone fails closed';
    assert public.resolve_wa_chef('15552000999') is null,'stranger cannot enroll through model';
    insert into public.chefs(name,wa_phone) values('Isolated test identity','15552000998') returning id into chef;
    assert public.resolve_wa_chef('15552000998')=chef,'registered local test identity keeps chat';
    msg := pg_temp.inbound('15552000998','hello','meta:isolated-chat');
    claimed := public.claim_wa_turn('15552000998',worker);
    assert claimed#>'{state,chefs,0,userId}'='null'::jsonb,'test identity has no invented user link';
    assert claimed#>'{state,opportunities}'='[]'::jsonb,'test identity sees no real requests';
    assert not has_function_privilege('anon','public.resolve_wa_chef(text)','execute'),'browser cannot resolve identities';
end;
$$;

-- A request closing or already accepted after a proposal cannot be changed by
-- a stale model turn. Failure keeps the inbound/tool/outbox changes atomic.
do $$
declare
    legacy uuid := gen_random_uuid(); request uuid := gen_random_uuid(); chef uuid;
    worker uuid := gen_random_uuid(); msg uuid; outgoing uuid; claimed jsonb; state jsonb;
    reference text; proposal text;
begin
    insert into public.whatsapp_user(chef_id,name,phone) values(legacy,'Booking guard chef','15552000005');
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created)
    values(request,legacy,'Already accepted meal',10,true,now()) returning ref_code into reference;
    chef := public.resolve_wa_chef('15552000005');
    msg := pg_temp.inbound('15552000005','interested','meta:accepted-propose');
    claimed := public.claim_wa_turn('15552000005',worker);
    assert claimed#>>'{state,opportunities,0,accepted}'='true','acceptance visible but separate';
    proposal := 'Should I record that you''re interested in '||reference||'? Reply "confirm" or "cancel". This records your interest; it does not book the event.';
    state := pg_temp.turn_state(claimed,proposal,jsonb_build_object('reference',reference,'interested',true,
        'sourceMessageId','meta:accepted-propose','expiresAt',to_char((now()+interval '15 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
    begin
        perform public.commit_wa_turn(msg,worker,state);
        raise exception 'accepted request proposal saved';
    exception when raise_exception then
        if sqlerrm='accepted request proposal saved' then raise; end if;
    end;
    assert (select processed_at is null from public.wa_messages where id=msg),'failed write leaves inbound unprocessed';
    assert not exists(select 1 from public.wa_messages where reply_to_message_id=msg),'failed write creates no reply';
    update public.whatsapp_catering set is_accepted=false where catering_id=request;
    outgoing := public.commit_wa_turn(msg,worker,state);
    perform public.claim_wa_reply('15552000005',worker);
    perform public.finish_wa_reply(outgoing,worker,'meta:guard-proposal-sent');
    msg := pg_temp.inbound('15552000005','confirm','meta:closed-confirm');
    claimed := public.claim_wa_turn('15552000005',worker);
    state := pg_temp.turn_state(claimed,'Recorded','null',jsonb_build_array(jsonb_build_object(
        'chefId',chef,'reference',reference,'interested',true,'messageId','meta:closed-confirm','recordedAt',now())));
    update public.whatsapp_catering set request_status='closed' where catering_id=request;
    begin
        perform public.commit_wa_turn(msg,worker,state);
        raise exception 'closed request response saved';
    exception when raise_exception then
        if sqlerrm='closed request response saved' then raise; end if;
    end;
    assert not exists(select 1 from public.interest_responses where catering_id=request),'stale confirmation writes no response';
    assert (select response_status='unanswered' and not is_accepted from public.whatsapp_catering where catering_id=request),'stale confirmation leaves canonical state alone';
end;
$$;

-- Sorting sender locks across a batch must preserve one sender's message order.
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); worker uuid:=gen_random_uuid(); claimed jsonb;
begin
    insert into public.whatsapp_user(chef_id,name,phone)
    values(a,'Batch A','15552000006'),(b,'Batch B','15552000007');
    perform public.ingest_inbound(jsonb_build_object('rejected','[]'::jsonb,'messages',jsonb_build_array(
        jsonb_build_object('provider','meta','providerMessageId','meta:sender-b','from','15552000007','text','b','sentAt',now()),
        jsonb_build_object('provider','meta','providerMessageId','meta:sender-a-first','from','15552000006','text','first','sentAt',now()),
        jsonb_build_object('provider','meta','providerMessageId','meta:sender-a-second','from','15552000006','text','second','sentAt',now()))));
    claimed:=public.claim_wa_turn('15552000006',worker);
    assert claimed#>>'{message,providerMessageId}'='meta:sender-a-first','batch sort preserves sender order';
end;
$$;

rollback;
