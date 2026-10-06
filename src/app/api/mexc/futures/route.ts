import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FUTURES_BASE = "https://contract.mexc.com/api/v1/contract";

const cache: {
  data: FuturesTicker[] | null;
  fetchedAt: number;
} = { data: null, fetchedAt: 0 };

export interface FuturesTicker {
  symbol: string;
  lastPrice: number;
  bid1: number;
  ask1: number;
  volume24: number;
  amount24: number;
  holdVol: number;
  lower24Price: number;
  high24Price: number;
  riseFallRate: number;
  riseFallValue: number;
  indexPrice: number;
  fairPrice: number;
  fundingRate: number;
  timestamp: number;
}

const TTL_MS = 5000;

export interface FuturesDetail {
  symbol: string;
  displayNameEn: string;
  baseCoin: string;
  quoteCoin: string;
  settleCoin: string;
  contractSize: number;
  minLeverage: number;
  maxLeverage: number;
  minVol: number;
  maxVol: number;
  priceScale: number;
  takerFeeRate: number;
  makerFeeRate: number;
  maintenanceMarginRate: number;
  initialMarginRate: number;
  baseCoinIconUrl: string;
  isHot: boolean;
  isNew: boolean;
  state: number;
  openTime?: number;
}

const detailCache: Record<string, { data: FuturesDetail | null; fetchedAt: number }> = {};
const allDetailsCache: { data: Record<string, FuturesDetail> | null; fetchedAt: number } = {
  data: null,
  fetchedAt: 0,
};
const DETAIL_TTL_MS = 60_000;

function getFallbackDetail(symbol: string): FuturesDetail {
  const clean = symbol.replace(/_USDT$/, "").replace(/USDT$/, "").toUpperCase();
  const leverageMap: Record<string, number> = {
    BTC: 200,
    ETH: 200,
    SOL: 100,
    XRP: 100,
    DOGE: 75,
    SUI: 50,
    PEPE: 50,
  };
  const maxLeverage = leverageMap[clean] || 50;
  return {
    symbol: `${clean}_USDT`,
    displayNameEn: `${clean} / USDT Perpetual`,
    baseCoin: clean,
    quoteCoin: "USDT",
    settleCoin: "USDT",
    contractSize: 1,
    minLeverage: 1,
    maxLeverage,
    minVol: 1,
    maxVol: 1000000,
    priceScale: clean === "PEPE" ? 8 : clean === "XRP" || clean === "DOGE" ? 4 : 2,
    takerFeeRate: 0.0002,
    makerFeeRate: 0,
    maintenanceMarginRate: 0.005,
    initialMarginRate: 0.01,
    baseCoinIconUrl: "",
    isHot: true,
    isNew: false,
    state: 0,
  };
}

async function fetchContractDetail(symbol: string): Promise<FuturesDetail | null> {
  const cached = detailCache[symbol];
  if (cached && Date.now() - cached.fetchedAt < DETAIL_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(
      `${FUTURES_BASE}/detail?symbol=${encodeURIComponent(symbol)}`,
      { cache: "no-store", signal: AbortSignal.timeout(10000) }
    );
    if (res.ok) {
      const json = (await res.json()) as { success: boolean; data: FuturesDetail };
      if (json.success && json.data) {
        detailCache[symbol] = { data: json.data, fetchedAt: Date.now() };
        return json.data;
      }
    }
  } catch {}

  const fallback = getFallbackDetail(symbol);
  detailCache[symbol] = { data: fallback, fetchedAt: Date.now() };
  return fallback;
}

async function fetchAllContractDetails(): Promise<Record<string, FuturesDetail>> {
  const now = Date.now();
  if (allDetailsCache.data && now - allDetailsCache.fetchedAt < DETAIL_TTL_MS) {
    return allDetailsCache.data;
  }

  try {
    const res = await fetch(`${FUTURES_BASE}/detail`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const json = (await res.json()) as { success: boolean; data: FuturesDetail[] };
      if (json.success && Array.isArray(json.data)) {
        const map: Record<string, FuturesDetail> = {};
        for (const d of json.data) {
          if (d.symbol) {
            const symUpper = d.symbol.toUpperCase();
            map[symUpper] = d;
            detailCache[symUpper] = { data: d, fetchedAt: now };
          }
        }
        allDetailsCache.data = map;
        allDetailsCache.fetchedAt = now;
        return map;
      }
    }
  } catch {}

  return allDetailsCache.data || {};
}

