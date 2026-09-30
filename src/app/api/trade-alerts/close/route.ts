import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTrade } from "@/lib/trade-ops";
import { calculateTradePnl } from "@/lib/trade-calc";
import { sideForTrigger } from "@/lib/types";
import { dispatchAlertNotification } from "@/lib/notification-dispatch";

export const dynamic = "force-dynamic";

const numOrNull = (v: unknown) => (v == null || v === "" ? null : Number(v));

const MEXC_FUTURES_DETAIL = "https://contract.mexc.com/api/v1/contract/detail";
const DETAIL_LEV_TTL_MS = 60_000;

let detailLevCache: { map: Record<string, number>; fetchedAt: number } | null = null;

/**
 * Resolve a contract's max leverage from the MEXC futures /detail endpoint.
 * Values are indexed under both `BTC_USDT` and `BTC` forms and cached for 60s,
 * so a close request never falls back to 1x when the contract leverage is knowable.
 */
async function resolveContractLeverage(symbol: string): Promise<number | null> {
  const now = Date.now();
  if (!detailLevCache || now - detailLevCache.fetchedAt >= DETAIL_LEV_TTL_MS) {
    try {
      const res = await fetch(MEXC_FUTURES_DETAIL, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          success?: boolean;
          data?: { symbol: string; maxLeverage?: number }[];
        };
        const map: Record<string, number> = {};
        for (const d of json.data ?? []) {
          if (d.symbol && typeof d.maxLeverage === "number" && d.maxLeverage > 0) {
            const rawSym = d.symbol.toUpperCase();
            map[rawSym] = d.maxLeverage;
            map[rawSym.replace(/_USDT$/i, "")] = d.maxLeverage;
          }
        }
        if (Object.keys(map).length > 0) detailLevCache = { map, fetchedAt: now };
      }
    } catch {
      // Network failure — fall through to any previously cached values.
    }
  }

  if (!detailLevCache) return null;
  const upper = symbol.trim().toUpperCase();
  const clean = upper.replace(/_USDT$/i, "");
  return (
    detailLevCache.map[upper] ??
    detailLevCache.map[`${clean}_USDT`] ??
    detailLevCache.map[clean] ??
    null
  );
}

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

  // Resolve leverage: explicit request > stored alert leverage > MEXC contract max > 1x.
  // The MEXC fallback prevents a manual close from silently logging 1x PnL when the
  // alert was created without an explicit leverage but the contract supports more.
  let lev = numOrNull(b.leverage) ?? alertRow.leverage ?? null;
  if (lev == null || !Number.isFinite(lev) || lev <= 0) {
    const contractLev = await resolveContractLeverage(alertRow.symbol);
    lev = contractLev ?? 1;
  }

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
    leverage: lev,
  };

  let { error: updateErr } = await supabase
    .from("trade_alerts")
    .update(updatePayload)
    .eq("id", alertId)
    .eq("user_id", user.id);

  if (updateErr && (updateErr.message.includes("leverage") || updateErr.code === "PGRST204" || updateErr.code === "42703")) {
    delete updatePayload.leverage;
    const retry = await supabase
      .from("trade_alerts")
      .update(updatePayload)
      .eq("id", alertId)
      .eq("user_id", user.id);
    updateErr = retry.error;
  }

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
