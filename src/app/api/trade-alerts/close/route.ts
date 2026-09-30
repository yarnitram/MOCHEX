import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTrade } from "@/lib/trade-ops";
import { calculateTradePnl } from "@/lib/trade-calc";
import { sideForTrigger } from "@/lib/types";
import { dispatchAlertNotification } from "@/lib/notification-dispatch";

export const dynamic = "force-dynamic";

const numOrNull = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** Resolve primary account for journal logging. */
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
 * POST /api/trade-alerts/close
 * Close an active trade alert, compute realized PnL, write to Journal trades table, and notify.
 * Body: { alert_id, exit_price, closed_reason ('manual_close' | 'tp_hit' | 'sl_hit'), close_notes }
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
  const alertId = b.alert_id?.toString();
  const exitPrice = numOrNull(b.exit_price);
  const closedReason = (b.closed_reason?.toString() || "manual_close") as
    | "manual_close"
    | "tp_hit"
    | "sl_hit";
  const closeNotes = b.close_notes?.toString() || null;

  if (!alertId) {
    return NextResponse.json({ error: "alert_id is required" }, { status: 400 });
  }
  if (exitPrice == null || exitPrice <= 0) {
    return NextResponse.json({ error: "Valid exit price is required" }, { status: 400 });
  }

  // Fetch the active trade alert
  const { data: alertRow, error: fetchErr } = await supabase
    .from("trade_alerts")
    .select("*")
    .eq("id", alertId)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !alertRow) {
    return NextResponse.json({ error: "Trade alert not found" }, { status: 404 });
  }

  const entry = alertRow.entry_price ?? alertRow.fired_price;
  const lev = numOrNull(b.leverage) ?? alertRow.leverage ?? 1;
  const pnl = calculateTradePnl(
    entry,
    exitPrice,
    alertRow.trigger_direction,
    alertRow.margin_usd,
    lev,
    alertRow
  );

  const closedAt = new Date().toISOString();

  // Update trade_alerts row to status = 'closed'
  const updatePayload: Record<string, unknown> = {
    status: "closed",
    closed_reason: closedReason,
    exit_price: exitPrice,
    closed_at: closedAt,
    close_notes: closeNotes,
    realized_pnl_usd: pnl.realizedPnlUsd,
    realized_pnl_pct: pnl.realizedPnlPct,
  };
  if (alertRow.leverage == null && lev > 0) {
    updatePayload.leverage = lev;
  }

  const { error: updateErr } = await supabase
    .from("trade_alerts")
    .update(updatePayload)
    .eq("id", alertId)
    .eq("user_id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  // Log to Journal (trades table)
  let journalLogged = false;
  try {
    const accountId = await resolveAccountId(supabase, user.id);
    if (accountId && entry != null && entry > 0) {
      const side = sideForTrigger(alertRow.trigger_direction, alertRow);
      const margin = alertRow.margin_usd ?? 1;
      const notional = margin * lev;
      const size = notional / entry;

      const reasonLabel =
        closedReason === "tp_hit"
          ? "TP Hit"
          : closedReason === "sl_hit"
          ? "SL Hit"
          : "Manual Close";

      await createTrade(supabase, {
        account_id: accountId,
        symbol: alertRow.symbol,
        direction: side,
        size,
        entry_price: entry,
        exit_price: exitPrice,
        stop_price: alertRow.stop_loss,
        fees: 0,
        entry_time: alertRow.fired_at || alertRow.created_at || closedAt,
        exit_time: closedAt,
        tags: [reasonLabel],
        post_trade_review: [
          `Closed via Trade Alert (${reasonLabel}).`,
          `Entry: ${entry} | Exit: ${exitPrice}`,
          `Margin: $${margin} | Leverage: ${lev}x`,
          pnl.realizedPnlUsd != null
            ? `PnL: $${pnl.realizedPnlUsd.toFixed(2)} (${(pnl.realizedPnlPct! * 100).toFixed(2)}%)`
            : "",
          closeNotes ? `Notes: ${closeNotes}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        leverage: lev,
      });
      journalLogged = true;
    }
  } catch (err) {
    console.error("Failed to write to journal trades table:", err);
  }

  // Announce / Notification
  try {
    const sym = alertRow.symbol.replace(/_USDT$/i, "");
    const reasonTitle =
      closedReason === "tp_hit"
        ? "TP Hit"
        : closedReason === "sl_hit"
        ? "SL Hit"
        : "Trade Closed";

    const pnlStr =
      pnl.realizedPnlUsd != null
        ? ` (PnL: $${pnl.realizedPnlUsd.toFixed(2)}, ${(
            pnl.realizedPnlPct! * 100
          ).toFixed(2)}%)`
        : "";

    await dispatchAlertNotification(supabase, user.id, {
      type: "trade_alert",
      title: `${sym} ${reasonTitle}`,
      message: `Trade closed at ${exitPrice}${pnlStr}.`,
      link: "/trades",
    }).catch(() => {});
  } catch {
    /* Best effort */
  }

  return NextResponse.json({
    ok: true,
    journalLogged,
    realizedPnlUsd: pnl.realizedPnlUsd,
    realizedPnlPct: pnl.realizedPnlPct,
  });
}
