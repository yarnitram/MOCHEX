// ============================================================
// Domain types matching the SQL schema in supabase/schema.sql
// ============================================================

export type Direction = "long" | "short";
export type TradeStatus = "open" | "closed";
export type TagCategory = "strategy" | "setup" | "mistake" | "emotion";

export interface Account {
  id: string;
  user_id: string;
  name: string;
  broker: string | null;
  starting_balance: number;
  current_balance: number;
  created_at: string;
}

export interface Trade {
  id: string;
  account_id: string;
  symbol: string;
  direction: Direction;
  entry_price: number;
  exit_price: number | null; // null while open
  size: number;
  stop_price: number | null;
  fees: number;
  entry_time: string;
  exit_time: string | null;
  status: TradeStatus;
  created_at: string;
}

/** A trade joined with its tags & notes for display in the UI. */
export interface TradeWithExtras extends Trade {
  tags: Tag[];
  notes?: TradeNotes | null;
  // Computed fields (not stored) — added by calculations lib.
  pnl_dollars?: number;
  pnl_pct?: number;
  r_multiple?: number | null;
  account_name?: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  category: TagCategory | null;
}

export interface TradeNotes {
  trade_id: string;
  pre_trade_thesis: string | null;
  post_trade_review: string | null;
  discipline_score: number | null;
  screenshot_url: string | null;
  screenshot_urls?: string[];
}

export interface ArchivedJournalTrade {
  id: string;
  user_id?: string;
  account_id: string | null;
  trade_id?: string | null;
  original_trade_id?: string | null;
  symbol: string;
  direction: Direction;
  entry_price: number;
  exit_price: number | null;
  size: number;
  stop_price: number | null;
  fees: number;
  entry_time: string;
  exit_time: string | null;
  status: TradeStatus;
  pnl_dollars?: number | null;
  pnl_pct?: number | null;
  r_multiple?: number | null;
  tags?: Tag[] | string[];
  notes?: TradeNotes | string | null;
  discipline_score?: number | null;
  archived_at: string;
  archived_reason?: string;
  created_at?: string;
}

export interface RiskSettings {
  account_id: string;
  max_daily_loss: number | null;
  max_position_risk_pct: number | null;
  max_open_positions: number | null;
}

export interface TelegramDestination {
  id: string;
  bot_token: string;
  chat_id: string;
  label?: string;
}

export interface UserSettings {
  user_id: string;
  username?: string | null;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  twitter_handle?: string | null;
  telegram_channel?: string | null;
  is_profile_public?: boolean;
  discord_webhook_url?: string | null;
  discord_webhooks: string[];
  notify_discord: boolean;
  telegram_destinations: TelegramDestination[];
  notify_telegram: boolean;
  notify_desktop: boolean;
  refresh_interval_sec: number;
  google_drive_connected?: boolean;
  google_drive_email?: string | null;
  google_drive_refresh_token?: string | null;
  screenshot_storage_backend?: "supabase" | "google_drive" | "auto";
}

export interface PublicShareItem {
  id: string;
  symbol: string;
  share_type?: "watchlist" | "trade";
  trigger_price?: number | null;
  trigger_direction?: "above" | "below" | null;
  order_type?: string | null;
  alert_price?: number | null;
  entry_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  notes?: string | null;
}

export interface PublicShareLink {
  id: string;
  user_id: string;
  title: string;
  slug: string;
  share_type: "watchlist" | "trade";
  symbol: string;
  items?: PublicShareItem[];
  watchlist_item_id?: string | null;
  trade_alert_id?: string | null;
  trigger_price?: number | null;
  trigger_direction?: "above" | "below" | null;
  order_type?: string | null;
  alert_price?: number | null;
  entry_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  notes?: string | null;
  is_active: boolean;
  view_count: number;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  username?: string | null;
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  symbol: string;
  notes: string | null;
  alert_price: number | null;
  added_at: string;
  // Trade-alert fields (added by migration 002).
  trigger_price: number | null;
  trigger_direction: "above" | "below" | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  alert_fired: boolean;
  alert_fired_at: string | null;
  // When the price-trigger was set (armed); cleared when the trigger is cleared.
  trigger_created_at: string | null;
  // Intended order type when the trigger fires (added by migration 006).
  order_type: OrderType | null;
  // Multi-TP & Auto-Breakeven fields (added by migration 016).
  tp1_price?: number | null;
  tp2_price?: number | null;
  tp3_price?: number | null;
  auto_be_on_tp1?: boolean;
  // Public sharing fields (added by migration 017).
  share_token?: string | null;
  is_public?: boolean;
  // Multi-screenshot support (added by migration 029).
  screenshot_url?: string | null;
  screenshot_urls?: string[];
}

/** The order type the user intends to place (aligns with MEXC order types). */
export type OrderType = "limit" | "trigger_limit" | "market";

