import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateTradePnl } from "@/lib/trade-calc";
import { createTrade } from "@/lib/trade-ops";
import { sideForTrigger } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

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
  return data ? (data as { id: string }).id : null;
}

/**
 * PATCH /api/trade-alerts/[id]
 * Full modification endpoint for trade alerts.
 * Body properties (all optional):
 * symbol, trigger_direction ('above' | 'below'), trigger_price, fired_price,
 * entry_price, stop_loss, take_profit, order_type, notes, margin_usd, leverage,
 * status ('active' | 'closed'), exit_price, closed_reason, close_notes
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  // Fetch current alert to merge values for PnL calculation
  const { data: current, error: fetchErr } = await supabase
    .from("trade_alerts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "Trade alert not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (b.symbol !== undefined && b.symbol !== null) {
    const rawSym = b.symbol.toString().trim().toUpperCase();
    if (rawSym) {
      updates.symbol = rawSym.endsWith("_USDT") ? rawSym : `${rawSym}_USDT`;
    }
  }

  if (b.trigger_direction !== undefined) {
    updates.trigger_direction =
      b.trigger_direction === "above" || b.trigger_direction === "below"
        ? b.trigger_direction
        : null;
  }

  if (b.trigger_price !== undefined) updates.trigger_price = numOrNull(b.trigger_price);
  if (b.fired_price !== undefined) updates.fired_price = numOrNull(b.fired_price);
  if (b.entry_price !== undefined) updates.entry_price = numOrNull(b.entry_price);
  if (b.stop_loss !== undefined) updates.stop_loss = numOrNull(b.stop_loss);
  if (b.take_profit !== undefined) updates.take_profit = numOrNull(b.take_profit);

  if (b.order_type !== undefined) {
    updates.order_type =
      b.order_type === "limit" ||
      b.order_type === "trigger_limit" ||
      b.order_type === "market"
        ? b.order_type
        : null;
  }

  if (b.notes !== undefined) updates.notes = b.notes?.toString() || null;
  if (b.margin_usd !== undefined) updates.margin_usd = posOrNull(b.margin_usd);
  if (b.leverage !== undefined) updates.leverage = posOrNull(b.leverage);

  if (b.screenshot_urls !== undefined) {
    const urls = Array.isArray(b.screenshot_urls)
      ? (b.screenshot_urls as unknown[]).map(String).filter(Boolean)
      : [];
    updates.screenshot_urls = urls;
    updates.screenshot_url = urls[0] ?? null;
  } else if (b.screenshot_url !== undefined) {
    const single = b.screenshot_url ? String(b.screenshot_url) : null;
    updates.screenshot_url = single;
    updates.screenshot_urls = single ? [single] : [];
  }

  if (b.status !== undefined) {
    updates.status = b.status === "closed" ? "closed" : "active";
  }

  if (b.closed_reason !== undefined) {
    updates.closed_reason =
      b.closed_reason === "tp_hit" ||
      b.closed_reason === "sl_hit" ||
      b.closed_reason === "manual_close"
        ? b.closed_reason
        : null;
  }

  if (b.close_notes !== undefined) updates.close_notes = b.close_notes?.toString() || null;
  if (b.exit_price !== undefined) updates.exit_price = numOrNull(b.exit_price);

  // Determine effective values for PnL calculation
  const effStatus = (updates.status ?? current.status) as "active" | "closed";
  const effExit = (updates.exit_price !== undefined ? updates.exit_price : current.exit_price) as number | null;
  const effEntry = ((updates.entry_price !== undefined ? updates.entry_price : current.entry_price) ?? current.fired_price) as number | null;
  const effDirection = (updates.trigger_direction !== undefined ? updates.trigger_direction : current.trigger_direction) as "above" | "below" | null;
  const effMargin = (updates.margin_usd !== undefined ? updates.margin_usd : current.margin_usd) as number | null;
  const effLeverage = (updates.leverage !== undefined ? updates.leverage : current.leverage) as number | null;

  if (effStatus === "closed" || effExit != null) {
    const pnl = calculateTradePnl(
      effEntry,
      effExit,
      effDirection,
      effMargin,
      effLeverage
    );
    updates.realized_pnl_usd = pnl.realizedPnlUsd;
    updates.realized_pnl_pct = pnl.realizedPnlPct;
    if (effStatus === "closed" && !current.closed_at) {
      updates.closed_at = new Date().toISOString();
    }
  } else {
    updates.realized_pnl_usd = null;
    updates.realized_pnl_pct = null;
  }

  let { data: updated, error } = await supabase
    .from("trade_alerts")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  // Retry fallback if column does not exist yet
  if (error && (error.message.includes("screenshot") || error.code === "PGRST204" || error.code === "42703")) {
    delete updates.screenshot_urls;
    delete updates.screenshot_url;
    const retry = await supabase
      .from("trade_alerts")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();
    updated = retry.data;
    error = retry.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // If transitioning to closed, log to Journal
  if (effStatus === "closed" && current.status !== "closed" && effExit != null && effEntry != null && effEntry > 0) {
    try {
      const accountId = await resolveAccountId(supabase, user.id);
      if (accountId) {
        const side = sideForTrigger(effDirection, current);
        const lev = effLeverage != null && effLeverage > 0 ? effLeverage : 1;
        const margin = effMargin != null && effMargin > 0 ? effMargin : 1;
        const notional = margin * lev;
        const size = notional / effEntry;
        const reasonLabel =
          updates.closed_reason === "tp_hit"
            ? "TP Hit"
            : updates.closed_reason === "sl_hit"
            ? "SL Hit"
            : "Manual Close";

        await createTrade(supabase, {
          account_id: accountId,
          symbol: String(updates.symbol ?? current.symbol),
          direction: side,
          size,
          entry_price: effEntry,
          exit_price: effExit,
          stop_price: (updates.stop_loss !== undefined ? updates.stop_loss : current.stop_loss) as number | null,
          fees: 0,
          entry_time: current.fired_at || current.created_at || new Date().toISOString(),
          exit_time: updates.closed_at ? String(updates.closed_at) : new Date().toISOString(),
          tags: [reasonLabel],
          post_trade_review: [
            `Closed via Trade Alert (${reasonLabel}).`,
            `Entry: ${effEntry} | Exit: ${effExit}`,
            `Margin: $${margin} | Leverage: ${lev}x`,
            updates.realized_pnl_usd != null
              ? `PnL: $${Number(updates.realized_pnl_usd).toFixed(2)} (${(Number(updates.realized_pnl_pct) * 100).toFixed(2)}%)`
              : "",
            updates.close_notes ? `Notes: ${updates.close_notes}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          leverage: lev,
        });
      }
    } catch (err) {
      console.error("Failed to log edited trade to journal:", err);
    }
  }

  return NextResponse.json({ ok: true, alert: updated });
}

/** DELETE /api/trade-alerts/[id] — remove a logged trade. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { error } = await supabase.from("trade_alerts").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
