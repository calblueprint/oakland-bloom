-- Connect the transport/conversation tables to the existing product records.
-- No old chef, catering, booking, menu, or prototype opportunity rows are removed.
alter table public.whatsapp_user add column user_id uuid unique references public.users(userid);
alter table public.chefs add column whatsapp_user_id uuid unique references public.whatsapp_user(chef_id);

create sequence public.whatsapp_catering_reference_seq;
-- Avoid reusing an OB code already shown by the earlier prototype.
select setval('public.whatsapp_catering_reference_seq', coalesce(
    (select max(substring(ref_code from 3)::bigint) + 1 from public.opportunities), 1), false);
alter table public.whatsapp_catering
    add column ref_code text not null unique default ('OB' || nextval('public.whatsapp_catering_reference_seq'))
        check (ref_code ~ '^OB[1-9][0-9]*$'),
    add column event_at timestamptz,
    add column location text check (char_length(location) between 1 and 500),
    add column details text not null default '' check (char_length(details) <= 2000),
    add column request_status text not null default 'open' check (request_status in ('open','closed')),
    -- A previous false is_accepted value cannot tell unanswered from declined.
    add column response_status text not null default 'unknown'
        check (response_status in ('unknown','unanswered','interested','declined')),
    add column response_at timestamptz,
    add column response_message_id text;
alter table public.whatsapp_catering alter column response_status set default 'unanswered';

alter table public.pending_confirmations
    alter column opportunity_id drop not null,
    add column catering_id uuid references public.whatsapp_catering(catering_id),
    add constraint pending_confirmation_one_target check (num_nonnulls(opportunity_id,catering_id)=1);
alter table public.interest_responses
    alter column opportunity_id drop not null,
    add column catering_id uuid references public.whatsapp_catering(catering_id),
    add constraint interest_response_one_target check (num_nonnulls(opportunity_id,catering_id)=1);
create index interest_responses_catering_latest
    on public.interest_responses(chef_id,catering_id,recorded_at desc) where catering_id is not null;
create or replace view public.latest_interest with (security_invoker=true) as
select distinct on (chef_id,opportunity_id) chef_id,opportunity_id,interested,message_id,recorded_at
from public.interest_responses where opportunity_id is not null
order by chef_id,opportunity_id,recorded_at desc,id desc;

-- Compares only explicitly supplied international digits; never guesses a country.
create function public.wa_normalize_phone(value text)
returns text language sql immutable strict set search_path='' as $$
    select case when btrim(value) ~ '^[+]?[- ()0-9.[:space:]]+$'
        and regexp_replace(value,'[+[:space:]().-]','','g') ~ '^[1-9][0-9]{1,14}$'
        then regexp_replace(value,'[+[:space:]().-]','','g') end;
$$;

