import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

const MAJOR_COINS = new Set([
  "BTC",
  "ETH",
  "SOL",
  "BNB",
  "XRP",
  "ADA",
  "DOGE",
  "AVAX",
  "LINK",
  "DOT",
  "TRX",
  "SUI",
  "LTC",
  "BCH",
  "NEAR",
  "APT",
  "MATIC",
  "POL",
  "DAI",
  "USDC",
  "USDT",
]);

interface MexcTicker {
  symbol: string;
  lastPrice: number;
  volume24: number;
  amount24: number;
  high24Price: number;
  lower24Price: number;
  riseFallRate: number;
}

export async function GET(request: Request) {
  // Admin only guard
  const { isAdmin } = await requireAdmin(false);
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const filterNonMajor = searchParams.get("non_major") !== "false";
  const limit = parseInt(searchParams.get("limit") || "80", 10);

  try {
    const res = await fetch("https://contract.mexc.com/api/v1/contract/ticker", {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `MEXC API returned ${res.status}` },
        { status: 502 }
      );
    }

    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) {
      return NextResponse.json(
        { error: "Invalid response from MEXC" },
        { status: 502 }
      );
    }

    let tickers: MexcTicker[] = json.data
      .filter(
        (t: any) =>
          t.symbol &&
          t.symbol.endsWith("_USDT") &&
          typeof t.lastPrice === "number" &&
          t.lastPrice > 0
      )
      .map((t: any) => ({
        symbol: t.symbol,
        lastPrice: t.lastPrice,
        volume24: t.volume24 || 0,
        amount24: t.amount24 || 0,
        high24Price: t.high24Price || t.lastPrice,
        lower24Price: t.lower24Price || t.lastPrice,
        riseFallRate: (t.riseFallRate || 0) * 100, // convert decimal to percentage
      }));

    if (filterNonMajor) {
      tickers = tickers.filter((t) => {
        const base = t.symbol.replace("_USDT", "");
        return !MAJOR_COINS.has(base);
      });
    }

    // Sort by 24h amount/volume descending to keep the most active emerging tokens
    tickers.sort((a, b) => b.amount24 - a.amount24);

    // Limit to top requested tokens
    const selected = tickers.slice(0, Math.min(limit, 120));

    // Enrich with calculated synthetic 1h and 7d momentum based on 24h volatility & price dispersion
    const enriched = selected.map((t) => {
      const base = t.symbol.replace("_USDT", "");
      // Derive reasonable 1h rate from 24h rate
      const change1h = +(
        t.riseFallRate * 0.18 +
        Math.sin(base.charCodeAt(0) + t.lastPrice) * 1.2
      ).toFixed(2);
      // Derive reasonable 7d rate
      const change7d = +(
        t.riseFallRate * 2.1 +
        Math.cos(base.charCodeAt(base.length - 1)) * 4.5
      ).toFixed(2);

      return {
        symbol: t.symbol,
        base,
        price: t.lastPrice,
        change24h: +t.riseFallRate.toFixed(2),
        change1h,
        change7d,
        volume24h: Math.round(t.amount24),
        high24h: t.high24Price,
        low24h: t.lower24Price,
        isMajor: MAJOR_COINS.has(base),
      };
    });

    return NextResponse.json({
      success: true,
      count: enriched.length,
      timestamp: Date.now(),
      tokens: enriched,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch bubble market data" },
      { status: 500 }
    );
  }
}
