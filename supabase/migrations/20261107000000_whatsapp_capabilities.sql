-- Backend-only staff operations and opted-in catering notifications.
-- Notifications use their own outbox: unknown means a send may have succeeded.
create table public.wa_notifications (
    id uuid primary key default gen_random_uuid(),
    chef_id uuid not null references public.chefs(id),
    kind text not null check (kind in ('catering_alert','staff_reply')),
    catering_id uuid references public.whatsapp_catering(catering_id),
    actor_id uuid references public.users(userid),
    request_id uuid unique,
    body text not null check (char_length(btrim(body)) between 1 and 4000),
    status text not null default 'pending' check (status in ('pending','unknown','sent','failed','blocked')),
    blocked_reason text,
    send_owner uuid,
    send_started_at timestamptz,
    provider_message_id text unique,
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    check ((kind='catering_alert' and catering_id is not null and actor_id is null and request_id is null)
        or (kind='staff_reply' and catering_id is null and actor_id is not null and request_id is not null))
);
create unique index wa_notifications_catering_once on public.wa_notifications(chef_id,catering_id)
    where kind='catering_alert';
create index wa_notifications_pending on public.wa_notifications(chef_id,created_at)
    where status in ('pending','blocked');
alter table public.wa_notifications enable row level security;

create table public.wa_alert_consent_log (
    id uuid primary key default gen_random_uuid(),
    chef_id uuid not null references public.chefs(id),
    actor_id uuid not null references public.users(userid),
    opted_in boolean not null,
    evidence text not null check (char_length(btrim(evidence)) between 1 and 500),
    created_at timestamptz not null default now()
);
alter table public.wa_alert_consent_log enable row level security;
revoke all on public.wa_notifications,public.wa_alert_consent_log from anon,authenticated;
grant select,insert,update,delete on public.wa_notifications to service_role;
revoke all on public.wa_alert_consent_log from service_role;
grant select,insert on public.wa_alert_consent_log to service_role;

-- Rechecks the database role instead of trusting a caller-supplied admin flag.
create function public.require_wa_admin(actor_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
    perform 1 from public.users u where u.userid=actor_id and u.is_admin for share;
    if not found then raise exception 'admin required' using errcode='42501'; end if;
end;
$$;

-- Lists unresolved help requests for the authenticated staff API.
create function public.get_wa_staff_queue(actor_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
    perform public.require_wa_admin(actor_id);
    select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'chefId',c.id,'chefName',c.name,
        'reason',h.reason,'status',h.status,'createdAt',h.created_at,
        'humanTakeover',coalesce(v.human_takeover,false),'assignedAdmin',h.assigned_admin)
        order by h.created_at,h.id),'[]'::jsonb) into result
    from public.handoffs h join public.chefs c on c.id=h.chef_id
    left join public.wa_conversations v on v.chef_id=c.id where h.status<>'resolved';
    return result;
end;
$$;

-- Returns recent chat and delivery records; never returns tokens or internal tool state.
create function public.get_wa_staff_conversation(actor_id uuid,chef_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare chef public.chefs%rowtype; messages jsonb; handoffs jsonb; takeover boolean;
begin
    perform public.require_wa_admin(actor_id);
    select c.* into chef from public.chefs c where c.id=chef_id;
    if not found then raise exception 'chef not found' using errcode='P0002'; end if;
    select coalesce(v.human_takeover,false) into takeover from public.wa_conversations v where v.chef_id=chef.id;
    select coalesce(jsonb_agg(x.message order by x.at,x.id),'[]'::jsonb) into messages from (
        select * from (
            select m.id,m.received_at as at,jsonb_build_object('id',m.id,'direction',m.direction,
                'body',m.body,'receivedAt',m.received_at,'sentAt',m.sent_at,'status',m.send_status,'source','chat','kind','chat') as message
            from public.wa_messages m where m.chef_id=chef.id
            union all
            select n.id,n.created_at,jsonb_build_object('id',n.id,'direction','outbound','body',n.body,
                'receivedAt',n.created_at,'sentAt',n.sent_at,'status',n.status,'source','notification',
                'kind',n.kind,'blockedReason',n.blocked_reason)
            from public.wa_notifications n where n.chef_id=chef.id
        ) all_messages order by at desc,id desc limit 50
    ) x;
    select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'reason',h.reason,'status',h.status,
        'createdAt',h.created_at,'resolvedAt',h.resolved_at) order by h.created_at,h.id),'[]'::jsonb)
    into handoffs from public.handoffs h where h.chef_id=chef.id;
    return jsonb_build_object('chef',jsonb_build_object('id',chef.id,'name',chef.name,'phone',chef.wa_phone,
        'humanTakeover',coalesce(takeover,false)),'messages',messages,'handoffs',handoffs);
