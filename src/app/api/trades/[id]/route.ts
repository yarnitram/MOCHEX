import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteTrade, toNum, updateTrade } from "@/lib/trade-ops";
import type { TradeInput } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/trades/[id] — update a trade. */
export async function PUT(request: Request, { params }: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

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
      clearNotes: Boolean(b.clearNotes),
      screenshot_url:
        b.screenshot_url !== undefined
          ? b.screenshot_url
            ? String(b.screenshot_url)
            : null
          : undefined,
      screenshot_urls:
        b.screenshot_urls !== undefined
          ? Array.isArray(b.screenshot_urls)
            ? (b.screenshot_urls as unknown[]).map(String).filter(Boolean)
            : []
          : undefined,
    };

    await updateTrade(supabase, id, input);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }
}

/** DELETE /api/trades/[id] — delete a trade. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await deleteTrade(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }
}