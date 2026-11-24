-- Chef-facing changes join the existing durable notification outbox. No raw
-- product rows are sent to a webhook, and writes never grant messaging consent.
alter table public.wa_notifications
    drop constraint wa_notifications_kind_check,
    drop constraint wa_notifications_check,
    add column booking_id uuid,
    add column booking_owner uuid,
    add column booking_end_at timestamptz,
    add column booking_deleted boolean not null default false,
    add constraint wa_notifications_kind_check check (kind in ('catering_alert','catering_update','booking_update','staff_reply')),
    add constraint wa_notifications_target_check check (
        (kind in ('catering_alert','catering_update') and catering_id is not null and actor_id is null
            and request_id is null and booking_id is null and booking_owner is null and booking_end_at is null and not booking_deleted)
        or (kind='staff_reply' and catering_id is null and actor_id is not null and request_id is not null
            and booking_id is null and booking_owner is null and booking_end_at is null and not booking_deleted)
        or (kind='booking_update' and catering_id is null and actor_id is null and request_id is null
            and booking_id is not null and booking_owner is not null and booking_end_at is not null));
-- Several edits before delivery become one current update; an in-flight send is immutable.
create unique index wa_notifications_catering_update_pending on public.wa_notifications(chef_id,catering_id)
    where kind='catering_update' and status in ('pending','blocked');
create unique index wa_notifications_booking_update_pending on public.wa_notifications(chef_id,booking_id)
    where kind='booking_update' and status in ('pending','blocked');

-- Formats current canonical facts instead of trusting an old queued message.
create function public.wa_catering_update_body(request public.whatsapp_catering) returns text
language sql stable security invoker set search_path='' as $$
    -- 2000 PostgreSQL characters fit the worker's 4000 UTF-16-unit limit, even with emoji.
    select case when char_length(body)>2000 then left(body,1997)||'...' else body end
    from (select 'Catering update '||request.ref_code||': '||left(request.meal_name,300)
        ||'. Status: '||case when request.is_accepted then 'accepted' else request.request_status end
        ||'. Guests: '||request.num_people
        ||case when request.event_at is not null then '. Event: '
            ||to_char(request.event_at at time zone 'America/Los_Angeles','YYYY-MM-DD HH24:MI')||' Oakland time' else '' end
        ||case when request.location is not null then '. Location: '||request.location else '' end
        ||case when request.details<>'' then '. Details: '||request.details else '' end||'.' as body) formatted;
$$;

-- JSON permits the same trigger on the legacy and newer multi-amenity schema.
create function public.wa_booking_update_body(booking jsonb,removed boolean) returns text
language sql stable security invoker set search_path='' as $$
    -- 2000 PostgreSQL characters fit the worker's 4000 UTF-16-unit limit, even with emoji.
    select case when char_length(body)>2000 then left(body,1997)||'...' else body end
    from (select 'Kitchen reservation '||left(booking->>'id',8)||': '
        ||left(coalesce(nullif(booking->>'title',''),'Kitchen reservation'),120)
        ||case when removed then ' was removed.' else '. Status: '||(booking->>'approval_status')
            ||'. '||to_char((booking->>'start_time')::timestamptz at time zone 'America/Los_Angeles','YYYY-MM-DD HH24:MI')
            ||' to '||to_char((booking->>'end_time')::timestamptz at time zone 'America/Los_Angeles','YYYY-MM-DD HH24:MI')||' Oakland time'
            ||'. Amenities: '||coalesce((select string_agg(a,', ' order by a)
                from jsonb_array_elements_text(booking->'amenities') a),booking->>'amenity')
            ||'. People: '||(booking->>'num_people')||'.' end as body) formatted;
$$;

-- Only changes to an already announced request need an additional update.
create function public.queue_wa_catering_update() returns trigger
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
        and n.catering_id=new.catering_id and n.kind='catering_alert' and n.status in ('sent','unknown')) then
        insert into public.wa_notifications(chef_id,kind,catering_id,body)
        values(target,'catering_update',new.catering_id,public.wa_catering_update_body(new))
        on conflict (chef_id,catering_id) where kind='catering_update' and status in ('pending','blocked')
        do update set body=excluded.body,status='pending',blocked_reason=null;
    end if;
    return new;
end;
$$;
create trigger queue_wa_catering_update after update on public.whatsapp_catering
    for each row execute function public.queue_wa_catering_update();

