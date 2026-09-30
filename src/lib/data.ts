import type { User } from "@supabase/supabase-js";
import type { ServerSupabase } from "./supabase/server";
import type { Account, RiskSettings, Tag, TradeWithExtras } from "./types";
import { enrichTrade } from "./calculations";

/**
 * Fetch the user's accounts (auto-creates a default account on first use).
 *
 * Pass an already-fetched `user` to the caller's page when available to avoid
 * paying a second `auth.getUser()` round-trip on top of the proxy + layout
 * auth checks. Omitting it falls back to fetching the user here for
 * backwards compatibility.
 */
export async function getAccounts(
  supabase: ServerSupabase,
  user?: User | null
): Promise<Account[]> {
  if (!user) {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  }
  if (!user) return [];

  const accountsRes = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: true });

  if (accountsRes.error) {
    throw new Error(accountsRes.error.message);
  }
  let data = accountsRes.data;

  // Auto-create the default account for a brand-new user.
  if (!data || data.length === 0) {
    const { data: created, error: createError } = await supabase
      .from("accounts")
      .insert({
        user_id: user.id,
        name: "Default",
        broker: "Manual",
        starting_balance: 0,
        current_balance: 0,
      })
      .select("*")
      .single();
    if (createError) throw new Error(createError.message);
    data = [created];
  }

  return (data ?? []) as Account[];
}

type TradeRow = TradeWithExtras & {
  trade_tags?: { tag_id: string; tags: Tag }[];
};

/** Fetch all trades (with tags & notes) for a given account, pnl computed. */
export async function getTrades(
  supabase: ServerSupabase,
  accountId: string
): Promise<TradeWithExtras[]> {
  const { data: raw, error } = await supabase
    .from("trades")
    .select("*, trade_tags(tag_id, tags(*))")
    .eq("account_id", accountId)
    .order("entry_time", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const tradeIds = ((raw ?? []) as TradeRow[]).map((t) => t.id);
  const { data: notes } = tradeIds.length
    ? await supabase.from("trade_notes").select("*").in("trade_id", tradeIds)
    : { data: [] };

  const notesByTrade = new Map(
    ((notes as { trade_id: string }[] | null) ?? []).map((n) => [
      n.trade_id,
      n,
    ])
  );

  const trades = ((raw ?? []) as TradeRow[]).map((t) => ({
    id: t.id,
    account_id: t.account_id,
    symbol: t.symbol,
    direction: t.direction,
    entry_price: Number(t.entry_price),
    exit_price: t.exit_price != null ? Number(t.exit_price) : null,
    size: Number(t.size),
    stop_price: t.stop_price != null ? Number(t.stop_price) : null,
    fees: Number(t.fees),
    entry_time: t.entry_time,
    exit_time: t.exit_time,
    status: t.status,
    leverage: t.leverage != null ? Number(t.leverage) : null,
    created_at: t.created_at,
    tags: ((t.trade_tags ?? []) as { tag_id: string; tags: Tag }[])
      .map((j) => j.tags)
      .filter(Boolean),
    notes: (notesByTrade.get(t.id) as TradeWithExtras["notes"]) ?? null,
  }));

  return trades.map(enrichTrade) as TradeWithExtras[];
}

/** Fetch all tags for the user (sorted by name). */
export async function getTags(supabase: ServerSupabase): Promise<Tag[]> {
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Tag[];
}

/** Fetch risk settings for an account (may be null). */
export async function getRiskSettings(
  supabase: ServerSupabase,
  accountId: string
): Promise<RiskSettings | null> {
  const { data, error } = await supabase
    .from("risk_settings")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as RiskSettings | null;
}