-- Backend capability regressions. Run on the isolated synthetic database only.
-- All fixtures, state changes and mock provider IDs are rolled back.
begin;

-- Creates a known, explicitly opted-in chef with a fresh inbound conversation.
create function pg_temp.capability_chef(phone text,consent boolean default true) returns uuid
language plpgsql as $$
declare result uuid:=gen_random_uuid();
begin
    insert into public.whatsapp_user(chef_id,name,phone) values(result,'Synthetic capability chef',phone);
    insert into public.chefs(id,name,wa_phone,whatsapp_user_id,opted_in_at,opt_in_method)
        values(result,'Synthetic capability chef',phone,result,case when consent then now() end,case when consent then 'in_person' end);
    insert into public.wa_conversations(chef_id,last_inbound_at) values(result,now());
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,processed_at)
        values('inbound','meta','meta:capability-'||result,result,phone,'hello',now(),now());
    return result;
end;
$$;

-- Inserts a genuine canonical assignment so the production trigger is exercised.
create function pg_temp.capability_request(target uuid,title text default 'Synthetic event') returns uuid
language plpgsql as $$
declare result uuid:=gen_random_uuid();
begin
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created)
        values(result,target,title,25,false,now());
    return result;
end;
$$;

-- Proactive alerts require opt-in, deduplicate, respect assignments and never retry unknown sends.
do $$
#variable_conflict use_variable
declare chef uuid:=pg_temp.capability_chef('15557600001'); other uuid:=pg_temp.capability_chef('15557600002',false);
    request uuid; notification jsonb; worker uuid:=gen_random_uuid();
begin
    request:=pg_temp.capability_request(chef);
    assert (select count(*)=1 from public.wa_notifications n where n.catering_id=request),'new assignment queues alert';
    perform pg_temp.capability_request(other);
    assert not exists(select 1 from public.wa_notifications n where n.chef_id=other),'missing consent never queues';
    update public.whatsapp_catering set meal_name='Updated synthetic title' where catering_id=request;
    assert (select count(*)=1 from public.wa_notifications n where n.catering_id=request),'ordinary updates do not duplicate alert';
    notification:=public.claim_wa_notification('15557600001',worker);
    assert notification->>'kind'='text','fresh contact permits free-form alert';
    assert notification->>'body' like '%Updated synthetic title%','alert uses current request facts';
    assert (select n.status='unknown' from public.wa_notifications n where n.id=(notification->>'id')::uuid),'unknown before external send';
    assert public.claim_wa_notification('15557600001',gen_random_uuid()) is null,'never reclaim unknown';
    assert public.claim_wa_turn('15557600001',gen_random_uuid()) is null,'notification serializes with model work';
    begin
        perform public.finish_wa_notification((notification->>'id')::uuid,gen_random_uuid(),'meta:wrong-worker');
        raise exception 'accepted wrong notification owner';
    exception when sqlstate '55000' then null; end;
    perform public.finish_wa_notification((notification->>'id')::uuid,worker,'meta:capability-alert-sent');
    assert (select n.status='sent' from public.wa_notifications n where n.id=(notification->>'id')::uuid),'acceptance recorded';
    update public.whatsapp_catering set chef=other where catering_id=request;
    update public.chefs set opted_in_at=now(),opt_in_method='web' where id=other;
    update public.whatsapp_catering set chef=chef where catering_id=request;
    assert (select count(*)=1 from public.wa_notifications n where n.chef_id=chef and n.catering_id=request),'reassignment back does not resend';
end;
$$;

