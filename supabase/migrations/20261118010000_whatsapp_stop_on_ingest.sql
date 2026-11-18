-- STOP changes consent independently of whether WhatsApp still allows a reply.
-- This recognizes an exact command with leading/trailing whitespace and punctuation.
create function public.wa_apply_inbound_stop(inbound_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare
    inbound public.wa_messages%rowtype;
    occurred_at timestamptz;
begin
    select m.* into inbound from public.wa_messages m
    where m.id=inbound_id and m.direction='inbound' and m.provider='meta'
        and m.provider_message_id like 'meta:%' and m.chef_id is not null
        and m.processed_at is null
        and m.body ~* '^[[:space:]]*(stop|unsubscribe)[.!]?[[:space:]]*$'
        and not exists(select 1 from public.wa_media a where a.message_id=m.id);
    if not found then return; end if;

    -- Don't let a late webhook override a newer explicit opt-in, or move an
    -- existing opt-out backward. A missing or future timestamp uses receipt time.
    occurred_at:=least(coalesce(inbound.sent_at,inbound.received_at),inbound.received_at);
    update public.chefs c set opted_out_at=occurred_at
    where c.id=inbound.chef_id and c.wa_phone=inbound.phone
        and (c.opted_in_at is null or c.opted_in_at<=occurred_at)
        and (c.opted_out_at is null or c.opted_out_at<occurred_at);
    if found then
        update public.wa_conversations v set lease_owner=null,lease_until=null,lease_message_id=null
        where v.chef_id=inbound.chef_id;
        update public.pending_confirmations p set expires_at=clock_timestamp()
            where p.chef_id=inbound.chef_id and p.expires_at>clock_timestamp();
        update public.wa_notifications n set status='blocked',blocked_reason='opted_out'
        where n.chef_id=inbound.chef_id and n.status in ('pending','blocked');
    end if;

    -- Consume even obsolete commands so the reply worker can't apply them later.
    update public.wa_messages m set processed_at=clock_timestamp()
    where m.id=inbound.id and m.processed_at is null;
end;
$$;

revoke all on function public.wa_apply_inbound_stop(uuid) from public,anon,authenticated;
grant execute on function public.wa_apply_inbound_stop(uuid) to service_role;

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

        -- Sender/chef locks are already held. Only a new stored Meta text
        -- command can revoke consent. Old webhook retries have no effect.
        if known_chef is not null and message ->> 'provider'='meta'
            and message -> 'media' is null
            and (message ->> 'text') ~* '^[[:space:]]*(stop|unsubscribe)[.!]?[[:space:]]*$' then
            perform public.wa_apply_inbound_stop(stored_id);
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
-- Recover opt-outs already stored but not processed by the older worker.
-- Today's consent and current phone binding are rechecked by the same helper.
do $$
declare pending_id uuid;
begin
    for pending_id in select m.id from public.wa_messages m
        where m.direction='inbound' and m.provider='meta' and m.chef_id is not null
            and m.processed_at is null
            and m.body ~* '^[[:space:]]*(stop|unsubscribe)[.!]?[[:space:]]*$'
        order by m.phone,m.sequence_no
    loop
        perform public.wa_apply_inbound_stop(pending_id);
    end loop;
end;
$$;
