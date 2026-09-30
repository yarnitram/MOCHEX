"use client";

import { useEffect, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { calculateTradePnl } from "@/lib/trade-calc";
import { sideForTrigger, type TradeAlert } from "@/lib/types";

interface Props {
  alert: TradeAlert | null;
  livePrice: number | null;
  maxLeverage?: number | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CloseTradeModal({
  alert,
  livePrice,
  maxLeverage,
  open,
  onClose,
  onSuccess,
}: Props) {
  const [exitPrice, setExitPrice] = useState("");
  const [closedReason, setClosedReason] = useState<"manual_close" | "tp_hit" | "sl_hit">("manual_close");
  const [closeNotes, setCloseNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultLev =
    alert?.leverage != null && alert.leverage > 0
      ? alert.leverage
      : maxLeverage != null && maxLeverage > 0
      ? maxLeverage
      : 1;

  const [leverage, setLeverage] = useState<string>(String(defaultLev));

  useEffect(() => {
    if (open && livePrice != null) {
      setExitPrice(livePrice.toString());
    } else if (open && alert) {
      const entry = alert.entry_price ?? alert.fired_price;
      setExitPrice(entry ? entry.toString() : "");
    }
    if (open && alert) {
      const lev =
        alert.leverage != null && alert.leverage > 0
          ? alert.leverage
          : maxLeverage != null && maxLeverage > 0
          ? maxLeverage
          : 1;
      setLeverage(String(lev));
    }
  }, [open, livePrice, alert, maxLeverage]);

  if (!open || !alert) return null;

  const numLev = Number(leverage);
  const effectiveLeverage = Number.isFinite(numLev) && numLev > 0 ? numLev : defaultLev;
  const entry = alert.entry_price ?? alert.fired_price;
  const numExit = exitPrice ? Number(exitPrice) : null;
  const pnl = calculateTradePnl(
    entry,
    numExit,
    alert.trigger_direction,
    alert.margin_usd,
    effectiveLeverage,
    alert
  );

  const side = sideForTrigger(alert.trigger_direction, alert);
  const isProfit = (pnl.realizedPnlUsd ?? 0) >= 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!alert) return;
    if (!numExit || numExit <= 0) {
      setError("Please enter a valid exit price");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/trade-alerts/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert_id: alert.id,
          exit_price: numExit,
          closed_reason: closedReason,
          close_notes: closeNotes,
          leverage: effectiveLeverage,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to close trade");
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error closing trade");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title={`Close Trade — ${alert.symbol.replace(/_USDT$/i, "")}`} disableClickOutside={true}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-loss/10 border border-loss/20 p-3 text-xs text-loss">
            {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 p-3 bg-panel-soft/70 border border-line rounded-xl text-xs">
          <div>
            <span className="text-muted block">Position Side</span>
            <span className={`font-semibold ${side === "long" ? "text-gain" : "text-loss"}`}>
              {side.toUpperCase()}
            </span>
          </div>
          <div>
            <span className="text-muted block">Entry Price</span>
            <span className="font-mono text-text">{entry ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted block">Margin</span>
            <span className="font-mono text-text">${alert.margin_usd ?? 1}</span>
          </div>
        </div>

        {/* Leverage configuration with presets */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-muted font-medium">
              Closing Leverage (ROE Multiplier)
            </label>
            {maxLeverage != null && maxLeverage > 0 && (
              <span className="text-[10px] font-mono text-muted">
                Contract Max: {maxLeverage}x
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                min="1"
                max={maxLeverage ?? 125}
                step="any"
                value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
                className="input-base w-full font-mono pr-7"
                required
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted font-mono text-xs">
                x
              </span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {[1, 5, 10, 20, 50].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setLeverage(String(preset))}
                  className={`px-2 py-1 rounded-md text-[10px] font-mono border transition-all cursor-pointer ${
                    leverage === String(preset)
                      ? "bg-accent/20 border-accent text-accent font-bold"
                      : "bg-panel border-line text-muted hover:text-text"
                  }`}
                >
                  {preset}x
                </button>
              ))}
              {maxLeverage != null && maxLeverage > 0 && (
                <button
                  type="button"
                  onClick={() => setLeverage(String(maxLeverage))}
                  className={`px-2 py-1 rounded-md text-[10px] font-mono border transition-all cursor-pointer ${
                    leverage === String(maxLeverage)
                      ? "bg-accent/20 border-accent text-accent font-bold"
                      : "bg-panel border-line text-muted hover:text-text"
                  }`}
                >
                  Max ({maxLeverage}x)
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted font-medium mb-1">
            Exit Price <span className="text-loss">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              step="any"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              className="input-base w-full font-mono pr-24"
              required
            />
            {livePrice != null && (
              <button
                type="button"
                onClick={() => setExitPrice(livePrice.toString())}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] bg-panel hover:bg-panel-soft border border-line text-text px-2 py-1 rounded-md transition-colors"
              >
                Use Live ({livePrice})
              </button>
            )}
          </div>
        </div>

        {/* Live PnL Preview */}
        {pnl.realizedPnlUsd != null && pnl.realizedPnlPct != null && (
          <div
            className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
              isProfit
                ? "bg-gain/10 border-gain/25 text-gain"
                : "bg-loss/10 border-loss/25 text-loss"
            }`}
          >
            <span>Estimated Realized PnL:</span>
            <span className="font-mono text-sm">
              {isProfit ? "+" : ""}${pnl.realizedPnlUsd.toFixed(2)} (
              {isProfit ? "+" : ""}
              {(pnl.realizedPnlPct * 100).toFixed(2)}%)
            </span>
          </div>
        )}

        <div>
          <label className="block text-xs text-muted font-medium mb-1">
            Close Reason
          </label>
          <select
            value={closedReason}
            onChange={(e) => setClosedReason(e.target.value as "manual_close" | "tp_hit" | "sl_hit")}
            className="input-base w-full"
          >
            <option value="manual_close">Manual Close</option>
            <option value="tp_hit">Take Profit (TP Hit)</option>
            <option value="sl_hit">Stop Loss (SL Hit)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted font-medium mb-1">
            Notes / Review
          </label>
          <textarea
            rows={2}
            placeholder="Post-trade notes or review..."
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
            className="input-base w-full text-xs"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-loss hover:opacity-90 text-white text-xs font-semibold transition-all shadow-md shadow-loss/20 disabled:opacity-50"
          >
            {submitting ? "Closing..." : "Close Trade & Log"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
