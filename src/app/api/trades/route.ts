import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTrade, toNum } from "@/lib/trade-ops";
import { getTrades } from "@/lib/data";
import type { TradeInput } from "@/lib/types";

/** GET /api/trades?account=<id> — list trades for an account. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account");
  if (!accountId) {
    return NextResponse.json({ error: "account required" }, { status: 400 });
  }

  try {
    const trades = await getTrades(supabase, accountId);
    return NextResponse.json({ trades });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** POST /api/trades — create a trade. */
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
  try {
    const input: TradeInput = {
      account_id: String(b.account_id),
      symbol: String(b.symbol),
      direction: b.direction === "short" ? "short" : "long",
      size: toNum(b.size),
      entry_price: toNum(b.entry_price),
      exit_price: b.exit_price != null && b.exit_price !== "" ? toNum(b.exit_price) : null,
      stop_price: b.stop_price != null && b.stop_price !== "" ? toNum(b.stop_price) : null,
      fees: b.fees != null && b.fees !== "" ? toNum(b.fees) : 0,
      entry_time: String(b.entry_time),
      exit_time: b.exit_time != null && b.exit_time !== "" ? String(b.exit_time) : null,
      tags: Array.isArray(b.tags) ? (b.tags as string[]) : [],
      pre_trade_thesis: b.pre_trade_thesis?.toString(),
      post_trade_review: b.post_trade_review?.toString(),
      discipline_score:
        b.discipline_score != null && b.discipline_score !== ""
          ? Math.min(5, Math.max(1, Math.round(toNum(b.discipline_score))))
          : null,
      leverage:
        b.leverage != null && b.leverage !== "" && Number(b.leverage) > 0
          ? toNum(b.leverage)
          : null,
      screenshot_url: b.screenshot_url ? String(b.screenshot_url) : null,
      screenshot_urls: Array.isArray(b.screenshot_urls)
        ? (b.screenshot_urls as unknown[]).map(String).filter(Boolean)
        : b.screenshot_url
        ? [String(b.screenshot_url)]
        : undefined,
    };

    if (!input.symbol || !input.entry_time) {
      return NextResponse.json({ error: "symbol and entry_time required" }, { status: 400 });
    }

    const { id } = await createTrade(supabase, input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }
}