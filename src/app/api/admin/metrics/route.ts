import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getSiteWideGoogleDriveToken } from "@/lib/google-drive";

export async function GET() {
  const { user, isAdmin, supabase } = await requireAdmin(false);

  if (!user || !isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    // 1. Total Registered Users
    const { count: totalUsers } = await supabase
      .from("user_settings")
      .select("*", { count: "exact", head: true });

    // 2. Trades & Journal Metrics
    const { data: trades, error: tradesErr } = await supabase
      .from("trades")
      .select("id, status, pnl, net_pnl, created_at, user_id");

    const totalTrades = trades?.length || 0;
    const closedTrades = trades?.filter((t) => t.status === "closed") || [];
    const winningTrades = closedTrades.filter((t) => (t.net_pnl ?? t.pnl ?? 0) > 0);
    const winRate =
      closedTrades.length > 0
        ? Math.round((winningTrades.length / closedTrades.length) * 100)
        : 0;

    const totalPnl = closedTrades.reduce(
      (sum, t) => sum + Number(t.net_pnl ?? t.pnl ?? 0),
      0
    );

    // 3. Watchlist Items
    const { count: totalWatchlist } = await supabase
      .from("watchlist")
      .select("*", { count: "exact", head: true });

    // 4. Alerts Fired in Last 24 Hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: alerts24h } = await supabase
      .from("trade_alerts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", oneDayAgo);

    // 5. Cloud Storage (Google Drive) Status
    const siteWideDrive = await getSiteWideGoogleDriveToken(supabase);

    // 6. MEXC Futures API Latency Ping
    let mexcLatencyMs = -1;
    let mexcStatus = "down";
    try {
      const pingStart = performance.now();
      const mexcRes = await fetch("https://contract.mexc.com/api/v1/contract/ping", {
        signal: AbortSignal.timeout(3000),
      });
      if (mexcRes.ok) {
        mexcLatencyMs = Math.round(performance.now() - pingStart);
        mexcStatus = "healthy";
      }
    } catch {
      mexcStatus = "degraded";
    }

    return NextResponse.json({
      metrics: {
        users: {
          total: totalUsers || 0,
        },
        trades: {
          total: totalTrades,
          closed: closedTrades.length,
          open: totalTrades - closedTrades.length,
          winRate,
          totalPnl: Math.round(totalPnl * 100) / 100,
        },
        watchlist: {
          total: totalWatchlist || 0,
        },
        alerts: {
          last24h: alerts24h || 0,
        },
        storage: {
          googleDriveActive: !!siteWideDrive.refreshToken,
          googleDriveEmail: siteWideDrive.email,
          backend: siteWideDrive.refreshToken ? "google_drive" : "supabase",
        },
        mexc: {
          status: mexcStatus,
          latencyMs: mexcLatencyMs,
        },
      },
    });
  } catch (err) {
    console.error("Failed to load admin metrics:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
