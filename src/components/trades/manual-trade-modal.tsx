"use client";

import { useEffect, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import type { OrderType } from "@/lib/types";
import { calculateTradePnl } from "@/lib/trade-calc";
import { CoinPicker, type SelectedCoin } from "@/components/ui/coin-picker";
import { fmtPx } from "@/lib/format";
import { MultiScreenshotUploader } from "@/components/ui/multi-screenshot-uploader";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  icons?: Record<string, string>;
}

export function ManualTradeModal({
  open,
  onClose,
  onSuccess,
  icons = {},
}: Props) {
  const [selectedCoin, setSelectedCoin] = useState<SelectedCoin | null>(null);
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState<"below" | "above">("below"); // below = long, above = short
  const [triggerPrice, setTriggerPrice] = useState("");
  const [firedPrice, setFiredPrice] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [leverage, setLeverage] = useState("");
  const [marginUsd, setMarginUsd] = useState("1");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [notes, setNotes] = useState("");
  const [screenshotUrls, setScreenshotUrls] = useState<string[]>([]);

  // Status & Closure
  const [status, setStatus] = useState<"active" | "closed">("active");
  const [exitPrice, setExitPrice] = useState("");
  const [closedReason, setClosedReason] = useState<"manual_close" | "tp_hit" | "sl_hit">("manual_close");
  const [closeNotes, setCloseNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setSelectedCoin(null);
      setSymbol("");
      setDirection("below");
      setTriggerPrice("");
      setFiredPrice("");
      setEntryPrice("");
      setStopLoss("");
      setTakeProfit("");
      setLeverage("");
      setMarginUsd("1");
      setOrderType("market");
      setNotes("");
      setScreenshotUrls([]);
      setStatus("active");
      setExitPrice("");
      setClosedReason("manual_close");
      setCloseNotes("");
      setError(null);
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  function handleSelectCoin(coin: SelectedCoin) {
    setSelectedCoin(coin);
    setSymbol(coin.symbol);
    if (!entryPrice && coin.lastPrice) {
      setEntryPrice(String(coin.lastPrice));
    }
    if (!firedPrice && coin.lastPrice) {
      setFiredPrice(String(coin.lastPrice));
    }
    if (!triggerPrice && coin.lastPrice) {
      setTriggerPrice(String(coin.lastPrice));
    }
    setError(null);
  }

  function handleClearCoin() {
    setSelectedCoin(null);
    setSymbol("");
  }

  const numEntry = entryPrice ? Number(entryPrice) : firedPrice ? Number(firedPrice) : null;
  const numExit = exitPrice ? Number(exitPrice) : null;
  const pnl = calculateTradePnl(
    numEntry,
    numExit,
    direction,
    marginUsd ? Number(marginUsd) : 1,
    leverage ? Number(leverage) : 1
  );

  // Live Risk/Reward Calculation
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
    const isLong = direction === "below";
    if (isLong) {
      if (slNum >= epNum) {
        riskWarning = "For a LONG trade, Stop Loss is normally below Entry Price.";
      } else if (tpNum <= epNum) {
        riskWarning = "For a LONG trade, Take Profit is normally above Entry Price.";
      }
    } else {
      if (slNum <= epNum) {
        riskWarning = "For a SHORT trade, Stop Loss is normally above Entry Price.";
      } else if (tpNum >= epNum) {
        riskWarning = "For a SHORT trade, Take Profit is normally below Entry Price.";
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) {
      setError("Please select a coin first.");
      return;
    }
    if (!entryPrice || Number(entryPrice) <= 0) {
      setError("Please enter a valid entry price.");
      return;
    }
    if (status === "closed" && (!exitPrice || Number(exitPrice) <= 0)) {
      setError("Exit price is required when creating a closed trade.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/trade-alerts/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          trigger_direction: direction,
          trigger_price: triggerPrice ? Number(triggerPrice) : null,
          fired_price: firedPrice ? Number(firedPrice) : Number(entryPrice),
          entry_price: Number(entryPrice),
          stop_loss: stopLoss ? Number(stopLoss) : null,
          take_profit: takeProfit ? Number(takeProfit) : null,
          leverage: leverage ? Number(leverage) : null,
          margin_usd: marginUsd ? Number(marginUsd) : 1,
          order_type: orderType,
          notes,
          screenshot_urls: screenshotUrls,
          screenshot_url: screenshotUrls[0] ?? null,
          status,
          exit_price: status === "closed" ? Number(exitPrice) : null,
          closed_reason: status === "closed" ? closedReason : null,
          close_notes: status === "closed" ? closeNotes : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create trade");
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error creating trade");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2 rounded-xl bg-panel-soft/80 border border-line text-text placeholder:text-muted/60 text-xs focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-mono";

  const lastPx = selectedCoin?.lastPrice;

  return (
    <ModalShell onClose={onClose} title="⚡ Add Manual Trade" maxWidth="max-w-xl">
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

        {/* 1. Token Selection (Reusable CoinPicker) */}
        <CoinPicker
          selectedCoin={selectedCoin}
          onSelectCoin={handleSelectCoin}
          onClearCoin={handleClearCoin}
          icons={icons}
          autoFocus={!selectedCoin}
        />

        {/* 2. Position / Direction & Order Type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
              Position / Direction <span className="text-loss">*</span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection("below")}
                className={`py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                  direction === "below"
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
                onClick={() => setDirection("above")}
                className={`py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                  direction === "above"
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

          <label className="flex flex-col gap-1 text-xs text-muted">
            <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
              Order Type
            </span>
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as OrderType)}
              className={`${inputCls} cursor-pointer py-2.5`}
            >
              <option value="market">Market</option>
              <option value="limit">Limit</option>
              <option value="trigger_limit">Trigger Limit</option>
            </select>
          </label>
        </div>

        {/* 3. Execution Levels: Entry, Trigger, Fired */}
        <div className="p-3.5 rounded-xl bg-panel/40 border border-line flex flex-col gap-3">
          <span className="text-[10px] font-mono uppercase text-muted tracking-wider font-semibold">
            Price &amp; Execution Details
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              <div className="flex items-center justify-between">
                <span>Entry Price <span className="text-loss">*</span></span>
                {lastPx != null && (
                  <button
                    type="button"
                    onClick={() => setEntryPrice(String(lastPx))}
                    className="text-[10px] font-mono text-accent hover:underline cursor-pointer"
                  >
                    Use Last
                  </button>
                )}
              </div>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className={inputCls}
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              <div className="flex items-center justify-between">
                <span>Trigger Price</span>
                {lastPx != null && (
                  <button
                    type="button"
                    onClick={() => setTriggerPrice(String(lastPx))}
                    className="text-[10px] font-mono text-accent hover:underline cursor-pointer"
                  >
                    Use Last
                  </button>
                )}
              </div>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(e.target.value)}
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              <div className="flex items-center justify-between">
                <span>Fired Price</span>
                {lastPx != null && (
                  <button
                    type="button"
                    onClick={() => setFiredPrice(String(lastPx))}
                    className="text-[10px] font-mono text-accent hover:underline cursor-pointer"
                  >
                    Use Last
                  </button>
                )}
              </div>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={firedPrice}
                onChange={(e) => setFiredPrice(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>

          {/* SL & TP */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>Stop Loss (SL)</span>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              <span>Take Profit (TP)</span>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>

          {/* Live R:R Ratio Badge or Warning */}
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

        {/* 4. Position Sizing: Margin & Leverage */}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
              Margin ($)
            </span>
            <input
              type="number"
              step="any"
              placeholder="1"
              value={marginUsd}
              onChange={(e) => setMarginUsd(e.target.value)}
              className={inputCls}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
              Leverage (x)
            </span>
            <input
              type="number"
              step="any"
              placeholder="e.g. 10"
              value={leverage}
              onChange={(e) => setLeverage(e.target.value)}
              className={inputCls}
            />
          </label>
        </div>

        {/* 5. Status: Active vs Closed */}
        <div className="p-3.5 rounded-xl bg-panel-soft/60 border border-line flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text">
              Initial Trade Status
            </span>
            <div className="grid grid-cols-2 gap-1 bg-panel p-1 rounded-xl border border-line">
              <button
                type="button"
                onClick={() => setStatus("active")}
                className={`px-3 py-1 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                  status === "active"
                    ? "bg-gain/20 text-gain border border-gain/30"
                    : "text-muted hover:text-text"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatus("closed")}
                className={`px-3 py-1 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                  status === "closed"
                    ? "bg-accent/20 text-accent border border-accent/30"
                    : "text-muted hover:text-text"
                }`}
              >
                Closed
              </button>
            </div>
          </div>

          {status === "closed" && (
            <div className="space-y-3 pt-2 border-t border-line">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  <div className="flex items-center justify-between">
                    <span>Exit Price <span className="text-loss">*</span></span>
                    {lastPx != null && (
                      <button
                        type="button"
                        onClick={() => setExitPrice(String(lastPx))}
                        className="text-[10px] font-mono text-accent hover:underline cursor-pointer"
                      >
                        Use Last ({fmtPx(lastPx)})
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={exitPrice}
                    onChange={(e) => setExitPrice(e.target.value)}
                    className={inputCls}
                    required={status === "closed"}
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span>Closed Reason</span>
                  <select
                    value={closedReason}
                    onChange={(e) =>
                      setClosedReason(
                        e.target.value as "manual_close" | "tp_hit" | "sl_hit"
                      )
                    }
                    className={`${inputCls} cursor-pointer`}
                  >
                    <option value="manual_close">Manual Close</option>
                    <option value="tp_hit">Take Profit Hit (TP)</option>
                    <option value="sl_hit">Stop Loss Hit (SL)</option>
                  </select>
                </label>
              </div>

              {pnl.realizedPnlUsd != null && pnl.realizedPnlPct != null && (
                <div
                  className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                    pnl.realizedPnlUsd >= 0
                      ? "bg-gain/15 border-gain/25 text-gain"
                      : "bg-loss/15 border-loss/25 text-loss"
                  }`}
                >
                  <span>Calculated Realized PnL:</span>
                  <span className="font-mono">
                    {pnl.realizedPnlUsd >= 0 ? "+" : ""}$
                    {pnl.realizedPnlUsd.toFixed(2)} (
                    {pnl.realizedPnlUsd >= 0 ? "+" : ""}
                    {(pnl.realizedPnlPct * 100).toFixed(2)}%)
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 6. Notes */}
        <label className="flex flex-col gap-1 text-xs text-muted">
          <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
            Notes / Strategy Thesis
          </span>
          <textarea
            rows={2}
            placeholder="Pre-trade thesis, reasoning, or trade review..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-panel-soft/80 border border-line text-text placeholder:text-muted/60 text-xs focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-none font-mono"
          />
        </label>

        {/* Multi-Screenshot Uploader (1–5 images) */}
        <MultiScreenshotUploader
          urls={screenshotUrls}
          onChange={setScreenshotUrls}
          maxFiles={5}
          entityId={`trade-${symbol || "new"}`}
          label="Chart Screenshots (1–5 images)"
          helpText="Paste (Ctrl+V) or upload up to 5 screenshots. Auto-compressed 85–95%."
        />

        {/* 7. Action Buttons */}
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
            disabled={saving || !symbol.trim()}
            className="accent-btn px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-panel border-t-transparent rounded-full animate-spin" />
                <span>Creating Trade...</span>
              </>
            ) : (
              <>
                <span>+</span>
                <span>Add Trade</span>
              </>
            )}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
