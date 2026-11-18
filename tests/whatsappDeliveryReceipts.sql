-- Test callback ordering and context without sending a WhatsApp message.
begin;
do $$
declare
    chef uuid:=gen_random_uuid();
    gig uuid:=gen_random_uuid();
    phone constant text:='15555700991';
    provider_id constant text:='meta:wamid.test-receipt-failure';
    worker uuid:=gen_random_uuid();
    notice jsonb;
    claimed jsonb;
begin
    insert into public.whatsapp_user(chef_id,name,phone) values(chef,'Synthetic receipt chef',phone);
    insert into public.chefs(id,name,wa_phone,whatsapp_user_id,opted_in_at,opt_in_method)
        values(chef,'Synthetic receipt chef',phone,chef,now(),'in_person');
    insert into public.wa_conversations(chef_id,last_inbound_at) values(chef,now());
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,body,sent_at)
        values('inbound','meta','meta:test-receipt-inbound',chef,phone,'hello',now());
    insert into public.whatsapp_catering(catering_id,chef,meal_name,num_people,day_created,is_accepted)
        values(gig,chef,'Synthetic receipt event',2,now(),false);
    notice:=public.claim_wa_notification(phone,worker);
    assert notice->>'kind'='text','fixture is eligible';
    -- The failure callback may beat recording the send response locally.
    perform public.ingest_inbound(jsonb_build_object('messages','[]'::jsonb,'rejected','[]'::jsonb,
        'deliveryReceipts',jsonb_build_array(jsonb_build_object('providerMessageId',provider_id,'status','failed'))));
    perform public.finish_wa_notification((notice->>'id')::uuid,worker,provider_id);
    claimed:=public.claim_wa_turn(phone,worker);
    assert claimed#>'{state,notificationMessages}'='[]'::jsonb,
        'accepted notice with a confirmed failure is not used as context';

    perform public.ingest_inbound(jsonb_build_object('messages','[]'::jsonb,'rejected','[]'::jsonb,
        'deliveryReceipts',jsonb_build_array(
            jsonb_build_object('providerMessageId',provider_id,'status','read'),
            jsonb_build_object('providerMessageId',provider_id,'status','delivered'),
            jsonb_build_object('providerMessageId',provider_id,'status','failed'))));
    assert (select status='read' from public.wa_notification_receipts
        where provider_message_id=provider_id),'weaker callbacks do not downgrade confirmed read';
    assert not has_table_privilege('authenticated','public.wa_notification_receipts','select'),
        'receipt IDs are server only';
end
$$;
rollback;
