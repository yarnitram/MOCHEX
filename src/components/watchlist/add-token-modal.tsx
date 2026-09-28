"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import type { OrderType, WatchlistItem } from "@/lib/types";
import { cleanSymbol, fmtPx, fmtPct } from "@/lib/format";
import { ORDER_TYPE_LABELS } from "./watchlist-types";
import { MultiScreenshotUploader } from "@/components/ui/multi-screenshot-uploader";

export interface AddSetupPayload {
  symbol: string;
  trigger_price?: number | null;
  trigger_direction?: "above" | "below" | null;
  order_type?: OrderType | null;
  entry_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  notes?: string | null;
  screenshot_urls?: string[];
  screenshot_url?: string | null;
}

interface TickerResult {
  symbol: string;
  lastPrice: number;
  riseFallRate: number;
  amount24?: number;
}

export interface AddTokenModalProps {
  open: boolean;
  onClose: () => void;
  /** Primary handler for submitting a full watchlist setup */
  onAddSetup?: (payload: AddSetupPayload) => Promise<WatchlistItem | void>;
  /** Backwards compatibility handler for adding symbol only */
  onAddCoin?: (symbol: string) => Promise<WatchlistItem | void>;
  existingSymbols: Set<string>;
  icons?: Record<string, string>;
  onConfigurePlan?: (item: WatchlistItem) => void;
}

const POPULAR_TOKENS = [
  "BTC",
  "ETH",
  "SOL",
  "DOGE",
  "XRP",
  "SUI",
  "PEPE",
  "NEAR",
  "AVAX",
  "BNB",
];

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: "limit", label: "Limit" },
  { value: "trigger_limit", label: "Trigger Limit" },
  { value: "market", label: "Market" },
];