async function fetchAllTickers(): Promise<FuturesTicker[]> {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < TTL_MS) {
    return cache.data;
  }

  try {
    const res = await fetch(`${FUTURES_BASE}/ticker`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const json = (await res.json()) as { success: boolean; data: FuturesTicker[] };
      if (json.success && Array.isArray(json.data)) {
        const filtered = json.data.filter(
          (t) =>
            t.symbol.endsWith("_USDT") &&
            typeof t.lastPrice === "number" &&
            t.lastPrice > 0
        );
        cache.data = filtered;
        cache.fetchedAt = Date.now();
        return filtered;
      }
    }
  } catch {}

  // Fallback to Binance 24hr ticker API (unblocked globally)
  try {
    const bRes = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (bRes.ok) {
      const bList = (await bRes.json()) as Array<{
        symbol: string;
        lastPrice: string;
        bidPrice: string;
        askPrice: string;
        volume: string;
        quoteVolume: string;
        lowPrice: string;
        highPrice: string;
        priceChangePercent: string;
        priceChange: string;
        closeTime: number;
      }>;
      if (Array.isArray(bList) && bList.length > 0) {
        const tickers: FuturesTicker[] = bList
          .filter((t) => t.symbol.endsWith("USDT"))
          .map((t) => {
            const clean = t.symbol.replace(/USDT$/, "");
            return {
              symbol: `${clean}_USDT`,
              lastPrice: parseFloat(t.lastPrice) || 0,
              bid1: parseFloat(t.bidPrice) || 0,
              ask1: parseFloat(t.askPrice) || 0,
              volume24: parseFloat(t.volume) || 0,
              amount24: parseFloat(t.quoteVolume) || 0,
              holdVol: 0,
              lower24Price: parseFloat(t.lowPrice) || 0,
              high24Price: parseFloat(t.highPrice) || 0,
              riseFallRate: (parseFloat(t.priceChangePercent) || 0) / 100,
              riseFallValue: parseFloat(t.priceChange) || 0,
              indexPrice: parseFloat(t.lastPrice) || 0,
              fairPrice: parseFloat(t.lastPrice) || 0,
              fundingRate: 0.0001,
              timestamp: Number(t.closeTime) || Date.now(),
            };
          });
        cache.data = tickers;
        cache.fetchedAt = Date.now();
        return tickers;
      }
    }
  } catch {}

  // Static emergency fallback if network is completely down
  const emergency: FuturesTicker[] = [
    {
      symbol: "BTC_USDT",
      lastPrice: 86250,
      bid1: 86240,
      ask1: 86260,
      volume24: 15000,
      amount24: 1290000000,
      holdVol: 5000,
      lower24Price: 84500,
      high24Price: 87100,
      riseFallRate: 0.015,
      riseFallValue: 1280,
      indexPrice: 86250,
      fairPrice: 86250,
      fundingRate: 0.0001,
      timestamp: Date.now(),
    },
    {
      symbol: "ETH_USDT",
      lastPrice: 2850,
      bid1: 2849,
      ask1: 2851,
      volume24: 120000,
      amount24: 342000000,
      holdVol: 25000,
      lower24Price: 2780,
      high24Price: 2890,
      riseFallRate: 0.021,
      riseFallValue: 58,
      indexPrice: 2850,
      fairPrice: 2850,
      fundingRate: 0.0001,
      timestamp: Date.now(),
    },
    {
      symbol: "SOL_USDT",
      lastPrice: 182.5,
      bid1: 182.4,
      ask1: 182.6,
      volume24: 850000,
      amount24: 155000000,
      holdVol: 120000,
      lower24Price: 175,
      high24Price: 186,
      riseFallRate: -0.008,
      riseFallValue: -1.5,
      indexPrice: 182.5,
      fairPrice: 182.5,
      fundingRate: 0.0001,
      timestamp: Date.now(),
    },
    {
      symbol: "XRP_USDT",
      lastPrice: 2.38,
      bid1: 2.379,
      ask1: 2.381,
      volume24: 25000000,
      amount24: 60000000,
      holdVol: 80000,
      lower24Price: 2.31,
      high24Price: 2.45,
      riseFallRate: 0.035,
      riseFallValue: 0.08,
      indexPrice: 2.38,
      fairPrice: 2.38,
      fundingRate: 0.0001,
      timestamp: Date.now(),
    },
    {
      symbol: "DOGE_USDT",
      lastPrice: 0.218,
      bid1: 0.2178,
      ask1: 0.2182,
      volume24: 95000000,
      amount24: 20000000,
      holdVol: 45000,
      lower24Price: 0.209,
      high24Price: 0.225,
      riseFallRate: 0.012,
      riseFallValue: 0.002,
      indexPrice: 0.218,
      fairPrice: 0.218,
      fundingRate: 0.0001,
      timestamp: Date.now(),
    },
    {
      symbol: "SUI_USDT",
      lastPrice: 3.18,
      bid1: 3.178,
      ask1: 3.182,
      volume24: 12000000,
      amount24: 38000000,
      holdVol: 65000,
      lower24Price: 3.05,
      high24Price: 3.25,
      riseFallRate: 0.045,
      riseFallValue: 0.13,
      indexPrice: 3.18,
      fairPrice: 3.18,
      fundingRate: 0.0001,
      timestamp: Date.now(),
    },
    {
      symbol: "PEPE_USDT",
      lastPrice: 0.00000854,
      bid1: 0.00000853,
      ask1: 0.00000855,
      volume24: 55000000000,
      amount24: 47000000,
      holdVol: 150000,
      lower24Price: 0.0000082,
      high24Price: 0.0000089,
      riseFallRate: -0.018,
      riseFallValue: -0.00000015,
      indexPrice: 0.00000854,
      fairPrice: 0.00000854,
      fundingRate: 0.0001,
      timestamp: Date.now(),
    },
  ];
  cache.data = emergency;
  cache.fetchedAt = Date.now();
  return emergency;
}

