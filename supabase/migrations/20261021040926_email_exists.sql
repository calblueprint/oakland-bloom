drop function if exists public.email_exists(text);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.email_lookup_attempts (
  client_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists email_lookup_attempts_key_time_idx
  on private.email_lookup_attempts (client_key, created_at);

create or replace function public.email_exists(p_email text, p_client_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_attempts int;
begin
  delete from private.email_lookup_attempts
  where created_at < now() - interval '1 day';

  select count(*) into recent_attempts
  from private.email_lookup_attempts
  where client_key = p_client_key
    and created_at > now() - interval '10 minutes';

  if recent_attempts >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into private.email_lookup_attempts (client_key)
  values (p_client_key);

  return exists (
    select 1 from auth.users
    where lower(email) = lower(trim(p_email))
  );
end;
$$;

revoke execute on function public.email_exists(text, text) from public, anon, authenticated;
grant execute on function public.email_exists(text, text) to service_role;