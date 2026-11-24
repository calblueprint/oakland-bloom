-- Read only the facts that belong in one automated notice. Rebuild the source
-- body at the same time so the worker can catch edits while the agent writes.
create function public.wa_agent_notice_snapshot(
    notice public.wa_notifications, chef public.chefs
) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare
    request public.whatsapp_catering%rowtype;
    booking public.booking_event%rowtype;
    booking_data jsonb;
    facts jsonb;
    source_body text;
    removed_prefix text;
    removed_suffix constant text:=' was removed.';
begin
    if notice.kind in ('catering_alert','catering_update') then
        select o.* into request from public.whatsapp_catering o
            where o.catering_id=notice.catering_id and o.chef=chef.whatsapp_user_id;
        if not found or request.event_at<=clock_timestamp() then return null; end if;
        facts:=jsonb_build_object('reference',request.ref_code,'title',left(request.meal_name,300));
        if notice.kind='catering_alert' then
            if request.request_status<>'open' or request.is_accepted then return null; end if;
            source_body:='New catering request '||request.ref_code||': '||left(request.meal_name,300)
                ||'. Reply with the reference to ask about it or respond.';
        else
            source_body:=public.wa_catering_update_body(request);
            facts:=facts||jsonb_build_object(
                'status',case when request.is_accepted then 'accepted' else request.request_status end,
                'startsAt',request.event_at,'guestCount',request.num_people::text,
                'location',request.location,'details',case
                    when char_length(request.details)>800 then left(request.details,799)||'…'
                    else nullif(request.details,'') end);
        end if;
    elsif notice.kind='booking_update' then
        if notice.booking_owner is distinct from chef.user_id then return null; end if;
        select b.* into booking from public.booking_event b where b.id=notice.booking_id;
        facts:=jsonb_build_object('reference',left(notice.booking_id::text,8));
        if found then
            if booking."user" is distinct from chef.user_id or booking.end_time<=clock_timestamp()
                then return null; end if;
            booking_data:=to_jsonb(booking);
            source_body:=public.wa_booking_update_body(booking_data,false);
            facts:=facts||jsonb_build_object(
                'title',nullif(booking_data->>'title',''),'status',booking.approval_status,
                'startsAt',booking.start_time,'endsAt',booking.end_time,
                'amenities',coalesce(booking_data->'amenities',jsonb_build_array(booking.amenity)),
                'guestCount',booking.num_people::text);
        elsif notice.booking_deleted and notice.booking_end_at>clock_timestamp() then
            source_body:=notice.body;
            facts:=facts||jsonb_build_object('status','removed');
            -- The original booking is gone, so keep the title from its removal snapshot.
            removed_prefix:='Kitchen reservation '||left(notice.booking_id::text,8)||': ';
            if starts_with(source_body,removed_prefix)
                and right(source_body,char_length(removed_suffix))=removed_suffix then
                facts:=facts||jsonb_build_object('title',substring(source_body from
                    char_length(removed_prefix)+1 for
                    char_length(source_body)-char_length(removed_prefix)-char_length(removed_suffix)));
            end if;
        else
            return null;
        end if;
    else
        return null;
    end if;
    return jsonb_build_object('body',source_body,
        'facts',jsonb_strip_nulls(facts||jsonb_build_object('notificationKind',notice.kind)));
end;
$$;

-- Retire unsent claims that are permanently invalid. Requeue temporary failures
-- unless a newer change has already filled that entity's pending slot.
create function public.release_wa_agent_notice(
    notice public.wa_notifications, next_status text, reason text
) returns void
language plpgsql security invoker set search_path='' as $$
begin
    update public.wa_notifications n set status=next_status,blocked_reason=reason,
        send_owner=null,send_started_at=null
        where n.id=notice.id and n.status='unknown' and n.send_owner=notice.send_owner;
exception when unique_violation then
    update public.wa_notifications n set status='failed',blocked_reason='superseded',
        send_owner=null,send_started_at=null
        where n.id=notice.id and n.status='unknown' and n.send_owner=notice.send_owner;
end;
$$;

-- Keep the older claim RPC and its response shape available during deployment.
create function public.claim_wa_notification_for_agent(
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
    return claimed||jsonb_build_object('facts',snapshot->'facts');
end;
$$;

-- The agent may take a few seconds. Recheck eligibility before sending and
-- store the actual text so future conversations see what the chef received.
create function public.prepare_wa_agent_notice(
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
        and n.status='unknown' and n.kind in ('catering_alert','catering_update','booking_update');
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
        and n.status='unknown' and n.kind in ('catering_alert','catering_update','booking_update') for update;
    if not found then return false; end if;
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

    update public.wa_notifications n set body=styled_body where n.id=notice.id;
    return true;
end;
$$;

revoke all on function public.wa_agent_notice_snapshot(public.wa_notifications,public.chefs),
    public.release_wa_agent_notice(public.wa_notifications,text,text),
    public.claim_wa_notification_for_agent(text,uuid,text,text),
    public.prepare_wa_agent_notice(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.wa_agent_notice_snapshot(public.wa_notifications,public.chefs),
    public.release_wa_agent_notice(public.wa_notifications,text,text),
    public.claim_wa_notification_for_agent(text,uuid,text,text),
    public.prepare_wa_agent_notice(uuid,uuid,text,text) to service_role;