-- Binds a sender to one existing identity. Ambiguous, unapproved, or conflicting
-- links return null; no name supplied by a message/model can grant access.
create function public.resolve_wa_chef(sender_phone text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
    normalized_phone text := public.wa_normalize_phone(sender_phone);
    web_user public.users%rowtype;
    legacy public.whatsapp_user%rowtype;
    extension public.chefs%rowtype;
    web_count integer;
    legacy_count integer;
begin
    if normalized_phone is null then return null; end if;
    perform pg_advisory_xact_lock(hashtextextended('wa-phone:' || normalized_phone,0));
    select count(*) into web_count from public.users u where public.wa_normalize_phone(u.phone)=normalized_phone;
    select count(*) into legacy_count from public.whatsapp_user u where public.wa_normalize_phone(u.phone)=normalized_phone;
    if web_count>1 or legacy_count>1 then return null; end if;
    select u.* into web_user from public.users u where public.wa_normalize_phone(u.phone)=normalized_phone for share;
    if web_count=1 and not web_user.is_approved then return null; end if;
    select u.* into legacy from public.whatsapp_user u where public.wa_normalize_phone(u.phone)=normalized_phone for update;
    select c.* into extension from public.chefs c where c.wa_phone=normalized_phone for update;
    -- Existing links cannot silently jump to a different person after a phone change.
    if legacy.user_id is not null and legacy.user_id is distinct from web_user.userid then return null; end if;
    if extension.user_id is not null and extension.user_id is distinct from web_user.userid then return null; end if;
    if extension.whatsapp_user_id is not null and extension.whatsapp_user_id is distinct from legacy.chef_id then return null; end if;
    if web_user.userid is not null and exists(select 1 from public.whatsapp_user u
        where u.user_id=web_user.userid and u.chef_id is distinct from legacy.chef_id) then return null; end if;
    if exists(select 1 from public.chefs c where c.id is distinct from extension.id
        and ((web_user.userid is not null and c.user_id=web_user.userid)
            or (legacy.chef_id is not null and c.whatsapp_user_id=legacy.chef_id))) then return null; end if;

    if legacy.chef_id is null and web_user.userid is not null then
        -- Approved web users share their canonical id when first joining WhatsApp.
        if exists(select 1 from public.whatsapp_user u where u.chef_id=web_user.userid) then return null; end if;
        insert into public.whatsapp_user(chef_id,name,phone,user_id)
        values(web_user.userid,web_user.name,normalized_phone,web_user.userid) returning * into legacy;
    elsif legacy.chef_id is not null and web_user.userid is not null and legacy.user_id is null then
        update public.whatsapp_user set user_id=web_user.userid where chef_id=legacy.chef_id returning * into legacy;
    end if;
    if extension.id is null then
        if legacy.chef_id is null then return null; end if; -- Unknown strangers are never registered.
        insert into public.chefs(user_id,whatsapp_user_id,name,wa_phone)
        values(web_user.userid,legacy.chef_id,left(coalesce(nullif(web_user.name,''),nullif(legacy.name,''),'Chef'),200),normalized_phone)
        returning * into extension;
    elsif legacy.chef_id is not null and (
        extension.user_id is distinct from web_user.userid
        or extension.whatsapp_user_id is distinct from legacy.chef_id
        or extension.name is distinct from left(coalesce(nullif(web_user.name,''),nullif(legacy.name,''),'Chef'),200)) then
        update public.chefs set user_id=web_user.userid,whatsapp_user_id=legacy.chef_id,
            name=left(coalesce(nullif(web_user.name,''),nullif(legacy.name,''),'Chef'),200)
        where id=extension.id returning * into extension;
    end if;
    -- A previously registered local test identity can chat without real-domain access.
    return extension.id;
end;
$$;

create or replace function public.ingest_inbound(batch jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    message jsonb;
    rejected jsonb;
    known_chef uuid;
    stored_id uuid;
begin
    if jsonb_typeof(batch -> 'messages') is distinct from 'array'
        or jsonb_typeof(batch -> 'rejected') is distinct from 'array' then
        raise exception 'batch must have messages and rejected arrays';
    end if;

    -- Every batch acquires sender locks in the same order. Original order is
    -- preserved within each chef's messages, avoiding reversed-batch deadlocks.
    for message in select e.value from jsonb_array_elements(batch -> 'messages')
        with ordinality as e(value,position)
        order by public.wa_normalize_phone(e.value ->> 'from'),e.position loop
        known_chef := public.resolve_wa_chef(message ->> 'from');

        insert into public.wa_messages (
            direction, provider, provider_message_id, chef_id, phone, body,
            context_message_id, sent_at
        ) values (
            'inbound',
            message ->> 'provider',
            message ->> 'providerMessageId',
            known_chef,
            message ->> 'from',
            message ->> 'text',
            message ->> 'contextMessageId',
            (message ->> 'sentAt')::timestamptz
        )
        on conflict (provider_message_id) do nothing
        returning id into stored_id;

        -- A duplicate delivery inserted nothing; skip its side effects too.
        continue when stored_id is null;

        if message -> 'media' is not null then
            insert into public.wa_media (
                message_id, direction, kind, provider_media_id, mime_type, sha256
            ) values (
                stored_id,
                'inbound',
                message -> 'media' ->> 'kind',
                message -> 'media' ->> 'mediaId',
                message -> 'media' ->> 'mimeType',
                message -> 'media' ->> 'sha256'
            );
        end if;

        if known_chef is not null then
            insert into public.wa_conversations (chef_id, last_inbound_at)
            values (known_chef, now())
            on conflict (chef_id) do update set last_inbound_at = excluded.last_inbound_at;
        end if;
    end loop;

    for rejected in select * from jsonb_array_elements(batch -> 'rejected') loop
        insert into public.wa_inbound_rejected (provider, provider_message_id, phone, reason)
        values (
            coalesce(split_part(rejected ->> 'providerMessageId', ':', 1), 'meta'),
            rejected ->> 'providerMessageId',
            rejected ->> 'from',
            rejected ->> 'reason'
        )
        on conflict (provider_message_id) do nothing;
    end loop;
end;
$$;

create or replace function public.claim_wa_turn(target_phone text, worker_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    chef public.chefs%rowtype;
    conversation public.wa_conversations%rowtype;
    inbound public.wa_messages%rowtype;
    pending jsonb;
    history jsonb;
    opportunities jsonb;
    responses jsonb;
    bound_id uuid;
    business text;
begin
    if worker_id is null then raise exception 'worker_id is required'; end if;
    bound_id := public.resolve_wa_chef(target_phone);
    select c.* into chef from public.chefs c
    where c.id = bound_id and c.wa_phone = target_phone and c.active and c.opted_out_at is null
    for share;
    if not found then return null; end if;

    insert into public.wa_conversations (chef_id) values (chef.id)
    on conflict (chef_id) do nothing;
    select c.* into conversation from public.wa_conversations c
    where c.chef_id = chef.id for update skip locked;
    if not found or conversation.human_takeover
        or conversation.lease_until > clock_timestamp() then return null; end if;

    select m.* into inbound from public.wa_messages m
    where m.chef_id = chef.id and m.phone = chef.wa_phone
        and m.direction = 'inbound' and m.provider = 'meta'
        and m.provider_message_id like 'meta:%' and m.processed_at is null
        and m.sent_at > clock_timestamp() - interval '24 hours'
        and m.sent_at <= clock_timestamp() + interval '5 minutes'
        and char_length(m.body) <= 4000
        and (btrim(m.body) ~* '^(stop|unsubscribe)[.!]?$'
            or not exists (select 1 from public.wa_media a where a.message_id = m.id))
    -- Opt-out takes priority even when an earlier reply is awaiting delivery.
    order by (btrim(m.body) ~* '^(stop|unsubscribe)[.!]?$') desc,
        m.received_at, m.sequence_no limit 1 for update skip locked;
    if not found then return null; end if;

    -- Stop requests bypass the model and suppress all further automated sends.
    if btrim(inbound.body) ~* '^(stop|unsubscribe)[.!]?$' then
        update public.chefs set opted_out_at = clock_timestamp() where id = chef.id;
        update public.wa_messages set processed_at = clock_timestamp() where id = inbound.id;
        update public.wa_conversations set lease_owner = null, lease_until = null,
            lease_message_id = null where chef_id = chef.id;
        return null;
    end if;

    -- A pending reply that missed its 24-hour window was never sent. Retire it
    -- so laptop downtime cannot block a later fresh conversation forever.
    update public.wa_messages o set send_status='failed'
    from public.wa_messages i where o.reply_to_message_id=i.id and o.chef_id=chef.id
        and o.direction='outbound' and o.send_status='pending'
        and i.sent_at <= clock_timestamp()-interval '24 hours';

    -- Finish the preceding exchange before interpreting a follow-up. In
    -- particular, a confirmation cannot race its still-unsent proposal.
    if exists (select 1 from public.wa_messages m
        where m.chef_id = chef.id and m.direction = 'outbound'
            and m.send_status in ('pending', 'unknown')) then return null; end if;
    update public.wa_conversations set lease_owner = worker_id::text,
        lease_until = clock_timestamp() + interval '90 seconds',
        lease_message_id = inbound.id where chef_id = chef.id;

    -- An ignored attachment or overlong message still interrupts a proposal.
    -- Otherwise a later "confirm" could approve an older question unexpectedly.
    delete from public.pending_confirmations p where p.chef_id = chef.id
        and exists (select 1 from public.wa_messages source
            join public.wa_messages between_message on between_message.chef_id = source.chef_id
            where source.chef_id = chef.id and source.provider_message_id = p.source_message_id
                and between_message.direction = 'inbound'
                and (between_message.received_at, between_message.sequence_no) > (source.received_at, source.sequence_no)
                and (between_message.received_at, between_message.sequence_no) < (inbound.received_at, inbound.sequence_no));

    select jsonb_build_object('reference', o.ref_code, 'interested', p.interested,
        'sourceMessageId', p.source_message_id,
        'expiresAt', to_char(p.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    into pending from public.pending_confirmations p
    join public.whatsapp_catering o on o.catering_id = p.catering_id and o.chef = chef.whatsapp_user_id
    join public.wa_messages source on source.provider_message_id = p.source_message_id
        and source.chef_id = p.chef_id
    join public.wa_messages sent on sent.reply_to_message_id = source.id
        and sent.chef_id = p.chef_id and sent.send_status = 'sent'
    where p.chef_id = chef.id;

    -- Only sent replies enter history. A queued/failed confirmation question
    -- must not authorize an interest response that the chef never received.
    select coalesce(jsonb_agg(h.turn order by h.received_at, h.sequence_no), '[]'::jsonb)
    into history from (
        select i.sequence_no, i.received_at, jsonb_build_object(
            'messageId', i.provider_message_id, 'text', i.body, 'reply', o.body) as turn
        from public.wa_messages i join public.wa_messages o on o.reply_to_message_id = i.id
        where i.chef_id = chef.id and i.direction = 'inbound'
            and o.chef_id = chef.id and o.direction = 'outbound' and o.send_status = 'sent'
            and char_length(i.body) <= 4000 and char_length(o.body) <= 4000
        order by i.received_at desc, i.sequence_no desc limit 12
    ) h;

    select coalesce(jsonb_agg(jsonb_build_object('reference', o.ref_code,
        'title', coalesce(nullif(o.meal_name,''),'Catering request'),
        'startsAt', to_char(o.event_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'location', o.location, 'headcount', case when o.num_people between 1 and 9007199254740991 then o.num_people else null end,
        'pay', null, 'details', o.details, 'status', o.request_status,
        'accepted', o.is_accepted, 'responseStatus', o.response_status,
        'chefIds', jsonb_build_array(chef.id)) order by o.day_created,o.catering_id), '[]'::jsonb)
    into opportunities from public.whatsapp_catering o where o.chef=chef.whatsapp_user_id;

    select coalesce(jsonb_agg(r.response order by r.recorded_at,r.id),'[]'::jsonb)
    into responses from (
        select r.id,r.recorded_at,jsonb_build_object('chefId',chef.id,
            'reference',o.ref_code,'interested',r.interested,'messageId',r.message_id,
            'recordedAt',to_char(r.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as response
        from public.interest_responses r join public.whatsapp_catering o on o.catering_id=r.catering_id
        where r.chef_id=chef.id and o.chef=chef.whatsapp_user_id
        order by r.recorded_at desc,r.id desc limit 20
    ) r;
    select left(string_agg(distinct r.name,', ' order by r.name),300) into business
    from public.restaurants r where r.userid=chef.user_id;

    return jsonb_build_object('inboundId', inbound.id,
        'message', jsonb_strip_nulls(jsonb_build_object(
            'providerMessageId', inbound.provider_message_id, 'from', inbound.phone,
            'text', inbound.body, 'provider', inbound.provider,
            'contextMessageId', inbound.context_message_id,
            'sentAt', to_char(inbound.sent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
        'state', jsonb_build_object('version', 1,
            'chefs', jsonb_build_array(jsonb_build_object('id', chef.id, 'name', chef.name, 'phone', chef.wa_phone, 'userId', chef.user_id, 'businessName', business)),
            'opportunities', opportunities,
            'conversations', jsonb_build_array(jsonb_build_object('chefId', chef.id, 'pending', pending, 'turns', history)),
            'responses', responses, 'handoffs', '[]'::jsonb, 'receipts', '[]'::jsonb));
end;
$$;

create or replace function public.commit_wa_turn(inbound_id uuid, worker_id uuid, turn_state jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
    chef public.chefs%rowtype;
    conversation public.wa_conversations%rowtype;
    inbound public.wa_messages%rowtype;
    previous_pending public.pending_confirmations%rowtype;
    receipt jsonb;
    agent_conversation jsonb;
    proposed jsonb;
    response jsonb;
    handoff jsonb;
    target_catering uuid;
    outbound_id uuid;
    previous_reply text;
    previous_reply_source text;
begin
    select m.* into inbound from public.wa_messages m where m.id = inbound_id;
    if not found or inbound.direction <> 'inbound' or inbound.provider <> 'meta'
        or inbound.processed_at is not null then raise exception 'inbound is unavailable'; end if;
    if public.resolve_wa_chef(inbound.phone) is distinct from inbound.chef_id then
        raise exception 'sender identity is unavailable'; end if;
    select c.* into chef from public.chefs c
    where c.id = inbound.chef_id and c.wa_phone = inbound.phone
        and c.active and c.opted_out_at is null for share;
    if not found then raise exception 'chef is unavailable'; end if;
    select c.* into conversation from public.wa_conversations c
    where c.chef_id = chef.id for update;
    if not found or conversation.human_takeover
        or conversation.lease_owner is distinct from worker_id::text
        or conversation.lease_message_id is distinct from inbound.id
        or conversation.lease_until is null or conversation.lease_until <= clock_timestamp()
        then raise exception 'turn lease is unavailable'; end if;
    -- Lock again after the conversation, in the same order as claim_wa_turn.
    select m.* into inbound from public.wa_messages m where m.id = inbound_id for update;
    if inbound.processed_at is not null then raise exception 'inbound already processed'; end if;

    if jsonb_typeof(turn_state -> 'receipts') is distinct from 'array'
        or jsonb_array_length(turn_state -> 'receipts') <> 1
        or jsonb_typeof(turn_state -> 'conversations') is distinct from 'array'
        or jsonb_array_length(turn_state -> 'conversations') <> 1
        or jsonb_typeof(turn_state -> 'responses') is distinct from 'array'
        or jsonb_typeof(turn_state -> 'handoffs') is distinct from 'array'
        then raise exception 'invalid turn state'; end if;
    receipt := turn_state -> 'receipts' -> 0;
    agent_conversation := turn_state -> 'conversations' -> 0;
    if receipt #>> '{message,providerMessageId}' is distinct from inbound.provider_message_id
        or receipt #>> '{message,from}' is distinct from chef.wa_phone
        or receipt #>> '{message,text}' is distinct from inbound.body
        or receipt #>> '{message,provider}' is distinct from 'meta'
        or agent_conversation ->> 'chefId' is distinct from chef.id::text
        or jsonb_typeof(receipt #> '{result,reply}') is distinct from 'string'
        or char_length(btrim(receipt #>> '{result,reply}')) not between 1 and 4000
        then raise exception 'receipt does not match claimed message'; end if;

    select p.* into previous_pending from public.pending_confirmations p
    where p.chef_id = chef.id for update;
    select o.body, i.provider_message_id into previous_reply, previous_reply_source
    from public.wa_messages o join public.wa_messages i on i.id = o.reply_to_message_id
    where o.chef_id = chef.id and o.direction = 'outbound' and o.send_status = 'sent'
    order by o.received_at desc, o.sequence_no desc limit 1;

    -- Tool outputs may append only this sender's response to this inbound.
    for response in select value from jsonb_array_elements(turn_state -> 'responses') loop
        if response ->> 'chefId' is distinct from chef.id::text then
            raise exception 'response belongs to another chef';
        end if;
        continue when response ->> 'messageId' is distinct from inbound.provider_message_id;
        select o.catering_id into target_catering from public.whatsapp_catering o
        where o.ref_code=response->>'reference' and o.chef=chef.whatsapp_user_id
            and o.request_status='open' and not o.is_accepted for update;
        if target_catering is null or previous_pending.catering_id is distinct from target_catering
            or previous_pending.interested is distinct from (response ->> 'interested')::boolean
            or previous_pending.source_message_id = inbound.provider_message_id
            or previous_reply_source is distinct from previous_pending.source_message_id
            or previous_pending.expires_at is null or previous_pending.expires_at <= clock_timestamp()
            or btrim(inbound.body) !~* '^(confirm|yes|yes please|correct|sí|si)[.!]?$'
            or previous_reply is distinct from (
                'Should I record that you''re ' || (case when previous_pending.interested then 'interested' else 'not interested' end)
                || ' in ' || (response ->> 'reference') || '? Reply "confirm" or "cancel". This records your interest; it does not book the event.')
            then raise exception 'interest response lacks a valid confirmation'; end if;
        insert into public.interest_responses (chef_id,catering_id,interested,message_id)
        values(chef.id,target_catering,previous_pending.interested,inbound.provider_message_id);
        -- Interest is a chef response, not acceptance/booking approval.
        update public.whatsapp_catering set response_status=case when previous_pending.interested then 'interested' else 'declined' end,
            response_at=clock_timestamp(),response_message_id=inbound.provider_message_id
        where catering_id=target_catering;
    end loop;

    delete from public.pending_confirmations where chef_id = chef.id;
    proposed := agent_conversation -> 'pending';
    if proposed is not null and proposed <> 'null'::jsonb then
        select o.catering_id into target_catering from public.whatsapp_catering o
        where o.ref_code=proposed->>'reference' and o.chef=chef.whatsapp_user_id
            and o.request_status='open' and not o.is_accepted for share;
        if target_catering is null or proposed ->> 'sourceMessageId' is distinct from inbound.provider_message_id
            or jsonb_typeof(proposed -> 'interested') is distinct from 'boolean'
            or (proposed ->> 'expiresAt')::timestamptz is null
            or (proposed ->> 'expiresAt')::timestamptz <= clock_timestamp()
            or (proposed ->> 'expiresAt')::timestamptz > clock_timestamp() + interval '16 minutes'
            then raise exception 'invalid pending confirmation'; end if;
        insert into public.pending_confirmations (chef_id, catering_id, interested, source_message_id, expires_at)
        values (chef.id, target_catering, (proposed ->> 'interested')::boolean,
            inbound.provider_message_id, (proposed ->> 'expiresAt')::timestamptz);
    end if;

    for handoff in select value from jsonb_array_elements(turn_state -> 'handoffs') loop
        if handoff ->> 'chefId' is distinct from chef.id::text
            or handoff ->> 'messageId' is distinct from inbound.provider_message_id
            then raise exception 'handoff does not match claimed message'; end if;
        insert into public.handoffs (chef_id, message_id, reason)
        values (chef.id, inbound.provider_message_id, handoff ->> 'reason');
    end loop;

    insert into public.wa_messages (direction, provider, chef_id, phone, body,
        reply_to_message_id, send_status, tool_trace)
    values ('outbound', 'meta', chef.id, chef.wa_phone, receipt #>> '{result,reply}',
        inbound.id, 'pending', receipt #> '{result,toolCalls}') returning id into outbound_id;
    update public.wa_messages set processed_at = clock_timestamp() where id = inbound.id;
    update public.wa_conversations set lease_owner = null, lease_until = null,
        lease_message_id = null where chef_id = chef.id;
    return outbound_id;
end;
$$;

create or replace function public.claim_wa_reply(target_phone text, worker_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    chef public.chefs%rowtype;
    conversation public.wa_conversations%rowtype;
    outbound public.wa_messages%rowtype;
    reply_to text;
    bound_id uuid;
begin
    if worker_id is null then raise exception 'worker_id is required'; end if;
    bound_id := public.resolve_wa_chef(target_phone);
    select c.* into chef from public.chefs c
    where c.id=bound_id and c.wa_phone = target_phone and c.active and c.opted_out_at is null for share;
    if not found then return null; end if;
    select c.* into conversation from public.wa_conversations c
    where c.chef_id = chef.id for update skip locked;
    if not found or conversation.human_takeover then return null; end if;
    -- A pending reply that missed its 24-hour window was never sent. Retire it
    -- so laptop downtime cannot block a later fresh conversation forever.
    update public.wa_messages o set send_status='failed'
    from public.wa_messages i where o.reply_to_message_id=i.id and o.chef_id=chef.id
        and o.direction='outbound' and o.send_status='pending'
        and i.sent_at <= clock_timestamp()-interval '24 hours';

    -- A STOP arriving behind an earlier turn must block its queued reply before
    -- the next poll has had a chance to mark the chef opted out.
    if exists (select 1 from public.wa_messages m
        where m.chef_id = chef.id and m.direction = 'inbound' and m.provider = 'meta'
            and m.processed_at is null and btrim(m.body) ~* '^(stop|unsubscribe)[.!]?$'
            and m.sent_at > clock_timestamp() - interval '24 hours'
            and m.sent_at <= clock_timestamp() + interval '5 minutes') then return null; end if;
    if exists (select 1 from public.wa_messages m
        where m.chef_id = chef.id and m.direction = 'outbound'
            and m.send_status = 'unknown') then return null; end if;
    select o.* into outbound from public.wa_messages o
    join public.wa_messages i on i.id = o.reply_to_message_id
    where o.chef_id = chef.id and o.phone = chef.wa_phone
        and o.direction = 'outbound' and o.provider = 'meta' and o.send_status = 'pending'
        and i.chef_id = chef.id and i.direction = 'inbound' and i.provider = 'meta'
        and i.sent_at > clock_timestamp() - interval '24 hours'
        and i.sent_at <= clock_timestamp() + interval '5 minutes'
    order by o.received_at, o.sequence_no limit 1 for update of o skip locked;
    if not found then return null; end if;
    select i.provider_message_id into reply_to from public.wa_messages i where i.id = outbound.reply_to_message_id;
    update public.wa_messages set send_status = 'unknown', send_owner = worker_id,
        send_started_at = clock_timestamp() where id = outbound.id;
    return jsonb_build_object('id', outbound.id, 'phone', outbound.phone,
        'body', outbound.body, 'replyTo', reply_to);
end;
$$;

-- These routines are backend-only; no new browser permissions are granted.
revoke all on function public.wa_normalize_phone(text) from public,anon,authenticated;
revoke all on function public.resolve_wa_chef(text) from public,anon,authenticated;
grant execute on function public.wa_normalize_phone(text) to service_role;
grant execute on function public.resolve_wa_chef(text) to service_role;
-- Existing table insert privileges still decide who may create requests. Sequence
-- usage merely preserves those inserts after adding the generated reference.
grant usage on sequence public.whatsapp_catering_reference_seq to anon,authenticated,service_role;
