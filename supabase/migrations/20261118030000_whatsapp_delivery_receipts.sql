-- Store only the provider message ID and its strongest delivery evidence.
-- Callbacks can arrive before the sender records Meta's accepted message ID.
create table public.wa_notification_receipts (
    provider_message_id text primary key check (
        char_length(provider_message_id)<=500 and provider_message_id~'^meta:wamid\.[^[:space:]]+$'),
    status text not null check (status in ('failed','delivered','read')),
    recorded_at timestamptz not null default now()
);
alter table public.wa_notification_receipts enable row level security;
revoke all on public.wa_notification_receipts from public,anon,authenticated;
grant select,insert,update on public.wa_notification_receipts to service_role;

-- Keep the inbox API while recording receipts in the same acknowledged transaction.
alter function public.ingest_inbound(jsonb) rename to ingest_inbound_before_delivery_receipts;
create function public.ingest_inbound(batch jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare receipt jsonb; message_id text; outcome text;
begin
    perform public.ingest_inbound_before_delivery_receipts(batch);
    if jsonb_typeof(batch->'deliveryReceipts') is distinct from 'array' then return; end if;
    -- Consistent ordering prevents inversions when two callbacks share message IDs.
    for receipt in select value from jsonb_array_elements(batch->'deliveryReceipts')
        order by value->>'providerMessageId' loop
        message_id:=receipt->>'providerMessageId';
        outcome:=receipt->>'status';
        if message_id is null or char_length(message_id)>500
            or message_id!~'^meta:wamid\.[^[:space:]]+$'
            or outcome is null or outcome not in ('failed','delivered','read') then
            continue;
        end if;
        insert into public.wa_notification_receipts as existing(provider_message_id,status)
        values(message_id,outcome)
        on conflict (provider_message_id) do update set status=excluded.status,recorded_at=now()
        where (existing.status='failed' and excluded.status in ('delivered','read'))
            or (existing.status='delivered' and excluded.status='read');
    end loop;
end;
$$;
revoke all on function public.ingest_inbound(jsonb),public.ingest_inbound_before_delivery_receipts(jsonb)
    from public,anon,authenticated;
grant execute on function public.ingest_inbound(jsonb),public.ingest_inbound_before_delivery_receipts(jsonb)
    to service_role;

-- Preserve existing booking/catering ownership checks and omit known failed notices.
create or replace function public.claim_wa_turn(target_phone text,worker_id uuid) returns jsonb
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
        where x.chef_id=target and x.kind<>'staff_reply' and x.status='sent'
        and not exists(select 1 from public.wa_notification_receipts r
            where r.provider_message_id=x.provider_message_id and r.status='failed') and (
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

