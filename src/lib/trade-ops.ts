import type { ServerSupabase } from "./supabase/server";
import type { TradeInput } from "./types";
import { pnlDollars } from "./calculations";

/**
 * Strategy for writing tags inside a trade upsert.
 * Returns new tag ids created on the fly (not yet attached) so the caller can
 * map local names → ids before linking.
 */
export async function ensureTagIds(
  supabase: ServerSupabase,
  userId: string,
  tagNames: string[]
): Promise<string[]> {
  const existingRes = await supabase
    .from("tags")
    .select("id,name")
    .eq("user_id", userId)
    .in("name", tagNames);
  const existing = (existingRes.data ?? []) as { id: string; name: string }[];

  const tagIdByName: Record<string, string> = {};
  for (const t of existing) tagIdByName[t.name] = t.id;

  const missing = tagNames.filter((n) => !tagIdByName[n]);
  if (missing.length) {
    // Create missing tags (one insert per tag keeps it simple & idempotent).
    for (const name of missing) {
      const { data, error } = await supabase
        .from("tags")
        .insert({ user_id: userId, name })
        .select("id,name")
        .single();
      if (error && !error.message.includes("duplicate")) throw error;
      if (data) tagIdByName[(data as { name: string }).name] = (data as { id: string }).id;
    }
  }

  return tagNames.map((n) => tagIdByName[n]).filter(Boolean);
}

/** Delete a trade and its join-row references. */
export async function deleteTrade(
  supabase: ServerSupabase,
  tradeId: string
): Promise<void> {
  // cascade deletes handle trade_tags + trade_notes via FK on delete cascade.
  const { error } = await supabase.from("trades").delete().eq("id", tradeId);
  if (error) throw new Error(error.message);
}

/**
 * Create a trade from form input.
 * Computes status from presence of exit price; writes tags + notes.
 */
export async function createTrade(
  supabase: ServerSupabase,
  input: TradeInput
): Promise<{ id: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const hasExit = input.exit_price != null && !Number.isNaN(input.exit_price);
  const status = hasExit ? "closed" : "open";

  const { data: trade, error } = await supabase
    .from("trades")
    .insert({
      account_id: input.account_id,
      symbol: input.symbol.trim().toUpperCase(),
      direction: input.direction,
      entry_price: input.entry_price,
      exit_price: hasExit ? input.exit_price : null,
      size: input.size,
      stop_price: input.stop_price ?? null,
      fees: input.fees ?? 0,
      entry_time: input.entry_time,
      exit_time: hasExit ? input.exit_time ?? null : null,
      status,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  const tradeId = (trade as { id: string }).id;

  // Tags (create-on-the-fly).
  const tagNames = (input.tags ?? [])
    .map((t) => t.trim())
    .filter(Boolean);
  if (tagNames.length) {
    const ids = await ensureTagIds(supabase, user.id, tagNames);
    if (ids.length) {
      await supabase
        .from("trade_tags")
        .insert(ids.map((tag_id) => ({ trade_id: tradeId, tag_id })));
    }
  }

  // Notes.
  const thesis = input.pre_trade_thesis?.trim();
  const review = input.post_trade_review?.trim();
  const screenshot = input.screenshot_url?.trim();
  if (thesis || review || input.discipline_score != null || screenshot) {
    await supabase.from("trade_notes").insert({
      trade_id: tradeId,
      pre_trade_thesis: thesis || null,
      post_trade_review: review || null,
      discipline_score: input.discipline_score ?? null,
      screenshot_url: screenshot || null,
    });
  }

  return { id: tradeId };
}

/**
 * Update an existing trade. Supports closing an open trade (set exit price),
 * editing any field, and clearing an exit (re-open).
 */
export async function updateTrade(
  supabase: ServerSupabase,
  tradeId: string,
  input: TradeInput
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const hasExit = input.exit_price != null && !Number.isNaN(input.exit_price);
  const status = hasExit ? "closed" : "open";

  const { error } = await supabase
    .from("trades")
    .update({
      symbol: input.symbol.trim().toUpperCase(),
      direction: input.direction,
      entry_price: input.entry_price,
      exit_price: hasExit ? input.exit_price : null,
      size: input.size,
      stop_price: input.stop_price ?? null,
      fees: input.fees ?? 0,
      entry_time: input.entry_time,
      exit_time: hasExit ? input.exit_time ?? null : null,
      status,
    })
    .eq("id", tradeId);
  if (error) throw new Error(error.message);

  // Tags: replace the full set (delete + reinsert).
  const { error: delTagErr } = await supabase
    .from("trade_tags")
    .delete()
    .eq("trade_id", tradeId);
  if (delTagErr) throw new Error(delTagErr.message);

  const tagNames = (input.tags ?? []).map((t) => t.trim()).filter(Boolean);
  if (tagNames.length) {
    const ids = await ensureTagIds(supabase, user.id, tagNames);
    if (ids.length) {
      await supabase
        .from("trade_tags")
        .insert(ids.map((tag_id) => ({ trade_id: tradeId, tag_id })));
    }
  }

  // Notes: upsert
  const thesis = input.pre_trade_thesis?.trim();
  const review = input.post_trade_review?.trim();
  const hasNotes =
    thesis ||
    review ||
    input.discipline_score != null ||
    input.screenshot_url !== undefined;

  if (hasNotes) {
    const updateObj: Record<string, unknown> = {
      trade_id: tradeId,
      pre_trade_thesis: thesis || null,
      post_trade_review: review || null,
      discipline_score: input.discipline_score ?? null,
    };
    if (input.screenshot_url !== undefined) {
      updateObj.screenshot_url = input.screenshot_url ? input.screenshot_url.trim() : null;
    }
    await supabase.from("trade_notes").upsert(updateObj, { onConflict: "trade_id" });
  } else if (input.clearNotes) {
    // Explicitly remove notes (keep the trade).
    await supabase.from("trade_notes").delete().eq("trade_id", tradeId);
  }
}

/** Validate a fee/size/numeric so DB numeric columns don't reject stringy input. */
export function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (Number.isNaN(n)) throw new Error("Numeric value required");
  return n;
}

// Re-export for the API route to compute pnl on the server when needed.
export { pnlDollars };