-- A timed-out draft has never reached Meta and is safe to recover. Preserve
-- the existing unknown status so it serializes with chat, and use an explicit
-- deadline to distinguish drafts from genuinely ambiguous provider sends.
alter table public.wa_notifications
    add column draft_expires_at timestamptz,
    add column draft_source_body text,
    add constraint wa_notifications_draft_check check (
        (draft_expires_at is null and draft_source_body is null)
        or (status='unknown' and send_owner is not null
            and kind in ('catering_alert','catering_update','booking_update')));

-- Release only the same claimed state; an old worker cannot release a newer claim.
create or replace function public.release_wa_agent_notice(
    notice public.wa_notifications, next_status text, reason text
) returns void
language plpgsql security invoker set search_path='' as $$
begin
    update public.wa_notifications n set status=next_status,blocked_reason=reason,
        body=coalesce(notice.draft_source_body,n.body),draft_source_body=null,
        send_owner=null,send_started_at=null,draft_expires_at=null
        where n.id=notice.id and n.status='unknown' and n.send_owner=notice.send_owner
        and n.draft_expires_at is not distinct from notice.draft_expires_at;
exception when unique_violation then
    update public.wa_notifications n set status='failed',blocked_reason='superseded',
        draft_source_body=null,send_owner=null,send_started_at=null,draft_expires_at=null
        where n.id=notice.id and n.status='unknown' and n.send_owner=notice.send_owner
        and n.draft_expires_at is not distinct from notice.draft_expires_at;
end;
$$;

-- Drafting does not announce an assignment. Keep edits from the provider round trip queued for later.
create or replace function public.queue_wa_catering_update() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
    if tg_table_schema<>'public' or tg_table_name<>'whatsapp_catering' or tg_op<>'UPDATE' then
        raise exception 'invalid catering update trigger' using errcode='42501';
    end if;
    if old.chef is distinct from new.chef
        or (new.event_at is not null and new.event_at<=clock_timestamp())
        or row(old.meal_name,old.num_people,old.event_at,old.location,old.details,old.request_status,old.is_accepted)
            is not distinct from row(new.meal_name,new.num_people,new.event_at,new.location,new.details,new.request_status,new.is_accepted)
        then return new; end if;
    select c.id into target from public.chefs c where c.whatsapp_user_id=new.chef
        and c.active and c.opted_in_at is not null and c.opted_out_at is null;
    if target is not null and exists(select 1 from public.wa_notifications n where n.chef_id=target
        and n.catering_id=new.catering_id and n.kind='catering_alert'
        and (n.status='sent' or (n.status='unknown' and n.draft_expires_at is null))) then
        insert into public.wa_notifications(chef_id,kind,catering_id,body)
        values(target,'catering_update',new.catering_id,public.wa_catering_update_body(new))
        on conflict (chef_id,catering_id) where kind='catering_update' and status in ('pending','blocked')
        do update set body=excluded.body,status='pending',blocked_reason=null;
    end if;
    return new;
