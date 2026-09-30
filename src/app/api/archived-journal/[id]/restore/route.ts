import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTrade } from "@/lib/trade-ops";
import type { TradeInput } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/archived-journal/[id]/restore
 * Restores an archived trade back into the active trades table and deletes the archive row.
 * Body can optionally supply the archived trade snapshot (needed if stored in local cache or table missing).
 */
export async function POST(request: Request, { params }: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Body optional if record is in database
  }

  const b = body as Record<string, unknown>;
  let item = (b.trade ?? null) as Record<string, unknown> | null;

  // If not provided in body and not local ID, fetch from archived_journal_trades
  if (!item && !id.startsWith("local-")) {
    const { data: dbItem, error: fetchErr } = await supabase
      .from("archived_journal_trades")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchErr && fetchErr.code !== "PGRST205") {
      return NextResponse.json({ error: fetchErr.message }, { status: 400 });
    }
    item = dbItem;
  }

  if (!item) {
    return NextResponse.json({ error: "Trade data not found to restore" }, { status: 404 });
  }

  // Find user's active account if account_id is missing
  let accountId = item.account_id ? String(item.account_id) : "";
  if (!accountId) {
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);
    accountId = accounts?.[0]?.id || "";
  }

  if (!accountId) {
    return NextResponse.json({ error: "No account found to restore trade into" }, { status: 400 });
  }

  const rawTags = item.tags;
  const tagNames: string[] = Array.isArray(rawTags)
    ? rawTags.map((t: unknown) => (typeof t === "string" ? t : (t as { name?: string })?.name || "")).filter(Boolean)
    : [];

  const notesObj = (item.notes as Record<string, unknown>) || {};

  const input: TradeInput = {
    account_id: accountId,
    symbol: String(item.symbol).toUpperCase(),
    direction: item.direction === "short" ? "short" : "long",
    size: Number(item.size),
    entry_price: Number(item.entry_price),
    exit_price: item.exit_price != null ? Number(item.exit_price) : null,
    stop_price: item.stop_price != null ? Number(item.stop_price) : null,
    fees: Number(item.fees ?? 0),
    entry_time: String(item.entry_time || new Date().toISOString()),
    exit_time: item.exit_time ? String(item.exit_time) : null,
    tags: tagNames,
    pre_trade_thesis: notesObj.pre_trade_thesis ? String(notesObj.pre_trade_thesis) : undefined,
    post_trade_review: notesObj.post_trade_review ? String(notesObj.post_trade_review) : undefined,
    discipline_score:
      notesObj.discipline_score != null
        ? Math.min(5, Math.max(1, Math.round(Number(notesObj.discipline_score))))
        : null,
    leverage: item.leverage != null ? Number(item.leverage) : null,
  };

  try {
    // 1. Create the restored trade in active trades table
    const { id: newTradeId } = await createTrade(supabase, input);

    // 2. Delete from archived_journal_trades if present in database
    if (!id.startsWith("local-")) {
      await supabase
        .from("archived_journal_trades")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
    }

    return NextResponse.json({ ok: true, restoredTradeId: newTradeId });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
