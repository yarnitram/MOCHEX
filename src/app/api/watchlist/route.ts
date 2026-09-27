import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET /api/watchlist — list the current user's watchlist items. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("watchlist_items")
    .select("*")
    .order("added_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

/** POST /api/watchlist — add a watchlist item. Body: { symbol, notes?, alert_price? } */
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
  const symbol = String(b.symbol ?? "").trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const numOrNull = (v: unknown) => (v == null || v === "" ? null : Number(v));

  const triggerDirection =
    b.trigger_direction === "above" || b.trigger_direction === "below"
      ? b.trigger_direction
      : null;

  const orderType =
    b.order_type === "limit" ||
    b.order_type === "trigger_limit" ||
    b.order_type === "market"
      ? b.order_type
      : null;

  const triggerPrice = numOrNull(b.trigger_price);

  const screenshotUrls = Array.isArray(b.screenshot_urls)
    ? (b.screenshot_urls as unknown[]).map(String).filter(Boolean)
    : b.screenshot_url
    ? [String(b.screenshot_url)]
    : [];
  const firstScreenshot = screenshotUrls[0] ?? (b.screenshot_url ? String(b.screenshot_url) : null);

  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    symbol,
    notes: b.notes?.toString() || null,
    alert_price: numOrNull(b.alert_price),
    trigger_price: triggerPrice,
    trigger_direction: triggerDirection,
    order_type: orderType,
    entry_price: numOrNull(b.entry_price),
    stop_loss: numOrNull(b.stop_loss),
    take_profit: numOrNull(b.take_profit),
    trigger_created_at:
      b.trigger_created_at != null
        ? String(b.trigger_created_at)
        : triggerPrice != null
        ? new Date().toISOString()
        : null,
    screenshot_urls: screenshotUrls,
    screenshot_url: firstScreenshot,
  };

  let { data, error } = await supabase
    .from("watchlist_items")
    .insert(insertPayload)
    .select("*")
    .single();

  // Graceful fallback if migration 029 is not yet run in remote Supabase
  if (error && (error.message.includes("screenshot") || error.code === "PGRST204" || error.code === "42703")) {
    delete insertPayload.screenshot_urls;
    delete insertPayload.screenshot_url;
    const retry = await supabase
      .from("watchlist_items")
      .insert(insertPayload)
      .select("*")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}