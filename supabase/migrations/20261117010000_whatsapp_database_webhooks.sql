-- The durable inbox/outbox remains authoritative. These content-free callbacks
-- only wake the worker sooner; its recovery poll handles lost callbacks.
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists pgcrypto with schema extensions;

-- Configure through a server-only RPC, never a browser-visible settings table.
-- Both NULL disables callbacks; use a different random token from Meta's token.
create function public.configure_wa_database_webhook(callback_url text, callback_token text)
returns void language plpgsql security definer set search_path='' as $$
declare secret_id uuid; secret_name text; secret_value text;
begin
    -- Serialize rotation so a racing configuration cannot mix two credentials.
    perform pg_advisory_xact_lock(hashtextextended('wa_database_webhook_config',0));
    if callback_url is null and callback_token is null then
        delete from vault.secrets where name in ('wa_database_webhook_url','wa_database_webhook_token');
        return;
    end if;
    if callback_url is null or callback_token is null
        or char_length(callback_token) not between 32 and 256
        or callback_token !~ '^[A-Za-z0-9_-]+$'
        or not (
            callback_url ~ '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,63}/api/whatsapp/database-events$'
            and callback_url !~ '^https://([^/]*\.)?(localhost|local|internal|test|invalid|example)/'
            or coalesce(current_setting('oakland_bloom.synthetic_test',true)='on',false)
                and callback_url ~ '^http://(127\.0\.0\.1|host\.docker\.internal):[1-9][0-9]{0,4}/api/whatsapp/database-events$'
        ) then
        raise exception 'Provide an HTTPS worker callback and a separate random webhook token.' using errcode='22023';
    end if;
    foreach secret_name in array array['wa_database_webhook_url','wa_database_webhook_token'] loop
        secret_value:=case secret_name when 'wa_database_webhook_url' then callback_url else callback_token end;
        select id into secret_id from vault.secrets where name=secret_name;
        if secret_id is null then
            perform vault.create_secret(secret_value,secret_name,'WhatsApp content-free database wake callback');
        else
            perform vault.update_secret(secret_id,secret_value);
        end if;
    end loop;
end;
$$;

-- pg_net sends only after COMMIT. Fail closed on missing config, and fail open
-- for the business write: callback availability must never reject a booking.
create function public.request_wa_database_wake() returns bigint
language plpgsql security definer set search_path='' as $$
declare callback_url text; callback_token text; request_id bigint;
    signed_at text; nonce text; signature text;
begin
    if current_setting('oakland_bloom.wa_wake_queued',true)='on' then return null; end if;
    select max(decrypted_secret) filter (where name='wa_database_webhook_url'),
        max(decrypted_secret) filter (where name='wa_database_webhook_token')
    into callback_url,callback_token from vault.decrypted_secrets
    where name in ('wa_database_webhook_url','wa_database_webhook_token');
    if callback_url is null or callback_token is null then return null; end if;
    signed_at:=floor(extract(epoch from clock_timestamp()))::bigint::text;
    nonce:=gen_random_uuid()::text;
    signature:=encode(extensions.hmac(signed_at||'.'||nonce,callback_token,'sha256'),'hex');
    select net.http_post(
        url:=callback_url,
        body:='{"event":"queue_changed"}'::jsonb,
        -- Supabase's pg_net queue is readable by SQL roles. Send only a short-
        -- lived signature, never the reusable Vault token or any chef data.
        headers:=jsonb_build_object('Content-Type','application/json',
            'X-WA-Webhook-Timestamp',signed_at,'X-WA-Webhook-Nonce',nonce,
            'X-WA-Webhook-Signature',signature),
        timeout_milliseconds:=3000
    ) into request_id;
    perform set_config('oakland_bloom.wa_wake_queued','on',true);
    return request_id;
exception when others then
    -- No credential, URL, private record or provider response enters SQL logs.
    raise warning 'WhatsApp wake callback unavailable; recovery polling remains active.';
    return null;
end;
$$;

-- Do not wake on delivery bookkeeping, blocked states, or outgoing chat rows.
create function public.wake_wa_database_worker() returns trigger
language plpgsql security definer set search_path='' as $$
begin
    if tg_table_schema='public' and tg_table_name='wa_notifications' then
        if new.status not in ('pending','blocked') then return new; end if;
        if tg_op='UPDATE' and not (
            new.status='pending' and old.status is distinct from new.status
            or new.body is distinct from old.body
        ) then return new; end if;
    elsif tg_table_schema='public' and tg_table_name='wa_messages' and tg_op='INSERT' then
        if new.direction<>'inbound' or new.provider<>'meta'
            or new.chef_id is null or new.processed_at is not null then return new; end if;
    else
        raise exception 'Invalid WhatsApp wake trigger' using errcode='42501';
    end if;
    perform public.request_wa_database_wake();
    return new;
end;
$$;

create trigger wa_notifications_wake after insert or update on public.wa_notifications
    for each row execute function public.wake_wa_database_worker();
create trigger wa_messages_wake after insert on public.wa_messages
    for each row execute function public.wake_wa_database_worker();

revoke all on function public.configure_wa_database_webhook(text,text),
    public.request_wa_database_wake(),public.wake_wa_database_worker()
    from public,anon,authenticated,service_role;
grant execute on function public.configure_wa_database_webhook(text,text),public.request_wa_database_wake()
    to service_role;
