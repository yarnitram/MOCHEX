import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

const numOrNull = (v: unknown) =>
  v == null || v === "" ? null : Number(v);

/**
 * PATCH /api/watchlist/[id]
 * Update a saved coin's price-trigger + trade plan.
 * Body (all optional): { trigger_price, trigger_direction, entry_price,
 * stop_loss, take_profit, notes, rearm }
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

  const direction =
    b.trigger_direction === "above" || b.trigger_direction === "below"
      ? b.trigger_direction
      : null;

  const orderType =
    b.order_type === "limit" ||
    b.order_type === "trigger_limit" ||
    b.order_type === "market"
      ? b.order_type
      : null;

  const updates: Record<string, unknown> = {
    trigger_price: numOrNull(b.trigger_price),
    trigger_direction: direction,
    order_type: orderType,
    entry_price: numOrNull(b.entry_price),
    stop_loss: numOrNull(b.stop_loss),
    take_profit: numOrNull(b.take_profit),
  };

  // Stamp when the trigger was armed. If a trigger price is provided, record
  // the current time as "trigger created"; if it's being cleared, drop it.
  if (b.trigger_price !== undefined) {
    updates.trigger_created_at =
      numOrNull(b.trigger_price) == null ? null : new Date().toISOString();
  }

  if (b.notes !== undefined) updates.notes = b.notes?.toString() || null;

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

  // Re-arm: clear the fired flag so the watcher can notify again.
  if (b.rearm) {
    updates.alert_fired = false;
    updates.alert_fired_at = null;
  }

  // Fire the alert: mark it as triggered (used by the polling watcher).
  // RACE-SAFETY: when firing, only claim rows whose alert_fired is still
  // false. `claimed` tells the caller whether THIS request won the claim —
  // the loser skips dispatching notifications so duplicates never go out.
  const firing = b.alert_fired === true;
  if (firing) {
    updates.alert_fired = true;
    updates.alert_fired_at =
      b.alert_fired_at != null && String(b.alert_fired_at) !== ""
        ? String(b.alert_fired_at)
        : new Date().toISOString();
  }

  // Fetch existing item to compare diffs for audit log
  const { data: oldItem } = await supabase
    .from("watchlist_items")
    .select("*")
    .eq("id", id)
    .single();

  let query = supabase.from("watchlist_items").update(updates).eq("id", id);
  if (firing) query = query.eq("alert_fired", false);

  let { data, error } = await query.select("id");

  // Fallback if migration 029 is not yet run in remote Supabase
  if (error && (error.message.includes("screenshot") || error.code === "PGRST204" || error.code === "42703")) {
    delete updates.screenshot_urls;
    delete updates.screenshot_url;
    let retryQuery = supabase.from("watchlist_items").update(updates).eq("id", id);
    if (firing) retryQuery = retryQuery.eq("alert_fired", false);
    const retryRes = await retryQuery.select("id");
    data = retryRes.data;
    error = retryRes.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Log setup revision audit trail
  if (oldItem) {
    const symbol = oldItem.symbol;
    const oldSL = oldItem.stop_loss;
    const newSL = updates.stop_loss !== undefined ? (updates.stop_loss as number | null) : oldSL;
    const oldTP = oldItem.take_profit;
    const newTP = updates.take_profit !== undefined ? (updates.take_profit as number | null) : oldTP;
    const ep = updates.entry_price !== undefined ? (updates.entry_price as number | null) : oldItem.entry_price;

    let revType: string | null = null;
    let revTitle = "";
    let revDesc = "";

    if (firing) {
      revType = "TRIGGER_FIRED";
      revTitle = `Price Alert Level Hit & Fired`;
      revDesc = `Trigger price level $${oldItem.trigger_price} reached on MEXC.`;
    } else if (newSL != null && ep != null && newSL >= ep && (oldSL == null || oldSL < ep)) {
      revType = "SL_BREAKEVEN";
      revTitle = `Stop Loss Moved to Breakeven`;
      revDesc = `Risk eliminated! SL moved from ${oldSL != null ? `$${oldSL}` : "unset"} to entry price $${newSL}.`;
    } else if (newSL !== oldSL) {
      revType = "SL_ADJUSTED";
      revTitle = `Stop Loss Level Updated`;
      revDesc = `Stop Loss adjusted from ${oldSL != null ? `$${oldSL}` : "unset"} to $${newSL}.`;
    } else if (newTP !== oldTP) {
      revType = "TP_ADJUSTED";
      revTitle = `Take Profit Target Updated`;
      revDesc = `Take Profit adjusted from ${oldTP != null ? `$${oldTP}` : "unset"} to $${newTP}.`;
    } else if (b.notes !== undefined && b.notes !== oldItem.notes) {
      revType = "NOTE_UPDATED";
      revTitle = `Pre-Trade Thesis Updated`;
      revDesc = `Thesis commentary updated.`;
    }

    if (revType) {
      await supabase.from("setup_revisions").insert({
        user_id: user.id,
        item_type: "watchlist",
        item_id: id,
        symbol: symbol,
        revision_type: revType,
        title: revTitle,
        description: revDesc,
        old_value: { stop_loss: oldSL, take_profit: oldTP, notes: oldItem.notes },
        new_value: { stop_loss: newSL, take_profit: newTP, notes: b.notes },
      });
    }
  }

  return NextResponse.json({ ok: true, claimed: !firing || (data?.length ?? 0) > 0 });
}

/** DELETE /api/watchlist/[id] — remove a watchlist item. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { error } = await supabase.from("watchlist_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}