-- Admin browser writes enqueue alerts; ordinary chefs use scoped bot reads.
-- Other browser clients cannot read or forge canonical identities/assignments.
select set_config('capability.browser_chef',pg_temp.capability_chef('15557600015')::text,true);
select set_config('capability.browser_other',pg_temp.capability_chef('15557600016')::text,true);
select set_config('capability.browser_request',gen_random_uuid()::text,true);
select set_config('capability.browser_admin',gen_random_uuid()::text,true);
insert into public.users(userid,name,email,phone,is_admin,is_approved)
    values(current_setting('capability.browser_admin')::uuid,'Synthetic assignment admin','assignment-admin@example.test','15557600994',true,true),
        (current_setting('capability.browser_chef')::uuid,'Synthetic reader A','assignment-a@example.test','15557600015',false,true),
        (current_setting('capability.browser_other')::uuid,'Synthetic reader B','assignment-b@example.test','15557600016',false,true);
update public.whatsapp_user set user_id=chef_id
    where chef_id in (current_setting('capability.browser_chef')::uuid,current_setting('capability.browser_other')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('capability.browser_admin'),true);
insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created)
    values(current_setting('capability.browser_request')::uuid,current_setting('capability.browser_chef')::uuid,
        'Synthetic browser assignment',25,false,now());
update public.whatsapp_catering set chef=current_setting('capability.browser_other')::uuid
    where catering_id=current_setting('capability.browser_request')::uuid;
update public.whatsapp_catering set chef=chef,meal_name='Updated browser assignment'
    where catering_id=current_setting('capability.browser_request')::uuid;
do $$
begin
    assert not has_function_privilege(current_user,'public.queue_wa_catering_alert()','EXECUTE'),
        'browser cannot call the privileged trigger directly';
    begin
        insert into public.wa_notifications(chef_id,kind,catering_id,body)
            values(current_setting('capability.browser_chef')::uuid,'catering_alert',
                current_setting('capability.browser_request')::uuid,'Must not insert directly');
        raise exception 'browser wrote notification table';
    exception when insufficient_privilege then null; end;
end;
$$;
reset role;
do $$
declare request uuid:=current_setting('capability.browser_request')::uuid; notification jsonb;
begin
    assert (select count(*)=2 from public.wa_notifications n where n.catering_id=request),
        'browser insert and reassignment queue once per recipient';
    assert public.claim_wa_notification('15557600015',gen_random_uuid()) is null,
        'old browser assignment cannot send after reassignment';
    notification:=public.claim_wa_notification('15557600016',gen_random_uuid());
    assert notification->>'phone'='15557600016','new browser assignee receives its own alert';
    assert notification->>'body' like '%Updated browser assignment%','ordinary edits refresh send facts without duplication';
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('capability.browser_chef'),true);
do $$
declare changed integer;
begin
    assert not exists(select 1 from public.whatsapp_user),'canonical identities remain server/admin-only';
    assert not exists(select 1 from public.whatsapp_catering
        where catering_id=current_setting('capability.browser_request')::uuid),'former assignee cannot read reassigned request';
    begin
        insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created)
            values(gen_random_uuid(),current_setting('capability.browser_chef')::uuid,'Forged assignment',25,false,now());
        raise exception 'ordinary chef inserted an assignment';
    exception when insufficient_privilege then null; end;
    update public.whatsapp_catering set chef=current_setting('capability.browser_chef')::uuid
        where catering_id=current_setting('capability.browser_request')::uuid;
    get diagnostics changed=row_count;
    assert changed=0,'ordinary chef cannot reassign another chef request';
    update public.whatsapp_user set name='Forged identity'
        where chef_id=current_setting('capability.browser_chef')::uuid;
    get diagnostics changed=row_count;
    assert changed=0,'ordinary chef cannot rewrite its canonical identity';
end;
$$;
select set_config('request.jwt.claim.sub',current_setting('capability.browser_other'),true);
do $$
declare changed integer;
begin
    assert not exists(select 1 from public.whatsapp_user),'other chef cannot read canonical identities';
    assert not exists(select 1 from public.whatsapp_catering),'canonical assignments remain server/admin-only';
    update public.whatsapp_catering set meal_name='Forged edit'
        where catering_id=current_setting('capability.browser_request')::uuid;
    get diagnostics changed=row_count;
    assert changed=0,'ordinary chef cannot edit even its assigned request';
