-- 1. Create admin_tracked_tokens table
create table if not exists public.admin_tracked_tokens (
    id uuid default gen_random_uuid() primary key,
    admin_id uuid not null references auth.users(id) on delete cascade,
    symbol text not null,
    alert_enabled boolean default true not null,
    min_usd_threshold numeric default 10000 not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for admin_tracked_tokens
alter table public.admin_tracked_tokens enable row level security;

create policy "Admins can view their tracked tokens"
    on public.admin_tracked_tokens for select
    using (auth.uid() = admin_id);

create policy "Admins can insert tracked tokens"
    on public.admin_tracked_tokens for insert
    with check (auth.uid() = admin_id);

create policy "Admins can update their tracked tokens"
    on public.admin_tracked_tokens for update
    using (auth.uid() = admin_id);

create policy "Admins can delete their tracked tokens"
    on public.admin_tracked_tokens for delete
    using (auth.uid() = admin_id);

create unique index if not exists admin_tracked_tokens_admin_id_symbol_idx on public.admin_tracked_tokens (admin_id, symbol);


-- 2. Modify admin_tracked_wallets to add alert config
alter table public.admin_tracked_wallets
    add column if not exists alert_enabled boolean default true not null,
    add column if not exists min_usd_threshold numeric default 5000 not null;
