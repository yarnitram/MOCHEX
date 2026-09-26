-- ============================================================
-- Migration 025: archived_journal_trades
-- Stores soft-deleted trades from the Journal (/journal) table.
-- Allows 1-click restore back to active trades or permanent delete.
-- ============================================================

create table if not exists archived_journal_trades (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users not null,
  account_id        uuid references accounts on delete set null,
  trade_id          uuid, -- Original trade id before archiving
  symbol            text not null,
  direction         text check (direction in ('long','short')),
  entry_price       numeric(18,7) not null,
  exit_price        numeric(18,7),
  size              numeric(18,7) not null,
  stop_price        numeric(18,7),
  fees              numeric(18,7) default 0,
  entry_time        timestamptz not null,
  exit_time         timestamptz,
  status            text check (status in ('open','closed')),
  pnl_dollars       numeric(18,7),
  pnl_pct           numeric(18,7),
  r_multiple        numeric(18,7),
  tags              jsonb default '[]'::jsonb,
  notes             jsonb,
  archived_at       timestamptz not null default now(),
  created_at        timestamptz default now()
);

alter table archived_journal_trades enable row level security;

create policy "archived_journal_select_own"
  on archived_journal_trades for select
  to authenticated using (auth.uid() = user_id);

create policy "archived_journal_insert_own"
  on archived_journal_trades for insert
  to authenticated with check (auth.uid() = user_id);

create policy "archived_journal_delete_own"
  on archived_journal_trades for delete
  to authenticated using (auth.uid() = user_id);