end;
$$;
reset role;
set local role anon;
do $$
begin
    begin
        perform 1 from public.whatsapp_user;
        raise exception 'anonymous client read canonical identities';
    exception when insufficient_privilege then null; end;
    begin
        perform 1 from public.whatsapp_catering;
        raise exception 'anonymous client read catering assignments';
    exception when insufficient_privilege then null; end;
    begin
        insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,is_accepted,day_created)
            values(gen_random_uuid(),current_setting('capability.browser_other')::uuid,'Anonymous forged assignment',25,false,now());
        raise exception 'anonymous client inserted an assignment';
    exception when insufficient_privilege then null; end;
end;
$$;
reset role;

-- Outside the service window only a configured approved-template shape may be claimed.
do $$
#variable_conflict use_variable
declare chef uuid:=pg_temp.capability_chef('15557600003'); worker uuid:=gen_random_uuid(); request uuid; notification jsonb;
begin
    update public.wa_messages set sent_at=now()-interval '25 hours' where chef_id=chef;
    request:=pg_temp.capability_request(chef,'Template test event');
    assert public.claim_wa_notification('15557600003',worker) is null,'no free text outside 24 hours';
    assert (select status='blocked' and blocked_reason='template_required' from public.wa_notifications where catering_id=request),'missing template is visible for staff';
    notification:=public.claim_wa_notification('15557600003',worker,'catering_request','en_US');
    assert notification->>'kind'='template','template required';
    assert notification#>>'{template,name}'='catering_request','configured template name';
    assert notification#>>'{template,bodyParameters,1}'='Template test event','template variables bound to current record';
    perform public.fail_wa_notification((notification->>'id')::uuid,worker);
    assert public.claim_wa_notification('15557600003',worker,'catering_request','en_US') is null,'definite refusal is not blindly retried';
end;
$$;

-- Closing/reassigning a request, losing consent or opting out prevents an alert send.
do $$
#variable_conflict use_variable
declare chef uuid:=pg_temp.capability_chef('15557600004'); other uuid:=pg_temp.capability_chef('15557600005'); request uuid; worker uuid:=gen_random_uuid();
begin
    request:=pg_temp.capability_request(chef);
    update public.whatsapp_catering set request_status='closed' where catering_id=request;
    assert public.claim_wa_notification('15557600004',worker) is null,'closed request does not send';
    request:=pg_temp.capability_request(chef);
    update public.whatsapp_catering set chef=other where catering_id=request;
    assert public.claim_wa_notification('15557600004',worker) is null,'old assignment cannot send';
    request:=pg_temp.capability_request(chef);
    update public.chefs set opted_in_at=null where id=chef;
    assert public.claim_wa_notification('15557600004',worker) is null,'revoked consent cannot send';
    update public.chefs set opted_in_at=now(),opted_out_at=now() where id=chef;
    assert public.claim_wa_notification('15557600004',worker) is null,'opt-out wins over former consent';
end;
$$;

-- Staff authorization, takeover, idempotent replies, audit and handoff resolution.
do $$
#variable_conflict use_variable
declare admin uuid:=gen_random_uuid(); chef uuid:=pg_temp.capability_chef('15557600006'); request uuid:=gen_random_uuid();
    handoff uuid:=gen_random_uuid(); first_reply jsonb; repeated jsonb; notification jsonb; worker uuid:=gen_random_uuid(); conversation jsonb;
