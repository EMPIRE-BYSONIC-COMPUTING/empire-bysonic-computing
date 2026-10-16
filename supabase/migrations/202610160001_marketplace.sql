create table if not exists public.marketplace_listings (
    id uuid primary key,
    name text not null check (char_length(name) between 2 and 100),
    condition text not null check (condition in ('New', 'Second Hand', 'Refurbished')),
    price text not null check (char_length(price) between 1 and 80),
    category text not null check (category in ('Laptop', 'Desktop', 'Tablet', 'Mini PC', 'Accessory')),
    description text not null check (char_length(description) between 5 and 2000),
    seller_whatsapp text not null check (seller_whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
    seller_contact_consented boolean not null default false check (seller_contact_consented),
    image_path text,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    created_at timestamptz not null default now()
);

alter table public.marketplace_listings enable row level security;
revoke all on public.marketplace_listings from public, anon, authenticated;
grant all on public.marketplace_listings to service_role;

create table if not exists public.marketplace_submission_rate_limits (
    ip_hash text primary key,
    window_started_at timestamptz not null,
    submission_count integer not null check (submission_count >= 0)
);

alter table public.marketplace_submission_rate_limits enable row level security;
revoke all on public.marketplace_submission_rate_limits from public, anon, authenticated;
grant all on public.marketplace_submission_rate_limits to service_role;

create table if not exists public.marketplace_whatsapp_events (
    message_id text primary key,
    received_at timestamptz not null default now()
);

alter table public.marketplace_whatsapp_events enable row level security;
revoke all on public.marketplace_whatsapp_events from public, anon, authenticated;
grant all on public.marketplace_whatsapp_events to service_role;

create or replace function public.consume_marketplace_submission_slot(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_submission_count integer;
begin
    insert into public.marketplace_submission_rate_limits (ip_hash, window_started_at, submission_count)
    values (p_ip_hash, now(), 1)
    on conflict (ip_hash) do update
    set window_started_at = case
            when public.marketplace_submission_rate_limits.window_started_at < now() - interval '1 hour' then now()
            else public.marketplace_submission_rate_limits.window_started_at
        end,
        submission_count = case
            when public.marketplace_submission_rate_limits.window_started_at < now() - interval '1 hour' then 1
            else public.marketplace_submission_rate_limits.submission_count + 1
        end
    returning submission_count into v_submission_count;

    return v_submission_count <= 3;
end;
$$;

revoke all on function public.consume_marketplace_submission_slot(text) from public, anon, authenticated;
grant execute on function public.consume_marketplace_submission_slot(text) to service_role;

create or replace function public.submit_marketplace_listing(
    p_id uuid,
    p_name text,
    p_condition text,
    p_price text,
    p_category text,
    p_description text,
    p_seller_whatsapp text,
    p_image_path text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin

    insert into public.marketplace_listings (
        id, name, condition, price, category, description,
        seller_whatsapp, seller_contact_consented, image_path, status
    )
    values (
        p_id, p_name, p_condition, p_price, p_category, p_description,
        p_seller_whatsapp, true, p_image_path, 'pending'
    );

    return p_id;
end;
$$;

revoke all on function public.submit_marketplace_listing(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_marketplace_listing(uuid, text, text, text, text, text, text, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sale-listing-images', 'sale-listing-images', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