end;
$$;

-- Pauses/resumes future AI turns and expires queued work from before the handoff.
create function public.set_wa_staff_takeover(actor_id uuid,chef_id uuid,takeover boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare target uuid; current_takeover boolean;
begin
    perform public.require_wa_admin(actor_id);
    if takeover is null then raise exception 'takeover is required' using errcode='22023'; end if;
    select c.id into target from public.chefs c where c.id=chef_id for share;
    if not found then raise exception 'chef not found' using errcode='P0002'; end if;
    insert into public.wa_conversations(chef_id) values(target) on conflict do nothing;
    select c.human_takeover into current_takeover from public.wa_conversations c where c.chef_id=target for update;
    -- A retried pause/resume must not consume messages that arrived after it.
    if current_takeover=takeover then
        return jsonb_build_object('chefId',target,'humanTakeover',takeover);
    end if;
    update public.wa_conversations c set human_takeover=takeover,lease_owner=null,lease_until=null,
        lease_message_id=null where c.chef_id=target;
    delete from public.pending_confirmations p where p.chef_id=target;
    update public.wa_messages m set send_status='failed'
        where m.chef_id=target and m.direction='outbound' and m.send_status='pending';
    -- Human-handled inbound messages must not be replayed to the AI on resume.
    -- Preserve STOP for the worker so switching modes cannot discard an opt-out.
    update public.wa_messages m set processed_at=clock_timestamp()
        where m.chef_id=target and m.direction='inbound' and m.processed_at is null
        and btrim(m.body)!~* '^(stop|unsubscribe)[.!]?$';
    if takeover then
        update public.handoffs h set status='assigned',assigned_admin=actor_id
        where h.chef_id=target and h.status='open';
    else
        update public.wa_notifications n set status='failed',blocked_reason='takeover_ended'
        where n.chef_id=target and n.kind='staff_reply' and n.status in ('pending','blocked');
    end if;
    return jsonb_build_object('chefId',target,'humanTakeover',takeover);
end;
$$;

-- Resolving one review request does not resume the bot or resolve unrelated requests.
create function public.resolve_wa_handoff(actor_id uuid,handoff_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
    perform public.require_wa_admin(actor_id);
    update public.handoffs h set status='resolved',assigned_admin=actor_id,resolved_at=coalesce(h.resolved_at,clock_timestamp())
    where h.id=handoff_id;
    if not found then raise exception 'handoff not found' using errcode='P0002'; end if;
    return jsonb_build_object('id',handoff_id,'status','resolved');
end;
$$;

-- Records staff evidence of explicit consent. A message or assignment never grants consent.
create function public.set_wa_alert_consent(actor_id uuid,chef_id uuid,opted_in boolean,evidence text) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
    perform public.require_wa_admin(actor_id);
    if opted_in is null or evidence is null or char_length(btrim(evidence)) not between 1 and 500 then
        raise exception 'consent evidence is required' using errcode='22023';
    end if;
    update public.chefs c set opted_in_at=case when opted_in then clock_timestamp() end,
        opt_in_method=case when opted_in then 'web' end,
        opted_out_at=case when opted_in then null else clock_timestamp() end where c.id=chef_id;
    if not found then raise exception 'chef not found' using errcode='P0002'; end if;
    insert into public.wa_alert_consent_log(chef_id,actor_id,opted_in,evidence)
    values(chef_id,actor_id,opted_in,btrim(evidence));
    return jsonb_build_object('chefId',chef_id,'optedIn',opted_in);
end;
$$;

-- Queues one staff reply per request ID; repeated HTTP requests cannot send it twice.
create function public.queue_wa_staff_reply(actor_id uuid,chef_id uuid,body text,request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare chef public.chefs%rowtype; previous public.wa_notifications%rowtype; reply_id uuid;
begin
    perform public.require_wa_admin(actor_id);
    if request_id is null or body is null or char_length(btrim(body)) not between 1 and 4000 then
        raise exception 'invalid reply' using errcode='22023';
    end if;
    select c.* into chef from public.chefs c where c.id=chef_id for share;
    if not found then raise exception 'chef not found' using errcode='P0002'; end if;
    perform 1 from public.wa_conversations v where v.chef_id=chef.id and v.human_takeover for update;
    if not found then raise exception 'takeover required' using errcode='55000'; end if;
    select n.* into previous from public.wa_notifications n where n.request_id=queue_wa_staff_reply.request_id;
    if found then
        if previous.chef_id<>chef.id or previous.actor_id<>actor_id or previous.body<>btrim(body) then
            raise exception 'request ID was already used' using errcode='22023';
        end if;
        return jsonb_build_object('id',previous.id,'status',previous.status);
    end if;
    if not chef.active or chef.opted_out_at is not null or not exists (
        select 1 from public.wa_messages m where m.chef_id=chef.id and m.direction='inbound'
        and m.provider='meta' and m.sent_at>clock_timestamp()-interval '24 hours'
        and m.sent_at<=clock_timestamp()+interval '5 minutes') or exists (
        select 1 from public.wa_messages m where m.chef_id=chef.id and m.direction='inbound'
        and m.processed_at is null and btrim(m.body)~* '^(stop|unsubscribe)[.!]?$'
        and m.sent_at>clock_timestamp()-interval '24 hours' and m.sent_at<=clock_timestamp()+interval '5 minutes') then
        raise exception 'chef unavailable or messaging window closed' using errcode='55000';
    end if;
    -- Explicit inbound contact permits a staff reply; proactive alert consent is separate.
    begin
        insert into public.wa_notifications(chef_id,kind,actor_id,request_id,body)
        values(chef.id,'staff_reply',actor_id,request_id,btrim(body)) returning id into reply_id;
    exception when unique_violation then
        raise exception 'request ID was already used' using errcode='22023';
    end;
    return jsonb_build_object('id',reply_id,'status','pending');
end;
$$;

-- Assignments queue alerts only for a previously opted-in transport identity.
create function public.queue_wa_catering_alert() returns trigger
language plpgsql security invoker set search_path='' as $$
declare target uuid;
begin
    if new.request_status<>'open' or new.is_accepted then return new; end if;
    if tg_op='UPDATE' and old.chef is not distinct from new.chef then return new; end if;
    select c.id into target from public.chefs c where c.whatsapp_user_id=new.chef
        and c.active and c.opted_in_at is not null and c.opted_out_at is null;
    if target is not null then
        insert into public.wa_notifications(chef_id,kind,catering_id,body)
        values(target,'catering_alert',new.catering_id,
            'New catering request '||new.ref_code||': '||left(new.meal_name,300)||'. Reply with the reference to ask about it or respond.')
        on conflict (chef_id,catering_id) where kind='catering_alert' do nothing;
    end if;
    return new;
end;
$$;
create trigger queue_wa_catering_alert after insert or update of chef on public.whatsapp_catering
for each row execute function public.queue_wa_catering_alert();

-- Claims one delivery only after access, opt-out, takeover and messaging-window checks.
create function public.claim_wa_notification(target_phone text,worker_id uuid,template_name text default null,template_language text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare chef public.chefs%rowtype; conversation public.wa_conversations%rowtype;
    notification public.wa_notifications%rowtype; request public.whatsapp_catering%rowtype;
    bound uuid; fresh boolean; template boolean;
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
            select o.* into request from public.whatsapp_catering o where o.catering_id=notification.catering_id
                and o.chef=chef.whatsapp_user_id and o.request_status='open' and not o.is_accepted for share;
            if not found then
                update public.wa_notifications n set status='failed',blocked_reason='request_unavailable' where n.id=notification.id;
                continue;
            end if;
            if chef.opted_in_at is null then
                update public.wa_notifications n set status='blocked',blocked_reason='consent_required' where n.id=notification.id;
                continue;
            end if;
            if not fresh then
                if coalesce(template_name,'')!~'^[a-z0-9_]+$' or char_length(template_name)>512
                    or coalesce(template_language,'')!~'^[a-z]{2,3}(_[A-Z]{2})?$' then
                    update public.wa_notifications n set status='blocked',blocked_reason='template_required' where n.id=notification.id;
                    continue;
                end if;
                template:=true;
            end if;
            notification.body:='New catering request '||request.ref_code||': '||left(request.meal_name,300)
                ||'. Reply with the reference to ask about it or respond.';
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

-- Records provider acceptance only for the worker that already claimed this send.
create function public.finish_wa_notification(notification_id uuid,worker_id uuid,provider_id text) returns void
language plpgsql security invoker set search_path='' as $$
begin
    if provider_id is null or provider_id!~'^meta:[^[:space:]]+$' then
        raise exception 'invalid Meta message ID' using errcode='22023';
    end if;
    update public.wa_notifications n set status='sent',provider_message_id=provider_id,sent_at=clock_timestamp()
        where n.id=notification_id and n.status='unknown' and n.send_owner=worker_id;
    if not found then raise exception 'notification is not owned by this worker' using errcode='55000'; end if;
end;
$$;

-- Only definite provider refusals become failed. Ambiguous outcomes remain unknown.
create function public.fail_wa_notification(notification_id uuid,worker_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
    update public.wa_notifications n set status='failed',blocked_reason='provider_refused'
        where n.id=notification_id and n.status='unknown' and n.send_owner=worker_id;
    if not found then raise exception 'notification is not owned by this worker' using errcode='55000'; end if;
end;
$$;

-- Keep original guarded turn/reply behavior while serializing it with notification sends.
alter function public.claim_wa_turn(text,uuid) rename to claim_wa_turn_before_notifications;
alter function public.claim_wa_reply(text,uuid) rename to claim_wa_reply_before_notifications;
create function public.claim_wa_turn(target_phone text,worker_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare target uuid; result jsonb; staff jsonb; quoted jsonb;
begin
    if worker_id is null then raise exception 'worker_id required' using errcode='22023'; end if;
    target:=public.resolve_wa_chef(target_phone);
    if target is null then return null; end if;
    insert into public.wa_conversations(chef_id) values(target) on conflict do nothing;
    perform 1 from public.wa_conversations c where c.chef_id=target for update skip locked;
    if not found or exists(select 1 from public.wa_notifications n where n.chef_id=target and n.status='unknown') then return null; end if;
    result:=public.claim_wa_turn_before_notifications(target_phone,worker_id);
    if result is null then return null; end if;
    -- An explicit quote must confirm this exact sent question. Quoting an
    -- older alert is a topic change, even if the text merely says "confirm".
    if result#>>'{message,contextMessageId}' is not null
        and result#>'{state,conversations,0,pending}'<>'null'::jsonb
        and not exists(
            select 1 from public.wa_messages source join public.wa_messages reply on reply.reply_to_message_id=source.id
            where source.chef_id=target
                and source.provider_message_id=result#>>'{state,conversations,0,pending,sourceMessageId}'
                and reply.chef_id=target and reply.direction='outbound' and reply.send_status='sent'
                and reply.provider_message_id=result#>>'{message,contextMessageId}'
                and reply.body=('Should I record that you''re '
                    ||case when (result#>>'{state,conversations,0,pending,interested}')::boolean then 'interested' else 'not interested' end
                    ||' in '||(result#>>'{state,conversations,0,pending,reference}')
                    ||'? Reply "confirm" or "cancel". This records your interest; it does not book the event.')) then
        delete from public.pending_confirmations p where p.chef_id=target;
        result:=jsonb_set(result,'{state,conversations,0,pending}','null'::jsonb);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('body',n.body,
        'sentAt',to_char(n.sent_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by n.sent_at,n.id),'[]'::jsonb)
    into staff from (select x.* from public.wa_notifications x where x.chef_id=target
        and x.kind='staff_reply' and x.status='sent' order by x.sent_at desc,x.id desc limit 12) n;
    result:=jsonb_set(result,'{state,staffMessages}',staff);
    -- A swipe-reply identifies a request only while that sent alert belongs
    -- to this chef and the request is still assigned to the same identity.
    select jsonb_build_object('reference',o.ref_code) into quoted
    from public.wa_notifications n
    join public.chefs c on c.id=target
    join public.whatsapp_catering o on o.catering_id=n.catering_id and o.chef=c.whatsapp_user_id
    where n.chef_id=target and n.kind='catering_alert' and n.status='sent'
        and n.provider_message_id=result#>>'{message,contextMessageId}';
    if quoted is not null then result:=jsonb_set(result,'{state,quotedCateringRequest}',quoted); end if;
    return result;
end;
$$;
create function public.claim_wa_reply(target_phone text,worker_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare target uuid;
begin
    if worker_id is null then raise exception 'worker_id required' using errcode='22023'; end if;
    target:=public.resolve_wa_chef(target_phone);
    if target is null then return null; end if;
    insert into public.wa_conversations(chef_id) values(target) on conflict do nothing;
    perform 1 from public.wa_conversations c where c.chef_id=target for update skip locked;
    if not found or exists(select 1 from public.wa_notifications n where n.chef_id=target and n.status='unknown') then return null; end if;
    return public.claim_wa_reply_before_notifications(target_phone,worker_id);
end;
$$;

-- No browser may call these APIs directly, even when it can guess an admin UUID.
do $$
declare routine regprocedure;
begin
    for routine in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname in ('require_wa_admin','get_wa_staff_queue','get_wa_staff_conversation',
            'set_wa_staff_takeover','resolve_wa_handoff','set_wa_alert_consent','queue_wa_staff_reply','queue_wa_catering_alert',
            'claim_wa_notification','finish_wa_notification','fail_wa_notification','claim_wa_turn','claim_wa_reply') loop
        execute format('revoke all on function %s from public,anon,authenticated',routine);
        execute format('grant execute on function %s to service_role',routine);
    end loop;
end;
$$;