begin
    insert into public.users(userid,name,email,phone,is_admin) values(admin,'Synthetic admin','admin-capability@example.test','15557600999',true);
    begin
        perform public.get_wa_staff_queue(chef);
        raise exception 'accepted non-admin';
    exception when insufficient_privilege then null; end;
    insert into public.handoffs(id,chef_id,message_id,reason) values(handoff,chef,'meta:capability-help','Synthetic help');
    assert jsonb_array_length(public.get_wa_staff_queue(admin))>=1,'review API sees handoff';
    begin
        perform public.queue_wa_staff_reply(admin,chef,'Staff reply',request);
        raise exception 'accepted reply without takeover';
    exception when sqlstate '55000' then null; end;
    update public.wa_conversations set lease_owner=worker::text,lease_until=now()+interval '60 seconds' where chef_id=chef;
    perform public.set_wa_staff_takeover(admin,chef,true);
    assert (select human_takeover and lease_owner is null and lease_until is null from public.wa_conversations where chef_id=chef),'takeover revokes model lease';
    assert public.claim_wa_turn('15557600006',worker) is null,'AI is paused';
    first_reply:=public.queue_wa_staff_reply(admin,chef,'Staff reply',request);
    repeated:=public.queue_wa_staff_reply(admin,chef,'Staff reply',request);
    assert first_reply=repeated,'HTTP retry returns the original queue item';
    begin
        perform public.queue_wa_staff_reply(admin,chef,'Changed reply',request);
        raise exception 'accepted changed idempotency payload';
    exception when invalid_parameter_value then null; end;
    notification:=public.claim_wa_notification('15557600006',worker);
    assert notification->>'body'='Staff reply','staff can reply during takeover';
    perform public.finish_wa_notification((notification->>'id')::uuid,worker,'meta:capability-staff-sent');
    conversation:=public.get_wa_staff_conversation(admin,chef);
    assert exists(select 1 from jsonb_array_elements(conversation->'messages') m where m->>'body'='Staff reply' and m->>'source'='notification'),'staff reply in conversation history';
    perform public.resolve_wa_handoff(admin,handoff);
    assert (select status='resolved' from public.handoffs where id=handoff),'resolve explicit handoff';
    perform public.set_wa_alert_consent(admin,chef,true,'Synthetic fixture explicit consent');
    assert (select count(*)=1 from public.wa_alert_consent_log l where l.chef_id=chef),'consent has an audit';
    perform public.set_wa_staff_takeover(admin,chef,false);
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at)
        values('inbound','meta','meta:capability-resumed',chef,'15557600006','what did staff say?',now());
    conversation:=public.claim_wa_turn('15557600006',worker);
    assert conversation#>>'{state,staffMessages,0,body}'='Staff reply','resumed AI receives staff context';
end;
$$;

-- A STOP during takeover blocks queued staff replies and records the opt-out.
do $$
#variable_conflict use_variable
declare admin uuid:=gen_random_uuid(); chef uuid:=pg_temp.capability_chef('15557600007'); worker uuid:=gen_random_uuid();
begin
    insert into public.users(userid,name,email,phone,is_admin) values(admin,'Synthetic admin','admin-stop@example.test','15557600998',true);
    perform public.set_wa_staff_takeover(admin,chef,true);
    perform public.queue_wa_staff_reply(admin,chef,'Must not send',gen_random_uuid());
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at)
        values('inbound','meta','meta:capability-stop',chef,'15557600007','STOP',now());
    assert public.claim_wa_notification('15557600007',worker) is null,'STOP suppresses staff send';
    assert (select opted_out_at is not null from public.chefs where id=chef),'STOP recorded while AI paused';
end;
$$;

-- Pausing revokes an actual claimed turn, not just its displayed takeover flag.
do $$
#variable_conflict use_variable
declare admin uuid:=gen_random_uuid(); chef uuid:=pg_temp.capability_chef('15557600008');
    worker uuid:=gen_random_uuid(); claimed jsonb; draft jsonb;
