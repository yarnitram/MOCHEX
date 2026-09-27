import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

export async function POST(request: Request) {
  const { user, isAdmin, supabase } = await requireAdmin(false);

  if (!user || !isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { symbol = "BTC_USDT", action = "trigger", price = 68000, side = "long", timeframe = "15m", notes } = body;

    // Get admin user's webhook secret
    const { data: userSettings } = await supabase
      .from("user_settings")
      .select("webhook_secret")
      .eq("user_id", user.id)
      .maybeSingle();

    const webhookSecret = userSettings?.webhook_secret;
    if (!webhookSecret) {
      return NextResponse.json(
        { error: "Admin does not have a webhook_secret configured in user_settings." },
        { status: 400 }
      );
    }

    const payload = {
      secret: webhookSecret,
      symbol,
      action,
      price: Number(price),
      side,
      timeframe,
      notes: notes || "Simulated test alert triggered from MOCHEX Admin Dashboard",
      timestamp: new Date().toISOString(),
    };

    const origin = new URL(request.url).origin;
    const start = performance.now();
    const webhookRes = await fetch(`${origin}/api/webhooks/tradingview?key=${encodeURIComponent(webhookSecret)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const elapsedMs = Math.round(performance.now() - start);
    const resultJson = await webhookRes.json().catch(() => ({ statusText: webhookRes.statusText }));

    return NextResponse.json({
      success: webhookRes.ok,
      statusCode: webhookRes.status,
      elapsedMs,
      payload,
      response: resultJson,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
