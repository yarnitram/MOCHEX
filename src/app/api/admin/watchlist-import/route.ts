import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

const MAX_ROWS = 500;
const VALID_ORDER_TYPES = ["limit", "trigger_limit", "market"] as const;
type OrderType = (typeof VALID_ORDER_TYPES)[number];

interface RowResult {
  rowIndex: number;
  symbol: string;
  user_id: string;
  status: "imported" | "skipped" | "error";
  reason?: string;
}

/**
 * POST /api/admin/watchlist-import
 * Admin-only bulk insert of watchlist setups.
 * Body: { rows: ImportRow[], defaultUserId?: string }
 */
export async function POST(request: Request) {
  const { user, supabase, isAdmin } = await requireAdmin(false);
  if (!user || !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const rows = Array.isArray(b.rows) ? (b.rows as unknown[]) : [];
  const defaultUserId = b.defaultUserId ? String(b.defaultUserId) : null;

  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows. Maximum is ${MAX_ROWS} per import.` },
      { status: 400 }
    );
  }

  const results: RowResult[] = [];
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  const toInsert: Record<string, unknown>[] = [];
  const insertIndexMap: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] as Record<string, unknown>;

    const symbolRaw = String(raw.symbol ?? "").trim().toUpperCase();
    const symbol = symbolRaw.includes("_") ? symbolRaw : symbolRaw ? `${symbolRaw}_USDT` : "";
    const targetUserId = raw.user_id ? String(raw.user_id).trim() : defaultUserId;

    if (!symbol) {
      results.push({ rowIndex: i + 1, symbol: "(blank)", user_id: targetUserId ?? "?", status: "error", reason: "symbol is required" });
      errors++; continue;
    }
    if (!targetUserId) {
      results.push({ rowIndex: i + 1, symbol, user_id: "?", status: "error", reason: "user_id required — set a default user or include user_id column" });
      errors++; continue;
    }

    const orderType = String(raw.order_type ?? "").trim().toLowerCase();
    if (!VALID_ORDER_TYPES.includes(orderType as OrderType)) {
      results.push({ rowIndex: i + 1, symbol, user_id: targetUserId, status: "error", reason: `invalid order_type "${orderType}" — use: limit, market, trigger_limit` });
      errors++; continue;
    }

    const ep = Number(raw.entry_price);
    const sl = Number(raw.stop_loss);
    const tp = Number(raw.take_profit);

    if (!ep || isNaN(ep) || ep <= 0) { results.push({ rowIndex: i + 1, symbol, user_id: targetUserId, status: "error", reason: "entry_price must be a positive number" }); errors++; continue; }
    if (!sl || isNaN(sl) || sl <= 0) { results.push({ rowIndex: i + 1, symbol, user_id: targetUserId, status: "error", reason: "stop_loss must be a positive number" }); errors++; continue; }
    if (!tp || isNaN(tp) || tp <= 0) { results.push({ rowIndex: i + 1, symbol, user_id: targetUserId, status: "error", reason: "take_profit must be a positive number" }); errors++; continue; }

    const trigPriceRaw = raw.trigger_price;
    const trigPrice = trigPriceRaw != null && trigPriceRaw !== "" ? Number(trigPriceRaw) : null;

    if (orderType === "trigger_limit" && (trigPrice == null || isNaN(trigPrice) || trigPrice <= 0)) {
      results.push({ rowIndex: i + 1, symbol, user_id: targetUserId, status: "error", reason: "trigger_price required for trigger_limit" });
      errors++; continue;
    }

    const trigDirRaw = raw.trigger_direction;
    const trigDir = trigDirRaw === "above" || trigDirRaw === "below" ? trigDirRaw : null;
    const finalTrigDir = trigDir ?? (trigPrice != null ? (trigPrice < ep ? "below" : "above") : null);

    toInsert.push({
      user_id: targetUserId,
      symbol,
      order_type: orderType,
      entry_price: ep,
      stop_loss: sl,
      take_profit: tp,
      trigger_price: orderType === "trigger_limit" ? trigPrice : ep,
      trigger_direction: orderType === "trigger_limit" ? finalTrigDir : null,
      notes: raw.notes ? String(raw.notes).trim() || null : null,
      trigger_created_at: new Date().toISOString(),
      alert_fired: false,
      screenshot_urls: [],
      screenshot_url: null,
    });
    insertIndexMap.push(i);
    results.push({ rowIndex: i + 1, symbol, user_id: targetUserId, status: "imported" });
  }

  if (toInsert.length > 0) {
    const affectedUserIds = [...new Set(toInsert.map((r) => String(r.user_id)))];
    const affectedSymbols = [...new Set(toInsert.map((r) => String(r.symbol)))];

    const { data: existingItems } = await supabase
      .from("watchlist_items")
      .select("user_id, symbol")
      .in("user_id", affectedUserIds)
      .in("symbol", affectedSymbols)
      .eq("alert_fired", false);

    const existingSet = new Set(
      (existingItems ?? []).map((e: { user_id: string; symbol: string }) => `${e.user_id}::${e.symbol}`)
    );

    const finalInsert: Record<string, unknown>[] = [];
    const finalInsertIdxMap: number[] = [];

    for (let j = 0; j < toInsert.length; j++) {
      const row = toInsert[j];
      const key = `${row.user_id}::${row.symbol}`;
      const origIdx = insertIndexMap[j];
      if (existingSet.has(key)) {
        results[origIdx] = { ...results[origIdx], status: "skipped", reason: "already in active watchlist" };
        skipped++;
      } else {
        finalInsert.push(row);
        finalInsertIdxMap.push(origIdx);
      }
    }

    if (finalInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("watchlist_items")
        .insert(finalInsert);

      if (insertError) {
        for (const idx of finalInsertIdxMap) {
          results[idx] = { ...results[idx], status: "error", reason: insertError.message };
          errors++;
        }
      } else {
        for (const idx of finalInsertIdxMap) {
          results[idx] = { ...results[idx], status: "imported" };
          imported++;
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    summary: { imported, skipped, errors, total: rows.length },
    results,
  });
}