begin
    insert into public.users(userid,name,email,phone,is_admin)
        values(admin,'Synthetic admin','admin-lease@example.test','15557600997',true);
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at)
        values('inbound','meta','meta:capability-lease',chef,'15557600008','show my requests',now());
    claimed:=public.claim_wa_turn('15557600008',worker);
    assert claimed is not null,'model has claimed a turn';
    draft:=jsonb_set(claimed->'state','{receipts}',jsonb_build_array(jsonb_build_object(
        'message',claimed->'message','result',jsonb_build_object('reply','Must not commit','outcome','conversation','toolCalls','[]'::jsonb))));
    perform public.set_wa_staff_takeover(admin,chef,true);
    begin
        perform public.commit_wa_turn((claimed->>'inboundId')::uuid,worker,draft);
        raise exception 'accepted an in-flight commit after takeover';
    exception when raise_exception then
        if sqlerrm='accepted an in-flight commit after takeover' then raise; end if;
    end;
    assert not exists(select 1 from public.wa_messages where chef_id=chef and direction='outbound'),'no stale AI outbox created';
end;
$$;

-- Staff authority and messaging windows are checked again when a queued reply is sent.
do $$
#variable_conflict use_variable
declare admin uuid:=gen_random_uuid(); chef uuid:=pg_temp.capability_chef('15557600009');
    worker uuid:=gen_random_uuid(); reply jsonb;
begin
    insert into public.users(userid,name,email,phone,is_admin)
        values(admin,'Synthetic admin','admin-revoked@example.test','15557600996',true);
    perform public.set_wa_staff_takeover(admin,chef,true);
    reply:=public.queue_wa_staff_reply(admin,chef,'Revoked admin must not send',gen_random_uuid());
    update public.users set is_admin=false where userid=admin;
    assert public.claim_wa_notification('15557600009',worker) is null,'revoked admin cannot send queued reply';
    assert (select status='failed' from public.wa_notifications where id=(reply->>'id')::uuid),'revoked reply retired';
    update public.users set is_admin=true where userid=admin;
    reply:=public.queue_wa_staff_reply(admin,chef,'Expired window must not send',gen_random_uuid());
    update public.wa_messages set sent_at=now()-interval '25 hours' where chef_id=chef;
    assert public.claim_wa_notification('15557600009',worker) is null,'expired window cannot send queued reply';
    begin
        perform public.queue_wa_staff_reply(admin,chef,'No new reply outside the window',gen_random_uuid());
        raise exception 'queued staff reply outside window';
    exception when sqlstate '55000' then null; end;
end;
$$;

-- Retrying a completed resume must preserve a new unanswered inbound message.
do $$
#variable_conflict use_variable
declare admin uuid:=gen_random_uuid(); chef uuid:=pg_temp.capability_chef('15557600010');
    worker uuid:=gen_random_uuid(); incoming uuid; claimed jsonb;
begin
    insert into public.users(userid,name,email,phone,is_admin)
        values(admin,'Synthetic admin','admin-retry@example.test','15557600995',true);
    perform public.set_wa_staff_takeover(admin,chef,true);
    perform public.set_wa_staff_takeover(admin,chef,false);
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at)
        values('inbound','meta','meta:capability-after-resume',chef,'15557600010','new question after resume',now()) returning id into incoming;
    perform public.set_wa_staff_takeover(admin,chef,false);
    assert (select processed_at is null from public.wa_messages where id=incoming),'retry resume leaves fresh input unanswered';
    claimed:=public.claim_wa_turn('15557600010',worker);
    assert claimed->>'inboundId'=incoming::text,'AI can still claim the fresh input';
end;
$$;

-- Swipe-replies identify only this chef's sent alert for a still-assigned request.
do $$
#variable_conflict use_variable
declare chef uuid:=pg_temp.capability_chef('15557600011'); other uuid:=pg_temp.capability_chef('15557600012');
    own_request uuid; foreign_request uuid; own_reference text; worker uuid:=gen_random_uuid(); incoming uuid; claimed jsonb;
