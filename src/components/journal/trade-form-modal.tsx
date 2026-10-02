"use client";

import { useEffect, useMemo, useState } from "react";
import type { Tag, TradeWithExtras } from "@/lib/types";
import { ModalShell } from "@/components/ui/modal-shell";
import { CoinPicker, type SelectedCoin } from "@/components/ui/coin-picker";
import { fmtPx } from "@/lib/format";
import { normalizeScreenshotUrl } from "@/lib/screenshot-helpers";
import { MultiScreenshotUploader } from "@/components/ui/multi-screenshot-uploader";

interface Props {
  trade: TradeWithExtras | null;
  tags: Tag[];
  onClose: () => void;
  onSave: (values: Record<string, unknown>, id?: string) => Promise<void>;
  icons?: Record<string, string>;
}

function toLocalInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function TradeFormModal({ trade, tags, onClose, onSave, icons = {} }: Props) {
  const editing = !!trade;

  const [selectedCoin, setSelectedCoin] = useState<SelectedCoin | null>(() => {
    if (!trade) return null;
    return {
      symbol: trade.symbol,
      label: trade.symbol.replace("_USDT", ""),
      isCustom: !trade.symbol.endsWith("_USDT"),
    };
  });

  const [symbol, setSymbol] = useState(trade?.symbol ?? "");
  const [direction, setDirection] = useState<"long" | "short">(
    trade?.direction ?? "long"
  );
  const [size, setSize] = useState(trade ? String(trade.size) : "");
  const [leverage, setLeverage] = useState(
    trade?.leverage != null && trade.leverage > 0 ? String(trade.leverage) : "1"
  );
  const [entryPrice, setEntryPrice] = useState(
    trade ? String(trade.entry_price) : ""
  );
  const [exitPrice, setExitPrice] = useState(
    trade?.exit_price != null ? String(trade.exit_price) : ""
  );
  const [stopPrice, setStopPrice] = useState(
    trade?.stop_price != null ? String(trade.stop_price) : ""
  );
  const [fees, setFees] = useState(trade ? String(trade.fees) : "0");
  const [entryTime, setEntryTime] = useState(
    toLocalInput(trade?.entry_time ?? null)
  );
  const [thesis, setThesis] = useState(
    trade?.notes?.pre_trade_thesis ?? ""
  );
  const [review, setReview] = useState(
    trade?.notes?.post_trade_review ?? ""
  );
  const [discipline, setDiscipline] = useState(
    trade?.notes?.discipline_score != null
      ? String(trade.notes.discipline_score)
      : ""
  );

  const initialScreenshots: string[] = trade?.notes?.screenshot_urls?.length
    ? trade.notes.screenshot_urls
    : trade?.notes?.screenshot_url
    ? [normalizeScreenshotUrl(trade.notes.screenshot_url)]
    : [];
  const [screenshotUrls, setScreenshotUrls] = useState<string[]>(initialScreenshots);

  const [selectedTags, setSelectedTags] = useState<string[]>(
    trade?.tags.map((t) => t.name) ?? []
  );
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Position Size Calculator helper state
  const [showSizeCalc, setShowSizeCalc] = useState(false);
  const [riskBudget, setRiskBudget] = useState("50"); // default $50 risk budget

  // Numerical values derived from inputs for live auto-calculations
  const numEntry = Number(entryPrice);
  const numExit = exitPrice.trim() !== "" ? Number(exitPrice) : null;
  const numStop = stopPrice.trim() !== "" ? Number(stopPrice) : null;
  const numSize = Number(size);
  const numFees = fees.trim() !== "" ? Number(fees) : 0;
  const numLeverage = leverage.trim() !== "" ? Math.max(1, Number(leverage)) : 1;
  const validLeverage = Number.isFinite(numLeverage) && numLeverage >= 1;

  const validEntry = Number.isFinite(numEntry) && numEntry > 0;
  const validSize = Number.isFinite(numSize) && numSize > 0;

  // 1. Notional Position Value: Size * Entry Price, and Required Margin
  const notionalValue = validEntry && validSize ? numEntry * numSize : null;
  const marginValue = notionalValue != null ? notionalValue / (validLeverage ? numLeverage : 1) : null;

  // 2. Risk Calculations (if stop price is provided)
  const riskPerUnit =
    validEntry && numStop != null && Number.isFinite(numStop)
      ? direction === "long"
        ? Math.max(0, numEntry - numStop)
        : Math.max(0, numStop - numEntry)
      : null;

  const totalRiskDollars =
    riskPerUnit != null && validSize ? riskPerUnit * numSize : null;

  // 3. Realized or Projected PnL (leveraged ROE %)
  const pnlCalculation = useMemo(() => {
    if (!validEntry || !validSize || numExit == null || !Number.isFinite(numExit)) {
      return null;
    }
    const gross =
      direction === "short"
        ? (numEntry - numExit) * numSize
        : (numExit - numEntry) * numSize;
    const net = gross - numFees;
    const notional = numEntry * numSize;
    const lev = validLeverage ? numLeverage : 1;
    const pct = notional > 0 ? (net / notional) * lev * 100 : 0;
    return { gross, net, pct };
  }, [validEntry, validSize, numEntry, numExit, numFees, direction, validLeverage, numLeverage]);

  // 4. R:R (Risk to Reward ratio)
  const rrCalculation = useMemo(() => {
    if (
      !validEntry ||
      riskPerUnit == null ||
      riskPerUnit <= 0 ||
      numExit == null ||
      !Number.isFinite(numExit)
    ) {
      return null;
    }
    const rewardPerUnit =
      direction === "long" ? numExit - numEntry : numEntry - numExit;
    const rr = rewardPerUnit / riskPerUnit;
    return rr;
  }, [validEntry, riskPerUnit, numExit, numEntry, direction]);

  // Calculated size from risk budget
  const calculatedSizeFromRisk = useMemo(() => {
    const budget = Number(riskBudget);
    if (!Number.isFinite(budget) || budget <= 0 || riskPerUnit == null || riskPerUnit <= 0) {
      return null;
    }
    return budget / riskPerUnit;
  }, [riskBudget, riskPerUnit]);

  // Quick R target application
  function applyTargetR(rMultiplier: number) {
    if (!validEntry || riskPerUnit == null || riskPerUnit <= 0) return;
    const targetExit =
      direction === "long"
        ? numEntry + rMultiplier * riskPerUnit
        : numEntry - rMultiplier * riskPerUnit;
    setExitPrice(String(targetExit));
  }

  // Sync state if editing trade changes
  useEffect(() => {
    if (trade) {
      setSelectedCoin({
        symbol: trade.symbol,
        label: trade.symbol.replace("_USDT", ""),
        isCustom: !trade.symbol.endsWith("_USDT"),
      });
      setSymbol(trade.symbol);
      setDirection(trade.direction);
      setSize(String(trade.size));
      setLeverage(trade.leverage != null && trade.leverage > 0 ? String(trade.leverage) : "1");
      setEntryPrice(String(trade.entry_price));
      setExitPrice(trade.exit_price != null ? String(trade.exit_price) : "");
      setStopPrice(trade.stop_price != null ? String(trade.stop_price) : "");
      setFees(String(trade.fees));
      setEntryTime(toLocalInput(trade.entry_time));
      setThesis(trade.notes?.pre_trade_thesis ?? "");
      setReview(trade.notes?.post_trade_review ?? "");
      setDiscipline(
        trade.notes?.discipline_score != null
          ? String(trade.notes.discipline_score)
          : ""
      );
      setSelectedTags(trade.tags.map((t) => t.name));
    }
  }, [trade]);

  function handleSelectCoin(coin: SelectedCoin) {
    setSelectedCoin(coin);
    setSymbol(coin.symbol);
    if (!entryPrice && coin.lastPrice) {
      setEntryPrice(String(coin.lastPrice));
    }
    setError(null);
  }

  function handleClearCoin() {
    setSelectedCoin(null);
    setSymbol("");
  }

  const suggestions = useMemo(() => {
    const known = new Set(tags.map((t) => t.name));
    return Array.from(new Set([...selectedTags, ...known])).filter((n) =>
      newTag.trim() === ""
        ? selectedTags.includes(n)
        : n.toLowerCase().includes(newTag.trim().toLowerCase())
    );
  }, [tags, selectedTags, newTag]);

  function toggleTag(name: string) {
    setSelectedTags((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  function commitNewTag() {
    const name = newTag.trim();
    if (!name) return;
    if (!selectedTags.includes(name)) {
      setSelectedTags((prev) => [...prev, name]);
    }
    setNewTag("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const entry = num(entryPrice);
    const exit = num(exitPrice);

    if (!symbol.trim()) {
      setError("Please select or enter a coin symbol.");
      return;
    }
    if (size.trim() === "" || entry == null || Number.isNaN(entry) || entry <= 0) {
      setError("Valid size and entry price are required.");
      return;
    }
    if (!entryTime) {
      setError("Entry time is required.");
      return;
    }

    setSaving(true);
    try {
      await onSave(
        {
          symbol: symbol.toUpperCase(),
          direction,
          size: num(size),
          leverage: validLeverage ? numLeverage : 1,
          entry_price: entry,
          exit_price: exit,
          stop_price: num(stopPrice),
          fees: num(fees) ?? 0,
          entry_time: new Date(entryTime).toISOString(),
          tags: selectedTags,
          pre_trade_thesis: thesis.trim() || null,
          post_trade_review: review.trim() || null,
          discipline_score: discipline.trim() === "" ? null : Number(discipline),
          screenshot_url: screenshotUrls[0] ?? null,
          screenshot_urls: screenshotUrls,
        },
        trade?.id
      );
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2 rounded-xl bg-panel-soft/80 border border-line text-text placeholder:text-muted/60 text-xs focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-mono";

  const lastPx = selectedCoin?.lastPrice;

  return (
    <ModalShell
      title={editing ? `Edit ${trade?.symbol} Trade` : "⚡ New Journal Trade"}
      onClose={onClose}
      maxWidth="max-w-xl"
      disableClickOutside={true}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
        {error && (
          <div className="p-3 rounded-xl bg-loss/10 border border-loss/20 text-loss text-xs flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-loss/70 hover:text-loss p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* 1. Coin Selection */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
            Asset / Coin <span className="text-loss">*</span>
          </span>
          <CoinPicker
            selectedCoin={selectedCoin}
            onSelectCoin={handleSelectCoin}
            onClearCoin={handleClearCoin}
            allowCustomSymbol={true}
            icons={icons}
            autoFocus={!selectedCoin}
          />
        </div>

        {/* 2. Position / Direction */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
            Direction <span className="text-loss">*</span>
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection("long")}
              className={`py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                direction === "long"
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
              onClick={() => setDirection("short")}
              className={`py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                direction === "short"
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

        {/* 3. Execution Levels: Size, Entry Time, Entry Price, Leverage */}
        <div className="p-3.5 rounded-xl bg-panel/40 border border-line flex flex-col gap-3">
          <span className="text-[10px] font-mono uppercase text-muted tracking-wider font-semibold">
            Execution Details
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>Position Size (Units) <span className="text-loss">*</span></span>
              <input
                type="number"
                step="any"
                className={inputCls}
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="e.g. 100"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              <div className="flex items-center justify-between">
                <span>Entry Price <span className="text-loss">*</span></span>
                {lastPx != null && (
                  <button
                    type="button"
                    onClick={() => setEntryPrice(String(lastPx))}
                    className="text-[10px] font-mono text-accent hover:underline cursor-pointer"
                  >
                    Use Last ({fmtPx(lastPx)})
                  </button>
                )}
              </div>
              <input
                type="number"
                step="any"
                className={inputCls}
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="0.00"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>Entry Timestamp <span className="text-loss">*</span></span>
              <input
                type="datetime-local"
                className={`${inputCls} py-1.5`}
                value={entryTime}
                onChange={(e) => setEntryTime(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
            <label className="flex flex-col gap-1 text-xs text-muted">
              <div className="flex items-center justify-between">
                <span>Exit Price</span>
                <span className="text-[10px] text-muted/60 font-normal">Blank = Open</span>
              </div>
              <input
                type="number"
                step="any"
                className={inputCls}
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                placeholder="Optional"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>Stop Price (for R Calc)</span>
              <input
                type="number"
                step="any"
                className={inputCls}
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                placeholder="Optional"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>Trading Fees ($)</span>
              <input
                type="number"
                step="any"
                className={inputCls}
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                placeholder="0.00"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              <div className="flex items-center justify-between">
                <span>Leverage</span>
                <span className="text-[10px] font-mono text-accent">
                  {marginValue != null ? `~$${marginValue.toFixed(2)}` : ""}
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="125"
                  step="1"
                  className={inputCls}
                  value={leverage}
                  onChange={(e) => setLeverage(e.target.value)}
                  placeholder="1"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted font-mono text-xs">x</span>
              </div>
            </label>
          </div>

          {/* Quick Leverage Presets */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted flex-wrap">
            <span className="text-[10px] font-mono uppercase">Leverage:</span>
            {[1, 5, 10, 20, 50, 100].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setLeverage(String(preset))}
                className={`px-2 py-0.5 rounded-lg font-mono text-[10px] font-semibold border transition-all cursor-pointer ${
                  leverage === String(preset)
                    ? "bg-accent/20 border-accent text-accent"
                    : "bg-panel border-line text-muted hover:text-text"
                }`}
              >
                {preset}x
              </button>
            ))}
          </div>

          <p className="text-[10px] leading-relaxed text-muted/80 -mt-1">
            Leverage scales <span className="text-text font-semibold">ROE %</span> and
            implied margin only. Dollar P&amp;L comes from{" "}
            <span className="font-mono text-text">size × (exit − entry)</span>, so it
            stays the same when you change leverage — adjust{" "}
            <span className="text-text font-semibold">Position Size</span> to change
            the dollar figure.
          </p>

          {/* Live Auto-Calculations Preview Box */}
          <div className="p-3 rounded-xl bg-panel-soft/60 border border-line flex flex-col gap-2 mt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-muted tracking-wider font-semibold flex items-center gap-1.5">
                <span>📊</span>
                <span>Live Calculations & Metrics</span>
              </span>
              <button
                type="button"
                onClick={() => setShowSizeCalc((prev) => !prev)}
                className="text-[10px] font-mono text-accent hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>🧮</span>
                <span>{showSizeCalc ? "Hide Size Calculator" : "Auto-Calculate Size"}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {/* Position Value */}
              <div className="p-2 rounded-lg bg-panel border border-line/60 flex flex-col">
                <span className="text-[10px] text-muted font-mono uppercase">Position Value</span>
                <span className="font-mono font-semibold text-text">
                  {notionalValue != null
                    ? `$${notionalValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                    : "—"}
                </span>
              </div>

              {/* Margin */}
              <div className="p-2 rounded-lg bg-panel border border-line/60 flex flex-col">
                <span className="text-[10px] text-muted font-mono uppercase">Margin ({validLeverage ? numLeverage : 1}x)</span>
                <span className="font-mono font-semibold text-accent">
                  {marginValue != null
                    ? `$${marginValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "—"}
                </span>
              </div>

              {/* Projected/Realized PnL */}
              <div className="p-2 rounded-lg bg-panel border border-line/60 flex flex-col">
                <span className="text-[10px] text-muted font-mono uppercase">Net P&L (ROE)</span>
                <span className={`font-mono font-semibold ${
                  pnlCalculation == null
                    ? "text-muted"
                    : pnlCalculation.net >= 0
                    ? "text-gain"
                    : "text-loss"
                }`}>
                  {pnlCalculation != null
                    ? `${pnlCalculation.net >= 0 ? "+" : ""}$${pnlCalculation.net.toFixed(2)} (${pnlCalculation.pct >= 0 ? "+" : ""}${pnlCalculation.pct.toFixed(2)}%)`
                    : "— (Open)"}
                </span>
              </div>

              {/* Max Risk / R:R */}
              <div className="p-2 rounded-lg bg-panel border border-line/60 flex flex-col">
                <span className="text-[10px] text-muted font-mono uppercase">
                  {rrCalculation != null ? "R:R Ratio" : "Max Risk ($)"}
                </span>
                <span className={`font-mono font-semibold ${
                  rrCalculation != null
                    ? rrCalculation >= 1 ? "text-gain" : "text-amber-400"
                    : totalRiskDollars != null ? "text-loss" : "text-muted"
                }`}>
                  {rrCalculation != null
                    ? `1 : ${rrCalculation.toFixed(2)}R`
                    : totalRiskDollars != null
                    ? `$${totalRiskDollars.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                    : "—"}
                </span>
              </div>
            </div>

            {/* Quick Target Presets if stop price is defined */}
            {riskPerUnit != null && riskPerUnit > 0 && (
              <div className="flex items-center gap-1.5 pt-1 text-[11px] text-muted flex-wrap">
                <span className="text-[10px] font-mono uppercase">Quick Target:</span>
                <button
                  type="button"
                  onClick={() => applyTargetR(1.5)}
                  className="px-2 py-0.5 rounded bg-panel hover:bg-panel-soft text-text border border-line font-mono text-[10px] cursor-pointer"
                >
                  +1.5R
                </button>
                <button
                  type="button"
                  onClick={() => applyTargetR(2)}
                  className="px-2 py-0.5 rounded bg-panel hover:bg-panel-soft text-text border border-line font-mono text-[10px] cursor-pointer"
                >
                  +2.0R
                </button>
                <button
                  type="button"
                  onClick={() => applyTargetR(3)}
                  className="px-2 py-0.5 rounded bg-panel hover:bg-panel-soft text-text border border-line font-mono text-[10px] cursor-pointer"
                >
                  +3.0R
                </button>
                <button
                  type="button"
                  onClick={() => applyTargetR(4)}
                  className="px-2 py-0.5 rounded bg-panel hover:bg-panel-soft text-text border border-line font-mono text-[10px] cursor-pointer"
                >
                  +4.0R
                </button>
              </div>
            )}

            {/* Expandable Position Size Calculator */}
            {showSizeCalc && (
              <div className="p-2.5 rounded-lg bg-accent/5 border border-accent/20 flex flex-col gap-2 mt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-accent">Position Size Calculator</span>
                  <span className="text-[10px] text-muted">Formula: Risk $ ÷ |Entry − Stop|</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <span>Max Risk: $</span>
                    <input
                      type="number"
                      value={riskBudget}
                      onChange={(e) => setRiskBudget(e.target.value)}
                      className="w-20 px-2 py-1 rounded bg-panel border border-line text-text font-mono text-xs focus:outline-none focus:border-accent"
                      placeholder="50"
                    />
                  </label>
                  {calculatedSizeFromRisk != null ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text font-mono">
                        = <span className="font-bold text-accent">{calculatedSizeFromRisk > 1 ? calculatedSizeFromRisk.toFixed(2) : calculatedSizeFromRisk.toPrecision(4)}</span> units
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const formatted = calculatedSizeFromRisk > 1
                            ? calculatedSizeFromRisk.toFixed(2)
                            : calculatedSizeFromRisk.toPrecision(4);
                          setSize(formatted);
                        }}
                        className="px-2.5 py-1 rounded-md bg-accent text-panel font-bold text-[10px] hover:brightness-110 cursor-pointer transition-all"
                      >
                        Apply Size
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted italic">
                      Enter valid entry & stop price above to calculate size
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4. Tags */}
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-[10px] font-mono uppercase text-muted tracking-wider">
            Tags ({selectedTags.length} selected)
          </legend>
          <div className="flex flex-wrap gap-1.5 items-center">
            {suggestions.map((name) => {
              const active = selectedTags.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleTag(name)}
                  className={`px-2.5 py-1 text-xs rounded-lg cursor-pointer transition-colors border ${
                    active
                      ? "bg-accent/15 border-accent text-accent font-semibold"
                      : "bg-panel-soft/60 border-line text-muted hover:text-text"
                  }`}
                >
                  {name} {active ? "✓" : ""}
                </button>
              );
            })}
            <div className="flex gap-1 items-center">
              <input
                className="w-28 px-2.5 py-1 rounded-lg bg-panel-soft/80 border border-line text-text placeholder:text-muted/60 text-xs focus:outline-none focus:border-accent"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitNewTag();
                  }
                }}
                placeholder="+ tag..."
              />
              {newTag.trim() && (
                <button
                  type="button"
                  onClick={commitNewTag}
                  className="px-2 py-1 text-xs rounded-lg bg-accent/20 text-accent font-bold cursor-pointer"
                >
                  +
                </button>
              )}
            </div>
          </div>
        </fieldset>

        {/* 5. Notes & Review */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
              Pre-Trade Thesis
            </span>
            <textarea
              className="w-full px-3 py-2 rounded-xl bg-panel-soft/80 border border-line text-text placeholder:text-muted/60 text-xs focus:outline-none focus:border-accent resize-none font-mono"
              rows={2}
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="Why are you taking this setup?"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
              Post-Trade Review
            </span>
            <textarea
              className="w-full px-3 py-2 rounded-xl bg-panel-soft/80 border border-line text-text placeholder:text-muted/60 text-xs focus:outline-none focus:border-accent resize-none font-mono"
              rows={2}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Execution review, emotions, lessons..."
            />
          </label>
        </div>

        {/* 6. Discipline Score */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
            Discipline Score (1 = Bad, 5 = Flawless)
          </span>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((num) => {
              const active = discipline === String(num);
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => setDiscipline(active ? "" : String(num))}
                  className={`w-9 h-8 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer border ${
                    active
                      ? "bg-accent/25 border-accent text-accent shadow-sm"
                      : "bg-panel-soft/60 border-line text-muted hover:text-text"
                  }`}
                >
                  {num}★
                </button>
              );
            })}
            {discipline && (
              <button
                type="button"
                onClick={() => setDiscipline("")}
                className="text-[11px] text-muted hover:text-text ml-2 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* 7. Screenshot Attachment (1–5 images with auto-compression) */}
        <div className="hairline-t pt-3">
          <MultiScreenshotUploader
            urls={screenshotUrls}
            onChange={setScreenshotUrls}
            maxFiles={5}
            entityId={`trade-${trade?.id || "new"}`}
            label="Chart Screenshots (1–5 images)"
            helpText="Paste (Ctrl+V) or upload up to 5 screenshots. Auto-compressed 85–95%."
          />
        </div>

        {/* 8. Action Buttons */}
        <div className="flex justify-between items-center pt-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-panel-soft hover:bg-panel text-text text-xs font-medium border border-line transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !symbol.trim()}
            className="accent-btn px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-panel border-t-transparent rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>{editing ? "Save Changes" : "+ Add to Journal"}</span>
            )}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}