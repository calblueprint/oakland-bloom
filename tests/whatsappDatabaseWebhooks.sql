-- No queued HTTP request survives this transaction; all records are synthetic.
begin;
select public.configure_wa_database_webhook(null,null);
select set_config('oakland_bloom.synthetic_test','off',true);

do $$
declare bad_url text;
begin
    assert not has_function_privilege('anon','public.configure_wa_database_webhook(text,text)','EXECUTE');
    assert not has_function_privilege('authenticated','public.configure_wa_database_webhook(text,text)','EXECUTE');
    assert not has_function_privilege('authenticated','public.request_wa_database_wake()','EXECUTE');
    assert not has_function_privilege('authenticated','public.wake_wa_database_worker()','EXECUTE');
    assert has_function_privilege('service_role','public.configure_wa_database_webhook(text,text)','EXECUTE');
    assert not has_table_privilege('authenticated','vault.decrypted_secrets','SELECT');
    assert public.request_wa_database_wake() is null,'missing configuration is harmless';
    foreach bad_url in array array[
        'http://worker.oaklandbloom.org/api/whatsapp/database-events',
        'https://user:password@worker.oaklandbloom.org/api/whatsapp/database-events',
        'https://127.0.0.1/api/whatsapp/database-events',
        'https://worker.localhost/api/whatsapp/database-events',
        'https://worker.oaklandbloom.org/other',
        'https://worker.oaklandbloom.org/api/whatsapp/database-events?token=private',
        'http://host.docker.internal:3001/api/whatsapp/database-events'
    ] loop
        begin
            perform public.configure_wa_database_webhook(bad_url,repeat('a',32));
            raise exception 'unsafe callback accepted';
        exception when invalid_parameter_value then null; end;
    end loop;
    begin
        perform public.configure_wa_database_webhook('https://worker.oaklandbloom.org/api/whatsapp/database-events','short');
        raise exception 'weak token accepted';
    exception when invalid_parameter_value then null; end;
end;
$$;

select public.configure_wa_database_webhook('https://webhook-tests.oaklandbloom.org/api/whatsapp/database-events',repeat('a',32));
do $$
declare request_id bigint; queued net.http_request_queue%rowtype; nonce text; signed_at text;
begin
    request_id:=public.request_wa_database_wake();
    assert request_id is not null,'configured callback queues';
    select * into strict queued from net.http_request_queue where id=request_id;
    assert convert_from(queued.body,'UTF8')::jsonb='{"event":"queue_changed"}'::jsonb,'no row content crosses HTTP';
    assert queued.headers->>'Authorization' is null,'no reusable bearer token in readable pg_net queue';
    assert queued.headers::text not like '%'||repeat('a',32)||'%','Vault token stays out of queued headers';
    signed_at:=queued.headers->>'X-WA-Webhook-Timestamp';
    nonce:=queued.headers->>'X-WA-Webhook-Nonce';
    assert signed_at ~ '^[0-9]+$' and nonce::uuid is not null;
    assert queued.headers->>'X-WA-Webhook-Signature'=
        encode(extensions.hmac(signed_at||'.'||nonce,repeat('a',32),'sha256'),'hex'),'signature matches worker contract';
    assert public.request_wa_database_wake() is null,'one wake per transaction coalesces batches';
    perform public.configure_wa_database_webhook('https://webhook-tests.oaklandbloom.org/api/whatsapp/database-events',repeat('b',32));
    assert (select count(*)=2 from vault.secrets where name in('wa_database_webhook_url','wa_database_webhook_token')),'rotation replaces rather than appends';
end;
$$;

do $$
declare chef uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); notification uuid:=gen_random_uuid(); baseline bigint;
begin
    insert into public.chefs(id,name,wa_phone) values(chef,'Synthetic webhook chef','15557890001');
    insert into public.users(userid,name,email,phone,is_admin,is_approved)
        values(actor,'Synthetic webhook admin','webhook-admin@example.test','15557890999',true,true);
    perform set_config('oakland_bloom.wa_wake_queued','off',true);
    select count(*) into baseline from net.http_request_queue;
    insert into public.wa_notifications(id,chef_id,kind,actor_id,request_id,body)
        values(notification,chef,'staff_reply',actor,gen_random_uuid(),'Synthetic staff reply');
    assert (select count(*)=baseline+1 from net.http_request_queue),'new notification wakes';
    perform set_config('oakland_bloom.wa_wake_queued','off',true);
    update public.wa_notifications set status='blocked',blocked_reason='window_expired' where id=notification;
    update public.wa_notifications set blocked_reason='same bookkeeping' where id=notification;
    assert (select count(*)=baseline+1 from net.http_request_queue),'delivery bookkeeping never creates a wake loop';
    update public.wa_notifications set body='Updated synthetic staff reply' where id=notification;
    assert (select count(*)=baseline+2 from net.http_request_queue),'coalesced pending content wakes';
    perform set_config('oakland_bloom.wa_wake_queued','off',true);
    insert into public.wa_messages(direction,provider,chef_id,phone,body)
        values('outbound','meta',chef,'15557890001','Synthetic outbound');
    insert into public.wa_messages(direction,provider,phone,body)
        values('inbound','meta','15557890002','Unknown synthetic sender');
    assert (select count(*)=baseline+2 from net.http_request_queue),'outbound and unknown senders do not wake';
    insert into public.wa_messages(direction,provider,chef_id,phone,body)
        values('inbound','meta',chef,'15557890001','Synthetic inbound');
    assert (select count(*)=baseline+3 from net.http_request_queue),'known inbound wakes';
    perform public.configure_wa_database_webhook(null,null);
    perform set_config('oakland_bloom.wa_wake_queued','off',true);
    insert into public.wa_messages(direction,provider,chef_id,phone,body)
        values('inbound','meta',chef,'15557890001','Webhook disabled but business write succeeds');
    assert (select count(*)=baseline+3 from net.http_request_queue),'disabled webhook falls back to poll';
end;
$$;
rollback;
