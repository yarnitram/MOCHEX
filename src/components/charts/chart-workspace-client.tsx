"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { InteractiveCandlestickChart } from "./interactive-candlestick-chart";
import { cleanSymbol, fmtPx, mexcChartUrl } from "@/lib/format";
import { FuturesTicker, FuturesDetail } from "@/app/api/mexc/futures/route";

interface Props {
  symbol: string;
}

const POPULAR_SYMBOLS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "SUI", "PEPE"];

export function ChartWorkspaceClient({ symbol: initialSymbol }: Props) {
  const [activeSymbol, setActiveSymbol] = useState<string>(initialSymbol || "BTC_USDT");
  const [ticker, setTicker] = useState<FuturesTicker | null>(null);
  const [detail, setDetail] = useState<FuturesDetail | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [allTickers, setAllTickers] = useState<FuturesTicker[]>([]);

  const cleanSym = cleanSymbol(activeSymbol);

  // Sync activeSymbol if initialSymbol changes from route
  useEffect(() => {
    if (initialSymbol) {
      setActiveSymbol(initialSymbol);
    }
  }, [initialSymbol]);

  // Clock ticker for real-time price timestamp (HH:mm:ss)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch ticker stats and contract detail for active symbol
  useEffect(() => {
    let mounted = true;
    async function loadStats() {
      try {
        const res = await fetch(`/api/mexc/futures?symbol=${encodeURIComponent(activeSymbol)}`);
        const json = await res.json();
        if (mounted && json.success) {
          setTicker(json.ticker);
          setDetail(json.detail);
        }
      } catch (err) {
        console.error("Failed to load ticker stats:", err);
      }
    }
    loadStats();
    return () => {
      mounted = false;
    };
  }, [activeSymbol]);

  // Load all available futures tickers for the quick search dropdown
  useEffect(() => {
    async function loadAllTickers() {
      try {
        const res = await fetch("/api/mexc/futures");
        const json = await res.json();
        if (json.success && Array.isArray(json.tickers)) {
          setAllTickers(json.tickers);
        }
      } catch (err) {
        console.warn("Failed to load tickers for search:", err);
      }
    }
    loadAllTickers();
  }, []);

  const handleSelectSymbol = (sym: string) => {
    const formatted = sym.endsWith("_USDT") ? sym : `${sym}_USDT`;
    setActiveSymbol(formatted);
    setIsSearchOpen(false);
    setSearchQuery("");
    try {
      localStorage.setItem("mochex_last_chart_symbol", cleanSymbol(sym));
    } catch {}
    // Update URL history without page reload
    window.history.replaceState(null, "", `/chart?symbol=${encodeURIComponent(cleanSymbol(sym))}`);
  };

  const filteredSymbols = useMemo(() => {
    if (!searchQuery.trim()) return allTickers.slice(0, 12);
    const q = searchQuery.toUpperCase().trim();
    return allTickers
      .filter((t) => t.symbol.includes(q) || cleanSymbol(t.symbol).includes(q))
      .slice(0, 15);
  }, [allTickers, searchQuery]);

  const isUp = (ticker?.riseFallRate || 0) >= 0;

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Symbol Switcher Station */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-panel/80 backdrop-blur-md border border-line p-4 rounded-2xl shadow-xl">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/watchlist"
            className="p-2 text-muted hover:text-text bg-panel border border-line hover:bg-panel-soft rounded-xl transition-colors"
            title="Back to Watchlist"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-text font-mono tracking-wide">
                {cleanSym} / USDT
              </h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-accent/15 text-accent border border-accent/30">
                MEXC Futures
              </span>
              {detail?.maxLeverage && (
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1 shadow-xs">
                  <span>⚡</span>
                  <span>{detail.maxLeverage}x</span>
                </span>
              )}
            </div>
            <p className="text-xs text-muted">
              Technical Analysis Chart Workspace & Market Stats
            </p>
          </div>
        </div>

        {/* Quick Symbol Switcher Chips & Search Dropdown */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Popular Tokens Chips */}
          <div className="hidden sm:flex items-center gap-1 bg-panel p-1 rounded-xl border border-line">
            {POPULAR_SYMBOLS.map((coin) => {
              const active = cleanSym.toUpperCase() === coin;
              return (
                <button
                  key={coin}
                  type="button"
                  onClick={() => handleSelectSymbol(coin)}
                  className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-lg transition-all ${
                    active
                      ? "bg-accent text-white shadow-xs"
                      : "text-muted hover:text-text hover:bg-panel-soft"
                  }`}
                >
                  {coin}
                </button>
              );
            })}
          </div>

          {/* Search Dropdown Modal/Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSearchOpen((prev) => !prev)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-panel hover:bg-panel-soft text-text border border-line rounded-xl transition-colors cursor-pointer"
            >
              <span>🔍</span>
              <span className="hidden md:inline">Search Contract</span>
              <span className="text-[10px] text-muted font-mono">▼</span>
            </button>

            {isSearchOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-panel border border-line rounded-xl shadow-2xl z-50 p-2 animate-in fade-in zoom-in-95 duration-150">
                <input
                  type="text"
                  placeholder="Search token (e.g. SUI, PEPE, SOL)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full bg-paper border border-line rounded-lg px-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent"
                />
                <div className="max-h-60 overflow-y-auto mt-2 space-y-1">
                  {filteredSymbols.map((item) => {
                    const c = cleanSymbol(item.symbol);
                    return (
                      <button
                        key={item.symbol}
                        type="button"
                        onClick={() => handleSelectSymbol(item.symbol)}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-panel-soft transition-colors cursor-pointer text-left"
                      >
                        <div className="font-mono font-bold text-text">{c}</div>
                        <div className="font-mono text-muted text-[11px]">${fmtPx(item.lastPrice)}</div>
                      </button>
                    );
                  })}
                  {filteredSymbols.length === 0 && (
                    <div className="p-3 text-center text-xs text-muted">No contracts found</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* External Exchange Link */}
          <a
            href={mexcChartUrl(activeSymbol)}
            target="_blank"
            rel="noopener noreferrer"
            className="accent-btn flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold shrink-0"
          >
            <span>MEXC</span>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>

      {/* Market Stats Grid with Last Price + Time and Max Leverage */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {/* 1. Last Price + Live Time */}
        <div className="bg-panel border border-line p-3.5 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-muted font-medium uppercase tracking-wider">
            <span>Last Price</span>
            <span className="flex items-center gap-1 text-[10px] text-gain font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE</span>
            </span>
          </div>
          <div className="text-base font-bold font-mono text-text mt-1">
            {ticker ? fmtPx(ticker.lastPrice) : "—"}
          </div>
          <div className="text-[11px] font-mono text-muted mt-1 flex items-center gap-1">
            <span>🕒</span>
            <span>{currentTime || "—"}</span>
          </div>
        </div>

        {/* 2. 24h Change */}
        <div className="bg-panel border border-line p-3.5 rounded-xl flex flex-col justify-between">
          <div className="text-[11px] text-muted font-medium uppercase tracking-wider">
            24h Change
          </div>
          <div
            className={`text-base font-bold font-mono mt-1 ${
              isUp ? "text-gain" : "text-loss"
            }`}
          >
            {ticker
              ? `${isUp ? "+" : ""}${(ticker.riseFallRate * 100).toFixed(2)}%`
              : "—"}
          </div>
          <div className="text-[11px] font-mono text-muted mt-1">
            {ticker ? `${isUp ? "+" : ""}${fmtPx(ticker.riseFallValue)}` : "—"}
          </div>
        </div>

        {/* 3. 24h High */}
        <div className="bg-panel border border-line p-3.5 rounded-xl flex flex-col justify-between">
          <div className="text-[11px] text-muted font-medium uppercase tracking-wider">
            24h High
          </div>
          <div className="text-base font-bold font-mono text-gain mt-1">
            {ticker ? fmtPx(ticker.high24Price) : "—"}
          </div>
          <div className="text-[10px] text-muted mt-1">24h Peak</div>
        </div>

        {/* 4. 24h Low */}
        <div className="bg-panel border border-line p-3.5 rounded-xl flex flex-col justify-between">
          <div className="text-[11px] text-muted font-medium uppercase tracking-wider">
            24h Low
          </div>
          <div className="text-base font-bold font-mono text-loss mt-1">
            {ticker ? fmtPx(ticker.lower24Price) : "—"}
          </div>
          <div className="text-[10px] text-muted mt-1">24h Floor</div>
        </div>

        {/* 5. Max Leverage Data */}
        <div className="bg-panel border border-line p-3.5 rounded-xl flex flex-col justify-between">
          <div className="text-[11px] text-muted font-medium uppercase tracking-wider flex items-center justify-between">
            <span>Max Leverage</span>
            <span className="text-[10px] text-amber-400 font-mono">⚡ FUTURES</span>
          </div>
          <div className="text-base font-bold font-mono text-amber-400 mt-1">
            {detail?.maxLeverage ? `${detail.maxLeverage}x` : "—"}
          </div>
          <div className="text-[10px] text-muted mt-1 font-mono">
            {detail ? `Min ${detail.minLeverage}x – Max ${detail.maxLeverage}x` : "Contract Leverage"}
          </div>
        </div>

        {/* 6. Funding Rate */}
        <div className="bg-panel border border-line p-3.5 rounded-xl flex flex-col justify-between">
          <div className="text-[11px] text-muted font-medium uppercase tracking-wider">
            Funding Rate
          </div>
          <div className="text-base font-bold font-mono text-accent mt-1">
            {ticker ? `${(ticker.fundingRate * 100).toFixed(4)}%` : "—"}
          </div>
          <div className="text-[10px] text-muted mt-1">8h Perpetual Settlement</div>
        </div>

        {/* 7. 24h Volume */}
        <div className="bg-panel border border-line p-3.5 rounded-xl flex flex-col justify-between">
          <div className="text-[11px] text-muted font-medium uppercase tracking-wider">
            24h Volume (USDT)
          </div>
          <div className="text-base font-bold font-mono text-text mt-1">
            {ticker ? `$${(ticker.amount24 / 1_000_000).toFixed(2)}M` : "—"}
          </div>
          <div className="text-[10px] text-muted mt-1 font-mono">
            {ticker ? `${ticker.volume24.toLocaleString()} contracts` : "—"}
          </div>
        </div>
      </div>

      {/* Main Full-Screen Interactive Candlestick Chart Workspace */}
      <InteractiveCandlestickChart
        key={activeSymbol}
        symbol={activeSymbol}
        height={700}
        showOverlayToggle={true}
        maxLeverage={detail?.maxLeverage ?? null}
      />
    </div>
  );
}