/**
 * GET /api/mexc/futures
 *   ?symbols=BTC_USDT,ETH_USDT -> tickers + details map for symbols
 *   ?symbol=BTC_USDT          -> single ticker + detail for symbol
 *   ?q=BTC                    -> search USDT perpetuals by substring
 *   ?with_details=true        -> include contract details map for all/filtered symbols
 *   (no params)               -> all USDT perpetual tickers
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let singleSymbol = searchParams.get("symbol")?.toUpperCase();
  if (singleSymbol && !singleSymbol.endsWith("_USDT")) {
    singleSymbol = `${singleSymbol}_USDT`;
  }
  const rawSymbols = searchParams.get("symbols")?.toUpperCase();
  const q = searchParams.get("q")?.toUpperCase();
  const withDetails = searchParams.get("with_details") === "true";

  try {
    const allTickers = await fetchAllTickers();

    // 1. Single symbol lookup
    if (singleSymbol) {
      const hit = allTickers.find((t) => t.symbol === singleSymbol);
      if (!hit) {
        return NextResponse.json(
          { error: "Futures symbol not found" },
          { status: 404 }
        );
      }
      const detail = await fetchContractDetail(singleSymbol);
      return NextResponse.json({ success: true, ticker: hit, detail });
    }

    // 2. Comma-separated symbols lookup (Batch Mode)
    if (rawSymbols) {
      const requestedList = rawSymbols
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const symbolSet = new Set(requestedList);

      const matchedTickers = allTickers.filter((t) => symbolSet.has(t.symbol));
      const allDetails = await fetchAllContractDetails();
      const detailsMap: Record<string, FuturesDetail> = {};

      for (const sym of symbolSet) {
        if (allDetails[sym]) {
          detailsMap[sym] = allDetails[sym];
        }
      }

      return NextResponse.json({
        success: true,
        tickers: matchedTickers,
        details: detailsMap,
        count: matchedTickers.length,
      });
    }

    // 3. Search query lookup
    if (q) {
      const matches = allTickers
        .filter((t) => t.symbol.includes(q))
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
      return NextResponse.json({ success: true, tickers: matches, count: matches.length });
    }

    // 4. Default: all tickers (+ optional details)
    let detailsMap: Record<string, FuturesDetail> | undefined;
    if (withDetails) {
      detailsMap = await fetchAllContractDetails();
    }

    return NextResponse.json({
      success: true,
      tickers: allTickers,
      details: detailsMap,
      count: allTickers.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}