-- Booking changes notify only their opted-in owner, never other kitchen users.
create function public.queue_wa_booking_update() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid; booking jsonb; removed boolean:=tg_op='DELETE';
begin
    if tg_table_schema<>'public' or tg_table_name<>'booking_event' or tg_op not in ('INSERT','UPDATE','DELETE') then
        raise exception 'invalid booking update trigger' using errcode='42501';
    end if;
    if tg_op='DELETE' then booking:=to_jsonb(old); else booking:=to_jsonb(new); end if;
    if (booking->>'end_time')::timestamptz<=clock_timestamp() then return null; end if;
    -- Internal conflict metadata and additional-contact edits do not change a chef's reservation.
    if tg_op='UPDATE' and (to_jsonb(old)-array['has_conflicts','additional_contacts'])
        is not distinct from (booking-array['has_conflicts','additional_contacts']) then return null; end if;
    select c.id into target from public.chefs c where c.user_id=(booking->>'user')::uuid
        and c.active and c.opted_in_at is not null and c.opted_out_at is null;
    if target is not null then
        insert into public.wa_notifications(chef_id,kind,booking_id,booking_owner,booking_end_at,booking_deleted,body)
        values(target,'booking_update',(booking->>'id')::uuid,(booking->>'user')::uuid,(booking->>'end_time')::timestamptz,removed,
            public.wa_booking_update_body(booking,removed))
        on conflict (chef_id,booking_id) where kind='booking_update' and status in ('pending','blocked')
        do update set body=excluded.body,booking_deleted=excluded.booking_deleted,booking_end_at=excluded.booking_end_at,status='pending',blocked_reason=null;
    end if;
    return null;
end;
$$;
create trigger queue_wa_booking_update after insert or update or delete on public.booking_event
    for each row execute function public.queue_wa_booking_update();