export function AddTokenModal({
  open,
  onClose,
  onAddSetup,
  onAddCoin,
  existingSymbols,
  icons = {},
  onConfigurePlan,
}: AddTokenModalProps) {
  // Token search & selection
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TickerResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<TickerResult | null>(null);

  // Setup form fields
  const [position, setPosition] = useState<"long" | "short">("long");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [triggerDirection, setTriggerDirection] = useState<"above" | "below">("below");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [notes, setNotes] = useState("");
  const [screenshotUrls, setScreenshotUrls] = useState<string[]>([]);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastAddedItem, setLastAddedItem] = useState<WatchlistItem | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(null);
      setSearchError(null);
      setSelectedToken(null);
      setPosition("long");
      setTriggerPrice("");
      setTriggerDirection("below");
      setOrderType("limit");
      setEntryPrice("");
      setStopLoss("");
      setTakeProfit("");
      setNotes("");
      setScreenshotUrls([]);
      setFormError(null);
      setSuccessBanner(null);
      setLastAddedItem(null);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open]);

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!open) return null;

  async function searchMexc(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/mexc/futures?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.tickers ?? []);
    } catch (err) {
      setSearchError((err as Error).message);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchMexc(val), 250);
  }

  async function handleSelectChip(token: string) {
    const fullSym = token.includes("_") ? token.toUpperCase() : `${token.toUpperCase()}_USDT`;
    try {
      const res = await fetch(`/api/mexc/futures?symbol=${encodeURIComponent(fullSym)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ticker) {
          handleSelectToken(data.ticker);
          return;
        }
      }
    } catch {
      // fallback to search
    }
    setQuery(token);
    searchMexc(token);
  }

  function handleSelectToken(t: TickerResult) {
    setSelectedToken(t);
    setQuery("");
    setResults(null);
    setFormError(null);
    setSuccessBanner(null);

    // Default trigger price to last price if empty
    if (!triggerPrice && t.lastPrice) {
      setTriggerPrice(String(t.lastPrice));
    }
    if (!entryPrice && t.lastPrice) {
      setEntryPrice(String(t.lastPrice));
    }
  }

  function handlePositionChange(newPos: "long" | "short") {
    setPosition(newPos);
  }

  function handleTriggerPriceChange(val: string) {
    setTriggerPrice(val);
    const trig = parseFloat(val);
    const last = selectedToken?.lastPrice;
    if (!isNaN(trig) && last != null && last > 0) {
      if (trig > last) {
        setTriggerDirection("above");
      } else if (trig < last) {
        setTriggerDirection("below");
      }
    }
  }

  function handleEntryChange(val: string) {
    setEntryPrice(val);
    // Auto-sync trigger price to EP for Limit and Market order types
    if (orderType === "limit" || orderType === "market") {
      setTriggerPrice(val);
    }
    const ep = parseFloat(val);
    const sl = parseFloat(stopLoss);
    if (!isNaN(ep) && !isNaN(sl)) {
      if (sl < ep) setPosition("long");
      else if (sl > ep) setPosition("short");
    }
  }

  function handleStopLossChange(val: string) {
    setStopLoss(val);
    const sl = parseFloat(val);
    const ep = parseFloat(entryPrice);
    if (!isNaN(sl) && !isNaN(ep)) {
      if (sl < ep) setPosition("long");
      else if (sl > ep) setPosition("short");
    }
  }

  // Calculate live Risk/Reward ratio
  const epNum = entryPrice ? parseFloat(entryPrice) : null;
  const slNum = stopLoss ? parseFloat(stopLoss) : null;
  const tpNum = takeProfit ? parseFloat(takeProfit) : null;

  let rrRatio: string | null = null;
  let riskWarning: string | null = null;

  if (epNum != null && slNum != null && tpNum != null && !isNaN(epNum) && !isNaN(slNum) && !isNaN(tpNum)) {
    const risk = Math.abs(epNum - slNum);
    const reward = Math.abs(tpNum - epNum);
    if (risk > 0) {
      rrRatio = (reward / risk).toFixed(2);
    }
    if (position === "long") {
      if (slNum >= epNum) {
        riskWarning = "For a LONG setup, Stop Loss should be below Entry Price.";
      } else if (tpNum <= epNum) {
        riskWarning = "For a LONG setup, Take Profit should be above Entry Price.";
      }
    } else {
      if (slNum <= epNum) {
        riskWarning = "For a SHORT setup, Stop Loss should be above Entry Price.";
      } else if (tpNum >= epNum) {
        riskWarning = "For a SHORT setup, Take Profit should be below Entry Price.";
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedToken) {
      setFormError("Please select a coin first.");
      return;
    }

    if (!orderType) {
      setFormError("Order type is required.");
      return;
    }

    // For Trigger Limit, triggerPrice must be set explicitly.
    // For Limit/Market, triggerPrice mirrors EP (validated below).
    const trigNum = triggerPrice ? parseFloat(triggerPrice) : null;
    if (orderType === "trigger_limit") {
      if (trigNum == null || isNaN(trigNum) || trigNum <= 0) {
        setFormError("Trigger price is required and must be greater than 0.");
        return;
      }
    }

    const ep = entryPrice ? parseFloat(entryPrice) : null;
    if (ep == null || isNaN(ep) || ep <= 0) {
      setFormError("Entry price (EP) is required and must be greater than 0.");
      return;
    }

    const sl = stopLoss ? parseFloat(stopLoss) : null;
    if (sl == null || isNaN(sl) || sl <= 0) {
      setFormError("Stop loss (SL) is required and must be greater than 0.");
      return;
    }

    const tp = takeProfit ? parseFloat(takeProfit) : null;
    if (tp == null || isNaN(tp) || tp <= 0) {
      setFormError("Take profit (TP) is required and must be greater than 0.");
      return;
    }

    // Directional validation to protect against immediate liquidation/loss
    if (position === "long") {
      if (sl >= ep) {
        setFormError("For a LONG setup, Stop Loss must be below Entry Price.");
        return;
      }
      if (tp <= ep) {
        setFormError("For a LONG setup, Take Profit must be above Entry Price.");
        return;
      }
    } else {
      if (sl <= ep) {
        setFormError("For a SHORT setup, Stop Loss must be above Entry Price.");
        return;
      }
      if (tp >= ep) {
        setFormError("For a SHORT setup, Take Profit must be below Entry Price.");
        return;
      }
    }

    setSubmitting(true);
    setFormError(null);
    setSuccessBanner(null);

    const payload: AddSetupPayload = {
      symbol: selectedToken.symbol.toUpperCase(),
      trigger_price: trigNum,
      trigger_direction: triggerDirection,
      order_type: orderType,
      entry_price: ep,
      stop_loss: sl,
      take_profit: tp,
      notes: notes.trim() || null,
      screenshot_urls: screenshotUrls,
      screenshot_url: screenshotUrls[0] ?? null,
    };

    try {
      let createdItem: WatchlistItem | void = undefined;
      if (onAddSetup) {
        createdItem = await onAddSetup(payload);
      } else if (onAddCoin) {
        createdItem = await onAddCoin(payload.symbol);
      }

      const symLabel = cleanSymbol(selectedToken.symbol);
      setSuccessBanner(`Added ${symLabel} (${position.toUpperCase()}) to your Watchlist!`);
      if (createdItem) {
        setLastAddedItem(createdItem);
      }

      // Reset setup inputs for next entry, keeping coin or clear
      setTriggerPrice("");
      setEntryPrice("");
      setStopLoss("");
      setTakeProfit("");
      setNotes("");
      setScreenshotUrls([]);
    } catch (err) {
      setFormError((err as Error).message || "Failed to add setup");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedSym = selectedToken ? selectedToken.symbol.toUpperCase() : null;
  const selectedLabel = selectedSym ? cleanSymbol(selectedSym) : null;
  const selectedIcon = selectedSym ? icons[selectedSym] : null;
  const isAlreadyTracked = selectedSym ? existingSymbols.has(selectedSym) : false;

  const inputCls =
    "w-full px-3 py-2 rounded-xl bg-panel-soft/80 border border-line text-text placeholder:text-muted/60 text-xs focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-mono";

  return (
    <ModalShell title="🪙 Add Watchlist Setup" onClose={onClose} maxWidth="max-w-xl" disableClickOutside={true}>
      <div className="flex flex-col gap-4 text-xs">
        {/* Success Banner */}
        {successBanner && (
          <div className="p-3 rounded-xl bg-gain/10 border border-gain/20 text-gain text-xs flex items-center justify-between animate-in fade-in duration-200">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="font-bold">✓</span>
              <span>{successBanner}</span>
            </span>
            <div className="flex items-center gap-2">
              {onConfigurePlan && lastAddedItem && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onConfigurePlan(lastAddedItem);
                  }}
                  className="px-2.5 py-1 rounded bg-gain/20 hover:bg-gain/30 text-gain font-semibold text-[11px] transition-colors cursor-pointer"
                >
                  View Details →
                </button>
              )}
              <button
                type="button"
                onClick={() => setSuccessBanner(null)}
                className="text-gain/70 hover:text-gain p-1 cursor-pointer"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {formError && (
          <div className="p-3 rounded-xl bg-loss/10 border border-loss/20 text-loss text-xs flex items-center justify-between animate-in fade-in duration-200">
            <span>{formError}</span>
            <button
              type="button"
              onClick={() => setFormError(null)}
              className="text-loss/70 hover:text-loss p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* --- STEP 1: TOKEN SELECTION --- */}
        {!selectedToken ? (
          <div className="flex flex-col gap-3">
            {/* Search Input Bar */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={handleQueryChange}
                placeholder="Search MEXC futures (e.g. BTC, ETH, SOL, DOGE)..."
                className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-panel-soft/80 border border-line text-text placeholder:text-muted/60 text-xs focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-mono"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setResults(null);
                    searchInputRef.current?.focus();
                  }}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted hover:text-text cursor-pointer"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Popular Market Chips */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
                Quick Select Popular Markets
              </span>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_TOKENS.map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => handleSelectChip(token)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-colors cursor-pointer border bg-panel-soft/60 hover:bg-accent/15 hover:border-accent/40 hover:text-accent text-muted border-line"
                  >
                    {token}
                  </button>
                ))}
              </div>
            </div>

            {/* Results or Helper Area */}
            {(searching || results) && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase text-muted tracking-wider px-1">
                  <span>
                    {searching
                      ? "Searching MEXC..."
                      : results
                      ? `${results.length} Markets Found`
                      : "Results"}
                  </span>
                  <span>MEXC Futures</span>
                </div>

                <div className="hairline rounded-xl bg-panel/30 max-h-56 overflow-y-auto divide-y divide-line">
                  {searching ? (
                    <div className="p-6 text-center text-muted font-mono flex flex-col items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      <span>Searching MEXC live futures...</span>
                    </div>
                  ) : searchError ? (
                    <div className="p-4 text-center text-loss text-xs">
                      {searchError}
                    </div>
                  ) : results && results.length === 0 ? (
                    <div className="p-6 text-center text-muted flex flex-col gap-1">
                      <span className="font-semibold text-text">No matches found</span>
                      <span className="text-muted text-[11px]">
                        No MEXC futures contracts match “{query}”.
                      </span>
                    </div>
                  ) : results ? (
                    results.map((t) => {
                      const sym = t.symbol.toUpperCase();
                      const label = cleanSymbol(sym);
                      const iconUrl = icons[sym];

                      return (
                        <div
                          key={t.symbol}
                          onClick={() => handleSelectToken(t)}
                          className="p-3 flex items-center justify-between gap-3 hover:bg-panel-soft/70 transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {iconUrl ? (
                              <img
                                src={iconUrl}
                                alt={label}
                                draggable={false}
                                className="w-6 h-6 rounded-full object-contain shrink-0"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-panel-soft border border-line flex items-center justify-center font-mono font-bold text-[10px] text-muted shrink-0">
                                {label.slice(0, 2)}
                              </div>
                            )}
                            <div className="flex flex-col leading-tight min-w-0">
                              <span className="font-bold text-text text-sm group-hover:text-accent transition-colors truncate">
                                {label}
                              </span>
                              <span className="font-mono text-[10px] text-muted truncate">
                                {sym.replace("_USDT", "")} · USDT Perpetual
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="flex flex-col items-end leading-tight">
                              <span className="font-mono font-medium text-text text-xs">
                                {fmtPx(t.lastPrice)}
                              </span>
                              <span
                                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium tabular-nums ${
                                  t.riseFallRate >= 0
                                    ? "bg-gain/10 text-gain"
                                    : "bg-loss/10 text-loss"
                                }`}
                              >
                                {fmtPct(t.riseFallRate)}
                              </span>
                            </div>
                            <span className="accent-btn px-2.5 py-1 text-xs font-semibold rounded-lg">
                              Select
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Selected Token Header Banner */
          <div className="p-3.5 rounded-xl bg-panel-soft/60 border border-line flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {selectedIcon ? (
                <img
                  src={selectedIcon}
                  alt={selectedLabel || ""}
                  draggable={false}
                  className="w-9 h-9 rounded-full object-contain shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-panel border border-line flex items-center justify-center font-mono font-bold text-xs text-muted shrink-0">
                  {selectedLabel?.slice(0, 2)}
                </div>
              )}
              <div className="flex flex-col leading-tight min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-text text-base">
                    {selectedLabel}
                  </span>
                  <span className="text-[10px] font-mono text-muted uppercase">
                    USDT Perpetual
                  </span>
                  {isAlreadyTracked && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-accent/15 text-accent border border-accent/25">
                      ✓ In Watchlist (Multi-Entry Supported)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs font-mono">
                  <span className="text-text font-semibold">
                    {fmtPx(selectedToken.lastPrice)}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded tabular-nums ${
                      selectedToken.riseFallRate >= 0
                        ? "bg-gain/15 text-gain"
                        : "bg-loss/15 text-loss"
                    }`}
                  >
                    {fmtPct(selectedToken.riseFallRate)} 24h
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedToken(null);
                setQuery("");
                setResults(null);
              }}
              className="text-xs font-medium text-accent hover:underline px-2.5 py-1.5 rounded-lg bg-panel hover:bg-panel-soft border border-line transition-colors cursor-pointer shrink-0"
            >
              Change Coin
            </button>
          </div>
        )}

        {/* --- STEP 2: SETUP CONFIGURATION (Shown once coin is selected) --- */}
        {selectedToken && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-1">
            {/* Position (Long vs Short) */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
                Position / Side <span className="text-loss">*</span>
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handlePositionChange("long")}
                  className={`py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                    position === "long"
                      ? "bg-gain/20 text-gain border-gain shadow-sm"
                      : "bg-panel-soft/60 hover:bg-panel-soft text-muted border-line"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 17L17 7M17 7H7M17 7V17" />
                  </svg>
                  <span>↗ LONG</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePositionChange("short")}
                  className={`py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                    position === "short"
                      ? "bg-loss/20 text-loss border-loss shadow-sm"
                      : "bg-panel-soft/60 hover:bg-panel-soft text-muted border-line"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 7l10 10M17 7v10H7" />
                  </svg>
                  <span>↘ SHORT</span>
                </button>
              </div>
            </div>

            {/* Trade Plan (Execution Details) — moved above Price Trigger */}
            <div className="p-3.5 rounded-xl bg-panel/40 border border-line flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase text-muted tracking-wider font-semibold">
                  Execution Plan (If Triggered)
                </span>
                <span className="text-[10px] font-mono text-loss font-semibold">
                  * Required
                </span>
              </div>

              {/* Order Type */}
              <label className="flex flex-col gap-1 text-xs text-muted">
                <span>
                  Order Type <span className="text-loss">*</span>
                </span>
                <select
                  required
                  value={orderType}
                  onChange={(e) => {
                    const newType = e.target.value as OrderType;
                    setOrderType(newType);
                    // Auto-sync trigger price to EP when switching away from trigger_limit
                    if (newType === "limit" || newType === "market") {
                      if (entryPrice) setTriggerPrice(entryPrice);
                    }
                  }}
                  className={`${inputCls} cursor-pointer`}
                >
                  {ORDER_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* EP / SL / TP 3-col Grid */}
              <div className="grid grid-cols-3 gap-2.5">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span className="flex items-center justify-between">
                    <span>
                      Entry (EP) <span className="text-loss">*</span>
                    </span>
                    {selectedToken.lastPrice > 0 && (
                      <button
                        type="button"
                        onClick={() => handleEntryChange(String(selectedToken.lastPrice))}
                        className="text-[10px] text-accent hover:underline cursor-pointer"
                        title="Use current market price"
                      >
                        Last
                      </button>
                    )}
                  </span>
                  <input
                    type="number"
                    step="any"
                    required
                    value={entryPrice}
                    onChange={(e) => handleEntryChange(e.target.value)}
                    placeholder="0.00"
                    className={inputCls}
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span>
                    Stop Loss (SL) <span className="text-loss">*</span>
                  </span>
                  <input
                    type="number"
                    step="any"
                    required
                    value={stopLoss}
                    onChange={(e) => handleStopLossChange(e.target.value)}
                    placeholder="0.00"
                    className={inputCls}
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span>
                    Take Profit (TP) <span className="text-loss">*</span>
                  </span>
                  <input
                    type="number"
                    step="any"
                    required
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                    placeholder="0.00"
                    className={inputCls}
                  />
                </label>
              </div>

              {/* R:R Ratio Badge or Warning */}
              {rrRatio && (
                <div className="p-2 rounded-lg bg-accent/10 border border-accent/25 flex items-center justify-between text-xs font-mono text-accent">
                  <span className="font-semibold">🎯 Risk : Reward</span>
                  <span>1 : {rrRatio} R:R</span>
                </div>
              )}
              {riskWarning && (
                <div className="text-[11px] text-amber-400 font-mono">
                  {riskWarning}
                </div>
              )}
            </div>

            {/* Price Alert / Trigger — only shown for Trigger Limit order type */}
            {orderType === "trigger_limit" && (
              <div className="p-3.5 rounded-xl bg-panel/40 border border-line flex flex-col gap-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-muted tracking-wider font-semibold">
                    Price Trigger (Alert)
                  </span>
                  {selectedToken.lastPrice > 0 && (
                    <button
                      type="button"
                      onClick={() => handleTriggerPriceChange(String(selectedToken.lastPrice))}
                      className="text-[11px] font-mono text-accent hover:underline cursor-pointer"
                    >
                      Use Last: {fmtPx(selectedToken.lastPrice)}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    <span>
                      Trigger Price <span className="text-loss">*</span>
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={triggerPrice}
                      onChange={(e) => handleTriggerPriceChange(e.target.value)}
                      placeholder="e.g. 64200"
                      className={inputCls}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-muted">
                    <span>Alert Condition</span>
                    <select
                      value={triggerDirection}
                      onChange={(e) => setTriggerDirection(e.target.value as "above" | "below")}
                      className={`${inputCls} cursor-pointer`}
                    >
                      <option value="below">Price drops to or below (≤)</option>
                      <option value="above">Price rises to or above (≥)</option>
                    </select>
                  </label>
                </div>
                <p className="text-[11px] text-muted leading-tight">
                  When live price reaches this trigger, you&apos;ll get notified on desktop &amp; Discord and the trade plan above will be executed.
                </p>
              </div>
            )}

            {/* Notes / Thesis */}
            <label className="flex flex-col gap-1 text-xs text-muted">
              <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
                Notes / Thesis (Optional)
              </span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. 4H bull flag breakout, tight invalidation below support..."
                className="w-full px-3 py-2 rounded-xl bg-panel-soft/80 border border-line text-text placeholder:text-muted/60 text-xs focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-none font-mono"
              />
            </label>

            {/* Screenshots (1–5 images) with Auto-Compression */}
            <MultiScreenshotUploader
              urls={screenshotUrls}
              onChange={setScreenshotUrls}
              maxFiles={5}
              entityId={`watchlist-${selectedToken?.symbol || "new"}`}
              label="Chart Screenshots (1–5 images)"
              helpText="Paste (Ctrl+V) or upload up to 5 screenshots. Auto-compressed 85–95%."
            />

            {/* Form Action Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-line">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-panel-soft hover:bg-panel text-text text-xs font-medium border border-line transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  submitting ||
                  !selectedToken ||
                  !triggerPrice ||
                  !entryPrice ||
                  !stopLoss ||
                  !takeProfit
                }
                className="accent-btn px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-panel border-t-transparent rounded-full animate-spin" />
                    <span>Adding Setup...</span>
                  </>
                ) : (
                  <>
                    <span>+</span>
                    <span>Add Setup to Watchlist</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Modal Footer when no coin selected yet */}
        {!selectedToken && (
          <div className="flex items-center justify-between pt-2 border-t border-line text-muted">
            <span className="text-[11px] font-mono">
              {existingSymbols.size} coins tracked · Multi-entry enabled
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-panel-soft hover:bg-panel text-text text-xs font-medium border border-line transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
