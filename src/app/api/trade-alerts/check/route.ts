import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTrade } from "@/lib/trade-ops";
import { detectHits, levelLabel, type HitLevel } from "@/lib/sl-tp";
import { sideForTrigger, type TradeAlert } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/trade-alerts/check
 *
 * Check every outstanding trade plan against the current MEXC price and, for
 * each stop-loss / take-profit the price has just crossed:
 *   1. claim the level atomically (so it never fires twice),
 *   2. notify the user naming the level (SL or TP),
 *   3. log a new Journal trade from the plan.
 *
 * Called by the /trades page poller and by scripts/alert-watcher.mjs, so a hit
 * is caught whether or not a browser tab is open.
 *
 * Side effects are best-effort, but the level is only marked fired once it has
 * actually been claimed, so a failure never silently swallows the alarm.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only active rows with a level still outstanding can possibly fire.
  const { data, error } = await supabase
    .from("trade_alerts")
    .select("*")
    .eq("user_id", user.id)
    .neq("status", "closed")
    .or("sl_fired_at.is.null,tp_fired_at.is.null");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const rows = (data ?? []) as TradeAlert[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, hits: [] });
  }

  const prices = await fetchPrices(request);
  // Prices are the whole point of the check — if they are unavailable, bail
  // without claiming anything so the hit is caught on a later poll.
  if (prices == null) {
    return NextResponse.json({ ok: true, checked: 0, hits: [], priceError: true });
  }

  // Resolve the journal account once; every entry lands on the default one.
  const accountId = await resolveAccountId(supabase, user.id);

  const hits: { symbol: string; level: HitLevel; price: number }[] = [];

  for (const row of rows) {
    const price = prices[row.symbol.toUpperCase()];
    if (price == null) continue;

    // ---- Multi-TP1 & Auto-Breakeven SL Engine ----
    if (
      row.tp1_price != null &&
      !row.tp1_hit &&
      row.entry_price != null
    ) {
      const side = sideForTrigger(row.trigger_direction, row);
      const hitTp1 =
        side === "long" ? price >= row.tp1_price : price <= row.tp1_price;

      if (hitTp1) {
        const updateObj: Record<string, unknown> = { tp1_hit: true };
        if (row.auto_be_on_tp1 !== false) {
          updateObj.stop_loss = row.entry_price;
        }
        await supabase.from("trade_alerts").update(updateObj).eq("id", row.id);

        const sym = row.symbol.replace(/_USDT$/i, "");
        fetch(new URL("/api/alerts/fire", new URL(request.url).origin), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: request.headers.get("cookie") ?? "",
          },
          body: JSON.stringify({
            type: "tp1_hit",
            title: `${sym} TP1 Hit!`,
            message: `Price ${price} reached TP1 (${row.tp1_price}). ${
              row.auto_be_on_tp1 !== false ? "Stop loss automatically moved to Breakeven (EP)." : ""
            }`,
            link: "/trades",
          }),
        }).catch(() => {});
      }
    }

    for (const { level } of detectHits(row, price)) {
      const column = level === "sl" ? "sl_fired_at" : "tp_fired_at";
      const closedReason = level === "sl" ? "sl_hit" : "tp_hit";
      const nowIso = new Date().toISOString();

      const entry = row.entry_price ?? row.fired_price;
      const side = sideForTrigger(row.trigger_direction, row);
      const lev = row.leverage ?? 1;
      const margin = row.margin_usd ?? 1;
      const sign = side === "long" ? 1 : -1;
      const notional = margin * lev;
      const posSize = entry && entry > 0 ? notional / entry : 0;
      const pnlUsd = entry && entry > 0 ? sign * posSize * (price - entry) : null;
      const pnlPct = entry && entry > 0 ? sign * (price / entry - 1) * lev : null;

      // Claim the level atomically and set status to closed.
      const { data: claimed, error: claimError } = await supabase
        .from("trade_alerts")
        .update({
          [column]: nowIso,
          status: "closed",
          closed_reason: closedReason,
          exit_price: price,
          closed_at: nowIso,
          realized_pnl_usd: pnlUsd,
          realized_pnl_pct: pnlPct,
        })
        .eq("id", row.id)
        .is(column, null)
        .select("id");

      if (claimError || !claimed || claimed.length === 0) continue;

      hits.push({ symbol: row.symbol, level, price });
      await announce(request, row, level, price);
      if (accountId) {
        await logToJournal(supabase, accountId, row, level, price, pnlUsd, pnlPct).catch(() => {});
      }
    }
  }

  return NextResponse.json({ ok: true, checked: rows.length, hits });
}

