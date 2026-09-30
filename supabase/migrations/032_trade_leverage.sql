-- ============================================================
-- 032 — Add leverage to journal trades and archived journal trades
-- Supports persisting the leverage configured on the /trades page
-- or entered in the journal trade form, factoring into Return on
-- Margin (ROE %) calculations across the trade ledger, detail modal,
-- analytics, and spreadsheet export.
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.
-- ============================================================

-- Leverage applied to the journal trade (e.g. 20 = 20x).
alter table public.trades
  add column if not exists leverage numeric(18,2);

-- Leverage in the archived journal trades archive table.
alter table public.archived_journal_trades
  add column if not exists leverage numeric(18,2);
