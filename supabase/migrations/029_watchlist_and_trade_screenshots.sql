-- Migration 029: Multi-screenshot support for Watchlist and Trades
-- Adds screenshot_urls (text array) and screenshot_url (text fallback) to watchlist tables and trades

-- 1. Active Watchlist Items
ALTER TABLE public.watchlist_items
ADD COLUMN IF NOT EXISTS screenshot_urls text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS screenshot_url text;

-- 2. Triggered Watchlist Items
ALTER TABLE public.triggered_watchlist_items
ADD COLUMN IF NOT EXISTS screenshot_urls text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS screenshot_url text;

-- 3. Archived Watchlist Items
ALTER TABLE public.archived_watchlist_items
ADD COLUMN IF NOT EXISTS screenshot_urls text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS screenshot_url text;

-- 4. Trade Notes (Journal)
ALTER TABLE public.trade_notes
ADD COLUMN IF NOT EXISTS screenshot_urls text[] DEFAULT '{}';

-- 5. Trade Alerts
ALTER TABLE public.trade_alerts
ADD COLUMN IF NOT EXISTS screenshot_urls text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS screenshot_url text;

-- Create GIN index on screenshot_urls for fast query/existence checks where needed
CREATE INDEX IF NOT EXISTS idx_watchlist_items_has_screenshots 
ON public.watchlist_items USING gin(screenshot_urls);
