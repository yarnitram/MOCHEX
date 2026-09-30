import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateTradePnl } from "@/lib/trade-calc";
import { createTrade } from "@/lib/trade-ops";
import { sideForTrigger } from "@/lib/types";

export const dynamic = "force-dynamic";

const numOrNull = (v: unknown) => (v == null || v === "" ? null : Number(v));
const posOrNull = (v: unknown) => {
  const n = numOrNull(v);
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
};

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
 * POST /api/trade-alerts/manual
 * Manually create a trade alert directly on the Trades page (Active or Closed).
 * Body: { symbol, trigger_direction ('above' | 'below'), trigger_price, fired_price, entry_price, stop_loss, take_profit, leverage, margin_usd, order_type, notes, status ('active' | 'closed'), exit_price, closed_reason, close_notes }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const rawSymbol = b.symbol?.toString()?.trim() || "";
  if (!rawSymbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  const symbol = rawSymbol.toUpperCase().endsWith("_USDT")
    ? rawSymbol.toUpperCase()
    : `${rawSymbol.toUpperCase()}_USDT`;

  const direction = b.trigger_direction === "above" ? "above" : "below";
  const entryPrice = posOrNull(b.entry_price);
  if (!entryPrice) {
    return NextResponse.json({ error: "Valid entry price is required" }, { status: 400 });
  }

  const orderType =
    b.order_type === "limit" ||
    b.order_type === "trigger_limit" ||
    b.order_type === "market"
      ? b.order_type
      : "market";

  const isClosed = b.status === "closed";
  const exitPrice = isClosed ? numOrNull(b.exit_price) : null;
  const closedReason = (b.closed_reason?.toString() || "manual_close") as
    | "manual_close"
    | "tp_hit"
    | "sl_hit";
  const closeNotes = b.close_notes?.toString() || null;
  const nowIso = new Date().toISOString();

  let pnlUsd: number | null = null;
  let pnlPct: number | null = null;

  if (isClosed && exitPrice != null) {
    const pnl = calculateTradePnl(
      entryPrice,
      exitPrice,
      direction,
      posOrNull(b.margin_usd) ?? 1,
      posOrNull(b.leverage)
    );
    pnlUsd = pnl.realizedPnlUsd;
    pnlPct = pnl.realizedPnlPct;
  }

  const insertData: Record<string, unknown> = {
    user_id: user.id,
    symbol,
    trigger_direction: direction,
    trigger_price: numOrNull(b.trigger_price),
    fired_price: numOrNull(b.fired_price) ?? entryPrice,
    entry_price: entryPrice,
    stop_loss: numOrNull(b.stop_loss),
    take_profit: numOrNull(b.take_profit),
    margin_usd: posOrNull(b.margin_usd) ?? 1,
    leverage: posOrNull(b.leverage),
    order_type: orderType,
    notes: b.notes?.toString() || null,
    status: isClosed ? "closed" : "active",
    closed_reason: isClosed ? closedReason : null,
    exit_price: exitPrice,
    close_notes: closeNotes,
    realized_pnl_usd: pnlUsd,
    realized_pnl_pct: pnlPct,
    closed_at: isClosed ? nowIso : null,
    fired_at: nowIso,
  };

  const screenshotUrls = Array.isArray(b.screenshot_urls)
    ? (b.screenshot_urls as unknown[]).map(String).filter(Boolean)
    : b.screenshot_url
    ? [String(b.screenshot_url)]
    : [];

  if (screenshotUrls.length > 0) {
    insertData.screenshot_urls = screenshotUrls;
    insertData.screenshot_url = screenshotUrls[0] ?? null;
  }

  let { data, error } = await supabase
    .from("trade_alerts")
    .insert(insertData)
    .select("*")
    .single();

  // Retry fallback if screenshot_urls column does not exist yet
  if (error && (error.message.includes("screenshot") || error.code === "PGRST204" || error.code === "42703")) {
    delete insertData.screenshot_urls;
    delete insertData.screenshot_url;
    const retry = await supabase
      .from("trade_alerts")
      .insert(insertData)
      .select("*")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // If created as pre-closed, log to Journal
  if (isClosed && exitPrice != null) {
    try {
      const accountId = await resolveAccountId(supabase, user.id);
      if (accountId) {
        const side = sideForTrigger(direction);
        const lev = posOrNull(b.leverage) ?? 1;
        const margin = posOrNull(b.margin_usd) ?? 1;
        const notional = margin * lev;
        const size = notional / entryPrice;

        await createTrade(supabase, {
          account_id: accountId,
          symbol,
          direction: side,
          size,
          entry_price: entryPrice,
          exit_price: exitPrice,
          stop_price: numOrNull(b.stop_loss),
          fees: 0,
          entry_time: nowIso,
          exit_time: nowIso,
          tags: ["Manual Trade"],
          screenshot_url: screenshotUrls[0] ?? null,
          screenshot_urls: screenshotUrls,
          post_trade_review: [
            "Manually logged closed trade.",
            `Entry: ${entryPrice} | Exit: ${exitPrice}`,
            `Margin: $${margin} | Leverage: ${lev}x`,
            pnlUsd != null ? `PnL: $${pnlUsd.toFixed(2)} (${(pnlPct! * 100).toFixed(2)}%)` : "",
            closeNotes ? `Notes: ${closeNotes}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          leverage: lev,
        });
      }
    } catch (err) {
      console.error("Failed to write manual trade to journal:", err);
    }
  }

  return NextResponse.json({ ok: true, alert: data });
}