begin
    own_request:=pg_temp.capability_request(chef,'Own quoted event');
    foreign_request:=pg_temp.capability_request(other,'Other chef quoted event');
    update public.wa_notifications set status='sent',provider_message_id='meta:capability-own-alert',sent_at=now() where catering_id=own_request;
    update public.wa_notifications set status='sent',provider_message_id='meta:capability-foreign-alert',sent_at=now() where catering_id=foreign_request;
    select ref_code into own_reference from public.whatsapp_catering where catering_id=own_request;
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,context_message_id)
        values('inbound','meta','meta:capability-own-quote',chef,'15557600011','yes',now(),'meta:capability-own-alert') returning id into incoming;
    claimed:=public.claim_wa_turn('15557600011',worker);
    assert claimed#>>'{state,quotedCateringRequest,reference}'=own_reference,'same-chef sent alert binds reference';
    update public.wa_messages set processed_at=now() where id=incoming;
    perform public.release_wa_turn(chef,worker);
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,context_message_id)
        values('inbound','meta','meta:capability-foreign-quote',chef,'15557600011','yes',now(),'meta:capability-foreign-alert') returning id into incoming;
    claimed:=public.claim_wa_turn('15557600011',worker);
    assert claimed#>'{state,quotedCateringRequest}' is null,'another chef alert never binds reference';
    update public.wa_messages set processed_at=now() where id=incoming;
    perform public.release_wa_turn(chef,worker);
    update public.whatsapp_catering set chef=other where catering_id=own_request;
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,context_message_id)
        values('inbound','meta','meta:capability-stale-quote',chef,'15557600011','yes',now(),'meta:capability-own-alert') returning id into incoming;
    claimed:=public.claim_wa_turn('15557600011',worker);
    assert claimed#>'{state,quotedCateringRequest}' is null,'reassigned request is not inferred from an old alert';
    update public.wa_messages set processed_at=now() where id=incoming;
    perform public.release_wa_turn(chef,worker);
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at)
        values('inbound','meta','meta:capability-unquoted-answer',chef,'15557600011','yes',now());
    claimed:=public.claim_wa_turn('15557600011',worker);
    assert claimed#>'{state,quotedCateringRequest}' is null,'unquoted yes does not infer a previous alert';
end;
$$;

-- An alert cannot interrupt a live confirmation question for a different request.
do $$
#variable_conflict use_variable
declare chef uuid:=pg_temp.capability_chef('15557600013'); proposal uuid; alert uuid;
    worker uuid:=gen_random_uuid(); claimed jsonb;
begin
    proposal:=pg_temp.capability_request(chef,'Proposed request A');
    update public.wa_notifications set status='sent',provider_message_id='meta:capability-proposal-alert',sent_at=now()
        where catering_id=proposal;
    alert:=pg_temp.capability_request(chef,'Unrelated request B');
    insert into public.pending_confirmations(chef_id,catering_id,interested,source_message_id,expires_at)
        values(chef,proposal,true,'meta:capability-proposal-question',now()+interval '15 minutes');
    assert public.claim_wa_notification('15557600013',worker) is null,'live proposal defers new alerts';
    assert (select status='blocked' and blocked_reason='confirmation_pending' from public.wa_notifications where catering_id=alert),'deferred alert explains why';
    delete from public.pending_confirmations where chef_id=chef;
    claimed:=public.claim_wa_notification('15557600013',worker);
    assert claimed is not null,'alert becomes eligible after confirmation clears';
    perform public.finish_wa_notification((claimed->>'id')::uuid,worker,'meta:capability-after-confirmation');
    insert into public.pending_confirmations(chef_id,catering_id,interested,source_message_id,expires_at)
        values(chef,proposal,true,'meta:capability-expired-proposal',now()-interval '1 second');
    perform pg_temp.capability_request(chef,'New event after expired question');
    assert public.claim_wa_notification('15557600013',worker) is not null,'expired proposals do not block future alerts';
end;
$$;

-- An explicit quote cannot confirm a different request's pending question.
do $$
#variable_conflict use_variable
declare chef uuid:=pg_temp.capability_chef('15557600014');
    alert uuid; pending_request uuid; reference text; question text; source uuid;
    incoming uuid; claimed jsonb; draft jsonb; worker uuid:=gen_random_uuid();
