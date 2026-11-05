-- Durable, per-chef turns for the local WhatsApp worker. The worker supplies its
-- configured test phone, not a phone chosen by the model. Only service_role may
-- call these functions; existing RLS policies stay unchanged.
alter table public.wa_conversations
    add column lease_message_id uuid references public.wa_messages (id);
alter table public.wa_messages
    add column send_owner uuid,
    add column send_started_at timestamptz,
    -- A webhook batch shares received_at; insertion order must break ties.
    add column sequence_no bigint generated always as identity;

-- Claims one fresh text message and rebuilds only its chef's agent context.
-- Row locking prevents overlapping claims; a crashed model turn expires in 90s.
create function public.claim_wa_turn(target_phone text, worker_id uuid)
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
begin
    if worker_id is null then raise exception 'worker_id is required'; end if;
    select c.* into chef from public.chefs c
    where c.wa_phone = target_phone and c.active and c.opted_out_at is null
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
    join public.opportunities o on o.id = p.opportunity_id
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
        'title', o.title,
        'startsAt', to_char(o.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'location', o.location, 'headcount', o.headcount, 'pay', o.pay_text,
        'details', o.details, 'status', o.status, 'chefIds', jsonb_build_array(chef.id))
        order by o.starts_at, o.id), '[]'::jsonb)
    into opportunities from public.opportunities o
    join public.wa_deliveries d on d.opportunity_id = o.id
    where d.chef_id = chef.id and o.status = 'open';

    select coalesce(jsonb_agg(r.response order by r.recorded_at, r.id), '[]'::jsonb)
    into responses from (
        select r.id, r.recorded_at, jsonb_build_object('chefId', chef.id,
            'reference', o.ref_code, 'interested', r.interested, 'messageId', r.message_id,
            'recordedAt', to_char(r.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as response
        from public.interest_responses r join public.opportunities o on o.id = r.opportunity_id
        where r.chef_id = chef.id order by r.recorded_at desc, r.id desc limit 20
    ) r;

    return jsonb_build_object('inboundId', inbound.id,
        'message', jsonb_strip_nulls(jsonb_build_object(
            'providerMessageId', inbound.provider_message_id, 'from', inbound.phone,
            'text', inbound.body, 'provider', inbound.provider,
            'contextMessageId', inbound.context_message_id,
            'sentAt', to_char(inbound.sent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
        'state', jsonb_build_object('version', 1,
            'chefs', jsonb_build_array(jsonb_build_object('id', chef.id, 'name', chef.name, 'phone', chef.wa_phone)),
            'opportunities', opportunities,
            'conversations', jsonb_build_array(jsonb_build_object('chefId', chef.id, 'pending', pending, 'turns', history)),
            'responses', responses, 'handoffs', '[]'::jsonb, 'receipts', '[]'::jsonb));
end;
$$;

-- Commits tool changes, reply, and processed marker together. A lease belongs
-- to one exact inbound, so a stale worker cannot commit another worker's turn.
create function public.commit_wa_turn(inbound_id uuid, worker_id uuid, turn_state jsonb)
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
    opportunity_id uuid;
    outbound_id uuid;
    previous_reply text;
    previous_reply_source text;
begin
    select m.* into inbound from public.wa_messages m where m.id = inbound_id;
    if not found or inbound.direction <> 'inbound' or inbound.provider <> 'meta'
        or inbound.processed_at is not null then raise exception 'inbound is unavailable'; end if;
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
        select o.id into opportunity_id from public.opportunities o
        join public.wa_deliveries d on d.opportunity_id = o.id
        where o.ref_code = response ->> 'reference' and o.status = 'open' and d.chef_id = chef.id
        for share of o, d;
        if opportunity_id is null or previous_pending.opportunity_id is distinct from opportunity_id
            or previous_pending.interested is distinct from (response ->> 'interested')::boolean
            or previous_pending.source_message_id = inbound.provider_message_id
            or previous_reply_source is distinct from previous_pending.source_message_id
            or previous_pending.expires_at is null or previous_pending.expires_at <= clock_timestamp()
            or btrim(inbound.body) !~* '^(confirm|yes|yes please|correct|sí|si)[.!]?$'
            or previous_reply is distinct from (
                'Should I record that you''re ' || (case when previous_pending.interested then 'interested' else 'not interested' end)
                || ' in ' || (response ->> 'reference') || '? Reply "confirm" or "cancel". This records your interest; it does not book the event.')
            then raise exception 'interest response lacks a valid confirmation'; end if;
        insert into public.interest_responses (chef_id, opportunity_id, interested, message_id)
        values (chef.id, opportunity_id, previous_pending.interested, inbound.provider_message_id);
    end loop;

    delete from public.pending_confirmations where chef_id = chef.id;
    proposed := agent_conversation -> 'pending';
    if proposed is not null and proposed <> 'null'::jsonb then
        select o.id into opportunity_id from public.opportunities o
        join public.wa_deliveries d on d.opportunity_id = o.id
        where o.ref_code = proposed ->> 'reference' and o.status = 'open' and d.chef_id = chef.id
        for share of o, d;
        if opportunity_id is null or proposed ->> 'sourceMessageId' is distinct from inbound.provider_message_id
            or jsonb_typeof(proposed -> 'interested') is distinct from 'boolean'
            or (proposed ->> 'expiresAt')::timestamptz is null
            or (proposed ->> 'expiresAt')::timestamptz <= clock_timestamp()
            or (proposed ->> 'expiresAt')::timestamptz > clock_timestamp() + interval '16 minutes'
            then raise exception 'invalid pending confirmation'; end if;
        insert into public.pending_confirmations (chef_id, opportunity_id, interested, source_message_id, expires_at)
        values (chef.id, opportunity_id, (proposed ->> 'interested')::boolean,
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

-- Releases only this worker's lease after model/storage failure. A subsequent
-- worker can retry the still-unprocessed input without replaying committed tools.
create function public.release_wa_turn(chef_id uuid, worker_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
    update public.wa_conversations set lease_owner = null, lease_until = null, lease_message_id = null
    where wa_conversations.chef_id = release_wa_turn.chef_id
        and lease_owner = worker_id::text;
$$;

-- Claims a queued reply before calling Meta. An interrupted/ambiguous send stays
-- unknown: automatically retrying could deliver the same reply twice.
create function public.claim_wa_reply(target_phone text, worker_id uuid)
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
begin
    if worker_id is null then raise exception 'worker_id is required'; end if;
    select c.* into chef from public.chefs c
    where c.wa_phone = target_phone and c.active and c.opted_out_at is null for share;
    if not found then return null; end if;
    select c.* into conversation from public.wa_conversations c
    where c.chef_id = chef.id for update skip locked;
    if not found or conversation.human_takeover then return null; end if;
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

-- Records Meta's accepted message ID only for the worker that claimed the send.
create function public.finish_wa_reply(outbound_id uuid, worker_id uuid, provider_id text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if provider_id is null or provider_id !~ '^meta:[^[:space:]]+$' then
        raise exception 'invalid Meta message id';
    end if;
    update public.wa_messages set send_status = 'sent', provider_message_id = provider_id,
        sent_at = clock_timestamp()
    where id = outbound_id and direction = 'outbound' and send_status = 'unknown'
        and send_owner = worker_id;
    if not found then raise exception 'reply send is not owned by this worker'; end if;
end;
$$;

-- Use only when Meta definitely rejected the request (a nonretryable 4xx).
-- Timeouts, network failures, and 5xx stay unknown to prevent duplicate sends.
create function public.fail_wa_reply(outbound_id uuid, worker_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    update public.wa_messages set send_status = 'failed'
    where id = outbound_id and direction = 'outbound' and send_status = 'unknown'
        and send_owner = worker_id;
    if not found then raise exception 'reply send is not owned by this worker'; end if;
end;
$$;

revoke all on function public.claim_wa_turn(text, uuid) from public, anon, authenticated;
revoke all on function public.commit_wa_turn(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.release_wa_turn(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_wa_reply(text, uuid) from public, anon, authenticated;
revoke all on function public.finish_wa_reply(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fail_wa_reply(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_wa_turn(text, uuid) to service_role;
grant execute on function public.commit_wa_turn(uuid, uuid, jsonb) to service_role;
grant execute on function public.release_wa_turn(uuid, uuid) to service_role;
grant execute on function public.claim_wa_reply(text, uuid) to service_role;
grant execute on function public.finish_wa_reply(uuid, uuid, text) to service_role;
grant execute on function public.fail_wa_reply(uuid, uuid) to service_role;
