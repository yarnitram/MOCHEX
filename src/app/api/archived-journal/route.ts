import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteTrade } from "@/lib/trade-ops";

export const dynamic = "force-dynamic";

/**
 * GET /api/archived-journal
 * List all archived journal trades for the current user.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("archived_journal_trades")
    .select("*")
    .eq("user_id", user.id)
    .order("archived_at", { ascending: false });

  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("schema cache")) {
      return NextResponse.json({ archivedTrades: [], tableMissing: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ archivedTrades: data ?? [], tableMissing: false });
}

/**
 * POST /api/archived-journal
 * Soft-delete a trade: copy to archived_journal_trades and delete from trades table.
 * Body: { tradeId: string, tradeSnapshot?: any }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const tradeId = String(b.tradeId ?? "").trim();
  const snapshot = (b.tradeSnapshot as Record<string, unknown>) ?? {};

  if (!tradeId) {
    return NextResponse.json({ error: "tradeId required" }, { status: 400 });
  }

  // 1. Fetch current trade if not fully provided in snapshot
  let tradeData = snapshot;
  if (!tradeData.symbol) {
    const { data: currentTrade, error: fetchErr } = await supabase
      .from("trades")
      .select("*, trade_tags(tag_id, tags(*))")
      .eq("id", tradeId)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 400 });
    }
    if (!currentTrade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }
    tradeData = currentTrade;
  }

  // Fetch notes if needed
  let notesData = tradeData.notes;
  if (!notesData) {
    const { data: notes } = await supabase
      .from("trade_notes")
      .select("*")
      .eq("trade_id", tradeId)
      .maybeSingle();
    notesData = notes ?? null;
  }

  const symbol = String(tradeData.symbol ?? "").toUpperCase();
  const direction = tradeData.direction === "short" ? "short" : "long";
  const entryPrice = Number(tradeData.entry_price);
  const exitPrice = tradeData.exit_price != null ? Number(tradeData.exit_price) : null;
  const size = Number(tradeData.size);
  const stopPrice = tradeData.stop_price != null ? Number(tradeData.stop_price) : null;
  const fees = Number(tradeData.fees ?? 0);
  const entryTime = String(tradeData.entry_time || new Date().toISOString());
  const exitTime = tradeData.exit_time ? String(tradeData.exit_time) : null;
  const status = tradeData.status === "open" ? "open" : "closed";
  const pnlDollars = tradeData.pnl_dollars != null ? Number(tradeData.pnl_dollars) : null;
  const pnlPct = tradeData.pnl_pct != null ? Number(tradeData.pnl_pct) : null;
  const rMultiple = tradeData.r_multiple != null ? Number(tradeData.r_multiple) : null;
  const tags = tradeData.tags ?? [];
  const accountId = tradeData.account_id ? String(tradeData.account_id) : null;
  const archivedAt = new Date().toISOString();

  // 2. Insert into archived_journal_trades
  const { data: archivedRow, error: insertErr } = await supabase
    .from("archived_journal_trades")
    .insert({
      user_id: user.id,
      account_id: accountId,
      trade_id: tradeId,
      symbol,
      direction,
      entry_price: entryPrice,
      exit_price: exitPrice,
      size,
      stop_price: stopPrice,
      fees,
      entry_time: entryTime,
      exit_time: exitTime,
      status,
      pnl_dollars: pnlDollars,
      pnl_pct: pnlPct,
      r_multiple: rMultiple,
      tags,
      notes: notesData,
      archived_at: archivedAt,
    })
    .select("*")
    .single();

  let tableMissing = false;
  if (insertErr) {
    if (insertErr.code === "PGRST205" || insertErr.message?.includes("schema cache")) {
      tableMissing = true;
    } else {
      return NextResponse.json({ error: insertErr.message }, { status: 400 });
    }
  }

  // 3. Delete from active trades table
  try {
    await deleteTrade(supabase, tradeId);
  } catch (delErr) {
    return NextResponse.json({ error: (delErr as Error).message }, { status: 400 });
  }

  const resultItem = archivedRow ?? {
    id: `local-${Date.now()}`,
    user_id: user.id,
    account_id: accountId,
    trade_id: tradeId,
    symbol,
    direction,
    entry_price: entryPrice,
    exit_price: exitPrice,
    size,
    stop_price: stopPrice,
    fees,
    entry_time: entryTime,
    exit_time: exitTime,
    status,
    pnl_dollars: pnlDollars,
    pnl_pct: pnlPct,
    r_multiple: rMultiple,
    tags,
    notes: notesData,
    archived_at: archivedAt,
  };

  return NextResponse.json({ item: resultItem, tableMissing });
}
