-- WhatsApp agent schema. PROPOSED: review with the team before applying to the
-- shared Supabase project. Design: docs/whatsapp-agent-production-plan.md §III.6.
--
-- Every table is written only by server code holding the secret key (which
-- bypasses RLS). RLS is enabled with no policies, so anon and signed-in clients
-- get nothing until admin read policies are added alongside the dashboard.
--
-- Not touched here: the legacy whatsapp_user / whatsapp_catering tables. Migrating
-- them (keeping past_items' foreign key intact) is a separate, reviewed step.

create table public.chefs (
    id uuid primary key default gen_random_uuid(),
    -- Verify public.users.userid is a uuid before applying.
    user_id uuid unique references public.users (userid),
    name text not null check (char_length(name) between 1 and 200),
    wa_phone text not null unique check (wa_phone ~ '^[1-9][0-9]{1,14}$'),
    opted_in_at timestamptz,
    opt_in_method text check (opt_in_method in ('intake_form', 'in_person', 'web', 'whatsapp')),
    opted_out_at timestamptz,
    preferred_language text not null default 'en',
    cuisines text[] not null default '{}',
    active boolean not null default true,
    created_at timestamptz not null default now()
);

create table public.opportunities (
    id uuid primary key default gen_random_uuid(),
    ref_code text not null unique check (ref_code ~ '^OB[1-9][0-9]*$'),
    title text not null check (char_length(title) between 1 and 300),
    starts_at timestamptz not null,
    location text not null check (char_length(location) between 1 and 500),
    headcount integer not null check (headcount > 0),
    pay_text text check (char_length(pay_text) <= 200),
    details text not null default '' check (char_length(details) <= 2000),
    status text not null default 'open' check (status in ('open', 'closed')),
    created_by uuid references public.users (userid),
    created_at timestamptz not null default now()
);

-- One row per gig sent to a chef. provider_message_id is how status callbacks
-- and swipe-replies find the gig.
create table public.wa_deliveries (
    id uuid primary key default gen_random_uuid(),
    opportunity_id uuid not null references public.opportunities (id),
    chef_id uuid not null references public.chefs (id),
    template_name text,
    template_language text,
    status text not null default 'queued'
        check (status in ('queued', 'accepted', 'sent', 'delivered', 'read', 'failed', 'unknown')),
    provider_message_id text unique,
    attempts integer not null default 0,
    last_error text,
    sent_at timestamptz,
    delivered_at timestamptz,
    read_at timestamptz,
    created_at timestamptz not null default now(),
    unique (opportunity_id, chef_id)
);

create table public.wa_conversations (
    chef_id uuid primary key references public.chefs (id),
    lease_owner text,
    lease_until timestamptz,
    last_inbound_at timestamptz,
    human_takeover boolean not null default false,
    summary text not null default ''
);

-- Every inbound and outbound message. Inbound rows from unknown numbers keep
-- chef_id null and are never handed to the agent.
create table public.wa_messages (
    id uuid primary key default gen_random_uuid(),
    direction text not null check (direction in ('inbound', 'outbound')),
    provider text not null check (provider in ('meta', 'twilio')),
    provider_message_id text unique,
    chef_id uuid references public.chefs (id),
    phone text not null,
    body text not null default '' check (char_length(body) <= 4096),
    context_message_id text,
    sent_at timestamptz,
    received_at timestamptz not null default now(),
    processed_at timestamptz,
    -- Outbound replies point at the inbound message they answer; unique so a
    -- retried agent step cannot commit two replies.
    reply_to_message_id uuid unique references public.wa_messages (id),
    send_status text check (send_status in ('pending', 'sent', 'failed', 'unknown')),
    tool_trace jsonb
);
create index wa_messages_unprocessed
    on public.wa_messages (chef_id, received_at)
    where direction = 'inbound' and processed_at is null;

create table public.wa_media (
    id uuid primary key default gen_random_uuid(),
    message_id uuid not null unique references public.wa_messages (id),
    direction text not null check (direction in ('inbound', 'outbound')),
    kind text not null check (kind in ('image', 'sticker')),
    provider_media_id text not null,
    mime_type text not null,
    sha256 text,
    bytes integer,
    storage_path text,
    status text not null default 'pending'
        check (status in ('pending', 'stored', 'rejected', 'failed')),
    created_at timestamptz not null default now()
);

-- Unsupported or malformed inbound messages, kept so the chef still gets a reply
-- ("can't open that yet") and staff can see what was missed.
create table public.wa_inbound_rejected (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    provider_message_id text unique,
    phone text,
    reason text not null,
    received_at timestamptz not null default now(),
    handled_at timestamptz
);

create table public.pending_confirmations (
    chef_id uuid primary key references public.chefs (id),
    opportunity_id uuid not null references public.opportunities (id),
    interested boolean not null,
    source_message_id text not null,
    expires_at timestamptz not null
);

-- Append-only: a change of mind is a new row, so history survives.
create table public.interest_responses (
    id uuid primary key default gen_random_uuid(),
    chef_id uuid not null references public.chefs (id),
    opportunity_id uuid not null references public.opportunities (id),
    interested boolean not null,
    message_id text not null unique,
    recorded_at timestamptz not null default now()
);
create index interest_responses_latest
    on public.interest_responses (chef_id, opportunity_id, recorded_at desc);

create view public.latest_interest
with (security_invoker = true) as
select distinct on (chef_id, opportunity_id)
    chef_id, opportunity_id, interested, message_id, recorded_at
from public.interest_responses
order by chef_id, opportunity_id, recorded_at desc, id desc;

create table public.handoffs (
    id uuid primary key default gen_random_uuid(),
    chef_id uuid not null references public.chefs (id),
    message_id text not null,
    reason text not null check (char_length(reason) between 1 and 500),
    status text not null default 'open' check (status in ('open', 'assigned', 'resolved')),
    assigned_admin uuid references public.users (userid),
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    unique (chef_id, message_id)
);

create table public.chef_facts (
    id uuid primary key default gen_random_uuid(),
    chef_id uuid not null references public.chefs (id),
    kind text not null
        check (kind in ('dietary', 'equipment', 'transport', 'availability', 'helpers', 'other')),
    value text not null check (char_length(value) between 1 and 200),
    source_message_id text,
    updated_by text not null check (updated_by in ('agent', 'admin')),
    updated_at timestamptz not null default now()
);

alter table public.chefs enable row level security;
alter table public.opportunities enable row level security;
alter table public.wa_deliveries enable row level security;
alter table public.wa_conversations enable row level security;
alter table public.wa_messages enable row level security;
alter table public.wa_media enable row level security;
alter table public.wa_inbound_rejected enable row level security;
alter table public.pending_confirmations enable row level security;
alter table public.interest_responses enable row level security;
alter table public.handoffs enable row level security;
alter table public.chef_facts enable row level security;

-- Persists one parsed webhook batch atomically (InboundBatch from
-- lib/whatsapp/inboundMessage.ts). Idempotent: Meta retries for up to 7 days and
-- may deliver duplicates, so repeats are no-ops.
create function public.ingest_inbound(batch jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    message jsonb;
    rejected jsonb;
    known_chef uuid;
    stored_id uuid;
begin
    if jsonb_typeof(batch -> 'messages') <> 'array'
        or jsonb_typeof(batch -> 'rejected') <> 'array' then
        raise exception 'batch must have messages and rejected arrays';
    end if;

    for message in select * from jsonb_array_elements(batch -> 'messages') loop
        select id into known_chef
        from public.chefs
        where wa_phone = message ->> 'from';

        insert into public.wa_messages (
            direction, provider, provider_message_id, chef_id, phone, body,
            context_message_id, sent_at
        ) values (
            'inbound',
            message ->> 'provider',
            message ->> 'providerMessageId',
            known_chef,
            message ->> 'from',
            message ->> 'text',
            message ->> 'contextMessageId',
            (message ->> 'sentAt')::timestamptz
        )
        on conflict (provider_message_id) do nothing
        returning id into stored_id;

        -- A duplicate delivery inserted nothing; skip its side effects too.
        continue when stored_id is null;

        if message -> 'media' is not null then
            insert into public.wa_media (
                message_id, direction, kind, provider_media_id, mime_type, sha256
            ) values (
                stored_id,
                'inbound',
                message -> 'media' ->> 'kind',
                message -> 'media' ->> 'mediaId',
                message -> 'media' ->> 'mimeType',
                message -> 'media' ->> 'sha256'
            );
        end if;

        if known_chef is not null then
            insert into public.wa_conversations (chef_id, last_inbound_at)
            values (known_chef, now())
            on conflict (chef_id) do update set last_inbound_at = excluded.last_inbound_at;
        end if;
    end loop;

    for rejected in select * from jsonb_array_elements(batch -> 'rejected') loop
        insert into public.wa_inbound_rejected (provider, provider_message_id, phone, reason)
        values (
            coalesce(split_part(rejected ->> 'providerMessageId', ':', 1), 'meta'),
            rejected ->> 'providerMessageId',
            rejected ->> 'from',
            rejected ->> 'reason'
        )
        on conflict (provider_message_id) do nothing;
    end loop;
end;
$$;

revoke all on function public.ingest_inbound(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_inbound(jsonb) to service_role;