end;
$$;
-- Recover reversible drafts before polling the outbox. Every caller keeps the
-- same RPC contract, and provider sends with uncertain outcomes stay parked.
alter function public.claim_wa_notification(text,uuid,text,text) rename to claim_wa_notification_candidate;
create function public.claim_wa_notification(
    target_phone text,worker_id uuid,template_name text default null,template_language text default null
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
    target uuid;
    draft public.wa_notifications%rowtype;
    claimed jsonb;
    candidate public.wa_notifications%rowtype;
begin
    if worker_id is null then raise exception 'worker_id required' using errcode='22023'; end if;
    target:=public.resolve_wa_chef(target_phone);
    if target is null then return null; end if;
    for draft in select n.* from public.wa_notifications n where n.chef_id=target
        and n.status='unknown' and n.draft_expires_at<=clock_timestamp()
        order by n.id for update skip locked loop
        perform public.release_wa_agent_notice(draft,'pending','draft_expired');
    end loop;

    loop
        claimed:=public.claim_wa_notification_candidate(target_phone,worker_id,template_name,template_language);
        if claimed is null then return null; end if;
        select n.* into strict candidate from public.wa_notifications n where n.id=(claimed->>'id')::uuid;
        if candidate.kind<>'catering_update' or exists(select 1 from public.wa_notifications initial
            where initial.chef_id=candidate.chef_id and initial.catering_id=candidate.catering_id
                and initial.kind='catering_alert' and initial.status='sent') then return claimed; end if;
        -- A follow-up queued in the provider round trip may outlive a failed initial alert.
        perform public.release_wa_agent_notice(candidate,'failed','initial_alert_unsent');
    end loop;
end;
$$;

-- Give agent work an expiry without changing the worker's RPC arguments.
create or replace function public.claim_wa_notification_for_agent(
    target_phone text,worker_id uuid,template_name text default null,template_language text default null
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
    claimed jsonb;
    notice public.wa_notifications%rowtype;
    chef public.chefs%rowtype;
    snapshot jsonb;
begin
    claimed:=public.claim_wa_notification(target_phone,worker_id,template_name,template_language);
    if claimed is null or claimed->>'kind'<>'text' then return claimed; end if;
    select n.* into strict notice from public.wa_notifications n where n.id=(claimed->>'id')::uuid;
    if notice.kind='staff_reply' then return claimed; end if;
    select c.* into strict chef from public.chefs c where c.id=notice.chef_id;
    snapshot:=public.wa_agent_notice_snapshot(notice,chef);
    if snapshot is null then
        perform public.release_wa_agent_notice(notice,'failed','notice_unavailable');
        return null;
    end if;
    if snapshot->>'body' is distinct from notice.body then
        perform public.release_wa_agent_notice(notice,'pending','notice_changed');
        return null;
    end if;
    -- Mark the reversible draft inside the same transaction as claiming.
    update public.wa_notifications n set draft_expires_at=clock_timestamp()+interval '45 seconds'
        where n.id=notice.id;
    return claimed||jsonb_build_object('facts',snapshot->'facts');
end;
$$;

-- Recheck the draft and end the recovery window before calling Meta.
create or replace function public.prepare_wa_agent_notice(
    notification_id uuid,worker_id uuid,styled_body text,target_phone text
) returns boolean
language plpgsql security invoker set search_path='' as $$
declare
    notice public.wa_notifications%rowtype;
    chef public.chefs%rowtype;
    conversation public.wa_conversations%rowtype;
    bound uuid;
    snapshot jsonb;
begin
    if styled_body is null or char_length(btrim(styled_body)) not between 1 and 4000
        or char_length(styled_body)>4000 then
        raise exception 'invalid styled notification' using errcode='22023';
    end if;
    select n.* into notice from public.wa_notifications n where n.id=notification_id and n.send_owner=worker_id
        and n.status='unknown' and n.draft_expires_at is not null
        and n.kind in ('catering_alert','catering_update','booking_update');
    if not found then return false; end if;

    -- Match the normal claim lock order: phone/chef, conversation, notification.
    bound:=public.resolve_wa_chef(target_phone);
    if bound is distinct from notice.chef_id then
        perform public.release_wa_agent_notice(notice,'failed','notice_unavailable');
        return false;
    end if;
    select c.* into chef from public.chefs c where c.id=notice.chef_id for update;
    select v.* into conversation from public.wa_conversations v where v.chef_id=chef.id for update;
    select n.* into notice from public.wa_notifications n where n.id=notification_id and n.send_owner=worker_id
        and n.status='unknown' and n.draft_expires_at is not null
        and n.kind in ('catering_alert','catering_update','booking_update') for update;
    if not found then return false; end if;
    if notice.draft_expires_at<=clock_timestamp() then
        perform public.release_wa_agent_notice(notice,'pending','draft_expired');
        return false;
    end if;
    if chef.wa_phone is distinct from target_phone or not chef.active then
        perform public.release_wa_agent_notice(notice,'failed','notice_unavailable');
        return false;
    end if;
    if chef.opted_out_at is not null or exists(select 1 from public.wa_messages m
        where m.chef_id=chef.id and m.direction='inbound' and m.provider='meta'
            and m.processed_at is null and btrim(m.body)~* '^(stop|unsubscribe)[.!]?$'
            and m.sent_at>clock_timestamp()-interval '24 hours'
            and m.sent_at<=clock_timestamp()+interval '5 minutes') then
        perform public.release_wa_agent_notice(notice,'blocked','opted_out');
        return false;
    end if;
    if chef.opted_in_at is null or conversation.human_takeover
        or conversation.lease_until>clock_timestamp() or exists(select 1 from public.pending_confirmations p
            where p.chef_id=chef.id and p.expires_at>clock_timestamp()) then
        perform public.release_wa_agent_notice(notice,'blocked','eligibility_changed');
        return false;
    end if;
    if not exists(select 1 from public.wa_messages m
        where m.chef_id=chef.id and m.direction='inbound' and m.provider='meta'
            and m.sent_at>clock_timestamp()-interval '24 hours'
            and m.sent_at<=clock_timestamp()+interval '5 minutes') then
        perform public.release_wa_agent_notice(notice,'blocked','template_required');
        return false;
    end if;

    snapshot:=public.wa_agent_notice_snapshot(notice,chef);
    if snapshot is null then
        perform public.release_wa_agent_notice(notice,'failed','notice_unavailable');
        return false;
    end if;
    if exists(select 1 from public.wa_notifications newer where newer.id<>notice.id
        and newer.chef_id=notice.chef_id and newer.kind=notice.kind and newer.status in ('pending','blocked')
        and ((notice.catering_id is not null and newer.catering_id=notice.catering_id)
            or (notice.booking_id is not null and newer.booking_id=notice.booking_id))) then
        perform public.release_wa_agent_notice(notice,'failed','superseded');
        return false;
    end if;
    if snapshot->>'body' is distinct from notice.body then
        perform public.release_wa_agent_notice(notice,'pending','notice_changed');
        return false;
    end if;

    -- After preparation it is no longer safe to assume a send never happened.
    update public.wa_notifications n set body=styled_body,draft_source_body=notice.body,draft_expires_at=null,
        send_started_at=clock_timestamp() where n.id=notice.id;
    return true;
end;
$$;

-- Call only if the worker knows it did not contact Meta. This also covers
-- a prepare response that was lost after the database committed.
create function public.abandon_wa_agent_notice(notification_id uuid,worker_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare notice public.wa_notifications%rowtype;
begin
    select n.* into notice from public.wa_notifications n where n.id=notification_id
        and n.status='unknown' and n.send_owner=worker_id
        and (n.draft_expires_at is not null or n.draft_source_body is not null)
        for update;
    if found then
        perform public.release_wa_agent_notice(notice,'pending','draft_abandoned');
    end if;
end;
$$;

-- Acceptance or a definite refusal ends recovery and drops the old draft text.
create or replace function public.finish_wa_notification(notification_id uuid,worker_id uuid,provider_id text) returns void
language plpgsql security invoker set search_path='' as $$
begin
    if provider_id is null or provider_id!~'^meta:[^[:space:]]+$' then
        raise exception 'invalid Meta message ID' using errcode='22023';
    end if;
    update public.wa_notifications n set status='sent',provider_message_id=provider_id,
        sent_at=clock_timestamp(),draft_source_body=null
        where n.id=notification_id and n.status='unknown' and n.send_owner=worker_id and n.draft_expires_at is null;
    if not found then raise exception 'notification is not owned by this worker' using errcode='55000'; end if;
end;
$$;

-- Only definite provider refusals become failed. Ambiguous outcomes remain unknown.
create or replace function public.fail_wa_notification(notification_id uuid,worker_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
    update public.wa_notifications n set status='failed',blocked_reason='provider_refused',draft_source_body=null
        where n.id=notification_id and n.status='unknown' and n.send_owner=worker_id and n.draft_expires_at is null;
    if not found then raise exception 'notification is not owned by this worker' using errcode='55000'; end if;
end;
$$;

revoke all on function public.claim_wa_notification(text,uuid,text,text),
    public.claim_wa_notification_candidate(text,uuid,text,text),
    public.abandon_wa_agent_notice(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_wa_notification(text,uuid,text,text),
    public.claim_wa_notification_candidate(text,uuid,text,text),
    public.abandon_wa_agent_notice(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
