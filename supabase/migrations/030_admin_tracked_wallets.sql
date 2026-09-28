-- Create admin_tracked_wallets table
create table if not exists public.admin_tracked_wallets (
    id uuid default gen_random_uuid() primary key,
    admin_id uuid not null references auth.users(id) on delete cascade,
    wallet_address text not null,
    label text,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS policies
alter table public.admin_tracked_wallets enable row level security;

create policy "Admins can view their tracked wallets"
    on public.admin_tracked_wallets for select
    using (auth.uid() = admin_id);

create policy "Admins can insert tracked wallets"
    on public.admin_tracked_wallets for insert
    with check (auth.uid() = admin_id);

create policy "Admins can update their tracked wallets"
    on public.admin_tracked_wallets for update
    using (auth.uid() = admin_id);

create policy "Admins can delete their tracked wallets"
    on public.admin_tracked_wallets for delete
    using (auth.uid() = admin_id);

-- Create index for faster querying
create index if not exists admin_tracked_wallets_admin_id_idx on public.admin_tracked_wallets (admin_id);
create unique index if not exists admin_tracked_wallets_admin_id_wallet_address_idx on public.admin_tracked_wallets (admin_id, wallet_address);
