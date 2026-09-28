"use client";

import { useState, useMemo } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { calculatePositionRisk } from "@/lib/calculator";
import { money, fmtPx, fmtPlanPx } from "@/lib/format";

interface ApplyValues {
  marginUsd: number;
  leverage: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  initialSymbol?: string;
  initialEntryPrice?: number | null;
  initialStopLoss?: number | null;
  initialTakeProfit?: number | null;
  onApply?: (values: ApplyValues) => void;
}

export function PositionCalculatorModal({
  open,
  onClose,
  initialSymbol = "BTC_USDT",
  initialEntryPrice,
  initialStopLoss,
  initialTakeProfit,
  onApply,
}: Props) {
  const [balance, setBalance] = useState("5000");
  const [riskPct, setRiskPct] = useState("1.0");
  const [entryPrice, setEntryPrice] = useState(
    initialEntryPrice ? String(initialEntryPrice) : "60000"
  );
  const [stopLoss, setStopLoss] = useState(
    initialStopLoss ? String(initialStopLoss) : "59000"
  );
  const [takeProfit, setTakeProfit] = useState(
    initialTakeProfit ? String(initialTakeProfit) : "64000"
  );
  const [leverage, setLeverage] = useState("20");

  const calcResult = useMemo(() => {
    return calculatePositionRisk({
      accountBalance: Number(balance) || 0,
      riskPct: Number(riskPct) || 0,
      entryPrice: Number(entryPrice) || 0,
      stopLoss: Number(stopLoss) || 0,
      takeProfit: takeProfit ? Number(takeProfit) : undefined,
      leverage: Number(leverage) || 10,
    });
  }, [balance, riskPct, entryPrice, stopLoss, takeProfit, leverage]);

  if (!open) return null;

  const inputCls =
    "hairline bg-panel px-3 py-2 text-sm outline-none focus:border-accent w-full rounded font-mono";

  const handleApplyClick = () => {
    if (onApply) {
      onApply({
        marginUsd: Math.round(calcResult.requiredMarginUsd * 100) / 100,
        leverage: Number(leverage) || 10,
        entryPrice: Number(entryPrice) || undefined,
        stopLoss: Number(stopLoss) || undefined,
        takeProfit: takeProfit ? Number(takeProfit) : undefined,
      });
    }
    onClose();
  };

  return (
    <ModalShell title={`🧮 Risk & Position Size Calculator (${initialSymbol})`} onClose={onClose} disableClickOutside={true}>
      <div className="flex flex-col gap-5 text-sm">
        {/* Input Parameters */}
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Account Balance ($)
            <input
              type="number"
              step="any"
              className={inputCls}
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="5000"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Risk Per Trade (%)
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="100"
              className={inputCls}
              value={riskPct}
              onChange={(e) => setRiskPct(e.target.value)}
              placeholder="1.0"
            />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Entry Price (EP)
            <input
              type="number"
              step="any"
              className={inputCls}
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              placeholder="60000"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Stop Loss (SL)
            <input
              type="number"
              step="any"
              className={inputCls}
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder="59000"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Take Profit (TP)
            <input
              type="number"
              step="any"
              className={inputCls}
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              placeholder="64000"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs text-muted">
          Leverage: <span className="font-mono font-semibold text-foreground">{leverage}×</span>
          <input
            type="range"
            min="1"
            max="125"
            step="1"
            value={leverage}
            onChange={(e) => setLeverage(e.target.value)}
            className="w-full accent-accent cursor-pointer"
          />
        </label>

        {/* Calculated Results Box */}
        <div className="hairline p-4 rounded-lg bg-panel/60 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs hairline-b pb-2">
            <span className="text-muted">Max Dollar Risk (Loss):</span>
            <span className="font-mono font-semibold text-rose-400">
              {money(calcResult.maxRiskUsd)} ({riskPct}%)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted block">Position Size (Coins):</span>
              <span className="font-mono font-semibold text-foreground">
                {calcResult.positionCoins.toFixed(4)}
              </span>
            </div>
            <div>
              <span className="text-muted block">Notional Value ($):</span>
              <span className="font-mono font-semibold text-foreground">
                {money(calcResult.notionalUsd)}
              </span>
            </div>
            <div>
              <span className="text-muted block">Required Margin:</span>
              <span className="font-mono font-semibold text-accent">
                {money(calcResult.requiredMarginUsd)}
              </span>
            </div>
            <div>
              <span className="text-muted block">Risk : Reward (R:R):</span>
              <span className={`font-mono font-semibold ${
                calcResult.riskRewardRatio && calcResult.riskRewardRatio >= 2
                  ? "text-emerald-400"
                  : "text-amber-400"
              }`}>
                {calcResult.riskRewardRatio ? `${calcResult.riskRewardRatio.toFixed(2)} R` : "—"}
              </span>
            </div>
          </div>

          {calcResult.potentialRewardUsd != null && (
            <div className="flex items-center justify-between text-xs hairline-t pt-2">
              <span className="text-muted">Potential Profit (at TP):</span>
              <span className="font-mono font-semibold text-emerald-400">
                +{money(calcResult.potentialRewardUsd)}
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs text-muted hover:text-foreground cursor-pointer"
          >
            Close
          </button>
          {onApply && (
            <button
              type="button"
              onClick={handleApplyClick}
              className="px-4 py-2 text-xs accent-btn font-semibold rounded cursor-pointer"
            >
              Apply to Trade Plan
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
