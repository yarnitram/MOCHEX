import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const numOrNull = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** GET /api/archived-watchlist — list the current user's archived watchlist items. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("archived_watchlist_items")
    .select("*")
    .order("archived_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

/** POST /api/archived-watchlist — insert a soft-deleted item into archive. */
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

  const archiveSource =
    b.archive_source === "triggered_deleted" ? "triggered_deleted" : "active_deleted";

  const rawScreenshots = b.screenshot_urls;
  const screenshotUrls: string[] = Array.isArray(rawScreenshots)
    ? rawScreenshots.filter((u): u is string => typeof u === "string" && u.trim() !== "")
    : [];
  const screenshotUrl =
    typeof b.screenshot_url === "string" && b.screenshot_url.trim() !== ""
      ? b.screenshot_url.trim()
      : screenshotUrls[0] ?? null;

  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    symbol,
    trigger_price: numOrNull(b.trigger_price),
    trigger_direction: triggerDirection,
    fired_price: numOrNull(b.fired_price),
    entry_price: numOrNull(b.entry_price),
    stop_loss: numOrNull(b.stop_loss),
    take_profit: numOrNull(b.take_profit),
    order_type: orderType,
    notes: b.notes?.toString() || null,
    archive_source: archiveSource,
    fired_at: b.fired_at ? String(b.fired_at) : null,
    archived_at: b.archived_at ? String(b.archived_at) : new Date().toISOString(),
    screenshot_urls: screenshotUrls,
    screenshot_url: screenshotUrl,
  };

  let { data, error } = await supabase
    .from("archived_watchlist_items")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error && (error.code === "PGRST204" || error.message?.includes("screenshot") || error.code === "42703")) {
    const fallbackPayload = { ...insertPayload };
    delete fallbackPayload.screenshot_urls;
    delete fallbackPayload.screenshot_url;
    const retry = await supabase
      .from("archived_watchlist_items")
      .insert(fallbackPayload)
      .select("*")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}