/** A fired watchlist price-trigger, logged to trade_alerts and shown on /trades. */
export interface TradeAlert {
  id: string;
  user_id: string;
  watchlist_item_id: string | null;
  symbol: string;
  trigger_price: number | null;
  trigger_direction: "above" | "below" | null;
  /** Last price when the alert fired. */
  fired_price: number | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  order_type: OrderType | null;
  notes: string | null;
  /** Position margin in USD (added by migration 010). NULL = default $1. */
  margin_usd: number | null;
  /** Leverage used for the position (added by migration 010).
   *  NULL = use the contract's max leverage from MEXC. */
  leverage: number | null;
  /** When the live price first crossed stop_loss (added by migration 011).
   *  NULL = not hit yet. Once set, the level never fires again. */
  sl_fired_at: string | null;
  /** When the live price first crossed take_profit (added by migration 011).
   *  NULL = not hit yet. Once set, the level never fires again. */
  tp_fired_at: string | null;
  fired_at: string;
  created_at: string;
  /** Trade status (added by migration 015). Default: 'active'. */
  status?: "active" | "closed";
  closed_reason?: "tp_hit" | "sl_hit" | "manual_close" | null;
  exit_price?: number | null;
  closed_at?: string | null;
  close_notes?: string | null;
  realized_pnl_usd?: number | null;
  realized_pnl_pct?: number | null;
  // Multi-TP & Auto-Breakeven fields (added by migration 016).
  tp1_price?: number | null;
  tp2_price?: number | null;
  tp3_price?: number | null;
  tp1_hit?: boolean;
  auto_be_on_tp1?: boolean;
  // Public sharing fields (added by migration 017).
  share_token?: string | null;
  is_public?: boolean;
  // Multi-screenshot support (added by migration 029).
  screenshot_url?: string | null;
  screenshot_urls?: string[];
}

export interface ArchivedTradeAlert {
  id: string;
  user_id: string;
  original_trade_alert_id: string | null;
  watchlist_item_id: string | null;
  symbol: string;
  trigger_price: number | null;
  trigger_direction: "above" | "below" | null;
  fired_price: number | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  order_type: OrderType | null;
  notes: string | null;
  margin_usd: number | null;
  leverage: number | null;
  sl_fired_at: string | null;
  tp_fired_at: string | null;
  fired_at: string | null;
  status_at_archive: "active" | "closed";
  closed_reason: "tp_hit" | "sl_hit" | "manual_close" | null;
  exit_price: number | null;
  closed_at: string | null;
  close_notes: string | null;
  realized_pnl_usd: number | null;
  realized_pnl_pct: number | null;
  archived_at: string;
  tp1_price?: number | null;
  tp2_price?: number | null;
  tp3_price?: number | null;
  auto_be_on_tp1?: boolean;
  share_token?: string | null;
  is_public?: boolean;
  screenshot_url?: string | null;
  screenshot_urls?: string[];
}

export interface TriggeredWatchlistItem {
  id: string;
  user_id: string;
  source_item_id: string | null;
  symbol: string;
  trigger_price: number | null;
  trigger_direction: "above" | "below" | null;
  fired_price: number | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  order_type: OrderType | null;
  notes: string | null;
  fired_at: string;
  created_at: string;
  screenshot_url?: string | null;
  screenshot_urls?: string[];
}

export interface ArchivedWatchlistItem {
  id: string;
  user_id: string;
  symbol: string;
  trigger_price: number | null;
  trigger_direction: "above" | "below" | null;
  fired_price: number | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  order_type: OrderType | null;
  notes: string | null;
  archive_source: "active_deleted" | "triggered_deleted";
  fired_at: string | null;
  archived_at: string;
  screenshot_url?: string | null;
  screenshot_urls?: string[];
}

/**
 * How a fired alert is traded. There is no stored side column: the watchlist
 * trigger direction decides it — a coin breaking BELOW its trigger is taken
 * LONG (buying the dip), and one breaking ABOVE is taken SHORT (fading it).
 */
export type TradeSide = "long" | "short";

export function sideForTrigger(
  direction: "above" | "below" | null | undefined
): TradeSide {
  return direction === "above" ? "short" : "long";
}

/** Notification types. */
export type NotificationType =
  | "trade_alert"
  | "risk_warning"
  | "system"
  | "watchlist_trigger"
  | "sl_tp_hit";

/** A user notification. */
export interface Notification {
  id: string;
  user_id?: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

/** Setup Revision History Audit Log types. */
export type SetupRevisionType =
  | "CREATED"
  | "SL_ADJUSTED"
  | "SL_BREAKEVEN"
  | "TP_ADJUSTED"
  | "NOTE_UPDATED"
  | "TRIGGER_FIRED"
  | "STATUS_CHANGED";

export interface SetupRevision {
  id: string;
  user_id: string;
  item_type: "watchlist" | "trade" | "share";
  item_id: string;
  symbol: string;
  revision_type: SetupRevisionType;
  title: string;
  description: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

/** Shape used when creating/updating a trade from the form. */
export interface TradeInput {
  account_id: string;
  symbol: string;
  direction: Direction;
  size: number;
  entry_price: number;
  exit_price?: number | null;
  stop_price?: number | null;
  fees?: number;
  entry_time: string;
  exit_time?: string | null;
  tags?: string[]; // tag ids or names (create-on-the-fly)
  pre_trade_thesis?: string;
  post_trade_review?: string;
  discipline_score?: number | null;
  clearNotes?: boolean;
  screenshot_url?: string | null;
  screenshot_urls?: string[];
}

/** Aggregated analytics for a set of closed trades. */
export interface AnalyticsSummary {
  tradeCount: number;
  winners: number;
  losers: number;
  winRate: number | null;
  profitFactor: number | null;
  averageR: number | null;
  expectancy: number | null;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  // Per-tag breakdown.
  byTag: Record<string, { count: number; winRate: number | null; netPnl: number }>;
  // Equity curve: cumulative realized P&L over time (closed trades only).
  equityCurve: { date: string; cumulative: number }[];
}