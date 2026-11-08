-- Legacy product tables were writable without RLS. Guard them before exposing
-- automatic alerts: only staff may create or reassign a catering request.
-- Browser users cannot change users.is_admin; its existing own-row SELECT
-- policy lets these checks read the caller's server-managed admin flag.
alter table public.whatsapp_user enable row level security;
alter table public.whatsapp_catering enable row level security;
revoke all on public.whatsapp_user,public.whatsapp_catering from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_user,public.whatsapp_catering to authenticated,service_role;

create policy wa_admin_manage_whatsapp_user on public.whatsapp_user
    for all to authenticated
    using (exists(select 1 from public.users u where u.userid=(select auth.uid()) and u.is_admin))
    with check (exists(select 1 from public.users u where u.userid=(select auth.uid()) and u.is_admin));
create policy wa_admin_manage_whatsapp_catering on public.whatsapp_catering
    for all to authenticated
    using (exists(select 1 from public.users u where u.userid=(select auth.uid()) and u.is_admin))
    with check (exists(select 1 from public.users u where u.userid=(select auth.uid()) and u.is_admin));
-- Authorized staff assignment writers cannot read the private chat tables.
-- Elevate only this canonical trigger after protecting its source table above.
-- CREATE OR REPLACE retains the existing backend-only EXECUTE grants.
create or replace function public.queue_wa_catering_alert() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
    if tg_table_schema<>'public' or tg_table_name<>'whatsapp_catering' or tg_op not in ('INSERT','UPDATE') then
        raise exception 'invalid catering alert trigger' using errcode='42501';
    end if;
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
