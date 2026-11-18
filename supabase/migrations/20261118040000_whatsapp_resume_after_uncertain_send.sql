-- A send can have reached Meta even if the worker never got its response.
-- Keep it for staff review without letting it block the whole conversation.
alter table public.wa_notifications
    drop constraint wa_notifications_status_check,
    add constraint wa_notifications_status_check
        check (status in ('pending','unknown','sent','failed','blocked','review'));
alter table public.wa_messages
    drop constraint wa_messages_send_status_check,
    add constraint wa_messages_send_status_check
        check (send_status in ('pending','unknown','sent','failed','review'));

create index wa_messages_uncertain_send on public.wa_messages(chef_id,send_started_at)
    where direction='outbound' and send_status='unknown';
create index wa_notifications_uncertain_send on public.wa_notifications(chef_id,send_started_at)
    where status='unknown' and draft_expires_at is null;

-- Match the claim lock order (phone/chef, conversation, then outbox rows).
-- No candidate for automatic delivery is created by this function.
create function public.resume_wa_after_uncertain_send(target_phone text) returns integer
language plpgsql security invoker set search_path='' as $$
declare
    chef_id_for_phone uuid;
    cutoff timestamptz:=clock_timestamp()-interval '2 minutes';
    replies integer;
    notices integer;
begin
    select c.id into chef_id_for_phone from public.chefs c where c.wa_phone=target_phone
        and (exists(select 1 from public.wa_messages m where m.chef_id=c.id
                and m.phone=target_phone and m.direction='outbound' and m.provider='meta'
                and m.send_status='unknown' and m.send_started_at<=cutoff)
            or exists(select 1 from public.wa_notifications n where n.chef_id=c.id
                and n.status='unknown' and n.draft_expires_at is null and n.send_started_at<=cutoff));
    if not found then return 0; end if;
    if public.resolve_wa_chef(target_phone) is distinct from chef_id_for_phone then return 0; end if;
    perform 1 from public.wa_conversations c
        where c.chef_id=chef_id_for_phone for update skip locked;
    if not found then return 0; end if;

    with reviewed as (
        update public.wa_messages m set send_status='review'
        where m.chef_id=chef_id_for_phone and m.phone=target_phone
            and m.direction='outbound' and m.provider='meta' and m.send_status='unknown'
            and m.send_started_at<=cutoff
        returning m.reply_to_message_id
    ), expired as (
        -- A confirmation whose question may not have arrived must be asked again.
        update public.pending_confirmations p set expires_at=clock_timestamp()
        from reviewed r join public.wa_messages source on source.id=r.reply_to_message_id
        where p.chef_id=chef_id_for_phone and p.source_message_id=source.provider_message_id
            and p.expires_at>clock_timestamp()
    )
    select count(*)::integer into replies from reviewed;

    update public.wa_notifications n set status='review',blocked_reason='delivery_uncertain',
        draft_source_body=null
    where n.chef_id=chef_id_for_phone and n.status='unknown'
        and n.draft_expires_at is null and n.send_started_at<=cutoff;
    get diagnostics notices=row_count;
    return replies+notices;
end;
$$;

-- A late definite provider result belongs to the original send owner. It may
-- settle the record, but cannot put the message back into the send queue.
create or replace function public.finish_wa_notification(notification_id uuid,worker_id uuid,provider_id text) returns void
language plpgsql security invoker set search_path='' as $$
begin
    if provider_id is null or provider_id!~'^meta:[^[:space:]]+$' then
        raise exception 'invalid Meta message ID' using errcode='22023';
    end if;
    update public.wa_notifications n set status='sent',provider_message_id=provider_id,
        sent_at=clock_timestamp(),draft_source_body=null,blocked_reason=null
        where n.id=notification_id and n.status in ('unknown','review')
            and n.send_owner=worker_id and n.draft_expires_at is null;
    if not found then raise exception 'notification is not owned by this worker' using errcode='55000'; end if;
end;
$$;

create or replace function public.fail_wa_notification(notification_id uuid,worker_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
    update public.wa_notifications n set status='failed',blocked_reason='provider_refused',draft_source_body=null
        where n.id=notification_id and n.status in ('unknown','review')
            and n.send_owner=worker_id and n.draft_expires_at is null;
    if not found then raise exception 'notification is not owned by this worker' using errcode='55000'; end if;
end;
$$;

create or replace function public.finish_wa_reply(outbound_id uuid,worker_id uuid,provider_id text) returns void
language plpgsql security invoker set search_path='' as $$
begin
    if provider_id is null or provider_id!~'^meta:[^[:space:]]+$' then
        raise exception 'invalid Meta message id';
    end if;
    update public.wa_messages m set send_status='sent',provider_message_id=provider_id,sent_at=clock_timestamp()
        where m.id=outbound_id and m.direction='outbound' and m.send_status in ('unknown','review')
            and m.send_owner=worker_id;
    if not found then raise exception 'reply send is not owned by this worker'; end if;
end;
$$;

create or replace function public.fail_wa_reply(outbound_id uuid,worker_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
    update public.wa_messages m set send_status='failed'
        where m.id=outbound_id and m.direction='outbound' and m.send_status in ('unknown','review')
            and m.send_owner=worker_id;
    if not found then raise exception 'reply send is not owned by this worker'; end if;
end;
$$;

revoke all on function public.resume_wa_after_uncertain_send(text) from public,anon,authenticated;
grant execute on function public.resume_wa_after_uncertain_send(text) to service_role;
notify pgrst,'reload schema';