-- Keep the existing consent, STOP, takeover, lease and uncertain-send guards.
create or replace function public.claim_wa_notification(target_phone text,worker_id uuid,template_name text default null,template_language text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare chef public.chefs%rowtype; conversation public.wa_conversations%rowtype;
    notification public.wa_notifications%rowtype; request public.whatsapp_catering%rowtype;
    bound uuid; fresh boolean; template boolean; booking public.booking_event%rowtype;
begin
    if worker_id is null then raise exception 'worker_id required' using errcode='22023'; end if;
    bound:=public.resolve_wa_chef(target_phone);
    select c.* into chef from public.chefs c where c.id=bound and c.wa_phone=target_phone and c.active for share;
    if not found then return null; end if;
    insert into public.wa_conversations(chef_id) values(chef.id) on conflict do nothing;
    select v.* into conversation from public.wa_conversations v where v.chef_id=chef.id for update skip locked;
    if not found then return null; end if;
    -- STOP must be honored while staff takeover has paused the normal AI worker.
    if exists(select 1 from public.wa_messages m where m.chef_id=chef.id and m.direction='inbound'
        and m.provider='meta' and m.processed_at is null and btrim(m.body)~* '^(stop|unsubscribe)[.!]?$'
        and m.sent_at>clock_timestamp()-interval '24 hours' and m.sent_at<=clock_timestamp()+interval '5 minutes') then
        update public.chefs c set opted_out_at=clock_timestamp() where c.id=chef.id;
        update public.wa_messages m set processed_at=clock_timestamp() where m.chef_id=chef.id
            and m.direction='inbound' and m.processed_at is null and btrim(m.body)~* '^(stop|unsubscribe)[.!]?$';
        update public.wa_notifications n set status='blocked',blocked_reason='opted_out'
            where n.chef_id=chef.id and n.status in ('pending','blocked');
        return null;
    end if;
    if chef.opted_out_at is not null then return null; end if;
    if conversation.lease_until>clock_timestamp() or exists(select 1 from public.wa_messages m
        where m.chef_id=chef.id and m.direction='outbound' and m.send_status in ('pending','unknown'))
        or exists(select 1 from public.wa_notifications n where n.chef_id=chef.id and n.status='unknown') then return null; end if;
    select exists(select 1 from public.wa_messages m where m.chef_id=chef.id and m.direction='inbound'
        and m.provider='meta' and m.sent_at>clock_timestamp()-interval '24 hours'
        and m.sent_at<=clock_timestamp()+interval '5 minutes') into fresh;
    for notification in select n.* from public.wa_notifications n where n.chef_id=chef.id
        and n.status in ('pending','blocked') and (n.kind='staff_reply' or not conversation.human_takeover)
        order by (n.kind='staff_reply') desc,n.created_at,n.id for update skip locked loop
        template:=false;
        if notification.kind='staff_reply' then
            if not conversation.human_takeover or not fresh or not exists (
                select 1 from public.users u where u.userid=notification.actor_id and u.is_admin) then
                update public.wa_notifications n set status='failed',blocked_reason='staff_reply_unavailable' where n.id=notification.id;
                continue;
            end if;
        else
            -- Keep an interest confirmation question adjacent to its answer.
            -- A new gig alert must not make "confirm" appear to refer to it.
            if exists(select 1 from public.pending_confirmations p
                where p.chef_id=chef.id and p.expires_at>clock_timestamp()) then
                update public.wa_notifications n set status='blocked',blocked_reason='confirmation_pending' where n.id=notification.id;
                continue;
            end if;
            if chef.opted_in_at is null then
                update public.wa_notifications n set status='blocked',blocked_reason='consent_required' where n.id=notification.id;
                continue;
            end if;
            -- Product writers already hold the entity lock before updating this outbox.
            -- Read its committed snapshot without taking the opposite lock order.
            if notification.kind='booking_update' then
                select b.* into booking from public.booking_event b where b.id=notification.booking_id;
                if (found and (booking."user" is distinct from chef.user_id or booking.end_time<=clock_timestamp()))
                    or notification.booking_owner is distinct from chef.user_id
                    or (not found and (not notification.booking_deleted or notification.booking_end_at<=clock_timestamp())) then
                    update public.wa_notifications n set status='failed',blocked_reason='booking_unavailable' where n.id=notification.id;
                    continue;
                end if;
                -- Deleted bookings retain only the original owner's removal notice.
                if found then notification.body:=public.wa_booking_update_body(to_jsonb(booking),false); end if;
            else
                select o.* into request from public.whatsapp_catering o where o.catering_id=notification.catering_id
                    and o.chef=chef.whatsapp_user_id;
                if not found or (request.event_at is not null and request.event_at<=clock_timestamp())
                    or (notification.kind='catering_alert' and (request.request_status<>'open' or request.is_accepted)) then
                    update public.wa_notifications n set status='failed',blocked_reason='request_unavailable' where n.id=notification.id;
                    continue;
                end if;
                notification.body:=case when notification.kind='catering_alert' then
                    'New catering request '||request.ref_code||': '||left(request.meal_name,300)
                        ||'. Reply with the reference to ask about it or respond.'
                    else public.wa_catering_update_body(request) end;
            end if;
            if not fresh then
                -- The catering-assignment template cannot be reused for unrelated updates.
                if notification.kind<>'catering_alert' or coalesce(template_name,'')!~'^[a-z0-9_]+$'
                    or char_length(template_name)>512 or coalesce(template_language,'')!~'^[a-z]{2,3}(_[A-Z]{2})?$' then
                    update public.wa_notifications n set status='blocked',blocked_reason='template_required' where n.id=notification.id;
                    continue;
                end if;
                template:=true;
            end if;
        end if;
        update public.wa_notifications n set status='unknown',body=notification.body,blocked_reason=null,send_owner=worker_id,
            send_started_at=clock_timestamp() where n.id=notification.id;
        return jsonb_build_object('id',notification.id,'phone',chef.wa_phone,'kind',case when template then 'template' else 'text' end,
            'body',notification.body)||case when template then jsonb_build_object('template',jsonb_build_object(
                'name',template_name,'language',template_language,'bodyParameters',jsonb_build_array(request.ref_code,request.meal_name))) else '{}'::jsonb end;
    end loop;
    return null;
end;
$$;

-- Add sent automated messages to the conversation without exposing another owner's records.
alter function public.claim_wa_turn(text,uuid) rename to claim_wa_turn_before_proactive_updates;
create function public.claim_wa_turn(target_phone text,worker_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare target uuid; result jsonb; notifications jsonb; quoted jsonb;
begin
    target:=public.resolve_wa_chef(target_phone);
    if target is null then return null; end if;
    result:=public.claim_wa_turn_before_proactive_updates(target_phone,worker_id);
    if result is null then return null; end if;
    select coalesce(jsonb_agg(jsonb_build_object('body',n.body,
        'sentAt',to_char(n.sent_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
        order by n.sent_at,n.id),'[]'::jsonb) into notifications
    from (select x.* from public.wa_notifications x join public.chefs c on c.id=target
        where x.chef_id=target and x.kind<>'staff_reply' and x.status='sent' and (
            (x.kind in ('catering_alert','catering_update') and exists(select 1 from public.whatsapp_catering o
                where o.catering_id=x.catering_id and o.chef=c.whatsapp_user_id))
            or (x.kind='booking_update' and x.booking_owner=c.user_id and (
                exists(select 1 from public.booking_event b where b.id=x.booking_id and b."user"=c.user_id)
                or (x.booking_deleted and not exists(select 1 from public.booking_event b where b.id=x.booking_id)))))
        order by x.sent_at desc,x.id desc limit 12) n;
    result:=jsonb_set(result,'{state,notificationMessages}',notifications);
    select jsonb_build_object('reference',o.ref_code) into quoted
    from public.wa_notifications n join public.chefs c on c.id=target
    join public.whatsapp_catering o on o.catering_id=n.catering_id and o.chef=c.whatsapp_user_id
    where n.chef_id=target and n.kind='catering_update' and n.status='sent'
        and n.provider_message_id=result#>>'{message,contextMessageId}';
    if quoted is not null then result:=jsonb_set(result,'{state,quotedCateringRequest}',quoted); end if;
    return result;
end;
$$;

-- Trigger elevation is narrow; direct browser calls and outbox writes remain forbidden.
do $$
declare routine regprocedure;
begin
    for routine in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname in ('wa_catering_update_body','wa_booking_update_body',
            'queue_wa_catering_update','queue_wa_booking_update','claim_wa_notification','claim_wa_turn',
            'claim_wa_turn_before_proactive_updates') loop
        execute format('revoke all on function %s from public,anon,authenticated',routine);
        execute format('grant execute on function %s to service_role',routine);
    end loop;
end;
$$;
