import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { isAdmin, user } = await requireAdmin(false);
  if (!isAdmin || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const supabase = await createClient();

    // 1. Fetch tracked tokens & wallets
    const [tokensRes, walletsRes] = await Promise.all([
      supabase.from("admin_tracked_tokens").select("*").eq("admin_id", user.id).eq("alert_enabled", true),
      supabase.from("admin_tracked_wallets").select("*").eq("admin_id", user.id).eq("alert_enabled", true),
    ]);

    const tokens = tokensRes.data || [];
    const wallets = walletsRes.data || [];

    const notificationsToInsert: any[] = [];

    // 2. Simulate finding a whale swap for a tracked token (if any)
    if (tokens.length > 0) {
      // Pick a random token from the list
      const randomToken = tokens[Math.floor(Math.random() * tokens.length)];
      
      // Simulate a random trade size above their threshold
      const tradeSize = randomToken.min_usd_threshold + Math.floor(Math.random() * 50000);
      const isBuy = Math.random() > 0.5;

      notificationsToInsert.push({
        user_id: user.id,
        type: "whale_alert",
        title: isBuy ? `🟢 Whale Accumulation: ${randomToken.symbol}` : `🚨 Whale Dump: ${randomToken.symbol}`,
        message: `A whale just ${isBuy ? "bought" : "sold"} $${tradeSize.toLocaleString()} worth of ${randomToken.symbol}.`,
        link: `/admin/bubblemaps?token=${randomToken.symbol}`,
        read: false,
      });
    }

    // 3. Simulate finding a whale swap for a tracked wallet (if any)
    if (wallets.length > 0) {
      // Pick a random wallet from the list
      const randomWallet = wallets[Math.floor(Math.random() * wallets.length)];
      const walletName = randomWallet.label || `Wallet ${randomWallet.wallet_address.substring(0, 6)}...`;
      
      // Simulate a random trade size above their threshold
      const tradeSize = randomWallet.min_usd_threshold + Math.floor(Math.random() * 100000);
      const randomToken = ["POPCAT", "GOAT", "BONK", "WIF"][Math.floor(Math.random() * 4)];
      const isBuy = Math.random() > 0.5;

      notificationsToInsert.push({
        user_id: user.id,
        type: "whale_alert",
        title: `👁️ Tracked Wallet Activity: ${walletName}`,
        message: `${walletName} just ${isBuy ? "bought" : "sold"} $${tradeSize.toLocaleString()} of ${randomToken}.`,
        link: `/admin/bubblemaps?token=${randomToken}`,
        read: false,
      });
    }

    // 4. Insert notifications
    if (notificationsToInsert.length > 0) {
      const { error } = await supabase.from("notifications").insert(notificationsToInsert);
      if (error) throw error;
    }

    return NextResponse.json({ 
      success: true, 
      generatedCount: notificationsToInsert.length,
      message: `Scanned on-chain data. Generated ${notificationsToInsert.length} whale alerts.` 
    });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to run scanner" },
      { status: 500 }
    );
  }
}