begin
    alert:=pg_temp.capability_request(chef,'Quoted alert A');
    pending_request:=pg_temp.capability_request(chef,'Pending request B');
    update public.wa_notifications set status='sent',provider_message_id='meta:capability-question-alert-'||catering_id,sent_at=now()
        where chef_id=chef;
    select ref_code into reference from public.whatsapp_catering where catering_id=pending_request;
    question:='Should I record that you''re interested in '||reference||'? Reply "confirm" or "cancel". This records your interest; it does not book the event.';
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,processed_at)
        values('inbound','meta','meta:capability-question-source',chef,'15557600014','Interested in '||reference,now(),now()) returning id into source;
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,send_status,reply_to_message_id)
        values('outbound','meta','meta:capability-confirmation-question',chef,'15557600014',question,now(),'sent',source);
    insert into public.pending_confirmations(chef_id,catering_id,interested,source_message_id,expires_at)
        values(chef,pending_request,true,'meta:capability-question-source',now()+interval '15 minutes');
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,context_message_id)
        values('inbound','meta','meta:capability-wrong-question-quote',chef,'15557600014','confirm',now(),
            'meta:capability-question-alert-'||alert) returning id into incoming;
    claimed:=public.claim_wa_turn('15557600014',worker);
    assert claimed#>'{state,conversations,0,pending}'='null'::jsonb,'quoted alert cannot confirm a different pending request';
    assert not exists(select 1 from public.pending_confirmations where chef_id=chef),'mismatched quote expires stored pending confirmation';
    -- A forged write still fails the database guard after the proposal was expired.
    draft:=jsonb_set(claimed->'state','{responses}',jsonb_build_array(jsonb_build_object('chefId',chef,
        'reference',reference,'interested',true,'messageId','meta:capability-wrong-question-quote','recordedAt',now())));
    draft:=jsonb_set(draft,'{receipts}',jsonb_build_array(jsonb_build_object('message',claimed->'message',
        'result',jsonb_build_object('reply','Must not save B','outcome','recorded','toolCalls','[]'::jsonb))));
    begin
        perform public.commit_wa_turn(incoming,worker,draft);
        raise exception 'confirmed B using quote of alert A';
    exception when raise_exception then
        if sqlerrm='confirmed B using quote of alert A' then raise; end if;
    end;
    update public.wa_messages set processed_at=now() where id=incoming;
    perform public.release_wa_turn(chef,worker);
    -- A fresh proposal followed by a quote of its own exact question is allowed.
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,processed_at)
        values('inbound','meta','meta:capability-valid-question-source',chef,'15557600014','Interested in '||reference,now(),now()) returning id into source;
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,send_status,reply_to_message_id)
        values('outbound','meta','meta:capability-valid-confirmation-question',chef,'15557600014',question,now(),'sent',source);
    insert into public.pending_confirmations(chef_id,catering_id,interested,source_message_id,expires_at)
        values(chef,pending_request,true,'meta:capability-valid-question-source',now()+interval '15 minutes');
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at,context_message_id)
        values('inbound','meta','meta:capability-valid-question-quote',chef,'15557600014','confirm',now(),
            'meta:capability-valid-confirmation-question');
    claimed:=public.claim_wa_turn('15557600014',worker);
    assert claimed#>>'{state,conversations,0,pending,reference}'=reference,'quoting the exact sent question keeps its proposal';
    assert exists(select 1 from public.pending_confirmations where chef_id=chef),'valid quoted pending remains stored';
end;
$$;

-- Browser roles cannot call staff RPCs or read notification bodies by guessing IDs.
set local role authenticated;
do $$
begin
    begin
        perform public.get_wa_staff_queue(gen_random_uuid());
        raise exception 'browser called staff RPC';
    exception when insufficient_privilege then null; end;
    begin
        perform 1 from public.wa_notifications;
        raise exception 'browser read notification table';
    exception when insufficient_privilege then null; end;
end;
$$;
reset role;
rollback;