/**
 * Fetch MEXC last prices for the symbols we track, keyed by upper-case symbol.
 *
 * Uses the app's own cached route (see /api/mexc/futures) so this shares the
 * upstream 5s cache with the trades page rather than hammering the exchange.
 * Returns null when the exchange could not be read.
 */
async function fetchPrices(
  request: Request
): Promise<Record<string, number> | null> {
  try {
    const url = new URL("/api/mexc/futures", new URL(request.url).origin);
    const res = await fetch(url, {
      cache: "no-store",
      headers: { cookie: request.headers.get("cookie") ?? "" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      tickers?: { symbol: string; lastPrice: number }[];
    };
    const map: Record<string, number> = {};
    for (const t of json.tickers ?? []) {
      if (typeof t.lastPrice === "number") map[t.symbol.toUpperCase()] = t.lastPrice;
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * Notify the user that a plan level was hit, naming which one it was.
 *
 * Delegates to the existing /api/alerts/fire dispatcher so in-app, Discord and
 * desktop handling stays in one place. The caller's cookie is forwarded so the
 * inner route authenticates as the same user.
 */
async function announce(
  request: Request,
  row: TradeAlert,
  level: HitLevel,
  price: number
): Promise<void> {
  const sym = row.symbol.replace(/_USDT$/i, "");
  const levelPrice = level === "sl" ? row.stop_loss : row.take_profit;
  const label = levelLabel(level);

  try {
    const url = new URL("/api/alerts/fire", new URL(request.url).origin);
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        type: "sl_tp_hit",
        title: `${sym} hit ${level === "sl" ? "SL" : "TP"}`,
        message:
          `Last price ${price} reached your ${label.toLowerCase()} at ${levelPrice}.` +
          (row.entry_price != null ? ` Entry was ${row.entry_price}.` : ""),
        link: "/trades",
      }),
    });
  } catch {
    // The hit is still recorded and journaled even if notification fails.
  }
}

/** The account journals land on: the user's first, created if none exists. */
async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (data) return (data as { id: string }).id;

  const { data: created } = await supabase
    .from("accounts")
    .insert({
      user_id: userId,
      name: "Default",
      broker: "Manual",
      starting_balance: 0,
      current_balance: 0,
    })
    .select("id")
    .single();
  return created ? (created as { id: string }).id : null;
}

/**
 * Write the hit plan into the Journal as a new OPEN trade.
 *
 * Size is derived exactly as the /trades page derives it — notional divided by
 * the entry — because trade_alerts stores margin + leverage rather than a
 * position size. The exit price is intentionally left null so the row starts
 * open and is closed by hand once the real exit is known.
 */
async function logToJournal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
  row: TradeAlert,
  level: HitLevel,
  hitPrice: number,
  pnlUsd?: number | null,
  pnlPct?: number | null
): Promise<void> {
  const entry = row.entry_price ?? hitPrice;
  const leverage = row.leverage ?? 1;
  const size = entry > 0 ? ((row.margin_usd ?? 1) * leverage) / entry : 0;
  const nowIso = new Date().toISOString();

  // `direction` shares the long/short vocabulary of the trades table and is
  // derived from the trigger direction, matching sideForTrigger().
  const direction = sideForTrigger(row.trigger_direction, row);

  await createTrade(supabase, {
    account_id: accountId,
    symbol: row.symbol,
    direction,
    size,
    entry_price: entry,
    exit_price: hitPrice,
    stop_price: row.stop_loss,
    fees: 0,
    entry_time: row.fired_at || row.created_at || nowIso,
    exit_time: nowIso,
    tags: [level === "sl" ? "SL Hit" : "TP Hit"],
    post_trade_review: reviewNote(row, level, hitPrice, entry, size, pnlUsd, pnlPct),
  });
}

/** Human-readable context attached to the auto-created journal entry. */
function reviewNote(
  row: TradeAlert,
  level: HitLevel,
  hitPrice: number,
  entry: number,
  size: number,
  pnlUsd?: number | null,
  pnlPct?: number | null
): string {
  const lines = [
    `Auto-closed: ${levelLabel(level)} hit at ${hitPrice}.`,
    `Entry ${entry} · size ${size.toFixed(6)} · margin $${row.margin_usd ?? 1}${
      row.leverage != null ? ` · ${row.leverage}x` : ""
    }`,
  ];
  if (pnlUsd != null && pnlPct != null) {
    lines.push(`Realized PnL: $${pnlUsd.toFixed(2)} (${(pnlPct * 100).toFixed(2)}%)`);
  }
  if (row.stop_loss != null) lines.push(`Stop-loss: ${row.stop_loss}`);
  if (row.take_profit != null) lines.push(`Take-profit: ${row.take_profit}`);
  if (row.notes) lines.push(`Original note: ${row.notes}`);
  return lines.join("\n");
}
